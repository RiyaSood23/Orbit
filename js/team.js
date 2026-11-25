
"use strict";

const initialState = {
  team: {
    name: "Team Orbit",
    description: "One team. Shared goals. Work that moves forward.",
    head: "m1",
    updated: "just now"
  },

  members: [
    {
      id: "m1",
      name: "Aarav Sharma",
      initials: "AS",
      role: "Team Head",
      skills: ["Planning", "Leadership"],
      points: 420,
      completed: 12,
      progress: 88,
      active: true,
      lastActivity: "12 min ago",
      lastActivityRank: 12
    },
    {
      id: "m3",
      name: "Ishita Verma",
      initials: "IV",
      role: "UI/UX Designer",
      skills: ["Figma", "Design"],
      points: 280,
      completed: 8,
      progress: 63,
      active: true,
      lastActivity: "1 hr ago",
      lastActivityRank: 60
    },
    {
      id: "m4",
      name: "Rohan Kapoor",
      initials: "RK",
      role: "Backend Developer",
      skills: ["Node.js", "API", "MongoDB"],
      points: 260,
      completed: 7,
      progress: 52,
      active: true,
      lastActivity: "3 hrs ago",
      lastActivityRank: 180
    },
    {
      id: "m5",
      name: "Ananya Singh",
      initials: "AN",
      role: "Marketing & Organising",
      skills: ["Writing", "Testing"],
      points: 195,
      completed: 5,
      progress: 34,
      active: false,
      lastActivity: "Yesterday",
      lastActivityRank: 1440
    }
  ],

  tasks: [
    {
      id: "t1",
      title: "Team dashboard UI",
      description: "Build a responsive team dashboard and member progress view.",
      assignee: "m4",
      priority: "High",
      deadline: "2026-10-29",
      points: 100,
      progress: 76,
      status: "In progress"
    },
    {
      id: "t2",
      title: "Orbit launch strategy",
      description: "Finalize the launch goals and coordinate team milestones.",
      assignee: "m1",
      priority: "High",
      deadline: "2026-10-30",
      points: 100,
      progress: 88,
      status: "In progress"
    },
    {
      id: "t3",
      title: "Task API endpoints",
      description: "Prepare and test the backend task routes.",
      assignee: "m4",
      priority: "High",
      deadline: "2026-11-01",
      points: 80,
      progress: 52,
      status: "In progress"
    },
    {
      id: "t4",
      title: "Design system refresh",
      description: "Polish reusable components, typography and spacing.",
      assignee: "m3",
      priority: "Medium",
      deadline: "2026-11-02",
      points: 60,
      progress: 63,
      status: "In review"
    },
    {
      id: "t5",
      title: "Launch content pack",
      description: "Prepare launch copy and the final content assets.",
      assignee: "m5",
      priority: "Medium",
      deadline: "2026-11-04",
      points: 60,
      progress: 34,
      status: "To do"
    },
    {
      id: "t6",
      title: "Project kickoff notes",
      description: "Document the initial decisions and responsibilities.",
      assignee: "m1",
      priority: "Low",
      deadline: "2026-10-24",
      points: 40,
      progress: 100,
      status: "Completed"
    }
  ],

  checklist: [
    {
      id: "c1",
      text: "Finalize project requirements",
      done: true
    },
    {
      id: "c2",
      text: "Complete dashboard UI",
      done: false
    },
    {
      id: "c3",
      text: "Review API endpoints",
      done: false
    },
    {
      id: "c4",
      text: "Test responsive layout",
      done: false
    },
    {
      id: "c5",
      text: "Prepare project demo",
      done: false
    }
  ],

  projects: [
    {
      id: "p1",
      name: "Orbit Launch",
      description: "Management planning, team coordination and launch readiness.",
      progress: 82
    },
    {
      id: "p2",
      name: "TeamFlow UI",
      description: "Responsive frontend and dashboard development.",
      progress: 68
    },
    {
      id: "p3",
      name: "API Foundation",
      description: "Backend endpoints and task management workflow.",
      progress: 46
    }
  ],

  activities: [
    {
      id: "a1",
      member: "Ananya Singh",
      action: "updated the Team dashboard UI",
      time: "35 min ago",
      icon: "↗"
    },
    {
      id: "a2",
      member: "Aarav Sharma",
      action: "updated Orbit launch strategy",
      time: "1 hr ago",
      icon: "✓"
    },
    {
      id: "a3",
      member: "Ishita Verma",
      action: "submitted the design system for review",
      time: "2 hrs ago",
      icon: "✳"
    },
    {
      id: "a4",
      member: "Rohan Kapoor",
      action: "started working on task API endpoints",
      time: "Yesterday",
      icon: "＋"
    }
  ]
};

// Load saved team data from localStorage.
// If no saved data exists, use the original demo data.
function loadState() {
  try {
    const savedState = localStorage.getItem("orbitTeamDetailsV2");

    if (savedState) {
      return {
        ...structuredClone(initialState),
        ...JSON.parse(savedState)
      };
    }
  } catch (error) {
    console.error("Could not load saved team data:", error);
  }

  return structuredClone(initialState);
}

