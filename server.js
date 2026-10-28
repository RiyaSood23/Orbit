const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { promisify } = require("util");

const port = Number(process.env.PORT) || 3000;
const rootDirectory = __dirname;
const dataDirectory = path.resolve(process.env.ORBIT_DATA_DIR || path.join(rootDirectory, ".orbit-data"));
const storePath = path.join(dataDirectory, "store.json");
const maxRequestBytes = 16 * 1024;
const sessionDurationMs = 12 * 60 * 60 * 1000;
const rememberedSessionDurationMs = 30 * 24 * 60 * 60 * 1000;
const scrypt = promisify(crypto.scrypt);
const sessions = new Map();
let storeQueue = Promise.resolve();
const teamRoster = {
  Design: ["Arjun Mehta", "Nisha Kapoor"],
  Product: ["Riya Sood"],
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
  const privateDataPath = path.resolve(dataDirectory);
  const rootRelativePath = path.relative(rootDirectory, filePath);
  const privateRelativePath = path.relative(privateDataPath, filePath);
  const outsideRoot =
    rootRelativePath === ".." ||
    rootRelativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(rootRelativePath);
  const insidePrivateData =
    privateRelativePath === "" ||
    (privateRelativePath !== ".." &&
      !privateRelativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(privateRelativePath));

  if (outsideRoot || insidePrivateData) {
    return null;
  }

  return filePath;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let settled = false;

    request.on("data", (chunk) => {
      if (settled) {
        return;
      }

      body += chunk;
      if (Buffer.byteLength(body) > maxRequestBytes) {
        settled = true;
        reject(new HttpError(413, "Request body is too large."));
        request.resume();
      }
    });

    request.on("end", () => {
      if (settled) {
        return;
      }

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

function getAuthenticatedUser(request, store) {
  const sessionId = parseCookies(request.headers.cookie).get("orbit_session");
  if (!sessionId) {
    return null;
  }

  const session = sessions.get(sessionId);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }

  const user = store.users.find((item) => item.id === session.userId);
  if (!user) {
    sessions.delete(sessionId);
    return null;
  }

  return user;
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setSessionCookie(request, response, sessionId, durationMs) {
  const maxAge = Math.floor(durationMs / 1000);
  const secure = request.socket.encrypted ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `orbit_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
  );
}

function createSession(request, response, user, remember) {
  for (const [sessionId, session] of sessions) {
    if (session.expiresAt <= Date.now()) {
      sessions.delete(sessionId);
    }
  }
  const sessionId = crypto.randomBytes(32).toString("hex");
  const durationMs = remember ? rememberedSessionDurationMs : sessionDurationMs;
  sessions.set(sessionId, { userId: user.id, expiresAt: Date.now() + durationMs });
  setSessionCookie(request, response, sessionId, durationMs);
}

async function loadStore() {
  const contents = await fs.promises.readFile(storePath, "utf8");
  const store = JSON.parse(contents);
  if (!store || !Array.isArray(store.users) || !Array.isArray(store.tasks)) {
    throw new Error("Orbit data store has an invalid structure.");
  }
  return store;
}

async function updateStore(update) {
  const operation = storeQueue.then(async () => {
    const store = await loadStore();
    const result = await update(store);
    const temporaryPath = path.join(dataDirectory, `store-${crypto.randomUUID()}.tmp`);
    await fs.promises.writeFile(temporaryPath, JSON.stringify(store), { mode: 0o600 });
    await fs.promises.rename(temporaryPath, storePath);
    return result;
  });

  storeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

async function createAccount(request, response) {
  const body = await readJsonBody(request);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (name.length < 2 || name.length > 80) {
    throw new HttpError(400, "Enter a name between 2 and 80 characters.");
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "Enter a valid email address.");
  }
  if (password.length < 10 || password.length > 128) {
    throw new HttpError(400, "Password must be between 10 and 128 characters.");
  }

  const salt = crypto.randomBytes(16);
  const passwordHash = await scrypt(password, salt, 64);
  const user = {
    id: crypto.randomUUID(),
    name,
    email,
    salt: salt.toString("hex"),
    passwordHash: passwordHash.toString("hex"),
    createdAt: new Date().toISOString(),
  };

  await updateStore((store) => {
    if (store.users.some((existingUser) => existingUser.email === email)) {
      throw new HttpError(409, "An account with this email already exists. Sign in instead.");
    }
    store.users.push(user);
  });

  createSession(request, response, user, false);
  sendJson(response, 201, { user: publicUser(user) });
}

async function login(request, response) {
  const body = await readJsonBody(request);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const store = await loadStore();
  const user = store.users.find((item) => item.email === email);

  if (!user || password.length > 128) {
    throw new HttpError(401, "Email or password is incorrect. If you’re new, create an account first.");
  }

  const candidateHash = await scrypt(password, Buffer.from(user.salt, "hex"), 64);
  const storedHash = Buffer.from(user.passwordHash, "hex");
  if (candidateHash.length !== storedHash.length || !crypto.timingSafeEqual(candidateHash, storedHash)) {
    throw new HttpError(401, "Email or password is incorrect. If you’re new, create an account first.");
  }

  createSession(request, response, user, body.remember === true);
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
  const parsedDueDate = /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? new Date(`${dueDate}T00:00:00.000Z`) : null;

  if (!title || title.length > 100) {
    throw new HttpError(400, "Task name is required and must be 100 characters or fewer.");
  }
  if (!Object.hasOwn(teamRoster, team)) {
    throw new HttpError(400, "Choose a valid team.");
  }
  if (!teamRoster[team].includes(assignee)) {
    throw new HttpError(400, "Choose a team member from the selected team.");
  }
  if (!Number.isSafeInteger(contributionPoints) || contributionPoints < 1) {
    throw new HttpError(400, "Contribution points must be a positive whole number.");
  }
  if (project.length > 100) {
    throw new HttpError(400, "Project name must be 100 characters or fewer.");
  }
  if (!["Low", "Medium", "High", "Urgent"].includes(priority)) {
    throw new HttpError(400, "Choose a valid task priority.");
  }
  if (
    !parsedDueDate ||
    Number.isNaN(parsedDueDate.getTime()) ||
    parsedDueDate.toISOString().slice(0, 10) !== dueDate ||
    dueDate < localDateString(new Date())
  ) {
    throw new HttpError(400, "Choose a valid due date that is today or later.");
  }
  if (!description || description.length > 1000) {
    throw new HttpError(400, "Description is required and must be 1,000 characters or fewer.");
  }

  const task = {
    id: crypto.randomUUID(),
    title,
    team,
    assignee,
    contributionPoints,
    project,
    priority,
    dueDate,
    description,
    status: "Assigned",
    createdBy: user.id,
    createdAt: new Date().toISOString(),
  };
  await updateStore((store) => {
    store.tasks.push(task);
  });
  sendJson(response, 201, { task });
}

async function handleApiRequest(request, response, pathname) {
  if (request.method === "GET" && pathname === "/api/auth/session") {
    const store = await loadStore();
    const user = getAuthenticatedUser(request, store);
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
    const sessionId = parseCookies(request.headers.cookie).get("orbit_session");
    if (sessionId) {
      sessions.delete(sessionId);
    }
    const secure = request.socket.encrypted ? "; Secure" : "";
    response.setHeader("Set-Cookie", `orbit_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
    sendJson(response, 200, { success: true });
    return;
  }

  if (request.method === "POST" && pathname === "/api/tasks") {
    const store = await loadStore();
    const user = getAuthenticatedUser(request, store);
    if (!user) {
      throw new HttpError(401, "Your session has expired. Sign in again.");
    }
    await createTask(request, response, user);
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

  let filePath;
  try {
    filePath = getFilePath(request.url);
  } catch {
    sendError(response, 400, "Bad Request");
    return;
  }

  if (!filePath) {
    sendError(response, 400, "Bad Request");
    return;
  }

  const protectedPages = new Set(["/create-task.html", "/dashboard.html", "/team.html", "/approvals.html"]);
  if (protectedPages.has(pathname)) {
    const store = await loadStore();
    if (!getAuthenticatedUser(request, store)) {
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
    if (!response.headersSent) {
      sendError(response, 500, "Unable to read the requested file.");
    } else {
      response.destroy(error);
    }
  });
  fileStream.pipe(response);
}

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url, "http://localhost");
  const apiResult = await handleApiRequest(request, response, requestUrl.pathname);
  if (apiResult !== false) {
    return;
  }
  await serveStatic(request, response, requestUrl.pathname);
}

async function startServer() {
  await fs.promises.mkdir(dataDirectory, { recursive: true });
  try {
    await fs.promises.access(storePath, fs.constants.F_OK);
    await loadStore();
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    await fs.promises.writeFile(storePath, JSON.stringify({ users: [], tasks: [] }), { flag: "wx", mode: 0o600 });
  }

  const server = http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      if (error instanceof HttpError) {
        sendError(response, error.status, error.message);
        return;
      }
      console.error("Request failed:", error);
      if (!response.headersSent) {
        sendError(response, 500, "The request could not be completed.");
      } else {
        response.destroy(error);
      }
    });
  });

  server.listen(port, () => {
    console.log(`Orbit is running at http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error("Orbit could not start:", error);
  process.exitCode = 1;
});
