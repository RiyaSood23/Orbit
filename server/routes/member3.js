const crypto = require("crypto");
const Team = require("../models/Team");
const Contribution = require("../models/Contribution");
const User = require("../models/User");
const { DEFAULT_ORGANIZATION_ID } = require("../organization");
const publicProfileFields = { id: 1, name: 1, email: 1, role: 1, skills: 1, _id: 0 };

class RouteError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  try {
    return JSON.parse(body || "{}");
  } catch {
    throw new RouteError(400, "Request body must be valid JSON.");
  }
}

function requireFields(value, fields) {
  for (const field of fields) {
    if (value[field] === undefined || value[field] === null || String(value[field]).trim() === "") {
      throw new RouteError(400, `${field} is required.`);
    }
  }
}

function canManageTeam(user, team) {
  if (!user) return false;
  return ["manager", "admin"].includes(user.role || "member") || team?.leaderId === user.id;
}

async function listMembers(response, user) {
  if (!user) throw new RouteError(401, "Authentication required.");
  const users = await User.find(
    { organizationId: user.organizationId || DEFAULT_ORGANIZATION_ID },
    publicProfileFields
  ).sort({ name: 1 }).lean();
  sendJson(response, 200, { users });
}

async function memberExists(userId, organizationId) {
  return !!(await User.findOne({ id: String(userId), organizationId }).lean());
}

async function createTeam(request, response, user) {
  const body = await readJson(request);
  requireFields(body, ["name", "description", "leaderId"]);
  const organizationId = user.organizationId || DEFAULT_ORGANIZATION_ID;
  if (typeof body.leaderId !== "string") throw new RouteError(400, "A valid team leader is required.");
  const leaderId = body.leaderId.trim();
  if (!await memberExists(leaderId, organizationId)) throw new RouteError(404, "Team leader not found.");
  if (body.memberIds !== undefined && (
    !Array.isArray(body.memberIds) ||
    body.memberIds.some((memberId) => typeof memberId !== "string" || !memberId.trim())
  )) {
    throw new RouteError(400, "Team members must be a list of workspace member IDs.");
  }

  if (await Team.findByName(body.name)) throw new RouteError(409, "A team with this name already exists.");

  const memberIds = [...new Set([leaderId, ...(Array.isArray(body.memberIds) ? body.memberIds : [])].map(String))];
  const memberChecks = await Promise.all(memberIds.map((memberId) => memberExists(memberId, organizationId)));
  if (memberChecks.includes(false)) throw new RouteError(404, "One or more team members were not found.");

  const team = await Team.create({
    id: crypto.randomUUID(),
    organizationId,
    name: body.name,
    description: body.description,
    leaderId,
    members: memberIds.map((userId) => ({ userId, role: userId === leaderId ? "Team Head" : "Member", skills: [] })),
  });
  sendJson(response, 201, { team });
}

async function listTeams(response, user) {
  const teams = await Team.find({ organizationId: user.organizationId || DEFAULT_ORGANIZATION_ID })
    .populate({ path: "leader", select: "id name email role skills -_id" })
    .populate({ path: "memberProfiles", select: "id name email role skills -_id" })
    .sort({ name: 1 })
    .lean();
  sendJson(response, 200, { teams });
}

async function getTeam(response, teamId, user) {
  const team = await Team.findOne({
    id: teamId,
    organizationId: user.organizationId || DEFAULT_ORGANIZATION_ID,
  })
    .populate({ path: "leader", select: "id name email role skills -_id" })
    .populate({ path: "memberProfiles", select: "id name email role skills -_id" })
    .lean();
  if (!team) throw new RouteError(404, "Team not found.");
  sendJson(response, 200, { team });
}