let state = loadState();

let activeFilter = "all";
let searchTerm = "";
let memberSort = "name";
let taskSort = "deadline";
let performerSort = "desc";
let toastTimer;
let memberDirectory = [];
let currentUser = null;
let canManageCurrentTeam = false;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The request could not be completed.");
  return body;
}

async function loadTeamsFromApi() {
  try {
    const session = await apiRequest("/api/auth/session");
    currentUser = session.user || null;
    const { teams } = await apiRequest("/api/teams");
    const teamSelector = $("#teamSelector");
    if (!teamSelector) return;
    teamSelector.innerHTML = (teams || []).map(team =>
      `<option value="${escapeHTML(team.id)}">${escapeHTML(team.name)}</option>`
    ).join("");

    if (!teams?.length) {
      state.team = { name: "No teams yet", description: "Create a team to get started.", head: "", updated: "from server" };
      state.members = [];
      state.tasks = [];
      state.checklist = [];
      return;
    }

    const requestedId = new URLSearchParams(window.location.search).get("team");
    teamSelector.value = teams.some(team => team.id === requestedId) ? requestedId : teams[0].id;
    await loadTeamDashboard(teamSelector.value);
  } catch (error) {
    console.warn("Teams could not be loaded from the API:", error.message);
    toast(error.message);
  }
}

async function loadTeamDashboard(teamId) {
  const dashboard = await apiRequest(`/api/teams/${encodeURIComponent(teamId)}/dashboard`);
  const team = dashboard.team;
  const contributionByMember = new Map();
  for (const contribution of dashboard.contributions || []) {
    contributionByMember.set(
      contribution.memberId,
      (contributionByMember.get(contribution.memberId) || 0) + (Number(contribution.points) || 0)
    );
  }

  state.team = {
    id: team.id,
    name: team.name,
    description: team.description,
    head: team.leaderId,
    updated: "from server"
  };
  state.contributions = dashboard.contributions || [];
  canManageCurrentTeam = Boolean(currentUser && (
    ["manager", "admin"].includes(currentUser.role) || currentUser.id === team.leaderId
  ));
  $("#addMemberBtn").hidden = !canManageCurrentTeam;
  $("#awardContributionBtn").hidden = !canManageCurrentTeam;
  state.members = (dashboard.members || []).map(member => {
    const profile = member.profile || {};
    return {
      id: member.userId,
      name: profile.name || member.userId,
      initials: getInitials(profile.name || member.userId),
      role: member.role || "Member",
      skills: Array.isArray(profile.skills) ? profile.skills : (member.skills || []),
      points: contributionByMember.get(member.userId) || 0,
      completed: member.completedTasks || 0,
      assignedTasks: member.assignedTasks || 0,
      progress: Math.max(0, Math.min(100, Number(member.progress) || 0)),
      active: true,
      lastActivity: "Just now",
      lastActivityRank: 0
    };
  });
  state.checklist = (dashboard.checkpoints || []).map(item => ({ id: item.id, text: item.text, done: !!item.done }));
  state.tasks = (dashboard.tasks || []).map(task => ({
    id: task.id,
    title: task.title,
    description: task.description || "",
    assignee: task.assignee,
    priority: task.priority,
    deadline: task.dueDate,
    points: task.contributionPoints || 0,
    progress: task.status === "Completed" ? 100 : Math.max(0, Math.min(100, Number(task.progress) || 0)),
    status: task.status === "Completed"
      ? "Completed"
      : task.status === "Assigned"
        ? "To do"
        : (task.status || "To do")
  }));
  state.reminders = dashboard.reminders || [];
  renderAll();
  window.history.replaceState({}, "", `team.html?team=${encodeURIComponent(teamId)}`);
}

// Save the complete team workspace to the browser.
function saveState() {
  const saveStatus = $("#saveStatus");
  if (saveStatus) saveStatus.textContent = "Synced with server";
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function memberById(id) {
  return state.members.find(member => member.id === id);
}

function contributionPoints(memberId) {
  const member = memberById(memberId);
  return member ? Number(member.points) || 0 : 0;
}

function getInitials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();
}

function todayString() {
  const now = new Date();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
}

function formatDate(date) {
  const value = new Date(`${date}T12:00:00`);

  return value.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short"
  });
}

function daysUntil(date) {
  const today = new Date(`${todayString()}T00:00:00`);
  const due = new Date(`${date}T00:00:00`);

  return Math.round((due - today) / 86400000);
}

function timeLabel(date) {
  const days = daysUntil(date);

  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Tomorrow";

  return `In ${days} days`;
}

function toast(message) {
  const element = $("#toast");

  element.textContent = message;
  element.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    element.classList.remove("show");
  }, 2500);
}

function addActivity(memberName, action, icon = "✓") {
  state.activities.unshift({
    id: `a${Date.now()}`,
    member: memberName,
    action,
    time: "Just now",
    icon
  });

  state.activities = state.activities.slice(0, 10);
  state.team.updated = "just now";
}

