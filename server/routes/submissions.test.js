const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const Submission = require("../models/Submission");
const Team = require("../models/Team");
const {
  createUploadMiddleware,
  handleSubmissions,
  SubmissionRouteError,
} = require("./submissions");

function matches(record, filter) {
  if (filter.$or && !filter.$or.some((clause) => matches(record, clause))) return false;
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") return true;
    if (key === "$expr") return true;
    const actual = key.includes(".")
      ? key.split(".").reduce((value, part) => (
        Array.isArray(value) ? value.map((entry) => entry[part]) : value?.[part]
      ), record)
      : record[key];
    if (expected && typeof expected === "object" && "$in" in expected) {
      return expected.$in.includes(actual);
    }
    return Array.isArray(actual) ? actual.includes(expected) : actual === expected;
  });
}

function query(value) {
  return {
    sort(sortOrder) {
      if (Array.isArray(value)) {
        const [field, direction] = Object.entries(sortOrder)[0];
        value.sort((left, right) => direction * (new Date(left[field]) - new Date(right[field])));
      }
      return this;
    },
    select() { return this; },
    lean() { return Promise.resolve(value); },
  };
}

function response() {
  return {
    status: null,
    body: null,
    writeHead(status) { this.status = status; },
    end(value) { this.body = JSON.parse(value); },
  };
}

function createStore() {
  const submissions = [];
  const tasks = [];
  const teams = [];
  const originals = {
    submissionFind: Submission.find,
    submissionFindOne: Submission.findOne,
    submissionCreate: Submission.create,
    submissionFindOneAndUpdate: Submission.findOneAndUpdate,
    teamFind: Team.find,
    teamFindOne: Team.findOne,
  };

  Submission.find = (filter) => query(submissions.filter((record) => matches(record, filter)));
  Submission.findOne = (filter) => query(submissions.find((record) => matches(record, filter)) || null);
  Submission.create = async (values) => {
    const now = new Date();
    const record = {
      ...values,
      status: values.status || "Submitted",
      files: values.files || [],
      comments: values.comments || [],
      createdAt: now,
      updatedAt: now,
    };
    submissions.push(record);
    return record;
  };
  Submission.findOneAndUpdate = async (filter, update) => {
    const record = submissions.find((item) => matches(item, filter));
    if (!record) return null;
    if (update.$set) Object.assign(record, update.$set);
    if (update.$push) {
      for (const [field, value] of Object.entries(update.$push)) {
        record[field].push(...(value.$each || [value]));
      }
    }
    if (update.$pull) {
      for (const [field, value] of Object.entries(update.$pull)) {
        record[field] = record[field].filter((entry) => !matches(entry, value));
      }
    }
    return record;
  };
  Team.find = (filter) => query(teams.filter((team) => matches(team, filter)));
  Team.findOne = (filter) => query(teams.find((team) => matches(team, filter)) || null);

  const db = {
    collection(name) {
      assert.equal(name, "tasks");
      return {
        async findOne(filter) {
          return tasks.find((task) => matches(task, filter)) || null;
        },
        find(filter) {
          return {
            sort(sortOrder) {
              const [field, direction] = Object.entries(sortOrder)[0];
              tasks.sort((left, right) => direction * (new Date(left[field]) - new Date(right[field])));
              return this;
            },
            async toArray() {
              return tasks.filter((task) => matches(task, filter));
            },
          };
        },
      };
    },
  };

  return {
    submissions,
    tasks,
    teams,
    db,
    restore() {
      Submission.find = originals.submissionFind;
      Submission.findOne = originals.submissionFindOne;
      Submission.create = originals.submissionCreate;
      Submission.findOneAndUpdate = originals.submissionFindOneAndUpdate;
      Team.find = originals.teamFind;
      Team.findOne = originals.teamFindOne;
    },
  };
}

test("submission schema validates file and comment references and caps attachments", async () => {
  const file = {
    id: crypto.randomUUID(),
    originalName: "work.pdf",
    storageKey: `${crypto.randomUUID()}.pdf`,
    mimeType: "application/pdf",
    size: 12,
  };
  const comment = {
    id: crypto.randomUUID(),
    authorId: "member-a",
    text: "Review comment.",
  };
  const valid = new Submission({
    id: "submission-schema-valid",
    organizationId: "organization-a",
    taskId: "task-a",
    submittedBy: "member-a",
    description: "Submitted work.",
    files: [file],
    comments: [comment],
  });
  await valid.validate();

  const overLimit = new Submission({
    id: "submission-schema-over-limit",
    organizationId: "organization-a",
    taskId: "task-a",
    submittedBy: "member-a",
    description: "Submitted work.",
    files: Array.from({ length: 6 }, (_, index) => ({
      ...file,
      id: `file-${index}`,
    })),
  });
  const validationError = await overLimit.validate().then(
    () => null,
    (error) => error
  );
  assert(validationError && validationError.errors.files);
});

