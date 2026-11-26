const crypto = require("crypto");
const Announcement = require("../models/Announcement");
const Contribution = require("../models/Contribution");
const Event = require("../models/Event");
const Organization = require("../models/Organization");
const Team = require("../models/Team");
const User = require("../models/User");
const priorities = ["Normal", "Important", "Urgent"];

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
}

class OrganisationRouteError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function requireOrganisation(user) {
  if (!user.organizationId) {
    throw new OrganisationRouteError(403, "Your account is not associated with an organisation.");
  }
  return user.organizationId;
}

function announcementPriority(value, required = false) {
  if (value === undefined && !required) return undefined;
  if (!priorities.includes(value)) {
    throw new OrganisationRouteError(400, "Priority must be Normal, Important, or Urgent.");
  }
  return value;
}

function text(value, field, { required = false, max = 120, min = 1 } = {}) {
  if (typeof value !== "string") {
    if (!required && value === undefined) return undefined;
    throw new OrganisationRouteError(400, `${field} must be a string.`);
  }
  const result = value.trim();
  if ((required && result.length < min) || (!required && result.length > 0 && result.length < min)) {
    throw new OrganisationRouteError(400, `${field} must contain at least ${min} characters.`);
  }
  if (result.length > max) {
    throw new OrganisationRouteError(400, `${field} must be no longer than ${max} characters.`);
  }
  if (required && !result) {
    throw new OrganisationRouteError(400, `${field} is required.`);
  }
  return result;
}

function recordId(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new OrganisationRouteError(400, `${label} is invalid.`);
  }
  return value;
}

function decodedRecordId(value, label) {
  try {
    return recordId(decodeURIComponent(value), label);
  } catch (error) {
    if (error instanceof OrganisationRouteError) throw error;
    throw new OrganisationRouteError(400, `${label} is invalid.`);
  }
}

function parseDate(value, field = "date") {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value)) {
    throw new OrganisationRouteError(400, `${field} must be a valid date and time.`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new OrganisationRouteError(400, `${field} must be a valid date and time.`);
  }
  const datePart = value.slice(0, 10);
  const [year, month, day] = datePart.split("-").map(Number);
  if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== datePart) {
    throw new OrganisationRouteError(400, `${field} must be a valid date and time.`);
  }
  return parsed;
}

function validateChecklist(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) {
    throw new OrganisationRouteError(400, "Checklist must be an array of at most 50 items.");
  }
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new OrganisationRouteError(400, "Each checklist item must be an object.");
    }
    if (item.completed !== undefined && typeof item.completed !== "boolean") {
      throw new OrganisationRouteError(400, "Checklist completion status must be true or false.");
    }
    return {
      id: crypto.randomUUID(),
      text: text(item.text, "Checklist item", { required: true, min: 1, max: 200 }),
      completed: item.completed === true,
    };
  });
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

