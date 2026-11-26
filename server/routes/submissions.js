const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const Submission = require("../models/Submission");
const Team = require("../models/Team");
const { DEFAULT_ORGANIZATION_ID } = require("../organization");

const reviewStatuses = ["Under review", "Revision requested", "Approved", "Rejected"];
const maxFilesPerSubmission = 5;
const uploadDirectory = path.resolve(__dirname, "..", "..", ".orbit-data", "submissions");
const allowedUploadTypes = {
  ".csv": ["text/csv", "application/vnd.ms-excel"],
  ".css": ["text/css", "text/plain"],
  ".doc": ["application/msword", "application/octet-stream"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".fig": ["application/octet-stream"],
  ".html": ["text/html", "text/plain"],
  ".jpeg": ["image/jpeg"],
  ".jpg": ["image/jpeg"],
  ".js": ["text/javascript", "application/javascript", "text/plain"],
  ".json": ["application/json", "text/plain"],
  ".md": ["text/markdown", "text/plain"],
  ".pdf": ["application/pdf"],
  ".png": ["image/png"],
  ".pptx": ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ".py": ["text/x-python", "text/plain"],
  ".ts": ["text/plain"],
  ".tsx": ["text/plain"],
  ".txt": ["text/plain"],
  ".webp": ["image/webp"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ".zip": ["application/zip", "application/x-zip-compressed"],
};

function safeOriginalName(value) {
  return path.basename(String(value).replace(/\\/g, "/"))
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
}

function createUploadMiddleware(directory = uploadDirectory) {
  const storage = multer.diskStorage({
    destination(request, file, callback) {
      fs.mkdir(directory, { recursive: true }, (error) => callback(error, directory));
    },
    filename(request, file, callback) {
      callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
    },
  });
  const middleware = multer({
    storage,
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: maxFilesPerSubmission,
      fields: 0,
      parts: maxFilesPerSubmission,
    },
    fileFilter(request, file, callback) {
      const originalName = safeOriginalName(file.originalname);
      const extension = path.extname(originalName).toLowerCase();
      const mimeTypes = allowedUploadTypes[extension];
      if (!originalName || originalName.length > 255 || !mimeTypes || !mimeTypes.includes(file.mimetype)) {
        callback(new SubmissionRouteError(415, "This file type is not supported."));
        return;
      }
      callback(null, true);
    },
  }).array("files", maxFilesPerSubmission);

  return (request, response) => new Promise((resolve, reject) => {
    middleware(request, response, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(request.files || []);
    });
  });
}

const receiveUploadedFiles = createUploadMiddleware();

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
}

class SubmissionRouteError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function recordId(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new SubmissionRouteError(400, `${label} is invalid.`);
  }
  return value;
}

function decodedRecordId(value, label) {
  try {
    return recordId(decodeURIComponent(value), label);
  } catch (error) {
    if (error instanceof SubmissionRouteError) throw error;
    throw new SubmissionRouteError(400, `${label} is invalid.`);
  }
}

function requiredText(value, field, max) {
  if (typeof value !== "string") {
    throw new SubmissionRouteError(400, `${field} is required.`);
  }
  const result = value.trim();
  if (!result) throw new SubmissionRouteError(400, `${field} is required.`);
  if (result.length > max) {
    throw new SubmissionRouteError(400, `${field} must be no longer than ${max} characters.`);
  }
  return result;
}

async function findTask(db, taskId, organizationId) {
  const task = await db.collection("tasks").findOne({ id: taskId, organizationId });
  if (!task) throw new SubmissionRouteError(404, "Task not found.");
  return task;
}

async function canSubmitTask(task, user, organizationId) {
  if (task.assignee === user.id) return true;
  if (typeof task.teamId !== "string" || !task.teamId) return false;
  const team = await Team.findOne({ id: task.teamId, organizationId }).lean();
  return Boolean(team && (
    team.leaderId === user.id ||
    (team.members || []).some((member) => member.userId === user.id)
  ));
}