async function call(store, method, pathname, user, body, url = pathname) {
  const result = response();
  try {
    await handleSubmissions(
      { method, url },
      result,
      pathname,
      {
        user,
        db: store.db,
        readJsonBody: async () => body,
      }
    );
  } catch (error) {
    if (!(error instanceof SubmissionRouteError)) throw error;
    result.status = error.status;
    result.body = { error: error.message };
  }
  return result;
}

test("team members can submit completed task work while incomplete and duplicate submissions are rejected", async (t) => {
  const store = createStore();
  t.after(() => store.restore());

  const organizationId = "organization-a";
  const memberA = { id: "member-a", organizationId, role: "member" };
  const memberB = { id: "member-b", organizationId, role: "member" };
  const leadA = { id: "lead-a", organizationId, role: "member" };
  store.tasks.push(
    { id: "task-a", organizationId, assignee: memberA.id, teamId: "team-a", status: "Completed" },
    { id: "task-b", organizationId, assignee: memberB.id, teamId: "team-b", status: "Completed" },
    { id: "task-incomplete", organizationId, assignee: memberA.id, teamId: "team-a", status: "In progress" }
  );
  store.teams.push({
    id: "team-a",
    organizationId,
    leaderId: leadA.id,
    members: [{ userId: memberA.id }, { userId: leadA.id }],
  });

  const createdA = await call(
    store,
    "POST",
    "/api/tasks/task-a/submissions",
    memberA,
    { description: "Completed implementation and test notes." }
  );
  assert.equal(createdA.status, 201);
  assert.equal(createdA.body.submission.status, "Submitted");
  assert.equal(createdA.body.submission.submittedBy, memberA.id);
  assert.equal(createdA.body.submission.organizationId, organizationId);

  const createdB = await call(
    store,
    "POST",
    "/api/tasks/task-b/submissions",
    memberB,
    { description: "Second member's work." }
  );
  assert.equal(createdB.status, 201);
  assert.equal((await call(
    store,
    "POST",
    "/api/tasks/task-incomplete/submissions",
    memberA,
    { description: "Not finished yet." }
  )).status, 409);
  assert.equal((await call(
    store,
    "POST",
    "/api/tasks/task-a/submissions",
    memberB,
    { description: "Not the assignee." }
  )).status, 403);
  assert.equal((await call(
    store,
    "POST",
    "/api/tasks/task-a/submissions",
    memberA,
    { description: "Duplicate active submission." }
  )).status, 409);

  const teamMember = { id: "teammate-a", organizationId, role: "member" };
  store.teams[0].members.push({ userId: teamMember.id });
  store.tasks.push({ id: "task-team-member", organizationId, assignee: memberA.id, teamId: "team-a", status: "Completed" });
  const teammateSubmission = await call(
    store,
    "POST",
    "/api/tasks/task-team-member/submissions",
    teamMember,
    { description: "Submitted by a teammate." }
  );
  assert.equal(teammateSubmission.status, 201);

  const memberList = await call(store, "GET", "/api/submissions", memberA);
  assert.deepEqual(
    memberList.body.submissions.map((entry) => entry.taskId).sort(),
    ["task-a", "task-b", "task-team-member"].sort()
  );
  const leadList = await call(store, "GET", "/api/submissions", leadA);
  assert.deepEqual(
    leadList.body.submissions.map((entry) => entry.taskId).sort(),
    ["task-a", "task-b", "task-team-member"].sort()
  );
});