async function updateTeam(request, response, teamId, user) {
  const body = await readJson(request);
  const organizationId = user.organizationId || DEFAULT_ORGANIZATION_ID;
  const team = await Team.findOne({ id: teamId, organizationId });
  if (!team) throw new RouteError(404, "Team not found.");
  if (!canManageTeam(user, team)) throw new RouteError(403, "You cannot manage this team.");

  if (body.name !== undefined) {
    const existing = await Team.findByName(body.name);
    if (existing && existing.id !== team.id) throw new RouteError(409, "A team with this name already exists.");
    team.name = body.name;
  }
  if (body.description !== undefined) team.description = body.description;
  if (body.leaderId !== undefined) {
    if (typeof body.leaderId !== "string" ||
        !await memberExists(body.leaderId.trim(), organizationId)) {
      throw new RouteError(404, "Team leader not found.");
    }
    team.leaderId = body.leaderId.trim();
  }
  if (body.memberIds !== undefined && (
    !Array.isArray(body.memberIds) ||
    body.memberIds.some((memberId) => typeof memberId !== "string" || !memberId.trim())
  )) {
    throw new RouteError(400, "Team members must be a list of workspace member IDs.");
  }
  if (body.memberIds !== undefined || body.leaderId !== undefined) {
    const existingMembers = team.members || [];
    const selectedIds = body.memberIds === undefined
      ? existingMembers.map((member) => member.userId)
      : [...new Set(body.memberIds.map((memberId) => memberId.trim()))];
    if (!selectedIds.includes(team.leaderId)) selectedIds.push(team.leaderId);
    const memberChecks = await Promise.all(
      selectedIds.map((memberId) => memberExists(memberId, organizationId))
    );
    if (memberChecks.includes(false)) throw new RouteError(404, "One or more team members were not found.");
    const previousMembers = new Map(existingMembers.map((member) => [member.userId, member]));
    team.members = selectedIds.map((userId) => {
      const previous = previousMembers.get(userId);
      return {
        userId,
        role: userId === team.leaderId ? "Team Head" : previous?.role === "Team Head" ? "Member" : previous?.role || "Member",
        skills: previous?.skills || [],
      };
    });
  }
  await team.save();
  sendJson(response, 200, { team });
}

async function deleteTeam(response, teamId, user) {
  const organizationId = user.organizationId || DEFAULT_ORGANIZATION_ID;
  const existing = await Team.findOne({ id: teamId, organizationId }).lean();
  if (!existing) throw new RouteError(404, "Team not found.");
  if (!canManageTeam(user, existing)) throw new RouteError(403, "You cannot delete this team.");
  const team = await Team.findOneAndDelete({ id: teamId, organizationId });
  if (!team) throw new RouteError(404, "Team not found.");
  await Contribution.deleteMany({ teamId });
  sendJson(response, 200, { success: true });
}

async function addMember(request, response, teamId, user) {
  const body = await readJson(request);
  requireFields(body, ["userId"]);
  if (typeof body.userId !== "string") throw new RouteError(400, "A valid member ID is required.");
  const organizationId = user.organizationId || DEFAULT_ORGANIZATION_ID;
  const team = await Team.findOne({ id: teamId, organizationId });
  if (!team) throw new RouteError(404, "Team not found.");
  if (!canManageTeam(user, team)) throw new RouteError(403, "You cannot manage this team.");
  if (!await memberExists(body.userId, organizationId)) throw new RouteError(404, "Member not found.");
  const updatedTeam = await Team.findOneAndUpdate(
    { id: teamId, organizationId, "members.userId": { $ne: String(body.userId) } },
    { $push: { members: { userId: String(body.userId), role: "Member", skills: [] } } },
    { new: true, runValidators: true }
  );
  if (!updatedTeam) {
    if (await Team.exists({ id: teamId, organizationId })) {
      throw new RouteError(409, "This user is already a member of the team.");
    }
    throw new RouteError(404, "Team not found.");
  }
  sendJson(response, 201, { team: updatedTeam });
}

