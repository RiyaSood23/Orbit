
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
      id: "m2",
      name: "Meghna Rana",
      initials: "MR",
      role: "Frontend Developer",
      skills: ["HTML", "CSS", "JavaScript"],
      points: 315,
      completed: 9,
      progress: 76,
      active: true,
      lastActivity: "35 min ago",
      lastActivityRank: 35
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
      role: "Content & Operations",
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
      assignee: "m2",
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
      description: "Product planning, team coordination and launch readiness.",
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
      member: "Meghna Rana",
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

let state = structuredClone(initialState);
let activeFilter = "all";
let searchTerm = "";
let memberSort = "name";
let taskSort = "deadline";
let performerSort = "desc";
let toastTimer;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function clearSavedState() {
  try {
    localStorage.removeItem("orbitTeamDetailsV2");
  } catch (error) {
    console.warn("Saved demo data could not be cleared.", error);
  }
}

function saveState() {
  const saveStatus = $("#saveStatus");

  if (saveStatus) {
    saveStatus.textContent = "Demo mode · resets on refresh";
  }
}

clearSavedState();

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

  if (!member) return 0;

  const completedTaskPoints = state.tasks
    .filter(task => task.assignee === memberId && task.progress === 100)
    .reduce((total, task) => total + Math.max(0, Number(task.points) || 0), 0);

  return member.points + completedTaskPoints;
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
      const overdue =
        task.status !== "Completed" && daysUntil(task.deadline) < 0;

      return `
        <article class="task-card" data-task="${task.id}">
          <div class="task-card-top">
            <span class="priority-label ${task.priority.toLowerCase()}">
              ${escapeHTML(task.priority)} priority
            </span>

            <span class="task-status">${escapeHTML(task.status)}</span>
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
                     class="task-points-input" min="0" max="1000" step="1"
                     value="${Math.max(0, Number(task.points) || 0)}"
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
                     ${task.status === "Completed" ? "checked" : ""}>
              Complete
            </label>

            <label class="progress-input">
              Progress
              <input type="number" class="task-progress-input"
                     min="0" max="100" value="${task.progress}"
                     aria-label="Task progress percentage"> %
            </label>
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

function renderAll() {
  renderTeamHeader();
  renderSummary();
  renderMembers();
  renderChecklist();
  renderTasks();
  renderActivity();
  renderPriorityTasks();
  renderTopPerformers();
  populateMemberSelects();
}

function populateMemberSelects() {
  const options = state.members.map(member => `
    <option value="${member.id}">
      ${escapeHTML(member.name)} (${escapeHTML(member.role)})
    </option>
  `).join("");

  $("#taskAssignee").innerHTML = options;
  $("#teamHead").innerHTML = options;

  $("#teamHead").value = state.team.head;
}

/* Task progress updates */

function updateMemberStatistics(memberId) {
  const member = memberById(memberId);

  if (!member) return;

  const assignedTasks = state.tasks.filter(
    task => task.assignee === memberId
  );

  if (!assignedTasks.length) {
    member.progress = 0;
    member.completed = 0;
    return;
  }

  member.progress = Math.round(
    assignedTasks.reduce((sum, task) => sum + task.progress, 0) /
    assignedTasks.length
  );

  member.completed = assignedTasks.filter(
    task => task.status === "Completed"
  ).length;
}

function updateTask(taskId, changes) {
  const task = state.tasks.find(item => item.id === taskId);

  if (!task) return;

  const oldAssignee = task.assignee;

  Object.assign(task, changes);

  task.progress = Math.max(0, Math.min(100, Number(task.progress) || 0));

  if (task.progress === 100) {
    task.status = "Completed";
  } else if (task.status === "Completed") {
    task.status = "In progress";
  } else if (task.progress > 0 && task.status === "To do") {
    task.status = "In progress";
  } else if (task.progress === 0 && task.status === "In progress") {
    task.status = "To do";
  }

  updateMemberStatistics(oldAssignee);

  if (task.assignee !== oldAssignee) {
    updateMemberStatistics(task.assignee);
  }

  const member = memberById(task.assignee);

  if (member) {
    member.lastActivity = "Just now";
    member.lastActivityRank = 0;
  }

  addActivity(
    member?.name || "Team member",
    `updated "${task.title}" to ${task.progress}%`,
    task.status === "Completed" ? "✓" : "↗"
  );

  saveState();
  renderAll();

  toast(task.status === "Completed"
    ? "Task completed successfully!"
    : "Task progress updated.");
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

/* Checklist interactions */

$("#checklist").addEventListener("click", event => {
  const row = event.target.closest("[data-check]");

  if (!row) return;

  const item = state.checklist.find(
    entry => entry.id === row.dataset.check
  );

  if (!item) return;

  if (event.target.closest(".delete-check")) {
    state.checklist = state.checklist.filter(
      entry => entry.id !== item.id
    );

    saveState();
    renderChecklist();
    toast("Checklist item deleted.");
    return;
  }

  if (event.target.closest(".checklist-check")) {
    item.done = !item.done;

    saveState();
    renderChecklist();

    toast(item.done ? "Checklist item completed." : "Item reopened.");
  }
});

$("#addChecklistBtn").addEventListener("click", () => {
  $("#checklistForm").reset();
  $("#checklistDialog").showModal();
});

$("#checklistForm").addEventListener("submit", event => {
  event.preventDefault();

  const formData = new FormData(event.currentTarget);
  const text = String(formData.get("text")).trim();

  if (!text) return;

  state.checklist.push({
    id: `c${Date.now()}`,
    text,
    done: false
  });

  saveState();
  renderChecklist();
  $("#checklistDialog").close();

  toast("Checklist item added.");
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

$("#taskForm").addEventListener("submit", event => {
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
    Math.min(100, Number(data.get("progress")) || 0)
  );

  const task = {
    id: `t${Date.now()}`,
    title,
    description,
    assignee,
    priority: String(data.get("priority")),
    deadline,
    points: Math.max(
      0,
      Math.min(1000, Math.round(Number(data.get("points")) || 0))
    ),
    progress,
    status: progress === 100
      ? "Completed"
      : progress === 0
        ? "To do"
        : "In progress"
  };

  state.tasks.push(task);

  const member = memberById(assignee);
  member.lastActivity = "Just now";
  member.lastActivityRank = 0;

  updateMemberStatistics(assignee);

  addActivity(member.name, `was assigned "${title}"`, "＋");

  saveState();
  activeFilter = "all";
  renderAll();

  $("#taskDialog").close();

  toast("Task added successfully.");
});

/* Create team */

$("#createTeamBtn").addEventListener("click", () => {
  $("#teamForm").reset();
  populateMemberSelects();
  $("#teamDialog").showModal();
});

$("#teamForm").addEventListener("submit", event => {
  event.preventDefault();

  const data = new FormData(event.currentTarget);
  const name = String(data.get("name")).trim();
  const description = String(data.get("description")).trim();
  const head = String(data.get("head"));

  if (!name || !description || !memberById(head)) {
    toast("Please complete all team fields.");
    return;
  }

  state.team.name = name;
  state.team.description = description;
  state.team.head = head;

  addActivity(
    memberById(head).name,
    `became the head of ${name}`,
    "✳"
  );

  saveState();
  renderAll();

  $("#teamDialog").close();

  toast(`${name} is now the displayed team.`);
});

/* Dialog close buttons */

$$("[data-close]").forEach(button => {
  button.addEventListener("click", () => {
    const dialog = document.getElementById(button.dataset.close);

    if (dialog) dialog.close();
  });
});

/* Initialize */

renderAll();
saveState();