async function getDashboard(response, user, db) {
  const organizationId = requireOrganisation(user);
  const today = todayString();
  const [teams, users, taskCounts, teamTaskRows, memberTaskRows, recentTasks] = await Promise.all([
    Team.find({ organizationId }).select("id name leaderId members").sort({ name: 1 }).lean(),
    User.find({ organizationId }).select("id name role").sort({ name: 1 }).lean(),
    db.collection("tasks").aggregate([
      { $match: { organizationId } },
      {
        $group: {
          _id: null,
          totalTasks: { $sum: 1 },
          completedTasks: { $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] } },
          overdueTasks: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$status", "Completed"] },
                    { $lt: ["$dueDate", today] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]).toArray(),
    db.collection("tasks").aggregate([
      { $match: { organizationId, teamId: { $type: "string" } } },
      {
        $group: {
          _id: "$teamId",
          totalTasks: { $sum: 1 },
          completedTasks: { $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] } },
          overdueTasks: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$status", "Completed"] },
                    { $lt: ["$dueDate", today] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]).toArray(),
    db.collection("tasks").aggregate([
      { $match: { organizationId, assignee: { $type: "string" } } },
      {
        $group: {
          _id: "$assignee",
          assignedTasks: { $sum: 1 },
          completedTasks: { $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] } },
        },
      },
    ]).toArray(),
    db.collection("tasks").aggregate([
      { $match: { organizationId } },
      { $sort: { createdAt: -1 } },
      { $limit: 5 },
      {
        $project: {
          _id: 0,
          id: 1,
          title: 1,
          team: 1,
          teamId: 1,
          assignee: 1,
          status: 1,
          dueDate: 1,
          createdAt: 1,
        },
      },
    ]).toArray(),
  ]);
  const organizationTeamIds = teams.map((team) => team.id);
  const [contributionRows, upcomingTasks, leaders, upcomingEvents] = await Promise.all([
    organizationTeamIds.length
      ? Contribution.aggregate([
          { $match: { teamId: { $in: organizationTeamIds } } },
          {
            $group: {
              _id: "$memberId",
              contributionPoints: { $sum: "$points" },
              contributionCount: { $sum: 1 },
            },
          },
        ])
      : [],
    db.collection("tasks").aggregate([
      { $match: { organizationId, status: { $ne: "Completed" }, dueDate: { $gte: today } } },
      { $sort: { dueDate: 1 } },
      { $limit: 5 },
      { $project: { _id: 0, id: 1, title: 1, team: 1, teamId: 1, assignee: 1, dueDate: 1, priority: 1 } },
    ]).toArray(),
    User.find({
      id: { $in: teams.map((team) => team.leaderId) },
      organizationId,
    })
      .select("id name")
      .lean(),
    Event.find({ organizationId, date: { $gte: new Date() } })
      .sort({ date: 1 })
      .limit(5)
      .lean(),
  ]);

  const teamTasks = new Map(teamTaskRows.map((row) => [row._id, row]));
  const memberTasks = new Map(memberTaskRows.map((row) => [row._id, row]));
  const memberContributions = new Map(contributionRows.map((row) => [row._id, row]));
  const usersById = new Map(users.map((member) => [member.id, member]));
  const leadersById = new Map(leaders.map((leader) => [leader.id, leader]));
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const teamNamesByMember = new Map();
  for (const team of teams) {
    for (const member of team.members || []) {
      const current = teamNamesByMember.get(member.userId) || [];
      current.push(team.name);
      teamNamesByMember.set(member.userId, current);
    }
  }

  const members = users.map((member) => {
    const taskStats = memberTasks.get(member.id) || { assignedTasks: 0, completedTasks: 0 };
    const contributionStats = memberContributions.get(member.id) || {
      contributionPoints: 0,
      contributionCount: 0,
    };
    return {
      id: member.id,
      name: member.name,
      role: member.role || "member",
      teams: teamNamesByMember.get(member.id) || [],
      assignedTasks: taskStats.assignedTasks,
      completedTasks: taskStats.completedTasks,
      contributionPoints: contributionStats.contributionPoints,
      contributionCount: contributionStats.contributionCount,
    };
  });

  const counts = taskCounts[0] || { totalTasks: 0, completedTasks: 0, overdueTasks: 0 };
  const upcomingDeadlines = upcomingTasks.map((task) => ({
    ...task,
    team: teamsById.get(task.teamId)?.name || task.team || "Unassigned team",
    assignee: usersById.get(task.assignee)?.name || task.assignee || "Unassigned",
  }));
  const recentTaskRecords = recentTasks.map((task) => ({
    ...task,
    team: teamsById.get(task.teamId)?.name || task.team || "Unassigned team",
    assignee: usersById.get(task.assignee)?.name || task.assignee || "Unassigned",
  }));
  const teamStats = teams.map((team) => {
    const stats = teamTasks.get(team.id) || { totalTasks: 0, completedTasks: 0, overdueTasks: 0 };
    return {
      id: team.id,
      name: team.name,
      leader: leadersById.get(team.leaderId) || null,
      memberCount: team.members?.length || 0,
      totalTasks: stats.totalTasks,
      completedTasks: stats.completedTasks,
      overdueTasks: stats.overdueTasks,
      productivity: stats.totalTasks
        ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
        : 0,
    };
  });
  const topPerformers = members
    .filter((member) => member.contributionPoints > 0)
    .sort((left, right) =>
      right.contributionPoints - left.contributionPoints || left.name.localeCompare(right.name)
    )
    .slice(0, 5);

  sendJson(response, 200, {
    stats: {
      totalTasks: counts.totalTasks,
      completedTasks: counts.completedTasks,
      pendingTasks: counts.totalTasks - counts.completedTasks,
      overdueTasks: counts.overdueTasks,
      totalTeams: teams.length,
      totalMembers: users.length,
      completionPercentage: counts.totalTasks
        ? Math.round((counts.completedTasks / counts.totalTasks) * 100)
        : 0,
    },
    totalTeams: teams.length,
    totalMembers: users.length,
    teams: teamStats,
    members,
    topPerformers,
    upcomingDeadlines,
    recentTasks: recentTaskRecords,
    upcomingEvents,
    recentSubmissions: [],
    submissionTrackingAvailable: false,
  });
}