async function removeMember(request, response, teamId, user) {
  const body = await readJson(request);
  requireFields(body, ["userId"]);
  if (typeof body.userId !== "string") throw new RouteError(400, "A valid member ID is required.");
  const memberId = body.userId.trim();
  const team = await Team.findOne({
    id: teamId,
    organizationId: user.organizationId || DEFAULT_ORGANIZATION_ID,
  });
  if (!team) throw new RouteError(404, "Team not found.");
  if (!canManageTeam(user, team)) throw new RouteError(403, "You cannot manage this team.");
  if (memberId === team.leaderId) {
    throw new RouteError(409, "Change the team leader before removing them from the team.");
  }
  if (!team.members.some((member) => member.userId === memberId)) {
    throw new RouteError(404, "This user is not a member of the team.");
  }
  await team.removeMember(memberId);
  sendJson(response, 200, { team });
}

async function assignLeader(request, response, teamId, user) {
  const body = await readJson(request);
  requireFields(body, ["leaderId"]);
  if (typeof body.leaderId !== "string") throw new RouteError(400, "A valid team leader is required.");
  const leaderId = body.leaderId.trim();
  const organizationId = user.organizationId || DEFAULT_ORGANIZATION_ID;
  const team = await Team.findOne({ id: teamId, organizationId });
  if (!team) throw new RouteError(404, "Team not found.");
  if (!canManageTeam(user, team)) throw new RouteError(403, "You cannot manage this team.");
  if (!await memberExists(leaderId, organizationId)) throw new RouteError(404, "Team leader not found.");
  team.members.forEach((member) => {
    if (member.role === "Team Head") member.role = "Member";
  });
  if (!team.members.some((member) => member.userId === leaderId)) {
    team.members.push({ userId: leaderId, role: "Team Head", skills: [] });
  } else {
    const newLeader = team.members.find((member) => member.userId === leaderId);
    newLeader.role = "Team Head";
  }
  team.leaderId = leaderId;
  await team.save();
  sendJson(response, 200, { team });
}

async function getTeamMembers(response, teamId, db, user) {
  const team = await Team.findOne({
    id: teamId,
    organizationId: user.organizationId || DEFAULT_ORGANIZATION_ID,
  }).lean();
  if (!team) throw new RouteError(404, "Team not found.");
  const teamMembers = team.members || [];
  const ids = teamMembers.map((member) => member.userId);
  const users = await User.find(  { id: { $in: ids }, organizationId: user.organizationId || DEFAULT_ORGANIZATION_ID }, publicProfileFields).lean();
  const byId = new Map(users.map((user) => [user.id, user]));
  const progressById = await calculateTeamMemberProgress(db, teamId, ids);
  sendJson(response, 200, {
    members: teamMembers.map((member) => ({
      ...member,
      profile: byId.get(member.userId) || null,
      ...(progressById.get(member.userId) || { assignedTasks: 0, completedTasks: 0, progress: 0 }),
    })),
  });
}

async function getMemberProfile(response, userId, currentUser) {
  const user = await User.findOne(
    { id: userId, organizationId: currentUser.organizationId },
    publicProfileFields
  ).lean();
  if (!user) throw new RouteError(404, "Member not found.");
  const organizationId = currentUser.organizationId || DEFAULT_ORGANIZATION_ID;
  const [teams, organizationTeams] = await Promise.all([
    Team.find({ organizationId, "members.userId": userId }).lean(),
    Team.find({ organizationId }).select("id").lean(),
  ]);
  const contributions = await Contribution.find({
    memberId: userId,
    teamId: { $in: organizationTeams.map((team) => team.id) },
  }).sort({ createdAt: -1 }).lean();
  sendJson(response, 200, {
    member: {
      ...user,
      teams,
      contributions,
      totalContributionPoints: contributions.reduce((total, item) => total + (Number(item.points) || 0), 0),
    },
  });
}

