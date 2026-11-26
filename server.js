
require("dotenv").config();

const dns = require("node:dns");

dns.setServers([
  "1.1.1.1",
  "1.0.0.1"
]);

const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const jwt = require("jsonwebtoken");
const path = require("path");
const mongoose = require("mongoose");
const { promisify } = require("util");
const {
  handleMember3,
  RouteError: Member3Error,
  calculateTeamMemberProgress,
} = require("./server/routes/member3");
const Contribution = require("./server/models/Contribution");
const Organization = require("./server/models/Organization");
const Event = require("./server/models/Event");
const Announcement = require("./server/models/Announcement");
const Submission = require("./server/models/Submission");
const Team = require("./server/models/Team");
const User = require("./server/models/User");
const {
  handleOrganisation,
  OrganisationRouteError,
} = require("./server/routes/organisation");
const {
  handleSubmissions,
  SubmissionRouteError,
} = require("./server/routes/submissions");
const { DEFAULT_ORGANIZATION_ID } = require("./server/organization");

const port = Number(process.env.PORT) || 3000;
const rootDirectory = __dirname;
const reactBuildDirectory = path.join(rootDirectory, "client", "dist");
const reactIndexPath = path.join(reactBuildDirectory, "index.html");
const legacyReactRoutes = new Map([
  ["/index.html", "/"],
  ["/landing.html", "/"],
  ["/dashboard.html", "/dashboard"],
  ["/team.html", "/team"],
  ["/create-task.html", "/create-task"],
  ["/approvals.html", "/approvals"],
  ["/announcements.html", "/announcements"],
  ["/workspace.html", "/workspace"],
]);
const mongoDbName = process.env.MONGODB_DB || "Orbit";
function getMongoUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;

  const cluster = process.env.MONGODB_CLUSTER;
  const username = process.env.MONGODB_USERNAME;
  const password = process.env.MONGODB_PASSWORD;
  if (cluster || username || password) {
    if (!cluster || !username || !password) {
      throw new Error("Set MONGODB_CLUSTER, MONGODB_USERNAME, and MONGODB_PASSWORD together.");
    }

    return `mongodb+srv://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${cluster}/${encodeURIComponent(mongoDbName)}?retryWrites=true&w=majority&appName=Orbit`;
  }

  return "mongodb://127.0.0.1:27017";
}

const mongoUri = getMongoUri();
const jwtSecret =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === "production" ? null : "orbit-development-secret-change-in-production");
const maxRequestBytes = 16 * 1024;
const scrypt = promisify(crypto.scrypt);
const teamRoster = {
  Design: ["Ishita Verma", "Ananya Singh"],
  Marketing: ["Ananya Singh", "Aarav Sharma"],
  Organising: ["Aarav Sharma", "Rohan Kapoor"],
  Technical: ["Rohan Kapoor", "Aarav Sharma"],
  Management: ["Aarav Sharma", "Ishita Verma"],
};

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

let db;
let usersCollection;
let tasksCollection;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(JSON.stringify(value));
}

function sendError(response, status, message) {
  sendJson(response, status, { error: message });
}

function getFilePath(requestUrl) {
  const requestedPath = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
  const relativePath = requestedPath === "/" ? "landing.html" : requestedPath.slice(1);
  const filePath = path.resolve(rootDirectory, relativePath);
  const rootRelativePath = path.relative(rootDirectory, filePath);
  const outsideRoot =
    rootRelativePath === ".." ||
    rootRelativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(rootRelativePath);
  return outsideRoot ? null : filePath;
}