async function authorizeFileAccess(submission, user, db, organizationId) {
  if (["manager", "admin"].includes(user.role || "member")) return;
  const task = await findTask(db, submission.taskId, organizationId);
  if (submission.submittedBy === user.id || await canSubmitTask(task, user, organizationId)) return;
  throw new SubmissionRouteError(403, "You do not have permission to access this submission file.");
}

async function removeUploadedFiles(files) {
  await Promise.all(files.map(async (file) => {
    try {
      await fs.promises.unlink(file.path);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }));
}

function mapUploadError(error) {
  if (error instanceof SubmissionRouteError) throw error;
  if (error instanceof multer.MulterError) {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "Each uploaded file must be 10 MB or smaller."
      : "The uploaded files do not meet the upload limits.";
    throw new SubmissionRouteError(status, message);
  }
  throw error;
}

async function createSubmission(request, response, user, db, readJsonBody, taskId, organizationId) {
  const task = await findTask(db, taskId, organizationId);
  if (!await canSubmitTask(task, user, organizationId)) {
    throw new SubmissionRouteError(403, "Only the assignee or a member of the task's team can submit this task.");
  }
  if (task.status !== "Completed") {
    throw new SubmissionRouteError(409, "Complete the task before submitting it for review.");
  }

  const body = await readJsonBody(request);
  const description = requiredText(body.description, "Submission description", 5000);
  const latestSubmission = await Submission.findOne({
    organizationId,
    taskId,
  }).sort({ createdAt: -1 }).lean();
  if (latestSubmission && latestSubmission.status !== "Revision requested") {
    throw new SubmissionRouteError(409, "This task already has a submission that cannot be resubmitted.");
  }

  let submission;
  try {
    submission = await Submission.create({
      id: crypto.randomUUID(),
      organizationId,
      taskId,
      submittedBy: user.id,
      description,
    });
  } catch (error) {
    if (error.code === 11000) {
      throw new SubmissionRouteError(409, "This task already has an active submission.");
    }
    throw error;
  }
  sendJson(response, 201, { submission });
}

async function listSubmissions(response, request, organizationId) {
  const url = new URL(request.url, "http://localhost");
  const filter = { organizationId };
  const taskId = url.searchParams.get("taskId");
  const status = url.searchParams.get("status");
  if (taskId !== null) filter.taskId = recordId(taskId, "Task ID");
  if (status !== null) {
    if (!["Submitted", ...reviewStatuses].includes(status)) {
      throw new SubmissionRouteError(400, "Submission status is invalid.");
    }
    filter.status = status;
  }
  const submissions = await Submission.find(filter).sort({ createdAt: -1 }).lean();
  sendJson(response, 200, { submissions });
}

async function listAdminTaskQueue(response, user, db, organizationId) {
  if (user.role !== "admin") {
    throw new SubmissionRouteError(403, "Only workspace admins can view the organization task queue.");
  }
  const tasks = await db.collection("tasks").find(
    { organizationId },
    {
      projection: {
        _id: 0,
        id: 1,
        title: 1,
        description: 1,
        status: 1,
        teamId: 1,
        team: 1,
        assignee: 1,
        dueDate: 1,
        priority: 1,
        createdAt: 1,
      },
    }
  ).sort({ createdAt: -1 }).toArray();
  sendJson(response, 200, { tasks });
}

async function getSubmission(response, submissionId, organizationId) {
  const submission = await Submission.findOne({ id: submissionId, organizationId }).lean();
  if (!submission) throw new SubmissionRouteError(404, "Submission not found.");
  sendJson(response, 200, { submission });
}

async function removeSubmissionComment(response, submissionId, commentId, user, organizationId) {
  if (user.role !== "admin") {
    throw new SubmissionRouteError(403, "Only workspace admins can delete submission comments.");
  }
  const updatedSubmission = await Submission.findOneAndUpdate(
    { id: submissionId, organizationId, "comments.id": commentId },
    {
      $pull: { comments: { id: commentId } },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: "after", runValidators: true }
  );
  if (!updatedSubmission) {
    const submission = await Submission.findOne({ id: submissionId, organizationId }).lean();
    if (!submission) throw new SubmissionRouteError(404, "Submission not found.");
    throw new SubmissionRouteError(404, "Submission comment not found.");
  }
  sendJson(response, 200, { submission: updatedSubmission });
}

async function addSubmissionFiles(request, response, submissionId, user, db, organizationId, receiveFiles, storageDirectory) {
  const submission = await Submission.findOne({ id: submissionId, organizationId }).lean();
  if (!submission) throw new SubmissionRouteError(404, "Submission not found.");
  if (submission.submittedBy !== user.id) {
    throw new SubmissionRouteError(403, "Only the submitter can add files.");
  }
  if (submission.status !== "Submitted") {
    throw new SubmissionRouteError(409, "Files can only be added to a submission awaiting review.");
  }
  const task = await findTask(db, submission.taskId, organizationId);
  if (task.status !== "Completed") {
    throw new SubmissionRouteError(409, "The task must remain completed while its files are attached.");
  }

  let uploadedFiles;
  try {
    uploadedFiles = await receiveFiles(request, response);
  } catch (error) {
    mapUploadError(error);
  }
  if (!uploadedFiles.length) {
    throw new SubmissionRouteError(400, "Attach at least one file using the files field.");
  }
  if ((submission.files || []).length + uploadedFiles.length > maxFilesPerSubmission) {
    await removeUploadedFiles(uploadedFiles);
    throw new SubmissionRouteError(400, `A submission can contain at most ${maxFilesPerSubmission} files.`);
  }

  const files = uploadedFiles.map((file) => ({
    id: crypto.randomUUID(),
    originalName: safeOriginalName(file.originalname),
    storageKey: file.filename,
    mimeType: file.mimetype,
    size: file.size,
  }));
  let updatedSubmission;
  try {
    updatedSubmission = await Submission.findOneAndUpdate(
      {
        id: submissionId,
        organizationId,
        submittedBy: user.id,
        status: "Submitted",
        $expr: {
          $lte: [
            { $add: [{ $size: { $ifNull: ["$files", []] } }, uploadedFiles.length] },
            maxFilesPerSubmission,
          ],
        },
      },
      {
        $push: { files: { $each: files } },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: "after", runValidators: true }
    );
  } catch (error) {
    await removeUploadedFiles(uploadedFiles);
    throw error;
  }
  if (!updatedSubmission) {
    await removeUploadedFiles(uploadedFiles);
    throw new SubmissionRouteError(409, "The submission changed or reached its file limit.");
  }
  sendJson(response, 201, { submission: updatedSubmission, files });
}

async function downloadSubmissionFile(response, submissionId, fileId, user, db, organizationId, storageDirectory) {
  const submission = await Submission.findOne({ id: submissionId, organizationId }).lean();
  if (!submission) throw new SubmissionRouteError(404, "Submission not found.");
  await authorizeFileAccess(submission, user, db, organizationId);

  const file = (submission.files || []).find((item) => item.id === fileId);
  if (!file) throw new SubmissionRouteError(404, "Submission file not found.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-z0-9]+$/i.test(file.storageKey)) {
    throw new SubmissionRouteError(404, "Submission file not found.");
  }

  const directory = path.resolve(storageDirectory);
  const filePath = path.resolve(directory, file.storageKey);
  if (path.dirname(filePath) !== directory) {
    throw new SubmissionRouteError(404, "Submission file not found.");
  }
  let fileStats;
  try {
    fileStats = await fs.promises.stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") throw new SubmissionRouteError(404, "Submission file not found.");
    throw error;
  }
  if (!fileStats.isFile()) throw new SubmissionRouteError(404, "Submission file not found.");

  const fallbackName = file.originalName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const fileExtension = path.extname(file.storageKey).toLowerCase();
  const contentType = allowedUploadTypes[fileExtension]?.includes(file.mimeType)
    ? file.mimeType
    : "application/octet-stream";
  response.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": fileStats.size,
    "Content-Disposition": `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  const stream = fs.createReadStream(filePath);
  stream.on("error", (error) => {
    console.error("Failed to stream submission file:", error);
    if (!response.headersSent) sendJson(response, 500, { error: "Unable to read the submission file." });
    else response.destroy(error);
  });
  stream.pipe(response);
}

async function updateSubmissionFeedback(request, response, submissionId, user, readJsonBody, organizationId) {
  const body = await readJsonBody(request);
  const feedback = requiredText(body.feedback, "Feedback", 5000);
  const submission = await Submission.findOne({ id: submissionId, organizationId }).lean();
  if (!submission) throw new SubmissionRouteError(404, "Submission not found.");
  if (user.role !== "admin" || submission.submittedBy === user.id) {
    throw new SubmissionRouteError(403, "Only workspace admins can provide feedback on another user's submission.");
  }
  if (!["Submitted", "Under review"].includes(submission.status)) {
    throw new SubmissionRouteError(409, "Feedback cannot be changed after a final review.");
  }

  const updatedSubmission = await Submission.findOneAndUpdate(
    {
      id: submissionId,
      organizationId,
      status: { $in: ["Submitted", "Under review"] },
    },
    { $set: { feedback, reviewedBy: user.id, reviewedAt: new Date() } },
    { returnDocument: "after", runValidators: true }
  );
  if (!updatedSubmission) {
    throw new SubmissionRouteError(409, "Feedback cannot be changed after a final review.");
  }
  sendJson(response, 200, { submission: updatedSubmission });
}

async function addSubmissionComment(request, response, submissionId, user, readJsonBody, organizationId) {
  const body = await readJsonBody(request);
  const text = requiredText(body.text, "Comment", 2000);
  const submission = await Submission.findOne({ id: submissionId, organizationId }).lean();
  if (!submission) throw new SubmissionRouteError(404, "Submission not found.");

  const comment = {
    id: crypto.randomUUID(),
    authorId: user.id,
    text,
    createdAt: new Date(),
  };
  const updatedSubmission = await Submission.findOneAndUpdate(
    { id: submissionId, organizationId },
    {
      $push: { comments: comment },
      $set: { updatedAt: comment.createdAt },
    },
    { returnDocument: "after", runValidators: true }
  );
  if (!updatedSubmission) throw new SubmissionRouteError(404, "Submission not found.");
  sendJson(response, 201, { comment, submission: updatedSubmission });
}

async function reviewSubmission(request, response, submissionId, user, readJsonBody, organizationId) {
  const body = await readJsonBody(request);
  const status = requiredText(body.status, "Review status", 32);
  if (!reviewStatuses.includes(status)) {
    throw new SubmissionRouteError(400, "Review status must be Under review, Revision requested, Approved, or Rejected.");
  }
  const feedback = body.feedback === undefined
    ? ""
    : typeof body.feedback === "string"
      ? body.feedback.trim()
      : null;
  if (feedback === null || feedback.length > 5000) {
    throw new SubmissionRouteError(400, "Feedback must be a string no longer than 5000 characters.");
  }
  if (["Revision requested", "Rejected"].includes(status) && !feedback) {
    throw new SubmissionRouteError(400, `Feedback is required when the submission is ${status.toLowerCase()}.`);
  }

  const submission = await Submission.findOne({ id: submissionId, organizationId }).lean();
  if (!submission) throw new SubmissionRouteError(404, "Submission not found.");
  if (user.role !== "admin" || submission.submittedBy === user.id) {
    throw new SubmissionRouteError(403, "Only workspace admins can review another user's submission.");
  }
  if (!["Submitted", "Under review"].includes(submission.status)) {
    throw new SubmissionRouteError(409, "This submission has already received a final review.");
  }

  const reviewedAt = new Date();
  const update = {
    $set: {
      status,
      feedback,
      reviewedBy: user.id,
      reviewedAt,
    },
  };
  if (status === "Rejected") {
    update.$push = {
      comments: {
        id: crypto.randomUUID(),
        authorId: user.id,
        text: `This submission was rejected by ${user.name || user.id}. Reason: ${feedback}`,
        createdAt: reviewedAt,
      },
    };
  }
  const updatedSubmission = await Submission.findOneAndUpdate(
    {
      id: submissionId,
      organizationId,
      status: { $in: ["Submitted", "Under review"] },
    },
    update,
    { returnDocument: "after", runValidators: true }
  );
  if (!updatedSubmission) {
    throw new SubmissionRouteError(409, "This submission has already received a final review.");
  }
  sendJson(response, 200, { submission: updatedSubmission });
}

async function handleSubmissions(request, response, pathname, context) {
  const {
    user,
    db,
    readJsonBody,
    receiveFiles = receiveUploadedFiles,
    storageDirectory = uploadDirectory,
  } = context;
  if (!user) throw new SubmissionRouteError(401, "Authentication required.");
  const organizationId = user.organizationId || DEFAULT_ORGANIZATION_ID;

  const taskSubmissionMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/submissions$/);
  if (request.method === "POST" && taskSubmissionMatch) {
    const taskId = decodedRecordId(taskSubmissionMatch[1], "Task ID");
    await createSubmission(request, response, user, db, readJsonBody, taskId, organizationId);
    return true;
  }

  if (request.method === "GET" && pathname === "/api/submissions") {
    await listSubmissions(response, request, organizationId);
    return true;
  }

  if (request.method === "GET" && pathname === "/api/submissions/queue") {
    await listAdminTaskQueue(response, user, db, organizationId);
    return true;
  }

  const submissionFilesMatch = pathname.match(/^\/api\/submissions\/([^/]+)\/files$/);
  if (request.method === "POST" && submissionFilesMatch) {
    const submissionId = decodedRecordId(submissionFilesMatch[1], "Submission ID");
    await addSubmissionFiles(
      request,
      response,
      submissionId,
      user,
      db,
      organizationId,
      receiveFiles,
      storageDirectory
    );
    return true;
  }

  const submissionFileMatch = pathname.match(/^\/api\/submissions\/([^/]+)\/files\/([^/]+)$/);
  if (request.method === "GET" && submissionFileMatch) {
    const submissionId = decodedRecordId(submissionFileMatch[1], "Submission ID");
    const fileId = decodedRecordId(submissionFileMatch[2], "File ID");
    await downloadSubmissionFile(
      response,
      submissionId,
      fileId,
      user,
      db,
      organizationId,
      storageDirectory
    );
    return true;
  }

  const commentMatch = pathname.match(/^\/api\/submissions\/([^/]+)\/comments(?:\/([^/]+))?$/);
  if (commentMatch) {
    const submissionId = decodedRecordId(commentMatch[1], "Submission ID");
    if (request.method === "DELETE" && commentMatch[2]) {
      const commentId = decodedRecordId(commentMatch[2], "Comment ID");
      await removeSubmissionComment(response, submissionId, commentId, user, organizationId);
      return true;
    }
    if (request.method === "POST" && !commentMatch[2]) {
      await addSubmissionComment(request, response, submissionId, user, readJsonBody, organizationId);
      return true;
    }
  }

  const feedbackMatch = pathname.match(/^\/api\/submissions\/([^/]+)\/feedback$/);
  if (request.method === "PATCH" && feedbackMatch) {
    const submissionId = decodedRecordId(feedbackMatch[1], "Submission ID");
    await updateSubmissionFeedback(request, response, submissionId, user, readJsonBody, organizationId);
    return true;
  }

  const reviewMatch = pathname.match(/^\/api\/submissions\/([^/]+)\/review$/);
  if (request.method === "PATCH" && reviewMatch) {
    const submissionId = decodedRecordId(reviewMatch[1], "Submission ID");
    await reviewSubmission(request, response, submissionId, user, readJsonBody, organizationId);
    return true;
  }

  const submissionMatch = pathname.match(/^\/api\/submissions\/([^/]+)$/);
  if (request.method === "GET" && submissionMatch) {
    const submissionId = decodedRecordId(submissionMatch[1], "Submission ID");
    await getSubmission(response, submissionId, organizationId);
    return true;
  }

  return false;
}

module.exports = {
  createUploadMiddleware,
  handleSubmissions,
  SubmissionRouteError,
};