async function allocateContribution(request, response, user) {
  const body = await readJson(request);
  requireFields(body, ["memberId", "teamId", "points", "reason"]);
  const points = Number(body.points);
  if (typeof body.reason !== "string") throw new RouteError(400, "A contribution description is required.");
  const reason = String(body.reason).trim();
  if (!Number.isInteger(points) || points < 1 || points > 1000) throw new RouteError(400, "Points must be an integer from 1 to 1000.");
  if (!reason || reason.length > 300) throw new RouteError(400, "Description must be between 1 and 300 characters.");
  if (typeof body.memberId !== "string" || typeof body.teamId !== "string") {
    throw new RouteError(400, "A valid team and member are required.");
  }
  const team = await Team.findOne({ id: body.teamId, organizationId: user.organizationId });
  if (!team) throw new RouteError(404, "Team not found.");
  if (!canManageTeam(user, team)) {
    throw new RouteError(403, "You cannot allocate contribution points for this team.");
  }
  if (!await memberExists(body.memberId, user.organizationId)) throw new RouteError(404, "Member not found.");
  if (!team.members.some((member) => member.userId === body.memberId)) {
    throw new RouteError(400, "The selected member does not belong to this team.");
  }

  const contribution = await Contribution.create({
    id: crypto.randomUUID(),
    memberId: body.memberId,
    teamId: body.teamId,
    points,
    reason,
    taskId: typeof body.taskId === "string" ? body.taskId : null,
    awardedBy: user.id,
  });
  sendJson(response, 201, { contribution });
}

async function contributionHistory(response, pathname, teamId, user) {
  const organizationId = user.organizationId || DEFAULT_ORGANIZATION_ID;
  if (teamId) {
    const team = await Team.findOne({ id: teamId, organizationId }).lean();
    if (!team) throw new RouteError(404, "Team not found.");
    const contributions = await Contribution.teamHistory(teamId);
    const totalPoints = contributions.reduce((total, item) => total + item.points, 0);
    sendJson(response, 200, { contributions, totalPoints });
    return;
  }
  const memberId = decodeURIComponent(pathname.split("/").pop());
  if (!await memberExists(memberId, organizationId)) throw new RouteError(404, "Member not found.");
  const organizationTeams = await Team.find({ organizationId }).select("id").lean();
  const contributions = await Contribution.find({
    memberId,
    teamId: { $in: organizationTeams.map((team) => team.id) },
  }).sort({ createdAt: -1 }).lean();
  sendJson(response, 200, {
    contributions,
    totalPoints: contributions.reduce((total, item) => total + item.points, 0),
  });
}

async function calculateTeamMemberProgress(db, teamId, memberIds) {
  const uniqueMemberIds = [...new Set(memberIds)];
  if (!uniqueMemberIds.length) return new Map();

  const taskProgress = {
    $cond: [
      { $eq: ["$status", "Completed"] },
      100,
      { $max: [0, { $min: [100, { $ifNull: ["$progress", 0] }] }] },
    ],
  };
  const progressRows = await db.collection("tasks").aggregate([
    { $match: { teamId, assignee: { $in: uniqueMemberIds } } },
    {
      $group: {
        _id: "$assignee",
        assignedTasks: { $sum: 1 },
        completedTasks: { $sum: { $cond: [{ $gte: [taskProgress, 100] }, 1, 0] } },
        averageProgress: { $avg: taskProgress },
      },
    },
  ]).toArray();

  return new Map(progressRows.map((row) => [
    row._id,
    {
      assignedTasks: row.assignedTasks,
      completedTasks: row.completedTasks,
      progress: Math.max(0, Math.min(100, Math.round((row.averageProgress || 0) * 100) / 100)),
    },
  ]));
}