function getReactBuildFile(pathname) {
  if (!fs.existsSync(reactIndexPath)) return null;

  const decodedPath = decodeURIComponent(pathname);
  if (decodedPath === "/" || !path.extname(decodedPath)) return reactIndexPath;
  if (!decodedPath.startsWith("/assets/")) return null;

  const filePath = path.resolve(reactBuildDirectory, `.${decodedPath}`);
  const relativePath = path.relative(reactBuildDirectory, filePath);
  const outsideBuild =
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath);
  return outsideBuild ? null : filePath;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let settled = false;

    request.on("data", (chunk) => {
      if (settled) return;
      body += chunk;
      if (Buffer.byteLength(body) > maxRequestBytes) {
        settled = true;
        reject(new HttpError(413, "Request body is too large."));
        request.resume();
      }
    });

    request.on("end", () => {
      if (settled) return;
      if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
        settled = true;
        reject(new HttpError(415, "Content-Type must be application/json."));
        return;
      }
      try {
        const value = JSON.parse(body);
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new SyntaxError("Expected a JSON object.");
        }
        settled = true;
        resolve(value);
      } catch {
        settled = true;
        reject(new HttpError(400, "Request body must be valid JSON."));
      }
    });

    request.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

function parseCookies(header = "") {
  return header.split(";").reduce((cookies, part) => {
    const separator = part.indexOf("=");
    if (separator > 0) {
      cookies.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
    }
    return cookies;
  }, new Map());
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role || "member",
  };
}