function avatar(member) {
  const palette = [
    ["#dfeddf", "#426a4b"],
    ["#e8effb", "#5276aa"],
    ["#fceade", "#ae7951"],
    ["#f6e7f0", "#a65c83"],
    ["#e9e5fb", "#6c5caa"]
  ];

  const index = Math.max(
    0,
    state.members.findIndex(item => item.id === member.id)
  ) % palette.length;

  const [background, color] = palette[index];

  return `
    <div class="avatar"
         style="background:${background};color:${color}">
      ${escapeHTML(member.initials || getInitials(member.name))}
    </div>
  `;
}

/* Team header and summary */

function renderTeamHeader() {
  $("#teamName").innerHTML =
    `${escapeHTML(state.team.name)}<span>.</span>`;

  $("#breadcrumbTeam").textContent = state.team.name;
  $("#teamDescription").textContent = state.team.description;

  const head = memberById(state.team.head);

  $("#headName").textContent = head ? head.name : "Not assigned";
  $("#lastUpdated").textContent = state.team.updated || "just now";
}

function renderSummary() {
  const activeMembers = state.members.filter(
    member => member.active
  ).length;

  const activeTasks = state.tasks.filter(
    task => task.status !== "Completed"
  ).length;

  $("#totalMembers").textContent = String(state.members.length).padStart(2, "0");
  $("#activeMembers").textContent = String(activeMembers).padStart(2, "0");
  $("#activeTasks").textContent = String(activeTasks).padStart(2, "0");
  $("#memberCount").textContent = String(state.members.length).padStart(2, "0");
  $("#allTaskCount").textContent = String(state.tasks.length).padStart(2, "0");

  const upcoming = state.tasks
    .filter(task => task.status !== "Completed")
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .slice(0, 3);

  $("#priorityEvents").innerHTML = upcoming.length
    ? upcoming.map(task => `
      <div class="event-row">
        <span class="event-date">${formatDate(task.deadline)}</span>

        <div class="event-copy">
          <strong>${escapeHTML(task.title)}</strong>
          <small>${timeLabel(task.deadline)}</small>
        </div>

        <span class="event-priority">
          ${escapeHTML(task.priority.toUpperCase())}
        </span>
      </div>
    `).join("")
    : `<div class="empty-state">No upcoming deadlines.</div>`;
}

/* Member list */

function renderMembers() {
  let members = state.members.filter(member => {
    const content = [
      member.name,
      member.role,
      ...member.skills
    ].join(" ").toLowerCase();

    return content.includes(searchTerm);
  });

  if (memberSort === "progress") {
    members.sort((a, b) => b.progress - a.progress);
  } else if (memberSort === "activity") {
    members.sort(
      (a, b) => a.lastActivityRank - b.lastActivityRank
    );
  } else {
    members.sort((a, b) => a.name.localeCompare(b.name));
  }

  $("#memberList").innerHTML = members.length
    ? members.map(member => `
      <article class="member-card" data-member="${member.id}">
        <div class="member-identity">
          ${avatar(member)}

          <div>
            <div class="member-name">${escapeHTML(member.name)}</div>
            <div class="member-role">
              ${escapeHTML(member.role)}
              ${member.active
                ? " · Active"
                : " · Away"}
            </div>
          </div>
        </div>

        <div class="member-skills">
          <div class="member-label">SKILLS</div>
          <div class="skills">
            ${member.skills.map(skill => `
              <span class="skill">${escapeHTML(skill)}</span>
            `).join("")}
          </div>
        </div>

        <div class="member-progress">
          <div class="progress-label">
            <span>Progress</span>
            <strong>${member.progress}%</strong>
          </div>

          <div class="progress-track">
            <span style="width:${member.progress}%"></span>
          </div>
        </div>

        <button class="member-expand" type="button"
                aria-label="Show ${escapeHTML(member.name)} details"
                aria-expanded="false">⌄</button>
        ${canManageCurrentTeam && member.id !== state.team.head
          ? `<button class="remove-member" type="button" data-remove-member="${escapeHTML(member.id)}">Remove</button>`
          : ""}

        <div class="member-extra">
          <div class="extra-item">
            <small>Contribution points</small>
            <strong>${contributionPoints(member.id)}</strong>
          </div>

          <div class="extra-item">
            <small>Tasks completed</small>
            <strong>${member.completed}</strong>
          </div>

          <div class="extra-item">
            <small>Last activity</small>
            <strong>${escapeHTML(member.lastActivity)}</strong>
          </div>
        </div>
      </article>
    `).join("")
    : `<div class="empty-state">No members match your search.</div>`;
}

/* Checklist */