async function getTeamProgress(response, teamId, db, user) {
  const team = await Team.findOne({
    id: teamId,
    organizationId: user.organizationId || DEFAULT_ORGANIZATION_ID,
  }).lean();
  if (!team) throw new RouteError(404, "Team not found.");
  const teamMembers = team.members || [];
  const memberIds = teamMembers.map((member) => member.userId);
  const progressByMember = await calculateTeamMemberProgress(db, teamId, memberIds);
  const members = memberIds.map((memberId) => {
    const progress = progressByMember.get(memberId) || { assignedTasks: 0, completedTasks: 0, progress: 0 };
    return {
      memberId,
      assignedTasks: progress.assignedTasks,
      activeTasks: progress.assignedTasks - progress.completedTasks,
      completedTasks: progress.completedTasks,
      averageProgress: progress.progress,
    };
  });
  sendJson(response, 200, {
    teamId,
    members,
    overallProgress: members.length
      ? Math.round(members.reduce((sum, item) => sum + item.averageProgress, 0) / members.length)
      : 0,
  });
}

async function getTeamDashboard(response, teamId, db, user) {
  const organizationId = user.organizationId || DEFAULT_ORGANIZATION_ID;
  const team = await Team.findOne({ id: teamId, organizationId }).lean();
  if (!team) throw new RouteError(404, "Team not found.");

  const teamMembers = team.members || [];
  const memberIds = teamMembers.map((member) => member.userId);
  const users = await User.find(
    { id: { $in: memberIds }, organizationId },
    publicProfileFields
  ).lean();
  const profilesById = new Map(users.map((user) => [user.id, user]));
  const progressById = await calculateTeamMemberProgress(db, teamId, memberIds);
  const leader = await User.findOne(
    { id: team.leaderId, organizationId },
    publicProfileFields
  ).lean();
  const contributions = await Contribution.find({ teamId }).sort({ points: -1 }).lean();
  const tasks = await db.collection("tasks").find({ teamId }).sort({ createdAt: -1 }).toArray();

  const members = teamMembers.map((member) => ({
    ...member,
    profile: profilesById.get(member.userId) || null,
    ...(progressById.get(member.userId) || { assignedTasks: 0, completedTasks: 0, progress: 0 }),
  }));
  const checkpoints = team.checkpoints?.length ? team.checkpoints : team.checklist || [];

  sendJson(response, 200, {
    team: { ...team, leader, members, checkpoints },
    members,
    leader,
    checkpoints,
    reminders: team.reminders || [],
    tasks,
    contributions,
  });
}

async function addCheckpoint(request, response, teamId, user) {
  const body = await readJson(request);
  requireFields(body, ["text"]);
  const team = await Team.findOne({
    id: teamId,
    organizationId: user.organizationId || DEFAULT_ORGANIZATION_ID,
  });
  if (!team) throw new RouteError(404, "Team not found.");
  if (!canManageTeam(user, team)) throw new RouteError(403, "You cannot manage this team.");
  team.checkpoints.push({ id: crypto.randomUUID(), text: body.text, done: body.done === true });
  await team.save();
  sendJson(response, 201, { checkpoint: team.checkpoints[team.checkpoints.length - 1] });
}

async function updateCheckpoint(request, response, teamId, checkpointId, user) {
  const body = await readJson(request);
  const team = await Team.findOne({
    id: teamId,
    organizationId: user.organizationId || DEFAULT_ORGANIZATION_ID,
  });
  if (!team) throw new RouteError(404, "Team not found.");
  if (!canManageTeam(user, team)) throw new RouteError(403, "You cannot manage this team.");
  const checkpoint = team.checkpoints.find((item) => item.id === checkpointId);
  if (!checkpoint) throw new RouteError(404, "Checkpoint not found.");
  if (body.text !== undefined) checkpoint.text = body.text;
  if (body.done !== undefined) checkpoint.done = body.done === true;
  await team.save();
  sendJson(response, 200, { checkpoint });
}