test("review requires authorization and feedback for revision requests, and locks final decisions", async (t) => {
  const store = createStore();
  t.after(() => store.restore());

  const organizationId = "organization-a";
  const member = { id: "member-a", organizationId, role: "member" };
  const lead = { id: "lead-a", organizationId, role: "member" };
  const manager = { id: "manager-a", organizationId, role: "manager" };
  const admin = { id: "admin-a", name: "Workspace Admin", organizationId, role: "admin" };
  store.tasks.push({
    id: "task-a",
    organizationId,
    assignee: member.id,
    teamId: "team-a",
    status: "Completed",
  });
  store.teams.push({ id: "team-a", organizationId, leaderId: lead.id });

  const created = await call(
    store,
    "POST",
    "/api/tasks/task-a/submissions",
    member,
    { description: "First version." }
  );
  const submissionId = created.body.submission.id;

  assert.equal((await call(
    store,
    "PATCH",
    `/api/submissions/${submissionId}/review`,
    lead,
    { status: "Revision requested", feedback: "Lead cannot make the final decision." }
  )).status, 403);

  const revision = await call(
    store,
    "PATCH",
    `/api/submissions/${submissionId}/review`,
    admin,
    { status: "Revision requested", feedback: "Please add the test results." }
  );
  assert.equal(revision.status, 200);
  assert.equal(revision.body.submission.feedback, "Please add the test results.");

  const resubmitted = await call(
    store,
    "POST",
    "/api/tasks/task-a/submissions",
    member,
    { description: "Updated version with test results." }
  );
  assert.equal(resubmitted.status, 201);
  const resubmittedId = resubmitted.body.submission.id;

  assert.equal((await call(
    store,
    "PATCH",
    `/api/submissions/${resubmittedId}/review`,
    member,
    { status: "Approved" }
  )).status, 403);

  assert.equal((await call(
    store,
    "PATCH",
    `/api/submissions/${resubmittedId}/review`,
    manager,
    { status: "Rejected", feedback: "Late decision." }
  )).status, 403);
  const approved = await call(
    store,
    "PATCH",
    `/api/submissions/${resubmittedId}/review`,
    admin,
    { status: "Approved" }
  );
  assert.equal(approved.status, 200);
  assert.equal(approved.body.submission.reviewedBy, admin.id);
  assert.equal((await call(
    store,
    "PATCH",
    `/api/submissions/${resubmittedId}/review`,
    admin,
    { status: "Rejected", feedback: "Late decision." }
  )).status, 409);
});

test("organization members can read and comment on submissions, while only admins can set formal feedback or delete comments", async (t) => {
  const store = createStore();
  t.after(() => store.restore());

  const organizationId = "organization-a";
  const member = { id: "member-a", organizationId, role: "member" };
  const lead = { id: "lead-a", organizationId, role: "member" };
  const outsider = { id: "outsider", organizationId, role: "member" };
  const admin = { id: "admin-a", name: "Workspace Admin", organizationId, role: "admin" };
  store.tasks.push({
    id: "task-a",
    organizationId,
    assignee: member.id,
    teamId: "team-a",
    status: "Completed",
  });
  store.teams.push({ id: "team-a", organizationId, leaderId: lead.id });

  const created = await call(
    store,
    "POST",
    "/api/tasks/task-a/submissions",
    member,
    { description: "Submitted work." }
  );
  const submissionId = created.body.submission.id;

  const comment = await call(
    store,
    "POST",
    `/api/submissions/${submissionId}/comments`,
    lead,
    { text: "Please add one screenshot." }
  );
  assert.equal(comment.status, 201);
  assert.equal(comment.body.comment.authorId, lead.id);
  assert.equal(comment.body.submission.comments.length, 1);
  const outsiderRead = await call(store, "GET", `/api/submissions/${submissionId}`, outsider);
  assert.equal(outsiderRead.status, 200);
  const outsiderComment = await call(
    store,
    "POST",
    `/api/submissions/${submissionId}/comments`,
    outsider,
    { text: "Not part of this review." }
  );
  assert.equal(outsiderComment.status, 201);
  assert.equal(outsiderComment.body.submission.comments.length, 2);

  const deniedDelete = await call(
    store,
    "DELETE",
    `/api/submissions/${submissionId}/comments/${comment.body.comment.id}`,
    outsider
  );
  assert.equal(deniedDelete.status, 403);
  const deletedComment = await call(
    store,
    "DELETE",
    `/api/submissions/${submissionId}/comments/${comment.body.comment.id}`,
    admin
  );
  assert.equal(deletedComment.status, 200);
  assert.equal(deletedComment.body.submission.comments.length, 1);

  const feedback = await call(
    store,
    "PATCH",
    `/api/submissions/${submissionId}/feedback`,
    admin,
    { feedback: "The implementation is clear so far." }
  );
  assert.equal(feedback.status, 200);
  assert.equal(feedback.body.submission.feedback, "The implementation is clear so far.");
  assert.equal(feedback.body.submission.status, "Submitted");
  assert.equal((await call(
    store,
    "PATCH",
    `/api/submissions/${submissionId}/feedback`,
    lead,
    { feedback: "Self-authored feedback." }
  )).status, 403);
});