function renderChecklist() {
  const done = state.checklist.filter(item => item.done).length;

  const percent = state.checklist.length
    ? Math.round(done / state.checklist.length * 100)
    : 0;

  $("#checklistPercent").textContent = `${percent}%`;
  $("#checklistBar").style.width = `${percent}%`;

  $("#checklist").innerHTML = state.checklist.length
    ? state.checklist.map(item => `
      <div class="checklist-item ${item.done ? "done" : ""}"
           data-check="${item.id}">
        <button class="checklist-check ${item.done ? "checked" : ""}"
                type="button"
                aria-label="${item.done ? "Mark incomplete" : "Mark complete"}"
                aria-pressed="${item.done}">
          ✓
        </button>

        <div>
          <strong>${escapeHTML(item.text)}</strong>
          <small>${item.done ? "Completed" : "Pending"}</small>
        </div>

        <button class="delete-check" type="button"
                aria-label="Delete checklist item">×</button>
      </div>
    `).join("")
    : `<div class="empty-state">Add your first checklist item.</div>`;
}

function renderReminders() {
  const reminders = state.reminders || [];
  $("#reminderList").innerHTML = reminders.length
    ? reminders.map(reminder => `
      <div class="checklist-item ${reminder.completed ? "done" : ""}" data-reminder="${reminder.id}">
        <button class="checklist-check ${reminder.completed ? "checked" : ""}" type="button" aria-label="Toggle reminder">✓</button>
        <div><strong>${escapeHTML(reminder.title)}</strong><small>${escapeHTML(reminder.dueDate)}</small></div>
        <button class="delete-check" type="button" aria-label="Delete reminder">×</button>
      </div>
    `).join("")
    : `<div class="empty-state">No reminders.</div>`;
}

/* Tasks */

function renderTasks() {
  let tasks = state.tasks.filter(task =>
    activeFilter === "all" || task.status === activeFilter
  );

  if (taskSort === "priority") {
    const rank = { High: 0, Medium: 1, Low: 2 };

    tasks.sort((a, b) =>
      rank[a.priority] - rank[b.priority] ||
      a.deadline.localeCompare(b.deadline)
    );
  } else if (taskSort === "progress") {
    tasks.sort((a, b) => b.progress - a.progress);
  } else {
    tasks.sort((a, b) => a.deadline.localeCompare(b.deadline));
  }

  $$(".filter-tab").forEach(button => {
    const status = button.dataset.status;

    button.classList.toggle("selected", status === activeFilter);

    const count = status === "all"
      ? state.tasks.length
      : state.tasks.filter(task => task.status === status).length;

    if (status === "all") {
      const span = button.querySelector("span");
      if (span) span.textContent = count;
    }
  });

  $("#taskGrid").innerHTML = tasks.length
    ? tasks.map(task => {
      const member = memberById(task.assignee);
      const assignedMemberCanUpdate = currentUser?.id === task.assignee;
      const assignedMemberCanEditPoints = canManageCurrentTeam && task.status !== "Completed";
      const overdue =
        task.status !== "Completed" && daysUntil(task.deadline) < 0;

      return `
        <article class="task-card" data-task="${task.id}">
          <div class="task-card-top">
            <span class="priority-label ${task.priority.toLowerCase()}">
              ${escapeHTML(task.priority)} priority
            </span>

            <span class="task-status">${escapeHTML(task.status)}</span>
            ${canManageCurrentTeam
              ? `<button class="task-delete" type="button" data-delete-task="${escapeHTML(task.id)}" aria-label="Delete ${escapeHTML(task.title)}">×</button>`
              : ""}
          </div>

          <h3>${escapeHTML(task.title)}</h3>

          <p class="task-description">
            ${escapeHTML(task.description || "No description added.")}
          </p>

          <div class="task-progress-row">
            <div class="donut" style="--progress:${task.progress}">
              <strong>${task.progress}%</strong>
            </div>

            <div class="task-progress-details">
              <div class="progress-label">
                <span>Task completion</span>
                <strong>${task.progress}%</strong>
              </div>

              <div class="progress-track">
                <span style="width:${task.progress}%"></span>
              </div>
            </div>
          </div>

          <div class="task-points">
            <label for="task-points-${task.id}">Points on completion</label>
            <div>
              <input id="task-points-${task.id}" type="number"
                     class="task-points-input" min="1" max="1000" step="1"
                     value="${Math.max(0, Number(task.points) || 0)}"
                     ${assignedMemberCanEditPoints ? "" : "disabled"}
                     aria-label="Points awarded when task is completed">
              <strong>pts</strong>
            </div>
          </div>

          <div class="task-card-bottom">
            <div class="task-assignee">
              ${member ? avatar(member) : ""}

              <div>
                <strong>${escapeHTML(member?.name || "Unassigned")}</strong>
                <small>Task owner</small>
              </div>
            </div>

            <div class="task-deadline ${overdue ? "overdue" : ""}">
              ${overdue ? "Overdue · " : "Due "}
              ${formatDate(task.deadline)}
            </div>
          </div>

          <div class="task-controls">
            <label class="check-label">
              <input type="checkbox" class="task-done"
                     ${assignedMemberCanUpdate ? "" : "disabled"}
                     ${assignedMemberCanUpdate ? "" : 'title="Only the assigned member can complete this task"'}
                     ${task.status === "Completed" ? "checked" : ""}>
              Complete
            </label>

            <label class="progress-input">
              Progress
              <input type="number" class="task-progress-input"
                     min="0" max="100" value="${task.progress}"
                     ${assignedMemberCanUpdate ? "" : "disabled"}
                     ${assignedMemberCanUpdate ? "" : 'title="Only the assigned member can update this task"'}
                     aria-label="Task progress percentage"> %
            </label>
            ${canManageCurrentTeam
              ? `<label class="task-reassign-control">
                  Reassign
                  <select class="task-assignee-input" aria-label="Reassign ${escapeHTML(task.title)}">
                    ${state.members.map(member => `
                      <option value="${escapeHTML(member.id)}" ${member.id === task.assignee ? "selected" : ""}>
                        ${escapeHTML(member.name)}
                      </option>
                    `).join("")}
                  </select>
                </label>`
              : ""}
          </div>
        </article>
      `;
    }).join("")
    : `<div class="empty-state">No tasks found for this filter.</div>`;
}