async function deleteCheckpoint(response, teamId, checkpointId, user) {
  const team = await Team.findOne({
    id: teamId,
    organizationId: user.organizationId || DEFAULT_ORGANIZATION_ID,
  });
  if (!team) throw new RouteError(404, "Team not found.");
  if (!canManageTeam(user, team)) throw new RouteError(403, "You cannot manage this team.");
  const before = team.checkpoints.length;
  team.checkpoints = team.checkpoints.filter((item) => item.id !== checkpointId);
  if (team.checkpoints.length === before) throw new RouteError(404, "Checkpoint not found.");
  await team.save();
  sendJson(response, 200, { success: true });
}

async function addReminder(request, response, teamId, user) {
  const body = await readJson(request);
  requireFields(body, ["title", "dueDate"]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)) throw new RouteError(400, "dueDate must use YYYY-MM-DD.");
  const team = await Team.findOne({
    id: teamId,
    organizationId: user.organizationId || DEFAULT_ORGANIZATION_ID,
  });
  if (!team) throw new RouteError(404, "Team not found.");
  if (!canManageTeam(user, team)) throw new RouteError(403, "You cannot manage this team.");
  team.reminders.push({ id: crypto.randomUUID(), title: body.title, dueDate: body.dueDate, completed: false });
  await team.save();
  sendJson(response, 201, { reminder: team.reminders[team.reminders.length - 1] });
}

async function updateReminder(request, response, teamId, reminderId, user) {
  const body = await readJson(request);
  const team = await Team.findOne({
    id: teamId,
    organizationId: user.organizationId || DEFAULT_ORGANIZATION_ID,
  });
  if (!team) throw new RouteError(404, "Team not found.");
  if (!canManageTeam(user, team)) throw new RouteError(403, "You cannot manage this team.");
  const reminder = team.reminders.find((item) => item.id === reminderId);
  if (!reminder) throw new RouteError(404, "Reminder not found.");
  if (body.title !== undefined) reminder.title = body.title;
  if (body.dueDate !== undefined) reminder.dueDate = body.dueDate;
  if (body.completed !== undefined) reminder.completed = body.completed === true;
  await team.save();
  sendJson(response, 200, { reminder });
}

async function deleteReminder(response, teamId, reminderId, user) {
  const team = await Team.findOne({
    id: teamId,
    organizationId: user.organizationId || DEFAULT_ORGANIZATION_ID,
  });
  if (!team) throw new RouteError(404, "Team not found.");
  if (!canManageTeam(user, team)) throw new RouteError(403, "You cannot manage this team.");
  const before = team.reminders.length;
  team.reminders = team.reminders.filter((item) => item.id !== reminderId);
  if (team.reminders.length === before) throw new RouteError(404, "Reminder not found.");
  await team.save();
  sendJson(response, 200, { success: true });
}

