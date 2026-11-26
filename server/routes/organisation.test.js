const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const Announcement = require("../models/Announcement");
const Contribution = require("../models/Contribution");
const Event = require("../models/Event");
const Team = require("../models/Team");
const User = require("../models/User");
const { handleOrganisation, OrganisationRouteError } = require("./organisation");

function query(value) {
  return {
    select() { return this; },
    sort() { return this; },
    skip() { return this; },
    limit() { return this; },
    lean() { return Promise.resolve(value); },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
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

function fakeRecord(values, collection) {
  const record = {
    ...values,
    toObject() {
      return { ...this };
    },
    async save() {
      this.updatedAt = new Date();
      return this;
    },
  };
  collection.push(record);
  return record;
}

function installRecordStore(model, initialRecords) {
  const records = initialRecords;
  model.find = (filter) => query(records.filter((record) =>
    Object.entries(filter).every(([key, value]) => record[key] === value)
  ));
  model.findOne = (filter) => query(records.find((record) =>
    Object.entries(filter).every(([key, value]) => record[key] === value)
  ) || null);
  model.findOneAndDelete = async (filter) => {
    const index = records.findIndex((record) =>
      Object.entries(filter).every(([key, value]) => record[key] === value)
    );
    return index < 0 ? null : records.splice(index, 1)[0];
  };
  model.create = async (values) => fakeRecord({
    ...values,
    createdAt: new Date(),
    updatedAt: new Date(),
  }, records);
  return records;
}

async function call(method, pathname, user, body, db, url = pathname) {
  const result = response();
  try {
    await handleOrganisation(
      { method, body, url },
      result,
      pathname,
      { user, db, readJsonBody: async (request) => request.body }
    );
  } catch (error) {
    if (!(error instanceof OrganisationRouteError)) throw error;
    result.status = error.status;
    result.body = { error: error.message };
  }
  return result;
}

test("event and announcement APIs validate, mutate, and isolate records by organisation", async (t) => {
  const original = {
    eventFind: Event.find,
    eventFindOne: Event.findOne,
    eventFindOneAndDelete: Event.findOneAndDelete,
    eventCreate: Event.create,
    announcementFind: Announcement.find,
    announcementFindOne: Announcement.findOne,
    announcementFindOneAndDelete: Announcement.findOneAndDelete,
    announcementCreate: Announcement.create,
  };
  const events = installRecordStore(Event, []);
  const announcements = installRecordStore(Announcement, []);
  const organizationA = "test-organization-a";
  const organizationB = "test-organization-b";
  const userA = { id: "test-user-a", organizationId: organizationA };
  const userB = { id: "test-user-b", organizationId: organizationB };
  t.after(() => {
    Event.find = original.eventFind;
    Event.findOne = original.eventFindOne;
    Event.findOneAndDelete = original.eventFindOneAndDelete;
    Event.create = original.eventCreate;
    Announcement.find = original.announcementFind;
    Announcement.findOne = original.announcementFindOne;
    Announcement.findOneAndDelete = original.announcementFindOneAndDelete;
    Announcement.create = original.announcementCreate;
  });

  const created = await call("POST", "/api/organisation/events", userA, {
    organizationId: organizationB,
    title: "Planning session",
    date: "2099-06-02T10:00:00.000Z",
    checklist: [{ text: "Prepare agenda" }],
  });
  assert.equal(created.status, 201);
  const eventId = created.body.event.id;
  assert.equal(created.body.event.organizationId, organizationA);

  const itemResponse = await call("POST", `/api/organisation/events/${eventId}/checklist`, userA, {
    text: "Book a room",
  });
  assert.equal(itemResponse.status, 201);
  const itemId = itemResponse.body.item.id;
  const checklistUpdate = await call(
    "PATCH",
    `/api/organisation/events/${eventId}/checklist/${itemId}`,
    userA,
    { text: "Reserve a room", completed: true }
  );
  assert.equal(checklistUpdate.body.item.text, "Reserve a room");
  assert.equal(checklistUpdate.body.item.completed, true);

  const privateEvent = fakeRecord({
    id: crypto.randomUUID(),
    organizationId: organizationB,
    title: "Private event",
    checklist: [],
  }, events);
  const privateEventResponse = await call(
    "GET",
    `/api/organisation/events/${privateEvent.id}`,
    userA
  );
  assert.equal(privateEventResponse.status, 404);
  assert.equal((await call("PATCH", `/api/organisation/events/${privateEvent.id}`, userA, {
    title: "Not allowed",
  })).status, 404);
  assert.equal((await call("DELETE", `/api/organisation/events/${privateEvent.id}`, userA)).status, 404);
  const eventList = await call("GET", "/api/organisation/events", userA);
  assert(!eventList.body.events.some((event) => event.id === privateEvent.id));
  const ownEventUpdate = await call(
    "PATCH",
    `/api/organisation/events/${eventId}`,
    userA,
    { title: "Updated planning session" }
  );
  assert.equal(ownEventUpdate.body.event.title, "Updated planning session");
  const removedItem = await call(
    "DELETE",
    `/api/organisation/events/${eventId}/checklist/${itemId}`,
    userA
  );
  assert.equal(removedItem.status, 200);
  assert.equal(removedItem.body.event.checklist.length, 1);
  assert.equal((await call("DELETE", `/api/organisation/events/${eventId}`, userA)).status, 200);

  assert.equal((await call(
    "POST",
    "/api/organisation/events",
    userA,
    { title: "Bad date", date: "2026-02-31" }
  )).status, 400);
  assert.equal((await call(
    "POST",
    "/api/organisation/events",
    userA,
    { title: "   ", date: "2099-06-02" }
  )).status, 400);

  const announcement = await call("POST", "/api/organisation/announcements", userA, {
    title: "Service update",
    content: "Initial message",
  });
  assert.equal(announcement.status, 201);
  const announcementId = announcement.body.announcement.id;
  const updatedAnnouncement = await call(
    "PATCH",
    `/api/organisation/announcements/${announcementId}`,
    userA,
    { content: "Updated message" }
  );
  assert.equal(updatedAnnouncement.body.announcement.content, "Updated message");
  const privateAnnouncement = fakeRecord({
    id: crypto.randomUUID(),
    organizationId: organizationB,
    title: "Private notice",
    content: "Secret",
  }, announcements);
  const announcementList = await call("GET", "/api/organisation/announcements", userA);
  assert(!announcementList.body.announcements.some((entry) => entry.id === privateAnnouncement.id));
  assert.equal((await call(
    "GET",
    `/api/organisation/announcements/${privateAnnouncement.id}`,
    userA
  )).status, 404);
  assert.equal((await call(
    "PATCH",
    `/api/organisation/announcements/${privateAnnouncement.id}`,
    userA,
    { content: "Not allowed" }
  )).status, 404);
  assert.equal((await call(
    "DELETE",
    `/api/organisation/announcements/${privateAnnouncement.id}`,
    userA
  )).status, 404);
  assert.equal((await call(
    "DELETE",
    `/api/organisation/announcements/${announcementId}`,
    userA
  )).status, 200);
  assert.equal((await call("GET", "/api/organisation/events/%20", userA)).status, 400);
  assert.equal((await call("GET", "/api/organisation/events", null)).status, 401);
  assert.equal(userB.organizationId, organizationB);
});

test("workspace announcement aliases paginate and isolate CRUD by organisation", async (t) => {
  const original = {
    find: Announcement.find,
    findOne: Announcement.findOne,
    findOneAndDelete: Announcement.findOneAndDelete,
    create: Announcement.create,
    countDocuments: Announcement.countDocuments,
  };
  const records = installRecordStore(Announcement, []);
  Announcement.countDocuments = async (filter) => records.filter((record) =>
    Object.entries(filter).every(([key, value]) => record[key] === value)
  ).length;
  t.after(() => {
    Announcement.find = original.find;
    Announcement.findOne = original.findOne;
    Announcement.findOneAndDelete = original.findOneAndDelete;
    Announcement.create = original.create;
    Announcement.countDocuments = original.countDocuments;
  });

  const organizationA = "workspace-a";
  const userA = { id: "member-a", organizationId: organizationA, role: "member" };
  const created = await call("POST", "/api/announcements", userA, {
    title: "Workspace update",
    message: "Welcome",
    priority: "Important",
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.announcement.content, "Welcome");
  assert.equal(created.body.announcement.message, "Welcome");

  const ownId = created.body.announcement.id;
  const privateRecord = fakeRecord({
    id: crypto.randomUUID(),
    organizationId: "workspace-b",
    title: "Private update",
    content: "Not visible",
    priority: "Urgent",
  }, records);
  const list = await call(
    "GET",
    "/api/announcements",
    userA,
    undefined,
    undefined,
    "/api/announcements?page=1&limit=5&priority=Important"
  );
  assert.equal(list.status, 200);
  assert.equal(list.body.pagination.total, 1);
  assert.deepEqual(list.body.announcements.map((entry) => entry.id), [ownId]);
  assert.equal((await call("GET", `/api/announcements/${privateRecord.id}`, userA)).status, 404);
  assert.equal((await call("PUT", `/api/announcements/${privateRecord.id}`, userA, {
    message: "Attempt",
  })).status, 404);
  assert.equal((await call("DELETE", `/api/announcements/${privateRecord.id}`, userA)).status, 404);

  const updated = await call("PUT", `/api/announcements/${ownId}`, userA, {
    title: "Updated workspace update",
    message: "Changed",
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.announcement.message, "Changed");
  assert.equal((await call("DELETE", `/api/announcements/${ownId}`, userA)).status, 200);
  assert.equal((await call("GET", "/api/announcements", userA, undefined, undefined,
    "/api/announcements?page=0")).status, 400);
});

test("dashboard counts status and overdue tasks and returns scoped team and member totals", async (t) => {
  const original = {
    teamFind: Team.find,
    userFind: User.find,
    contributionAggregate: Contribution.aggregate,
    eventFind: Event.find,
  };
  const organizationId = "analytics-organization";
  const memberId = "analytics-member";
  const teamId = "analytics-team";
  Team.find = (filter) => query(filter.organizationId === organizationId
    ? [{ id: teamId, name: "Analytics team", leaderId: memberId, members: [{ userId: memberId }] }]
    : []);
  User.find = (filter) => {
    if (filter.organizationId !== organizationId) return query([]);
    if (filter.id && filter.id.$in) {
      return query([{ id: memberId, name: "Analytics member" }]);
    }
    return query([{ id: memberId, name: "Analytics member", role: "member" }]);
  };
  Contribution.aggregate = async (pipeline) => {
    assert.deepEqual(pipeline[0].$match.teamId.$in, [teamId]);
    return [{
      _id: memberId,
      contributionPoints: 42,
      contributionCount: 2,
    }];
  };
  Event.find = (filter) => {
    assert.equal(filter.organizationId, organizationId);
    return query([]);
  };
  t.after(() => {
    Team.find = original.teamFind;
    User.find = original.userFind;
    Contribution.aggregate = original.contributionAggregate;
    Event.find = original.eventFind;
  });

  let taskAggregate = 0;
  const db = {
    collection() {
      return {
        aggregate(pipeline) {
          taskAggregate += 1;
          assert.equal(pipeline[0].$match.organizationId, organizationId);
          const groupId = pipeline.find((stage) => stage.$group)?.$group?._id;
          const rows = groupId === null
            ? [{ totalTasks: 3, completedTasks: 1, overdueTasks: 1 }]
            : groupId === "$teamId"
              ? [{ _id: teamId, totalTasks: 3, completedTasks: 1, overdueTasks: 1 }]
              : groupId === "$assignee"
                ? [{ _id: memberId, assignedTasks: 3, completedTasks: 1 }]
                : [];
          return { toArray: async () => rows };
        },
      };
    },
  };
  const result = await call(
    "GET",
    "/api/organisation/dashboard",
    { id: "analytics-user", organizationId },
    undefined,
    db
  );
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.stats, {
    totalTasks: 3,
    completedTasks: 1,
    pendingTasks: 2,
    overdueTasks: 1,
    totalTeams: 1,
    totalMembers: 1,
    completionPercentage: 33,
  });
  assert.equal(result.body.teams[0].productivity, 33);
  assert.equal(result.body.members[0].assignedTasks, 3);
  assert.equal(result.body.members[0].contributionPoints, 42);
  assert.equal(result.body.topPerformers[0].id, memberId);
  assert.equal(result.body.stats.totalTeams, 1);
  assert.equal(result.body.stats.totalMembers, 1);
  assert.equal(result.body.submissionTrackingAvailable, false);
  assert.equal(taskAggregate, 5);
});

test("workspace data is scoped to the current member and their teams", async (t) => {
  const original = {
    teamFind: Team.find,
    userFind: User.find,
    eventFind: Event.find,
    contributionAggregate: Contribution.aggregate,
    contributionFind: Contribution.find,
  };
  const organizationId = "workspace-organization";
  const memberId = "workspace-member";
  const teamId = "workspace-team";
  const team = {
    id: teamId,
    name: "Workspace team",
    leaderId: "workspace-leader",
    members: [{ userId: memberId }, { userId: "workspace-leader" }],
  };
  Team.find = (filter) => {
    assert.equal(filter.organizationId, organizationId);
    assert(filter.$or.some((clause) => clause.leaderId === memberId));
    assert(filter.$or.some((clause) => clause["members.userId"] === memberId));
    return query([team]);
  };
  User.find = (filter) => {
    assert.equal(filter.organizationId, organizationId);
    assert.deepEqual(new Set(filter.id.$in), new Set([memberId, "workspace-leader"]));
    return query([
      { id: memberId, name: "Workspace member", role: "member" },
      { id: "workspace-leader", name: "Workspace leader", role: "member" },
    ]);
  };
  Event.find = (filter) => {
    assert.equal(filter.organizationId, organizationId);
    return query([]);
  };
  Contribution.aggregate = async (pipeline) => {
    assert.deepEqual(pipeline[0].$match, { teamId: { $in: [teamId] }, memberId });
    return [{ points: 15, count: 1 }];
  };
  Contribution.find = (filter) => {
    assert.deepEqual(filter, { teamId: { $in: [teamId] }, memberId });
    return query([{
      id: "workspace-contribution",
      memberId,
      teamId,
      points: 15,
      reason: "Completed task",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    }]);
  };
  t.after(() => {
    Team.find = original.teamFind;
    User.find = original.userFind;
    Event.find = original.eventFind;
    Contribution.aggregate = original.contributionAggregate;
    Contribution.find = original.contributionFind;
  });

  const task = {
    id: "workspace-task",
    organizationId,
    teamId,
    assignee: memberId,
    title: "Assigned task",
    status: "In progress",
    dueDate: "2099-01-01",
  };
  const db = {
    collection() {
      return {
        aggregate(pipeline) {
          assert.equal(pipeline[0].$match.organizationId, organizationId);
          if (pipeline.some((stage) => stage.$group?._id === null)) {
            return { toArray: async () => [{ totalTasks: 2, completedTasks: 1, overdueTasks: 0 }] };
          }
          if (pipeline.some((stage) => stage.$group?._id === "$teamId")) {
            return { toArray: async () => [{ _id: teamId, totalTasks: 2, completedTasks: 1 }] };
          }
          return { toArray: async () => [] };
        },
        find(filter) {
          assert.equal(filter.organizationId, organizationId);
          assert(filter.$or.some((clause) => clause.assignee === memberId));
          assert(filter.$or.some((clause) => clause.teamId?.$in.includes(teamId)));
          return {
            sort() { return this; },
            limit() { return this; },
            toArray: async () => [task],
          };
        },
      };
    },
  };
  const result = await call(
    "GET",
    "/api/organisation/workspace",
    { id: memberId, name: "Workspace member", role: "member", organizationId },
    undefined,
    db
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.scope, "member");
  assert.equal(result.body.stats.totalTasks, 2);
  assert.equal(result.body.stats.contributionPoints, 15);
  assert.equal(result.body.teams[0].productivity, 50);
  assert.equal(result.body.tasks[0].title, "Assigned task");
  assert.equal(result.body.recentActivity[0].memberName, "Workspace member");
  assert.equal(result.body.submissionTrackingAvailable, false);
  const memberList = await call(
    "GET",
    "/api/organizations/members",
    { id: memberId, role: "member", organizationId },
    undefined,
    db
  );
  assert.equal(memberList.status, 200);
  assert.deepEqual(memberList.body.members.map((member) => member.id), [memberId, "workspace-leader"]);
});

test("event and announcement schemas require organisation IDs and core fields", () => {
  const event = new Event({
    id: "schema-event",
    organizationId: "schema-org",
    title: "Valid event",
    date: new Date("2099-01-01T00:00:00.000Z"),
    createdBy: "schema-user",
  });
  assert.equal(event.validateSync(), undefined);
  const invalidEvent = new Event({ id: "invalid-event", title: "", createdBy: "schema-user" });
  assert(invalidEvent.validateSync());

  const announcement = new Announcement({
    id: "schema-announcement",
    organizationId: "schema-org",
    title: "Valid announcement",
    content: "A message",
    createdBy: "schema-user",
  });
  assert.equal(announcement.validateSync(), undefined);
  const invalidAnnouncement = new Announcement({ id: "invalid-announcement" });
  assert(invalidAnnouncement.validateSync());
});