/* Recent activity */

function renderActivity() {
  $("#activityList").innerHTML = state.activities.length
    ? state.activities.slice(0, 5).map(activity => `
      <div class="activity-item">
        <span class="activity-icon">${escapeHTML(activity.icon)}</span>

        <div class="activity-copy">
          <p>
            <strong>${escapeHTML(activity.member)}</strong>
            ${escapeHTML(activity.action)}
          </p>
          <small>Team Orbit workspace</small>
        </div>

        <span class="activity-time">${escapeHTML(activity.time)}</span>
      </div>
    `).join("")
    : `<div class="empty-state">Your team's activity will appear here.</div>`;
}

function renderPriorityTasks() {
  const tasks = state.tasks
    .filter(task =>
      task.status !== "Completed" && task.priority === "High"
    )
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .slice(0, 3);

  $("#priorityTaskList").innerHTML = tasks.length
    ? tasks.map(task => {
      const member = memberById(task.assignee);

      return `
        <div class="priority-task">
          <div class="priority-task-top">
            <span class="priority-label high">High priority</span>
            <small>${formatDate(task.deadline)}</small>
          </div>

          <strong>${escapeHTML(task.title)}</strong>

          <small>${escapeHTML(member?.name || "Unassigned")}</small>

          <div class="progress-track">
            <span style="width:${task.progress}%"></span>
          </div>
        </div>
      `;
    }).join("")
    : `<div class="empty-state">No high-priority open tasks.</div>`;
}

/* Top performers and overall progress */

function renderTopPerformers() {
  const members = [...state.members].sort((a, b) => {
    const pointsDifference = performerSort === "asc"
      ? a.points - b.points
      : b.points - a.points;

    return pointsDifference || a.name.localeCompare(b.name);
  });
  const highestPoints = Math.max(
    1,
    ...members.map(member => contributionPoints(member.id))
  );

  $("#topPerformers").innerHTML = members.length
    ? members.map((member, index) => `
      <article class="performer-row">
        <span class="performer-rank" aria-label="Rank ${index + 1}">
          ${index + 1}
        </span>
        ${avatar(member)}
        <div class="performer-details">
          <div class="performer-name">${escapeHTML(member.name)}</div>
          <div class="performer-role">${escapeHTML(member.role)}</div>
          <div class="performer-points-track" aria-hidden="true">
            <span style="width:${Math.max(0, contributionPoints(member.id)) / highestPoints * 100}%"></span>
          </div>
        </div>
        <strong class="performer-points">
            ${contributionPoints(member.id)}<small> pts</small>
        </strong>
      </article>
    `).join("")
    : `<div class="empty-state">No team contributions to rank yet.</div>`;

  const overall = state.tasks.length
    ? Math.round(
        state.tasks.reduce((sum, task) => sum + task.progress, 0) /
        state.tasks.length
      )
    : 0;

  $("#overallProgress").textContent = `${overall}%`;
  $("#overallProgressBar").style.width = `${overall}%`;
}

function renderContributionHistory() {
  const contributions = state.contributions || [];
  const teamTotal = contributions.reduce((total, item) => total + (Number(item.points) || 0), 0);
  $("#teamContributionTotal").textContent = `${teamTotal} pts total`;
  $("#contributionHistory").innerHTML = contributions.length
    ? contributions.slice(0, 8).map(item => {
      const member = memberById(item.memberId);
      const date = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "";
      return `
        <div class="contribution-history-row">
          <div>
            <strong>${escapeHTML(member?.name || "Team member")}</strong>
            <small>${escapeHTML(item.reason || "Contribution")} · ${escapeHTML(date)}</small>
          </div>
          <strong>+${Number(item.points) || 0} pts</strong>
        </div>
      `;
    }).join("")
    : `<div class="empty-state">No contribution records yet.</div>`;
}

function renderAll() {
  renderTeamHeader();
  renderSummary();
  renderMembers();
  renderChecklist();
  renderReminders();
  renderTasks();
  renderActivity();
  renderPriorityTasks();
  renderTopPerformers();
  renderContributionHistory();
  populateMemberSelects();
}