function setAuthCookie(request, response, token, remember) {
  const maxAge = remember ? 30 * 24 * 60 * 60 : 12 * 60 * 60;
  const secure = request.socket.encrypted ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `orbit_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
  );
}

function createToken(user, remember) {
  return jwt.sign(
    { sub: user.id, role: user.role || "member", email: user.email },
    jwtSecret,
    { expiresIn: remember ? "30d" : "12h" }
  );
}

async function authenticate(request) {
  const authorization = request.headers.authorization || "";
  const bearerToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
  const cookieToken = parseCookies(request.headers.cookie).get("orbit_token");
  const token = bearerToken || cookieToken;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = await usersCollection.findOne({ id: payload.sub });
    return user || null;
  } catch {
    return null;
  }
}

function requireAuth(handler) {
  return async (request, response, ...args) => {
    const user = await authenticate(request);
    if (!user) throw new HttpError(401, "Authentication required.");
    return handler(request, response, user, ...args);
  };
}

function requireRole(...roles) {
  return (handler) => requireAuth(async (request, response, user) => {
    if (!roles.includes(user.role || "member")) {
      throw new HttpError(403, "You do not have permission to perform this action.");
    }
    return handler(request, response, user);
  });
}

async function migrateLegacyStore() {
  const legacyPath = path.join(__dirname, ".orbit-data", "store.json");
  if (!fs.existsSync(legacyPath)) return;

  try {
    const legacy = JSON.parse(await fs.promises.readFile(legacyPath, "utf8"));
    if (!legacy || !Array.isArray(legacy.users)) return;

    if (await usersCollection.countDocuments() === 0 && legacy.users.length > 0) {
      await usersCollection.insertMany(
        legacy.users.map((user, index) => ({
          ...user,
          role: index === 0 ? "admin" : "member",
          organizationId: user.organizationId || DEFAULT_ORGANIZATION_ID,
          passwordFormat: "scrypt",
          updatedAt: new Date().toISOString(),
        }))
      );
    }
    if (await tasksCollection.countDocuments() === 0 && Array.isArray(legacy.tasks) && legacy.tasks.length > 0) {
      await tasksCollection.insertMany(legacy.tasks.map((task) => ({
        ...task,
        organizationId: task.organizationId || DEFAULT_ORGANIZATION_ID,
      })));
    }
  } catch (error) {
    console.warn("Legacy store migration skipped:", error.message);
  }
}

async function createAccount(request, response) {
  const body = await readJsonBody(request);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode.trim().toUpperCase() : "";

  if (name.length < 2 || name.length > 80) {
    throw new HttpError(400, "Enter a name between 2 and 80 characters.");
  }
  if (body.inviteCode !== undefined &&
      (typeof body.inviteCode !== "string" || body.inviteCode.trim().length > 32)) {
    throw new HttpError(400, "Enter a valid workspace invitation code.");
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "Enter a valid email address.");
  }
  if (password.length < 10 || password.length > 128) {
    throw new HttpError(400, "Password must be between 10 and 128 characters.");
  }
  if (await usersCollection.findOne({ email })) {
    throw new HttpError(409, "An account with this email already exists. Sign in instead.");
  }

  let organizationId = DEFAULT_ORGANIZATION_ID;
  if (inviteCode) {
    const organization = await Organization.findOne({ inviteCode }).select("id").lean();
    if (!organization) throw new HttpError(400, "The workspace invitation code is invalid or expired.");
    organizationId = organization.id;
  }

  const role = (await usersCollection.countDocuments()) === 0 ? "admin" : "member";
  const user = {
    id: crypto.randomUUID(),
    name,
    email,
    passwordHash: await bcrypt.hash(password, 12),
    passwordFormat: "bcrypt",
    role,
    organizationId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await usersCollection.insertOne(user);

  const remember = body.remember === true;
  setAuthCookie(request, response, createToken(user, remember), remember);
  sendJson(response, 201, { token: createToken(user, false), user: publicUser(user) });
}

async function verifyLegacyPassword(password, user) {
  if (!user.salt || !user.passwordHash) return false;
  const candidateHash = await scrypt(password, Buffer.from(user.salt, "hex"), 64);
  const storedHash = Buffer.from(user.passwordHash, "hex");
  return candidateHash.length === storedHash.length &&
    crypto.timingSafeEqual(candidateHash, storedHash);
}

async function login(request, response) {
  const body = await readJsonBody(request);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length > 128) {
    throw new HttpError(401, "Email or password is incorrect.");
  }

  const user = await usersCollection.findOne({ email });
  let valid = false;
  if (user) {
    if (user.passwordFormat === "bcrypt" || (!user.salt && user.passwordHash)) {
      valid = await bcrypt.compare(password, user.passwordHash);
    } else {
      valid = await verifyLegacyPassword(password, user);
      if (valid) {
        const migratedHash = await bcrypt.hash(password, 12);
        await usersCollection.updateOne(
          { id: user.id },
          {
            $set: {
              passwordHash: migratedHash,
              passwordFormat: "bcrypt",
              updatedAt: new Date().toISOString(),
            },
            $unset: { salt: "" },
          }
        );
        user.passwordHash = migratedHash;
        user.passwordFormat = "bcrypt";
      }
    }
  }

  if (!valid) {
    throw new HttpError(401, "Email or password is incorrect. If you're new, create an account first.");
  }

  const remember = body.remember === true;
  setAuthCookie(request, response, createToken(user, remember), remember);
  sendJson(response, 200, { token: createToken(user, false), user: publicUser(user) });
}

async function getProfile(request, response, user) {
  sendJson(response, 200, { user: publicUser(user) });
}

async function updateProfile(request, response, user) {
  const body = await readJsonBody(request);
  const updates = {};

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2 || name.length > 80) {
      throw new HttpError(400, "Enter a name between 2 and 80 characters.");
    }
    updates.name = name;
  }
  if (body.password !== undefined) {
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < 10 || password.length > 128) {
      throw new HttpError(400, "Password must be between 10 and 128 characters.");
    }
    updates.passwordHash = await bcrypt.hash(password, 12);
    updates.passwordFormat = "bcrypt";
  }
  if (Object.keys(updates).length === 0) {
    throw new HttpError(400, "Provide a name or password to update.");
  }
  updates.updatedAt = new Date().toISOString();

  const result = await usersCollection.findOneAndUpdate(
    { id: user.id },
    { $set: updates },
    { returnDocument: "after" }
  );
  sendJson(response, 200, { user: publicUser(result) });
}

async function listUsers(request, response, user) {
  const users = await usersCollection.find(
    { organizationId: user.organizationId || DEFAULT_ORGANIZATION_ID },
    { projection: { _id: 0, passwordHash: 0, passwordFormat: 0, salt: 0 } }
  ).toArray();
  sendJson(response, 200, { users: users.map(publicUser) });
}

async function updateUserRole(request, response, currentUser) {
  const body = await readJsonBody(request);
  const id = typeof body.id === "string" ? body.id : "";
  const role = typeof body.role === "string" ? body.role : "";
  if (!["member", "manager", "admin"].includes(role)) {
    throw new HttpError(400, "Role must be member, manager, or admin.");
  }
  const user = await usersCollection.findOneAndUpdate(
    { id, organizationId: currentUser.organizationId || DEFAULT_ORGANIZATION_ID },
    { $set: { role, updatedAt: new Date().toISOString() } },
    { returnDocument: "after" }
  );
  if (!user) throw new HttpError(404, "User not found.");
  sendJson(response, 200, { user: publicUser(user) });
}

async function createTask(request, response, user) {
  const body = await readJsonBody(request);
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const team = typeof body.team === "string" ? body.team : "";
  const assignee = typeof body.assignee === "string" ? body.assignee.trim() : "";
  const project = typeof body.project === "string" ? body.project.trim() : "";
  const priority = typeof body.priority === "string" ? body.priority : "";
  const dueDate = typeof body.dueDate === "string" ? body.dueDate : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const contributionPoints = Number(body.contributionPoints);
  const progress = body.progress === undefined ? 0 : Number(body.progress);
  const teamId = typeof body.teamId === "string" ? body.teamId.trim() : "";
  if (teamId) {
    const Team = mongoose.models.Team;
    if (!Team) throw new HttpError(500, "Team management is unavailable.");
    if (!(await Team.exists({ id: teamId, organizationId: user.organizationId }))) {
      throw new HttpError(404, "Team not found.");
    }
    if (!(await Team.exists({ id: teamId, organizationId: user.organizationId, "members.userId": assignee }))) {
      throw new HttpError(400, "The assignee must be a member of the selected team.");
    }
  }

  if (!title || title.length > 100) throw new HttpError(400, "Task name is required.");
  if (!teamId && !Object.hasOwn(teamRoster, team)) throw new HttpError(400, "Choose a valid team.");
  if (!teamId && !teamRoster[team].includes(assignee)) throw new HttpError(400, "Choose a valid assignee.");
  if (!Number.isSafeInteger(contributionPoints) || contributionPoints < 1 || contributionPoints > 1000) throw new HttpError(400, "Contribution points must be a whole number from 1 to 1000.");
  if (!Number.isInteger(progress) || progress < 0 || progress > 99) {
    throw new HttpError(400, "Initial progress must be from 0 to 99. The assigned member must complete the task.");
  }
  if (project.length > 100) throw new HttpError(400, "Project name is too long.");
  if (!["Low", "Medium", "High", "Urgent"].includes(priority)) throw new HttpError(400, "Choose a valid priority.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new HttpError(400, "Choose a valid due date.");
  if (!description || description.length > 1000) throw new HttpError(400, "Description is required.");

  const task = {
    id: crypto.randomUUID(),
    organizationId: user.organizationId || DEFAULT_ORGANIZATION_ID,
    title, team, teamId: teamId || null, assignee, contributionPoints, project, priority, dueDate, description,
    progress,
    status: teamId
      ? progress > 0 ? "In progress" : "To do"
      : "Assigned",
    createdBy: user.id,
    createdAt: new Date().toISOString(),
  };
  await tasksCollection.insertOne(task);
  const memberProgress = teamId
    ? [...(await calculateTeamMemberProgress(db, teamId, [assignee])).entries()].map(([memberId, progress]) => ({
        memberId,
        ...progress,
      }))
    : [];
  sendJson(response, 201, { task, memberProgress });
}

async function getTaskMemberProgress(task, memberIds) {
  if (typeof task.teamId !== "string" || !task.teamId) return [];
  const progressById = await calculateTeamMemberProgress(db, task.teamId, memberIds);
  return [...progressById.entries()].map(([memberId, progress]) => ({ memberId, ...progress }));
}

async function updateTask(request, response, user, taskId) {
  const body = await readJsonBody(request);
  const hasProgress = body.progress !== undefined;
  const hasPoints = body.contributionPoints !== undefined;
  const hasAssignee = body.assignee !== undefined;
  if ([hasProgress, hasPoints, hasAssignee].filter(Boolean).length !== 1) {
    throw new HttpError(400, "Update one task field at a time.");
  }

  const progress = hasProgress ? Number(body.progress) : null;
  if (hasProgress && (!Number.isInteger(progress) || progress < 0 || progress > 100)) {
    throw new HttpError(400, "Progress must be a whole number from 0 to 100.");
  }

  const contributionPoints = hasPoints ? Number(body.contributionPoints) : null;
  if (hasPoints &&
      (!Number.isSafeInteger(contributionPoints) || contributionPoints < 1 || contributionPoints > 1000)) {
    throw new HttpError(400, "Contribution points must be a whole number from 1 to 1000.");
  }

  const task = await tasksCollection.findOne({ id: taskId, organizationId: user.organizationId });
  if (!task) throw new HttpError(404, "Task not found.");

  if (hasAssignee) {
    const newAssignee = typeof body.assignee === "string" ? body.assignee.trim() : "";
    if (!newAssignee) throw new HttpError(400, "Choose a valid team member.");
    if (task.status === "Completed" || await Contribution.exists({ taskId })) {
      throw new HttpError(409, "Completed tasks cannot be reassigned.");
    }
    const Team = mongoose.models.Team;
    const team = typeof task.teamId === "string" && Team
      ? await Team.findOne({ id: task.teamId, organizationId: user.organizationId }).lean()
      : null;
    if (!team) throw new HttpError(404, "The task's team was not found.");
    if (!["manager", "admin"].includes(user.role || "member") && team.leaderId !== user.id) {
      throw new HttpError(403, "Only the team leader or an administrator can reassign tasks.");
    }
    if (!team.members.some(member => member.userId === newAssignee)) {
      throw new HttpError(400, "The new assignee must be a member of this team.");
    }
    if (!(await usersCollection.findOne({ id: newAssignee }))) {
      throw new HttpError(404, "The new assignee was not found.");
    }
    const updatedTask = await tasksCollection.findOneAndUpdate(
      { id: taskId, organizationId: user.organizationId, status: { $ne: "Completed" } },
      { $set: { assignee: newAssignee, updatedAt: new Date().toISOString() } },
      { returnDocument: "after" }
    );
    if (!updatedTask) throw new HttpError(409, "Completed tasks cannot be reassigned.");
    const memberProgress = await getTaskMemberProgress(updatedTask, [task.assignee, newAssignee]);
    sendJson(response, 200, { task: updatedTask, memberProgress });
    return;
  }

  if (contributionPoints !== null) {
    if (task.status === "Completed" || await Contribution.exists({ taskId })) {
      throw new HttpError(409, "Contribution points cannot be changed after task completion.");
    }
    const Team = mongoose.models.Team;
    const team = typeof task.teamId === "string" && Team
      ? await Team.findOne({ id: task.teamId, organizationId: user.organizationId }).lean()
      : null;
    if (!team) throw new HttpError(404, "The task's team was not found.");
    if (!["manager", "admin"].includes(user.role || "member") && team.leaderId !== user.id) {
      throw new HttpError(403, "Only the team leader or an administrator can change task points.");
    }
    const updatedTask = await tasksCollection.findOneAndUpdate(
      { id: taskId, organizationId: user.organizationId, status: { $ne: "Completed" } },
      { $set: { contributionPoints, updatedAt: new Date().toISOString() } },
      { returnDocument: "after" }
    );
    if (!updatedTask) throw new HttpError(409, "Contribution points cannot be changed after task completion.");
    sendJson(response, 200, {
      task: updatedTask,
      contribution: null,
      memberProgress: await getTaskMemberProgress(updatedTask, [updatedTask.assignee]),
    });
    return;
  }

  if (task.assignee !== user.id) {
    throw new HttpError(403, "Only the assigned member can update this task's progress.");
  }

  if (progress !== 100) {
    const updates = { updatedAt: new Date().toISOString() };
    updates.progress = progress;
    updates.status = progress === 0 ? "To do" : "In progress";
    const updatedTask = await tasksCollection.findOneAndUpdate(
      { id: taskId, organizationId: user.organizationId, assignee: user.id },
      { $set: updates },
      { returnDocument: "after" }
    );
    if (!updatedTask) throw new HttpError(404, "Task not found.");
    sendJson(response, 200, {
      task: updatedTask,
      contribution: null,
      memberProgress: await getTaskMemberProgress(updatedTask, [updatedTask.assignee]),
    });
    return;
  }

  const session = await mongoose.startSession();
  let updatedTask;
  let contribution;
  try {
    await session.withTransaction(async () => {
      const currentTask = await tasksCollection.findOne({ id: taskId, organizationId: user.organizationId }, { session });
      if (!currentTask) throw new HttpError(404, "Task not found.");
      if (currentTask.assignee !== user.id) {
        throw new HttpError(403, "Only the assigned member can update this task's progress.");
      }

      const points = Number(currentTask.contributionPoints);
      if (!Number.isSafeInteger(points) || points < 1 || points > 1000) {
        throw new HttpError(400, "This task does not have a valid contribution point value.");
      }
      if (typeof currentTask.teamId !== "string" || !currentTask.teamId) {
        throw new HttpError(409, "This task is not associated with a team and cannot award contribution points.");
      }

      const Team = mongoose.models.Team;
      if (!Team || !(await Team.exists({
        id: currentTask.teamId,
        organizationId: user.organizationId,
      }).session(session))) {
        throw new HttpError(404, "The task's team was not found.");
      }

      const priorAward = await Contribution.findOne({ taskId }).session(session).lean();
      if (currentTask.status === "Completed" && priorAward) {
        updatedTask = currentTask;
        contribution = priorAward;
        return;
      }

      const completedTask = await tasksCollection.findOneAndUpdate(
        { id: taskId, organizationId: user.organizationId, assignee: user.id, status: { $ne: "Completed" } },
        {
          $set: {
            progress: 100,
            status: "Completed",
            updatedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
        },
        { returnDocument: "after", session }
      );

      if (!completedTask) {
        const latestTask = await tasksCollection.findOne({ id: taskId, organizationId: user.organizationId }, { session });
        if (!latestTask) throw new HttpError(404, "Task not found.");
        if (latestTask.assignee !== user.id) {
          throw new HttpError(403, "Only the assigned member can update this task's progress.");
        }
        updatedTask = latestTask;
      } else {
        updatedTask = completedTask;
      }

      contribution = priorAward || (await Contribution.create([{
        id: `task-completion-${taskId}`,
        memberId: user.id,
        teamId: currentTask.teamId,
        points,
        reason: `Completed task: ${currentTask.title}`,
        taskId,
        awardedBy: user.id,
      }], { session }))[0];
    });
  } finally {
    await session.endSession();
  }

  sendJson(response, 200, {
    task: updatedTask,
    contribution,
    memberProgress: await getTaskMemberProgress(updatedTask, [updatedTask.assignee]),
  });
}

async function deleteTask(request, response, user, taskId) {
  const task = await tasksCollection.findOne({ id: taskId, organizationId: user.organizationId });
  if (!task) throw new HttpError(404, "Task not found.");

  if (typeof task.teamId === "string" && task.teamId) {
    const Team = mongoose.models.Team;
    const team = Team
      ? await Team.findOne({ id: task.teamId, organizationId: user.organizationId }).lean()
      : null;
    if (!team) throw new HttpError(404, "The task's team was not found.");
    if (!["manager", "admin"].includes(user.role || "member") && team.leaderId !== user.id) {
      throw new HttpError(403, "Only the team leader or an administrator can delete tasks.");
    }
  } else if (task.createdBy !== user.id && !["manager", "admin"].includes(user.role || "member")) {
    throw new HttpError(403, "You cannot delete this task.");
  }

  if (await Submission.exists({ organizationId: user.organizationId, taskId })) {
    throw new HttpError(409, "Tasks with submissions cannot be deleted.");
  }

  const result = await tasksCollection.deleteOne({ id: taskId, organizationId: user.organizationId });
  if (!result.deletedCount) throw new HttpError(404, "Task not found.");
  sendJson(response, 200, {
    success: true,
    memberProgress: await getTaskMemberProgress(task, [task.assignee]),
  });
}

async function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function handleApiRequest(request, response, pathname) {
  const submissionApi =
    pathname === "/api/submissions" ||
    pathname.startsWith("/api/submissions/") ||
    /^\/api\/tasks\/[^/]+\/submissions$/.test(pathname);
  if (submissionApi) {
    const user = await authenticate(request);
    try {
      const result = await handleSubmissions(request, response, pathname, {
        user,
        db,
        readJsonBody,
      });
      if (result !== false) return true;
    } catch (error) {
      if (error instanceof SubmissionRouteError) {
        throw new HttpError(error.status, error.message);
      }
      throw error;
    }
  }

  const organisationApi =
    pathname === "/api/organisation" ||
    pathname.startsWith("/api/organisation/") ||
    pathname === "/api/organizations" ||
    pathname.startsWith("/api/organizations/") ||
    pathname === "/api/announcements" ||
    pathname.startsWith("/api/announcements/");
  if (organisationApi) {
    const user = await authenticate(request);
    try {
      const result = await handleOrganisation(request, response, pathname, {
        user,
        db,
        readJsonBody,
      });
      if (result !== false) return true;
    } catch (error) {
      if (error instanceof OrganisationRouteError) {
        throw new HttpError(error.status, error.message);
      }
      throw error;
    }
  }

  const member3Api =
    pathname === "/api/teams" ||
    pathname.startsWith("/api/teams/") ||
    pathname === "/api/members" ||
    pathname.startsWith("/api/members/") ||
    pathname.startsWith("/api/contributions");

  if (member3Api) {
    const isWrite =
      ["POST", "PATCH", "PUT", "DELETE"].includes(request.method);
    const user = await authenticate(request);
    if (isWrite && !user) throw new HttpError(401, "Authentication required.");
    try {
      const result = await handleMember3(
        request,
        response,
        pathname,
        db,
        { user }
      );
      if (result !== false) return true;
    } catch (error) {
      if (error instanceof Member3Error) {
        throw new HttpError(error.status, error.message);
      }
      throw error;
    }
  }

  if (request.method === "GET" && pathname === "/api/auth/session") {
    const user = await authenticate(request);
    sendJson(response, 200, { user: user ? publicUser(user) : null });
    return;
  }
  if (request.method === "POST" && pathname === "/api/auth/signup") {
    await createAccount(request, response);
    return;
  }
  if (request.method === "POST" && pathname === "/api/auth/login") {
    await login(request, response);
    return;
  }
  if (request.method === "POST" && pathname === "/api/auth/logout") {
    const secure = request.socket.encrypted ? "; Secure" : "";
    response.setHeader("Set-Cookie", `orbit_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
    sendJson(response, 200, { success: true });
    return;
  }

  if (request.method === "GET" && pathname === "/api/users/me") {
    await requireAuth(getProfile)(request, response);
    return;
  }
  if (request.method === "PATCH" && pathname === "/api/users/me") {
    await requireAuth(updateProfile)(request, response);
    return;
  }
  if (request.method === "GET" && pathname === "/api/users") {
    await requireRole("manager", "admin")(listUsers)(request, response);
    return;
  }
  if (request.method === "PATCH" && pathname === "/api/users/role") {
    await requireRole("admin")(updateUserRole)(request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/api/tasks") {
    await requireAuth(createTask)(request, response);
    return;
  }
  const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (request.method === "PATCH" && taskMatch) {
    const taskId = decodeURIComponent(taskMatch[1]);
    await requireAuth((request, response, user) => updateTask(request, response, user, taskId))(request, response);
    return;
  }
  if (request.method === "DELETE" && taskMatch) {
    const taskId = decodeURIComponent(taskMatch[1]);
    await requireAuth((request, response, user) => deleteTask(request, response, user, taskId))(request, response);
    return;
  }

  if (pathname.startsWith("/api/")) {
    sendError(response, 404, "API endpoint not found.");
    return;
  }
  return false;
}