async function getWorkspace(response, user, db) {
  const organizationId = requireOrganisation(user);
  const organizationWide = ["admin", "manager"].includes(user.role);
  const teamFilter = organizationWide
    ? { organizationId }
    : { organizationId, $or: [{ leaderId: user.id }, { "members.userId": user.id }] };
  const teams = await Team.find(teamFilter)
    .select("id name leaderId members")
    .sort({ name: 1 })
    .lean();
  const teamIds = teams.map((team) => team.id);
  const taskFilter = organizationWide
    ? { organizationId }
    : {
        organizationId,
        $or: [
          { assignee: user.id },
          ...(teamIds.length ? [{ teamId: { $in: teamIds } }] : []),
        ],
      };
  const today = todayString();
  const [taskCounts, teamTaskRows, taskRecords, upcomingDeadlines, upcomingEvents] = await Promise.all([
    db.collection("tasks").aggregate([
      { $match: taskFilter },
      {
        $group: {
          _id: null,
          totalTasks: { $sum: 1 },
          completedTasks: { $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] } },
          overdueTasks: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ["$status", "Completed"] }, { $lt: ["$dueDate", today] }] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]).toArray(),
    teamIds.length
      ? db.collection("tasks").aggregate([
          { $match: { organizationId, teamId: { $in: teamIds } } },
          {
            $group: {
              _id: "$teamId",
              totalTasks: { $sum: 1 },
              completedTasks: { $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] } },
            },
          },
        ]).toArray()
      : [],
    db.collection("tasks").find(taskFilter)
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray(),
    db.collection("tasks").aggregate([
      { $match: { ...taskFilter, status: { $ne: "Completed" }, dueDate: { $gte: today } } },
      { $sort: { dueDate: 1 } },
      { $limit: 10 },
      { $project: { _id: 0, id: 1, title: 1, team: 1, teamId: 1, assignee: 1, dueDate: 1, priority: 1 } },
    ]).toArray(),
    Event.find({ organizationId, date: { $gte: new Date() } })
      .sort({ date: 1 })
      .limit(5)
      .lean(),
  ]);
  const relevantMemberIds = new Set([user.id]);
  for (const team of teams) {
    if (team.leaderId) relevantMemberIds.add(team.leaderId);
    for (const member of team.members || []) relevantMemberIds.add(member.userId);
  }
  const memberFilter = organizationWide
    ? { organizationId }
    : { organizationId, id: { $in: [...relevantMemberIds] } };
  const members = await User.find(memberFilter).select("id name role").sort({ name: 1 }).lean();
  const membersById = new Map(members.map((member) => [member.id, member]));
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const teamTasksById = new Map(teamTaskRows.map((row) => [row._id, row]));
  const counts = taskCounts[0] || { totalTasks: 0, completedTasks: 0, overdueTasks: 0 };
  const teamStats = teams.map((team) => {
    const taskStats = teamTasksById.get(team.id) || { totalTasks: 0, completedTasks: 0 };
    const memberIds = new Set((team.members || []).map((member) => member.userId));
    if (team.leaderId) memberIds.add(team.leaderId);
    return {
      id: team.id,
      name: team.name,
      description: team.description,
      leaderId: team.leaderId,
      leader: membersById.get(team.leaderId)?.name || "Not assigned",
      members: team.members || [],
      memberCount: memberIds.size,
      totalTasks: taskStats.totalTasks,
      completedTasks: taskStats.completedTasks,
      productivity: taskStats.totalTasks
        ? Math.round((taskStats.completedTasks / taskStats.totalTasks) * 100)
        : 0,
    };
  });
  const teamLeader = teams.some((team) => team.leaderId === user.id);
  const contributionFilter = teamIds.length
    ? {
        teamId: { $in: teamIds },
        ...(!organizationWide && !teamLeader ? { memberId: user.id } : {}),
      }
    : null;
  const [ownContributionRows, activity] = contributionFilter
    ? await Promise.all([
        Contribution.aggregate([
          { $match: { ...contributionFilter, memberId: user.id } },
          { $group: { _id: null, points: { $sum: "$points" }, count: { $sum: 1 } } },
        ]),
        Contribution.find(contributionFilter).sort({ createdAt: -1 }).limit(10).lean(),
      ])
    : [[], []];
  const taskRecordsWithNames = taskRecords.map((task) => ({
    ...task,
    team: teamsById.get(task.teamId)?.name || task.team || "Unassigned team",
    assignee: membersById.get(task.assignee)?.name || task.assignee || "Unassigned",
  }));
  const deadlinesWithNames = upcomingDeadlines.map((task) => ({
    ...task,
    team: teamsById.get(task.teamId)?.name || task.team || "Unassigned team",
    assignee: membersById.get(task.assignee)?.name || task.assignee || "Unassigned",
  }));
  const activityWithNames = activity.map((entry) => ({
    ...entry,
    memberName: membersById.get(entry.memberId)?.name || entry.memberId,
    teamName: teamsById.get(entry.teamId)?.name || "Team",
  }));
  const totalMemberIds = new Set();
  for (const team of teams) {
    for (const member of team.members || []) totalMemberIds.add(member.userId);
    if (team.leaderId) totalMemberIds.add(team.leaderId);
  }
  if (organizationWide) {
    for (const member of members) totalMemberIds.add(member.id);
  } else {
    totalMemberIds.add(user.id);
  }
  sendJson(response, 200, {
    scope: organizationWide ? "organization" : teamLeader ? "team" : "member",
    user: {
      id: user.id,
      name: membersById.get(user.id)?.name || user.name || "Member",
      role: user.role || "member",
    },
    stats: {
      totalTasks: counts.totalTasks,
      completedTasks: counts.completedTasks,
      pendingTasks: counts.totalTasks - counts.completedTasks,
      overdueTasks: counts.overdueTasks,
      totalTeams: teams.length,
      totalMembers: totalMemberIds.size,
      contributionPoints: ownContributionRows[0]?.points || 0,
    },
    teams: teamStats,
    tasks: taskRecordsWithNames,
    upcomingDeadlines: deadlinesWithNames,
    upcomingEvents,
    recentActivity: activityWithNames,
    recentSubmissions: [],
    submissionTrackingAvailable: false,
  });
}