function populateMemberSelects() {
  const teamCandidates = memberDirectory.length ? memberDirectory : state.members;
  const teamOptions = teamCandidates.map(member => `
    <option value="${escapeHTML(member.id)}">
      ${escapeHTML(member.name)} (${escapeHTML(member.role || "Member")})
    </option>
  `).join("");
  const taskOptions = state.members.map(member => `
    <option value="${escapeHTML(member.id)}">
      ${escapeHTML(member.name)} (${escapeHTML(member.role || "Member")})
    </option>
  `).join("");

  $("#taskAssignee").innerHTML = taskOptions;
  $("#teamHead").innerHTML = teamOptions;
  $("#teamMembers").innerHTML = teamOptions;

  if (teamCandidates.some(member => member.id === state.team.head)) {
    $("#teamHead").value = state.team.head;
  }
}

/* Task progress updates */

async function updateTask(taskId, changes) {
  const task = state.tasks.find(item => item.id === taskId);
  if (!task) return;
  const payload = {};
  if (changes.progress !== undefined) {
    payload.progress = Math.max(0, Math.min(100, Number(changes.progress) || 0));
  }
  if (changes.points !== undefined) {
    payload.contributionPoints = Math.max(1, Math.min(1000, Math.round(Number(changes.points) || 1)));
  }
  try {
    await apiRequest(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    await loadTeamDashboard(state.team.id);
    toast(payload.progress === 100
      ? "Task completed and contribution points saved."
      : "Task progress saved.");
  } catch (error) {
    renderAll();
    toast(error.message);
  }
}

/* Search and sort */

$("#memberSearch").addEventListener("input", event => {
  searchTerm = event.target.value.trim().toLowerCase();
  renderMembers();
});

$("#memberSort").addEventListener("change", event => {
  memberSort = event.target.value;
  renderMembers();
});

$("#taskSort").addEventListener("change", event => {
  taskSort = event.target.value;
  renderTasks();
});

$("#performerSort").addEventListener("change", event => {
  performerSort = event.target.value;
  renderTopPerformers();
});

$("#statusFilters").addEventListener("click", event => {
  const button = event.target.closest("[data-status]");

  if (!button) return;

  activeFilter = button.dataset.status;
  renderTasks();
});

/* Expand member details */

$("#memberList").addEventListener("click", event => {
  const removeButton = event.target.closest("[data-remove-member]");
  if (removeButton) {
    const userId = removeButton.dataset.removeMember;
    apiRequest(`/api/teams/${encodeURIComponent(state.team.id)}/members`, {
      method: "DELETE",
      body: JSON.stringify({ userId })
    }).then(() => loadTeamDashboard(state.team.id))
      .then(() => toast("Member removed from the team."))
      .catch(error => toast(error.message));
    return;
  }

  const button = event.target.closest(".member-expand");

  if (!button) return;

  const card = button.closest(".member-card");
  const expanded = card.classList.toggle("expanded");

  button.setAttribute("aria-expanded", String(expanded));
  button.textContent = expanded ? "⌃" : "⌄";
});

/* Update progress and completion */

$("#taskGrid").addEventListener("change", event => {
  const card = event.target.closest("[data-task]");

  if (!card) return;

  const taskId = card.dataset.task;
  const task = state.tasks.find(item => item.id === taskId);

  if (!task) return;

  if (event.target.matches(".task-assignee-input")) {
    apiRequest(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      body: JSON.stringify({ assignee: event.target.value })
    }).then(() => loadTeamDashboard(state.team.id))
      .then(() => toast("Task reassigned."))
      .catch(error => {
        renderAll();
        toast(error.message);
      });
    return;
  }

  if (event.target.matches(".task-done")) {
    updateTask(taskId, {
      progress: event.target.checked ? 100 : 99,
      status: event.target.checked ? "Completed" : "In progress"
    });
  }

  if (event.target.matches(".task-points-input")) {
    const points = Math.max(
      0,
      Math.min(1000, Math.round(Number(event.target.value) || 0))
    );

    updateTask(taskId, { points });
  }

  if (event.target.matches(".task-progress-input")) {
    const progress = Math.max(
      0,
      Math.min(100, Number(event.target.value) || 0)
    );

    updateTask(taskId, {
      progress,
      status: progress === 100
        ? "Completed"
        : progress === 0
          ? "To do"
          : "In progress"
    });
  }
});

$("#taskGrid").addEventListener("click", event => {
  const button = event.target.closest("[data-delete-task]");
  if (!button || !window.confirm("Delete this task? This cannot be undone.")) return;
  const taskId = button.dataset.deleteTask;
  apiRequest(`/api/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" })
    .then(() => loadTeamDashboard(state.team.id))
    .then(() => toast("Task deleted."))
    .catch(error => toast(error.message));
});

/* Checklist interactions */

$("#checklist").addEventListener("click", event => {
  const row = event.target.closest("[data-check]");

  if (!row) return;

  const item = state.checklist.find(
    entry => entry.id === row.dataset.check
  );

  if (!item) return;

  if (event.target.closest(".delete-check")) {
    apiRequest(`/api/teams/${encodeURIComponent(state.team.id)}/checkpoints/${encodeURIComponent(item.id)}`, { method: "DELETE" })
      .then(() => loadTeamDashboard(state.team.id))
      .then(() => toast("Checklist item deleted."));
    return;
  }

  if (event.target.closest(".checklist-check")) {
    apiRequest(`/api/teams/${encodeURIComponent(state.team.id)}/checkpoints/${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ done: !item.done })
    }).then(() => loadTeamDashboard(state.team.id))
      .then(() => toast(item.done ? "Item reopened." : "Checklist item completed."));
  }
});