test("admins can list every task and rejections persist reviewer attribution and explanation as a comment", async (t) => {
  const store = createStore();
  t.after(() => store.restore());

  const organizationId = "organization-a";
  const member = { id: "member-a", organizationId, role: "member" };
  const admin = { id: "admin-a", name: "Workspace Admin", organizationId, role: "admin" };
  store.tasks.push(
    { id: "task-completed", organizationId, assignee: member.id, status: "Completed", createdAt: new Date("2026-03-02") },
    { id: "task-active", organizationId, assignee: member.id, status: "In progress", createdAt: new Date("2026-03-01") }
  );

  const forbiddenQueue = await call(store, "GET", "/api/submissions/queue", member);
  assert.equal(forbiddenQueue.status, 403);

  const queue = await call(store, "GET", "/api/submissions/queue", admin);
  assert.equal(queue.status, 200);
  assert.deepEqual(queue.body.tasks.map((task) => task.status), ["Completed", "In progress"]);

  const created = await call(
    store,
    "POST",
    "/api/tasks/task-completed/submissions",
    member,
    { description: "Finished work." }
  );
  const rejected = await call(
    store,
    "PATCH",
    `/api/submissions/${created.body.submission.id}/review`,
    admin,
    { status: "Rejected", feedback: "Please add the missing accessibility notes." }
  );
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.submission.status, "Rejected");
  assert.equal(rejected.body.submission.reviewedBy, admin.id);
  assert.equal(rejected.body.submission.feedback, "Please add the missing accessibility notes.");
  assert.match(rejected.body.submission.comments[0].text, /rejected by Workspace Admin/);
  assert.match(rejected.body.submission.comments[0].text, /missing accessibility notes/);
});

test("Multer uploads files to private storage and download access is scoped to participants", async (t) => {
  const store = createStore();
  const storageDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "orbit-submissions-"));
  const member = { id: "member-a", organizationId: "organization-a", role: "member" };
  let currentUser = member;
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    store.restore();
    await fs.rm(storageDirectory, { recursive: true, force: true });
  });

  store.tasks.push({
    id: "task-a",
    organizationId: member.organizationId,
    assignee: member.id,
    status: "Completed",
  });
  const created = await call(
    store,
    "POST",
    "/api/tasks/task-a/submissions",
    member,
    { description: "A file-backed submission." }
  );
  const submissionId = created.body.submission.id;
  const receiveFiles = createUploadMiddleware(storageDirectory);

  server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    handleSubmissions(request, response, url.pathname, {
      user: currentUser,
      db: store.db,
      readJsonBody: async () => ({}),
      receiveFiles,
      storageDirectory,
    }).catch((error) => {
      const status = error instanceof SubmissionRouteError ? error.status : 500;
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const form = new FormData();
  form.append("files", new Blob(["verified submission file"], { type: "application/pdf" }), "work.pdf");
  const uploadResponse = await fetch(`${baseUrl}/api/submissions/${submissionId}/files`, {
    method: "POST",
    body: form,
  });
  assert.equal(uploadResponse.status, 201);
  const uploadResult = await uploadResponse.json();
  const uploadedFile = uploadResult.files[0];
  assert.equal(uploadedFile.originalName, "work.pdf");
  assert.equal(uploadedFile.size, 24);
  assert.equal((await fs.readdir(storageDirectory)).length, 1);

  const downloadResponse = await fetch(
    `${baseUrl}/api/submissions/${submissionId}/files/${uploadedFile.id}`
  );
  assert.equal(downloadResponse.status, 200);
  assert.match(downloadResponse.headers.get("content-disposition"), /attachment/);
  assert.equal(await downloadResponse.text(), "verified submission file");

  const unsupportedForm = new FormData();
  unsupportedForm.append(
    "files",
    new Blob(["not allowed"], { type: "application/octet-stream" }),
    "payload.exe"
  );
  const unsupportedResponse = await fetch(`${baseUrl}/api/submissions/${submissionId}/files`, {
    method: "POST",
    body: unsupportedForm,
  });
  assert.equal(unsupportedResponse.status, 415);
  assert.equal((await fs.readdir(storageDirectory)).length, 1);

  const excessForm = new FormData();
  for (let index = 0; index < 5; index += 1) {
    excessForm.append(
      "files",
      new Blob(["extra"], { type: "application/pdf" }),
      `extra-${index}.pdf`
    );
  }
  const excessResponse = await fetch(`${baseUrl}/api/submissions/${submissionId}/files`, {
    method: "POST",
    body: excessForm,
  });
  assert.equal(excessResponse.status, 400);
  assert.equal((await fs.readdir(storageDirectory)).length, 1);

  currentUser = { id: "outsider", organizationId: member.organizationId, role: "member" };
  const deniedDownload = await fetch(
    `${baseUrl}/api/submissions/${submissionId}/files/${uploadedFile.id}`
  );
  assert.equal(deniedDownload.status, 403);
});