async function listEvents(response, organizationId) {
  const events = await Event.find({ organizationId }).sort({ date: 1, createdAt: -1 }).lean();
  sendJson(response, 200, { events });
}

async function getEvent(response, organizationId, id) {
  const event = await Event.findOne({ id, organizationId }).lean();
  if (!event) throw new OrganisationRouteError(404, "Event not found.");
  sendJson(response, 200, { event });
}

async function createEvent(request, response, user, organizationId, readJsonBody) {
  const body = await readJsonBody(request);
  const event = await Event.create({
    id: crypto.randomUUID(),
    organizationId,
    title: text(body.title, "Title", { required: true, min: 2, max: 120 }),
    description: text(body.description ?? "", "Description", { max: 2000 }),
    date: parseDate(body.date),
    location: text(body.location ?? "", "Location", { max: 200 }),
    createdBy: user.id,
    checklist: validateChecklist(body.checklist),
  });
  sendJson(response, 201, { event });
}

async function updateEvent(request, response, user, organizationId, id, readJsonBody) {
  const body = await readJsonBody(request);
  const event = await Event.findOne({ id, organizationId });
  if (!event) throw new OrganisationRouteError(404, "Event not found.");
  const updates = ["title", "description", "date", "location", "checklist"]
    .filter((field) => body[field] !== undefined);
  if (!updates.length) throw new OrganisationRouteError(400, "Provide at least one event field to update.");
  if (body.title !== undefined) event.title = text(body.title, "Title", { required: true, min: 2, max: 120 });
  if (body.description !== undefined) event.description = text(body.description, "Description", { max: 2000 });
  if (body.date !== undefined) event.date = parseDate(body.date);
  if (body.location !== undefined) event.location = text(body.location, "Location", { max: 200 });
  if (body.checklist !== undefined) event.checklist = validateChecklist(body.checklist);
  await event.save();
  sendJson(response, 200, { event });
}