async function handleMember3(request, response, pathname, db, authContext) {
  const method = request.method;
  const user = authContext?.user || null;
  if (!user) throw new RouteError(401, "Authentication required.");
  const organizationId = user.organizationId || DEFAULT_ORGANIZATION_ID;
  const teamResourceMatch = pathname.match(/^\/api\/teams\/([^/]+)/);
  if (teamResourceMatch) {
    const teamId = decodeURIComponent(teamResourceMatch[1]);
    if (!await Team.exists({ id: teamId, organizationId })) {
      throw new RouteError(404, "Team not found.");
    }
  }
  const memberResourceMatch = pathname.match(/^\/api\/members\/([^/]+)$/);
  const contributionMemberMatch = pathname.match(/^\/api\/contributions\/member\/([^/]+)$/);
  const memberId = memberResourceMatch?.[1] || contributionMemberMatch?.[1];
  if (memberId && !await memberExists(decodeURIComponent(memberId), organizationId)) {
    throw new RouteError(404, "Member not found.");
  }
  const contributionTeamMatch = pathname.match(/^\/api\/contributions\/team\/([^/]+)$/);
  if (contributionTeamMatch && !await Team.exists({
    id: decodeURIComponent(contributionTeamMatch[1]),
    organizationId,
  })) {
    throw new RouteError(404, "Team not found.");
  }
  if (method === "GET" && pathname === "/api/members") return listMembers(response, user);
  if (method === "GET" && pathname === "/api/teams") return listTeams(response, user);
  if (method === "POST" && pathname === "/api/teams") return createTeam(request, response, user);

  const teamMatch = pathname.match(/^\/api\/teams\/([^/]+)$/);
  if (teamMatch) {
    const teamId = decodeURIComponent(teamMatch[1]);
    if (method === "GET") return getTeam(response, teamId, user);
    if (method === "PATCH" || method === "PUT") return updateTeam(request, response, teamId, user);
    if (method === "DELETE") return deleteTeam(response, teamId, user);
  }
  if (method === "POST" && /^\/api\/teams\/[^/]+\/members$/.test(pathname)) {
    return addMember(request, response, decodeURIComponent(pathname.split("/")[3]), user);
  }
  if (method === "DELETE" && /^\/api\/teams\/[^/]+\/members$/.test(pathname)) {
    return removeMember(request, response, decodeURIComponent(pathname.split("/")[3]), user);
  }
  if (method === "PATCH" && /^\/api\/teams\/[^/]+\/leader$/.test(pathname)) {
    return assignLeader(request, response, decodeURIComponent(pathname.split("/")[3]), user);
  }
  if (method === "GET" && /^\/api\/teams\/[^/]+\/members$/.test(pathname)) {
    return getTeamMembers(response, decodeURIComponent(pathname.split("/")[3]), db, user);
  }
  if (method === "GET" && /^\/api\/teams\/[^/]+\/progress$/.test(pathname)) {
    return getTeamProgress(response, decodeURIComponent(pathname.split("/")[3]), db, user);
  }
  if (method === "GET" && /^\/api\/teams\/[^/]+\/dashboard$/.test(pathname)) {
    return getTeamDashboard(response, decodeURIComponent(pathname.split("/")[3]), db, user);
  }

  const checkpointMatch = pathname.match(/^\/api\/teams\/([^/]+)\/checkpoints(?:\/([^/]+))?$/);
  if (checkpointMatch) {
    const teamId = decodeURIComponent(checkpointMatch[1]);
    const checkpointId = checkpointMatch[2] ? decodeURIComponent(checkpointMatch[2]) : null;
    if (method === "POST" && !checkpointId) return addCheckpoint(request, response, teamId, user);
    if (method === "PATCH" && checkpointId) return updateCheckpoint(request, response, teamId, checkpointId, user);
    if (method === "DELETE" && checkpointId) return deleteCheckpoint(response, teamId, checkpointId, user);
  }

  const reminderMatch = pathname.match(/^\/api\/teams\/([^/]+)\/reminders(?:\/([^/]+))?$/);
  if (reminderMatch) {
    const teamId = decodeURIComponent(reminderMatch[1]);
    const reminderId = reminderMatch[2] ? decodeURIComponent(reminderMatch[2]) : null;
    if (method === "POST" && !reminderId) return addReminder(request, response, teamId, user);
    if (method === "PATCH" && reminderId) return updateReminder(request, response, teamId, reminderId, user);
    if (method === "DELETE" && reminderId) return deleteReminder(response, teamId, reminderId, user);
  }

  const profileMatch = pathname.match(/^\/api\/members\/([^/]+)$/);
  if (method === "GET" && profileMatch) return getMemberProfile(response, decodeURIComponent(profileMatch[1]), user);
  if (method === "POST" && pathname === "/api/contributions") return allocateContribution(request, response, authContext.user);
  if (method === "GET" && /^\/api\/contributions\/member\/[^/]+$/.test(pathname)) {
    return contributionHistory(response, pathname, null, user);
  }
  if (method === "GET" && /^\/api\/contributions\/team\/[^/]+$/.test(pathname)) {
    return contributionHistory(response, pathname, decodeURIComponent(pathname.split("/").pop()), user);
  }
  return false;
}

module.exports = { handleMember3, RouteError, calculateTeamMemberProgress };