$("#addChecklistBtn").addEventListener("click", () => {
  $("#checklistForm").reset();
  $("#checklistDialog").showModal();
});

$("#checklistForm").addEventListener("submit", async event => {
  event.preventDefault();

  const formData = new FormData(event.currentTarget);
  const text = String(formData.get("text")).trim();

  if (!text) return;

  if (!state.team.id) return toast("Create or select a team first.");
  try {
    await apiRequest(`/api/teams/${encodeURIComponent(state.team.id)}/checkpoints`, {
      method: "POST",
      body: JSON.stringify({ text })
    });
    await loadTeamDashboard(state.team.id);
    $("#checklistDialog").close();
    toast("Checklist item added.");
  } catch (error) {
    toast(error.message);
  }
});

/* Add task */

$("#addTaskBtn").addEventListener("click", () => {
  $("#taskForm").reset();
  populateMemberSelects();

  $("#taskDeadline").value = [
    new Date().getFullYear(),
    String(new Date().getMonth() + 1).padStart(2, "0"),
    String(new Date().getDate() + 7).padStart(2, "0")
  ].join("-");

  $("#taskDialog").showModal();
});

$("#taskForm").addEventListener("submit", async event => {
  event.preventDefault();

  const data = new FormData(event.currentTarget);
  const title = String(data.get("title")).trim();
  const description = String(data.get("description")).trim();
  const deadline = String(data.get("deadline"));
  const assignee = String(data.get("assignee"));

  if (!title || !deadline || !memberById(assignee)) {
    toast("Please complete the required task fields.");
    return;
  }

  if (deadline < todayString()) {
    toast("Choose today or a future deadline.");
    return;
  }

  const progress = Math.max(
    0,
    Math.min(99, Number(data.get("progress")) || 0)
  );

  if (!state.team.id) return toast("Create or select a team first.");

  const task = {
    title,
    description,
    assignee,
    priority: String(data.get("priority")),
    dueDate: deadline,
    contributionPoints: Math.max(
      1,
      Math.min(1000, Math.round(Number(data.get("points")) || 1))
    ),
    progress,
    team: state.team.name,
    teamId: state.team.id,
    project: "",
  };
  try {
    await apiRequest("/api/tasks", {
      method: "POST",
      body: JSON.stringify(task)
    });
    await loadTeamDashboard(state.team.id);
    activeFilter = "all";
    $("#taskDialog").close();
    toast("Task added successfully.");
  } catch (error) {
    toast(error.message);
  }
});

/* Create team */

$("#createTeamBtn").addEventListener("click", async () => {
  const createButton = $("#createTeamBtn");
  createButton.disabled = true;
  try {
    const { users } = await apiRequest("/api/members");
    memberDirectory = (users || []).map(user => ({
      id: user.id,
      name: user.name,
      role: user.role || "Member",
      skills: user.skills || []
    }));
    if (!memberDirectory.length) {
      toast("No user accounts are available to add to a team.");
      return;
    }
  } catch (error) {
    toast(error.message);
    return;
  } finally {
    createButton.disabled = false;
  }

  $("#teamForm").reset();
  populateMemberSelects();
  if ($("#teamMembers").options.length) $("#teamMembers").options[0].selected = true;
  $("#teamDialog").showModal();
});