async function serveStatic(request, response, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendError(response, 405, "Method Not Allowed");
    return;
  }

  if (fs.existsSync(reactIndexPath) && legacyReactRoutes.has(pathname)) {
    response.writeHead(302, {
      Location: legacyReactRoutes.get(pathname),
      "Cache-Control": "no-store",
    });
    response.end();
    return;
  }

  let filePath;
  try {
    filePath = getReactBuildFile(pathname) || getFilePath(request.url);
  } catch {
    sendError(response, 400, "Bad Request");
    return;
  }
  if (!filePath) {
    sendError(response, 400, "Bad Request");
    return;
  }

  const protectedPages = new Set([
    "/create-task.html",
    "/dashboard.html",
    "/team.html",
    "/approvals.html",
    "/workspace.html",
    "/announcements.html",
  ]);
  if (protectedPages.has(pathname)) {
    if (!(await authenticate(request))) {
      response.writeHead(302, { Location: "/index.html", "Cache-Control": "no-store" });
      response.end();
      return;
    }
  }

  let stats;
  try {
    stats = await fs.promises.stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Page Not Found");
      return;
    }
    throw error;
  }

  if (!stats.isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Page Not Found");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    "Content-Type": mimeTypes[extension] || "application/octet-stream",
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }

  const fileStream = fs.createReadStream(filePath);
  fileStream.on("error", (error) => {
    console.error("Failed to stream static file:", error);
    if (!response.headersSent) sendError(response, 500, "Unable to read the requested file.");
    else response.destroy(error);
  });
  fileStream.pipe(response);
}

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url, "http://localhost");
  const apiResult = await handleApiRequest(request, response, requestUrl.pathname);
  if (apiResult !== false) return;
  await serveStatic(request, response, requestUrl.pathname);
}