async function deleteEvent(response, organizationId, id) {
  const event = await Event.findOneAndDelete({ id, organizationId });
  if (!event) throw new OrganisationRouteError(404, "Event not found.");
  sendJson(response, 200, { success: true });
}

async function updateChecklistItem(request, response, organizationId, eventId, itemId, readJsonBody) {
  const body = await readJsonBody(request);
  const event = await Event.findOne({ id: eventId, organizationId });
  if (!event) throw new OrganisationRouteError(404, "Event not found.");
  const item = event.checklist.find((entry) => entry.id === itemId);
  if (!item) throw new OrganisationRouteError(404, "Checklist item not found.");
  if (body.text === undefined && body.completed === undefined) {
    throw new OrganisationRouteError(400, "Provide checklist text or completion status.");
  }
  if (body.text !== undefined) item.text = text(body.text, "Checklist item", { required: true, min: 1, max: 200 });
  if (body.completed !== undefined) {
    if (typeof body.completed !== "boolean") {
      throw new OrganisationRouteError(400, "Checklist completion status must be true or false.");
    }
    item.completed = body.completed;
  }
  await event.save();
  sendJson(response, 200, { event, item });
}

async function handleOrganisation(request, response, pathname, context) {
  const { user, db, readJsonBody } = context;
  if (!user) throw new OrganisationRouteError(401, "Authentication required.");
  const organizationId = requireOrganisation(user);

  if (request.method === "GET" && pathname === "/api/organizations/me") {
    const organization = await Organization.findOne({ id: organizationId })
      .select("id name inviteCode")
      .lean();
    if (!organization) throw new OrganisationRouteError(404, "Workspace not found.");
    const result = { id: organization.id, name: organization.name };
    if (["manager", "admin"].includes(user.role || "member")) {
      result.inviteCode = organization.inviteCode;
    }
    sendJson(response, 200, { organization: result });
    return true;
  }
  if (request.method === "GET" && pathname === "/api/organizations/members") {
    let memberFilter = { organizationId };
    if (!["manager", "admin"].includes(user.role || "member")) {
      const teams = await Team.find({
        organizationId,
        $or: [{ leaderId: user.id }, { "members.userId": user.id }],
      }).select("leaderId members").lean();
      const memberIds = new Set([user.id]);
      for (const team of teams) {
        if (team.leaderId) memberIds.add(team.leaderId);
        for (const member of team.members || []) memberIds.add(member.userId);
      }
      memberFilter = { organizationId, id: { $in: [...memberIds] } };
    }
    const members = await User.find(
      memberFilter,
      { id: 1, name: 1, email: 1, role: 1, _id: 0 }
    ).sort({ name: 1 }).lean();
    sendJson(response, 200, { members });
    return true;
  }
  if (request.method === "GET" && pathname === "/api/organizations/me/invite-code") {
    if (!["manager", "admin"].includes(user.role || "member")) {
      throw new OrganisationRouteError(403, "Only workspace managers and admins can view the invitation code.");
    }
    const organization = await Organization.findOne({ id: organizationId })
      .select("inviteCode")
      .lean();
    if (!organization) throw new OrganisationRouteError(404, "Workspace not found.");
    sendJson(response, 200, { inviteCode: organization.inviteCode });
    return true;
  }
  if (request.method === "POST" && pathname === "/api/organizations/me/invite-code") {
    if (user.role !== "admin") {
      throw new OrganisationRouteError(403, "Only workspace admins can rotate the invitation code.");
    }
    const organization = await Organization.findOneAndUpdate(
      { id: organizationId },
      { $set: { inviteCode: crypto.randomBytes(6).toString("hex").toUpperCase() } },
      { returnDocument: "after", runValidators: true }
    ).select("id name inviteCode");
    if (!organization) throw new OrganisationRouteError(404, "Workspace not found.");
    sendJson(response, 200, { organization });
    return true;
  }

  if (pathname === "/api/announcements" && request.method === "GET") {
    const query = new URL(request.url || pathname, "http://localhost").searchParams;
    const page = Number(query.get("page") || 1);
    const limit = Number(query.get("limit") || 10);
    const priority = query.get("priority") || "";
    if (!Number.isSafeInteger(page) || page < 1 ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
      throw new OrganisationRouteError(400, "Page must be positive and limit must be from 1 to 50.");
    }
    if (!Number.isSafeInteger((page - 1) * limit)) {
      throw new OrganisationRouteError(400, "Page is too large.");
    }
    if (priority && !priorities.includes(priority)) {
      throw new OrganisationRouteError(400, "Priority must be Normal, Important, or Urgent.");
    }
    const filter = { organizationId, ...(priority ? { priority } : {}) };
    const [announcements, total] = await Promise.all([
      Announcement.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Announcement.countDocuments(filter),
    ]);
    sendJson(response, 200, {
      announcements: announcements.map((announcement) => ({
        ...announcement,
        message: announcement.content,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
    return true;
  }
  if (pathname === "/api/announcements" && request.method === "POST") {
    const body = await readJsonBody(request);
    const announcement = await Announcement.create({
      id: crypto.randomUUID(),
      organizationId,
      title: text(body.title, "Title", { required: true, min: 2, max: 120 }),
      content: text(body.message ?? body.content, "Announcement message", {
        required: true,
        min: 1,
        max: 10000,
      }),
      priority: announcementPriority(body.priority === undefined ? "Normal" : body.priority, true),
      createdBy: user.id,
    });
    sendJson(response, 201, {
      announcement: { ...announcement.toObject(), message: announcement.content },
    });
    return true;
  }
  const pagedAnnouncementMatch = pathname.match(/^\/api\/announcements\/([^/]+)$/);
  if (pagedAnnouncementMatch) {
    const id = decodedRecordId(pagedAnnouncementMatch[1], "Announcement ID");
    if (request.method === "GET") {
      const announcement = await Announcement.findOne({ id, organizationId }).lean();
      if (!announcement) throw new OrganisationRouteError(404, "Announcement not found.");
      sendJson(response, 200, {
        announcement: { ...announcement, message: announcement.content },
      });
      return true;
    }
    if (request.method === "PUT" || request.method === "PATCH") {
      const body = await readJsonBody(request);
      const announcement = await Announcement.findOne({ id, organizationId });
      if (!announcement) throw new OrganisationRouteError(404, "Announcement not found.");
      const content = body.message !== undefined ? body.message : body.content;
      if (body.title === undefined && content === undefined && body.priority === undefined) {
        throw new OrganisationRouteError(400, "Provide a title, message, or priority to update.");
      }
      if (body.title !== undefined) {
        announcement.title = text(body.title, "Title", { required: true, min: 2, max: 120 });
      }
      if (content !== undefined) {
        announcement.content = text(content, "Announcement message", {
          required: true,
          min: 1,
          max: 10000,
        });
      }
      if (body.priority !== undefined) {
        announcement.priority = announcementPriority(body.priority, true);
      }
      await announcement.save();
      sendJson(response, 200, {
        announcement: { ...announcement.toObject(), message: announcement.content },
      });
      return true;
    }
    if (request.method === "DELETE") {
      const announcement = await Announcement.findOneAndDelete({ id, organizationId });
      if (!announcement) throw new OrganisationRouteError(404, "Announcement not found.");
      sendJson(response, 200, { success: true });
      return true;
    }
  }

  if (request.method === "GET" && pathname === "/api/organisation/workspace") {
    await getWorkspace(response, user, db);
    return true;
  }
  if (request.method === "GET" && pathname === "/api/organisation/dashboard") {
    await getDashboard(response, user, db);
    return true;
  }
  if (request.method === "GET" && pathname === "/api/organisation/events") {
    await listEvents(response, organizationId);
    return true;
  }
  if (request.method === "POST" && pathname === "/api/organisation/events") {
    await createEvent(request, response, user, organizationId, readJsonBody);
    return true;
  }
  if (request.method === "GET" && pathname === "/api/organisation/announcements") {
    const announcements = await Announcement.find({ organizationId }).sort({ createdAt: -1 }).lean();
    sendJson(response, 200, { announcements });
    return true;
  }
  if (request.method === "POST" && pathname === "/api/organisation/announcements") {
    const body = await readJsonBody(request);
    const announcement = await Announcement.create({
      id: crypto.randomUUID(),
      organizationId,
      title: text(body.title, "Title", { required: true, min: 2, max: 120 }),
      content: text(body.content, "Announcement content", { required: true, min: 1, max: 5000 }),
      priority: announcementPriority(body.priority === undefined ? "Normal" : body.priority, true),
      createdBy: user.id,
    });
    sendJson(response, 201, { announcement });
    return true;
  }

  const eventItemMatch = pathname.match(/^\/api\/organisation\/events\/([^/]+)\/checklist\/([^/]+)$/);
  if (eventItemMatch) {
    const eventId = decodedRecordId(eventItemMatch[1], "Event ID");
    const itemId = decodedRecordId(eventItemMatch[2], "Checklist item ID");
    if (request.method === "PATCH") {
      await updateChecklistItem(request, response, organizationId, eventId, itemId, readJsonBody);
      return true;
    }
    if (request.method === "DELETE") {
      const event = await Event.findOne({ id: eventId, organizationId });
      if (!event) throw new OrganisationRouteError(404, "Event not found.");
      const before = event.checklist.length;
      event.checklist = event.checklist.filter((item) => item.id !== itemId);
      if (event.checklist.length === before) throw new OrganisationRouteError(404, "Checklist item not found.");
      await event.save();
      sendJson(response, 200, { event });
      return true;
    }
  }

  const eventChecklistMatch = pathname.match(/^\/api\/organisation\/events\/([^/]+)\/checklist$/);
  if (eventChecklistMatch && request.method === "POST") {
    const eventId = decodedRecordId(eventChecklistMatch[1], "Event ID");
    const body = await readJsonBody(request);
    const event = await Event.findOne({ id: eventId, organizationId });
    if (!event) throw new OrganisationRouteError(404, "Event not found.");
    if (event.checklist.length >= 50) throw new OrganisationRouteError(400, "An event can have at most 50 checklist items.");
    event.checklist.push({
      id: crypto.randomUUID(),
      text: text(body.text, "Checklist item", { required: true, min: 1, max: 200 }),
      completed: false,
    });
    await event.save();
    sendJson(response, 201, { event, item: event.checklist[event.checklist.length - 1] });
    return true;
  }

  const eventMatch = pathname.match(/^\/api\/organisation\/events\/([^/]+)$/);
  if (eventMatch) {
    const id = decodedRecordId(eventMatch[1], "Event ID");
    if (request.method === "GET") {
      await getEvent(response, organizationId, id);
      return true;
    }
    if (request.method === "PATCH" || request.method === "PUT") {
      await updateEvent(request, response, user, organizationId, id, readJsonBody);
      return true;
    }
    if (request.method === "DELETE") {
      await deleteEvent(response, organizationId, id);
      return true;
    }
  }

  const announcementMatch = pathname.match(/^\/api\/organisation\/announcements\/([^/]+)$/);
  if (announcementMatch) {
    const id = decodedRecordId(announcementMatch[1], "Announcement ID");
    if (request.method === "GET") {
      const announcement = await Announcement.findOne({ id, organizationId }).lean();
      if (!announcement) throw new OrganisationRouteError(404, "Announcement not found.");
      sendJson(response, 200, { announcement });
      return true;
    }
    if (request.method === "PATCH" || request.method === "PUT") {
      const body = await readJsonBody(request);
      const announcement = await Announcement.findOne({ id, organizationId });
      if (!announcement) throw new OrganisationRouteError(404, "Announcement not found.");
      if (body.title === undefined && body.content === undefined) {
        throw new OrganisationRouteError(400, "Provide a title or content to update.");
      }
      if (body.title !== undefined) {
        announcement.title = text(body.title, "Title", { required: true, min: 2, max: 120 });
      }
      if (body.content !== undefined) {
        announcement.content = text(body.content, "Announcement content", { required: true, min: 1, max: 10000 });
      }
      if (body.priority !== undefined) announcement.priority = announcementPriority(body.priority, true);
      await announcement.save();
      sendJson(response, 200, { announcement });
      return true;
    }
    if (request.method === "DELETE") {
      const announcement = await Announcement.findOneAndDelete({ id, organizationId });
      if (!announcement) throw new OrganisationRouteError(404, "Announcement not found.");
      sendJson(response, 200, { success: true });
      return true;
    }
  }
  return false;
}

module.exports = { handleOrganisation, OrganisationRouteError };