$("#teamForm").addEventListener("submit", async event => {
  event.preventDefault();
  const submitButton = event.currentTarget.querySelector('[type="submit"]');

  const data = new FormData(event.currentTarget);
  const name = String(data.get("name")).trim();
  const description = String(data.get("description")).trim();
  const head = String(data.get("head"));
  const memberIds = data.getAll("members").map(String);

  if (!name || !description || !memberDirectory.some(member => member.id === head)) {
    toast("Please complete all team fields.");
    return;
  }

  memberIds.push(head);
  if (submitButton) submitButton.disabled = true;
  try {
    const { team } = await apiRequest("/api/teams", {
      method: "POST",
      body: JSON.stringify({
        name,
        description,
        leaderId: head,
        memberIds: [...new Set(memberIds)],
      }),
    });
    $("#teamDialog").close();
    await loadTeamsFromApi();
    $("#teamSelector").value = team.id;
    await loadTeamDashboard(team.id);
    toast(`${name} was created.`);
  } catch (error) {
    toast(error.message);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

$("#addMemberBtn").addEventListener("click", async () => {
  try {
    const { users } = await apiRequest("/api/members");
    const currentIds = new Set(state.members.map(member => member.id));
    memberDirectory = (users || [])
      .filter(user => !currentIds.has(user.id))
      .map(user => ({
        id: user.id,
        name: user.name,
        email: user.email || "",
        role: user.role || "Member",
        skills: Array.isArray(user.skills) ? user.skills : []
      }));
    const select = $("#eligibleMemberSelect");
    select.innerHTML = memberDirectory.map(member => `
      <option value="${escapeHTML(member.id)}">
        ${escapeHTML(member.name)}${member.email ? ` · ${escapeHTML(member.email)}` : ""}
      </option>
    `).join("");
    if (!memberDirectory.length) {
      toast("There are no eligible users to add.");
      return;
    }
    $("#eligibleMemberDetails").textContent = "";
    select.dispatchEvent(new Event("change"));
    $("#addMemberDialog").showModal();
  } catch (error) {
    toast(error.message);
  }
});

$("#eligibleMemberSelect").addEventListener("change", event => {
  const member = memberDirectory.find(user => user.id === event.target.value);
  $("#eligibleMemberDetails").textContent = member
    ? `${member.role}${member.skills.length ? ` · Skills: ${member.skills.join(", ")}` : ""}`
    : "Select a user to view their profile details.";
});

$("#addMemberForm").addEventListener("submit", async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('[type="submit"]');
  const userId = String(new FormData(event.currentTarget).get("userId") || "");
  if (!userId || !state.team.id) return toast("Choose a user and team first.");
  if (button) button.disabled = true;
  try {
    await apiRequest(`/api/teams/${encodeURIComponent(state.team.id)}/members`, {
      method: "POST",
      body: JSON.stringify({ userId })
    });
    await loadTeamDashboard(state.team.id);
    $("#addMemberDialog").close();
    toast("Member added to the team.");
  } catch (error) {
    toast(error.message);
  } finally {
    if (button) button.disabled = false;
  }
});

$("#awardContributionBtn").addEventListener("click", () => {
  $("#contributionForm").reset();
  $("#contributionMember").innerHTML = state.members.map(member => `
    <option value="${escapeHTML(member.id)}">${escapeHTML(member.name)}</option>
  `).join("");
  if (!state.members.length) return toast("Add a team member before awarding points.");
  $("#contributionDialog").showModal();
});

$("#contributionForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  const data = new FormData(form);
  const payload = {
    teamId: state.team.id,
    memberId: String(data.get("memberId") || ""),
    points: Number(data.get("points")),
    reason: String(data.get("reason") || "").trim()
  };
  if (!payload.teamId || !payload.memberId || !Number.isInteger(payload.points) || payload.points < 1 || !payload.reason) {
    toast("Enter a member, a positive whole number of points, and a description.");
    return;
  }

  if (button) button.disabled = true;
  try {
    const { contribution } = await apiRequest("/api/contributions", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    state.contributions = [contribution, ...(state.contributions || [])];
    const member = memberById(contribution.memberId);
    if (member) member.points += contribution.points;
    renderAll();
    $("#contributionDialog").close();
    form.reset();
    toast("Contribution saved.");
    try {
      await loadTeamDashboard(state.team.id);
    } catch (error) {
      toast(`Contribution saved, but the dashboard could not refresh: ${error.message}`);
    }
  } catch (error) {
    toast(error.message);
  } finally {
    if (button) button.disabled = false;
  }
});

/* Dialog close buttons */

$$("[data-close]").forEach(button => {
  button.addEventListener("click", () => {
    const dialog = document.getElementById(button.dataset.close);

    if (dialog) dialog.close();
  });
});

$("#teamSelector").addEventListener("change", async event => {
  try {
    await loadTeamDashboard(event.target.value);
  } catch (error) {
    toast(error.message);
  }
});

$("#addReminderBtn").addEventListener("click", () => {
  $("#reminderForm").reset();
  $("#reminderDialog").showModal();
});

$("#reminderForm").addEventListener("submit", async event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  if (!state.team.id) return toast("Create or select a team first.");
  try {
    await apiRequest(`/api/teams/${encodeURIComponent(state.team.id)}/reminders`, {
      method: "POST",
      body: JSON.stringify({
        title: String(data.get("title")).trim(),
        dueDate: String(data.get("dueDate"))
      })
    });
    await loadTeamDashboard(state.team.id);
    $("#reminderDialog").close();
    toast("Reminder added.");
  } catch (error) {
    toast(error.message);
  }
});

$("#reminderList").addEventListener("click", async event => {
  const row = event.target.closest("[data-reminder]");
  if (!row) return;
  const reminder = state.reminders.find(item => item.id === row.dataset.reminder);
  if (!reminder) return;
  try {
    if (event.target.closest(".delete-check")) {
      await apiRequest(`/api/teams/${encodeURIComponent(state.team.id)}/reminders/${encodeURIComponent(reminder.id)}`, { method: "DELETE" });
      toast("Reminder deleted.");
    } else {
      await apiRequest(`/api/teams/${encodeURIComponent(state.team.id)}/reminders/${encodeURIComponent(reminder.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ completed: !reminder.completed })
      });
    }
    await loadTeamDashboard(state.team.id);
  } catch (error) {
    toast(error.message);
  }
});

/* Initialize */

loadTeamsFromApi().finally(() => {
  renderAll();
  saveState();
});