async function startServer() {
  if (!jwtSecret) {
    throw new Error("JWT_SECRET is required when NODE_ENV=production.");
  }

  await mongoose.connect(mongoUri, { dbName: mongoDbName });
  db = mongoose.connection.db;
  usersCollection = db.collection("users");
  tasksCollection = db.collection("tasks");
  const defaultOrganization = await Organization.findOneAndUpdate(
    { id: DEFAULT_ORGANIZATION_ID },
    { $setOnInsert: { id: DEFAULT_ORGANIZATION_ID, name: "Orbit Workspace" } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
  if (!defaultOrganization.inviteCode) {
    defaultOrganization.inviteCode = crypto.randomBytes(6).toString("hex").toUpperCase();
    await defaultOrganization.save();
  }
  await Promise.all([
    User.updateMany(
      { organizationId: { $exists: false } },
      { $set: { organizationId: DEFAULT_ORGANIZATION_ID } }
    ),
    Team.updateMany(
      { organizationId: { $exists: false } },
      { $set: { organizationId: DEFAULT_ORGANIZATION_ID } }
    ),
    tasksCollection.updateMany(
      { organizationId: { $exists: false } },
      { $set: { organizationId: DEFAULT_ORGANIZATION_ID } }
    ),
  ]);
  await Contribution.migrateLegacyHistory();
  await Contribution.init();
  await Promise.all([Event.init(), Announcement.init(), Submission.init()]);

  await usersCollection.createIndex({ email: 1 }, { unique: true });
  await usersCollection.createIndex({ id: 1 }, { unique: true });
  await tasksCollection.createIndex({ id: 1 }, { unique: true });
  await tasksCollection.createIndex({ createdBy: 1 });
  await tasksCollection.createIndex({ organizationId: 1, dueDate: 1, status: 1 });
  await migrateLegacyStore();

  const server = http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      if (error instanceof HttpError) {
        sendError(response, error.status, error.message);
        return;
      }
      console.error("Request failed:", error);
      if (!response.headersSent) sendError(response, 500, "The request could not be completed.");
      else response.destroy(error);
    });
  });

  server.on("close", () => mongoose.disconnect());
  server.listen(port, () => {
    console.log(`Orbit is running at http://localhost:${port}`);
    console.log(`MongoDB database: ${mongoDbName}`);
  });
}

startServer().catch((error) => {
  console.error("Orbit could not start:", error);
  process.exitCode = 1;
});
