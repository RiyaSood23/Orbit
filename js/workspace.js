const feedback = document.querySelector("#workspace-feedback");
const workspaceName = document.querySelector("#workspace-name");
const inviteCode = document.querySelector("#invite-code");
const copyInviteButton = document.querySelector("#copy-invite");
const rotateInviteButton = document.querySelector("#rotate-invite");
const inviteNote = document.querySelector("#invite-note");
const memberList = document.querySelector("#member-list");
const memberCount = document.querySelector("#member-count");
const teamList = document.querySelector("#team-list");
const teamCount = document.querySelector("#team-count");
const teamForm = document.querySelector("#team-form");
const teamNameInput = document.querySelector("#team-name");
const teamDescriptionInput = document.querySelector("#team-description");
const teamLeaderSelect = document.querySelector("#team-leader");
const teamMemberOptions = document.querySelector("#team-member-options");
const saveTeamButton = document.querySelector("#save-team");
const cancelTeamEditButton = document.querySelector("#cancel-team-edit");
const teamPermissionNote = document.querySelector("#team-permission-note");
const workspaceScope = document.querySelector("#workspace-scope");
const workspacePoints = document.querySelector("#workspace-points");
const workspaceTaskTotal = document.querySelector("#workspace-task-total");
const workspaceTaskCompleted = document.querySelector("#workspace-task-completed");
const workspaceTaskPending = document.querySelector("#workspace-task-pending");
const workspaceTaskOverdue = document.querySelector("#workspace-task-overdue");
const workspaceTeamTotal = document.querySelector("#workspace-team-total");
const workspaceMemberTotal = document.querySelector("#workspace-member-total");
const workspaceTaskList = document.querySelector("#workspace-task-list");
const workspaceDeadlinesList = document.querySelector("#workspace-deadlines-list");
const workspaceProgressList = document.querySelector("#workspace-progress-list");
const workspaceActivityList = document.querySelector("#workspace-activity-list");
const workspaceEventsList = document.querySelector("#workspace-events-list");
const workspaceSubmissionsList = document.querySelector("#workspace-submissions-list");

let organization = null;
let currentUser = null;
let members = [];
let teams = [];
let editingTeamId = null;
let workspaceData = null;

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("The server returned an invalid response.");
  }
  if (!response.ok) throw new Error(result.error || "The request could not be completed.");
  return result;
}

function showFeedback(message, isError = true) {
  feedback.textContent = message;
  feedback.classList.toggle("is-error", Boolean(message) && isError);
  feedback.classList.toggle("is-success", Boolean(message) && !isError);
}

function canManageWorkspace() {
  return ["manager", "admin"].includes(currentUser?.role);
}

function canManageTeam(team) {
  return canManageWorkspace() || team.leaderId === currentUser?.id;
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatWorkspaceDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date)
    : "Date unavailable";
}

function renderRecordList(container, records, emptyMessage, renderRecord) {
  container.replaceChildren();
  if (!records.length) {
    container.append(makeElement("li", "empty-state", emptyMessage));
    return;
  }
  for (const record of records) container.append(renderRecord(record));
}

function renderWorkspaceData(data) {
  const stats = data.stats;
  workspaceScope.textContent = data.scope === "organization"
    ? "Organisation-wide view"
    : data.scope === "team"
      ? "Showing your team tasks, progress, and activity."
      : "Showing tasks assigned to you and your team membership.";
  workspacePoints.textContent = Number(stats.contributionPoints || 0).toLocaleString();
  workspaceTaskTotal.textContent = String(stats.totalTasks || 0);
  workspaceTaskCompleted.textContent = String(stats.completedTasks || 0);
  workspaceTaskPending.textContent = String(stats.pendingTasks || 0);
  workspaceTaskOverdue.textContent = String(stats.overdueTasks || 0);
  workspaceTeamTotal.textContent = String(stats.totalTeams || 0);
  workspaceMemberTotal.textContent = String(stats.totalMembers || 0);

  renderRecordList(workspaceTaskList, data.tasks || [], "No tasks are assigned to your workspace view.", (task) => {
    const item = makeElement("li", "record-item");
    const detail = makeElement("div", "record-item-copy");
    detail.append(
      makeElement("strong", "", task.title || "Untitled task"),
      makeElement("span", "", `${task.team} · ${task.assignee}`),
      makeElement("span", "record-meta", `${task.status || "Pending"}${task.dueDate ? ` · Due ${formatWorkspaceDate(task.dueDate)}` : ""}`)
    );
    item.append(detail);
    return item;
  });

  renderRecordList(workspaceDeadlinesList, data.upcomingDeadlines || [], "No upcoming task deadlines.", (task) => {
    const item = makeElement("li", "record-item");
    const detail = makeElement("div", "record-item-copy");
    detail.append(
      makeElement("strong", "", task.title || "Untitled task"),
      makeElement("span", "", `${task.team} · ${task.assignee}`),
      makeElement("span", "record-meta", `Due ${formatWorkspaceDate(task.dueDate)}`)
    );
    item.append(detail, makeElement("span", "role-badge", task.priority || "Task"));
    return item;
  });

  renderRecordList(workspaceProgressList, data.teams || [], "No teams are associated with your workspace view.", (team) => {
    const item = makeElement("li", "record-item");
    const detail = makeElement("div", "record-item-copy");
    detail.append(
      makeElement("strong", "", team.name),
      makeElement("span", "", `Lead: ${team.leader} · ${team.memberCount} members`),
      makeElement("span", "record-meta", `${team.completedTasks} of ${team.totalTasks} tasks completed · ${team.productivity}% productivity`)
    );
    item.append(detail);
    return item;
  });

  renderRecordList(workspaceActivityList, data.recentActivity || [], "No contribution activity has been recorded yet.", (entry) => {
    const item = makeElement("li", "record-item");
    const detail = makeElement("div", "record-item-copy");
    detail.append(
      makeElement("strong", "", `${entry.memberName} · ${entry.points} points`),
      makeElement("span", "", `${entry.teamName} · ${entry.reason}`),
      makeElement("span", "record-meta", formatWorkspaceDate(entry.createdAt))
    );
    item.append(detail);
    return item;
  });

  renderRecordList(workspaceEventsList, data.upcomingEvents || [], "No upcoming events have been scheduled.", (event) => {
    const item = makeElement("li", "record-item");
    const detail = makeElement("div", "record-item-copy");
    detail.append(
      makeElement("strong", "", event.title),
      makeElement("span", "", event.location || event.description || "Organisation event"),
      makeElement("span", "record-meta", formatWorkspaceDate(event.date))
    );
    item.append(detail);
    return item;
  });

  renderRecordList(
    workspaceSubmissionsList,
    data.recentSubmissions || [],
    data.submissionTrackingAvailable
      ? "No recent submissions have been recorded."
      : "Submission records are unavailable: this project has no submission model or API.",
    (submission) => {
      const item = makeElement("li", "record-item");
      const detail = makeElement("div", "record-item-copy");
      detail.append(
        makeElement("strong", "", submission.title || submission.taskTitle || "Task submission"),
        makeElement("span", "", `${submission.status || "Submitted"}${submission.feedback ? ` · ${submission.feedback}` : ""}`),
        makeElement("span", "record-meta", submission.updatedAt ? formatWorkspaceDate(submission.updatedAt) : "Date unavailable")
      );
      item.append(detail);
      return item;
    }
  );
}

function renderWorkspace() {
  workspaceName.textContent = organization?.name || "Workspace";
  inviteCode.textContent = organization?.inviteCode || "Not available";
  const canRotate = currentUser?.role === "admin";
  rotateInviteButton.hidden = !canRotate;
  copyInviteButton.hidden = !organization?.inviteCode;
  inviteNote.textContent = canRotate
    ? "Admins can rotate the invitation code."
    : organization?.inviteCode
      ? "Ask a workspace admin to rotate the invitation code."
      : "Invitation codes are visible to workspace managers and admins.";

  memberCount.textContent = `${members.length} ${members.length === 1 ? "member" : "members"}`;
  memberList.replaceChildren();
  if (!members.length) {
    memberList.append(makeElement("li", "empty-state", "No workspace members yet."));
  } else {
    for (const member of members) {
      const item = makeElement("li", "record-item");
      const detail = makeElement("div", "record-item-copy");
      detail.append(
        makeElement("strong", "", member.name || "Unnamed member"),
        makeElement("span", "", member.email || member.role || "Workspace member")
      );
      item.append(detail, makeElement("span", "role-badge", member.role || "member"));
      memberList.append(item);
    }
  }
  renderMemberSelectors();
  renderTeams();
}

function renderMemberSelectors(selectedIds = []) {
  teamLeaderSelect.replaceChildren();
  if (!members.length) {
    const option = new Option("No workspace members available", "");
    teamLeaderSelect.add(option);
  } else {
    for (const member of members) {
      teamLeaderSelect.add(new Option(member.name || member.id, member.id));
    }
  }
  teamMemberOptions.replaceChildren();
  for (const member of members) {
    const label = makeElement("label", "member-checkbox");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "memberIds";
    checkbox.value = member.id;
    checkbox.checked = selectedIds.includes(member.id);
    label.append(checkbox, makeElement("span", "", member.name || member.id));
    teamMemberOptions.append(label);
  }
}

function renderTeams() {
  teamCount.textContent = `${teams.length} ${teams.length === 1 ? "team" : "teams"}`;
  teamList.replaceChildren();
  if (!teams.length) {
    teamList.append(makeElement("li", "empty-state", "No teams have been created yet."));
    return;
  }
  for (const team of teams) {
    const item = makeElement("li", "record-item team-record");
    const detail = makeElement("div", "record-item-copy");
    const memberNames = (team.members || []).map((member) => {
      const profile = members.find((candidate) => candidate.id === member.userId);
      return profile?.name || member.userId;
    });
    const leader = members.find((member) => member.id === team.leaderId);
    detail.append(
      makeElement("strong", "", team.name),
      makeElement("span", "", team.description || "No description"),
      makeElement("span", "record-meta", `Lead: ${leader?.name || team.leaderId || "Unassigned"} · ${memberNames.length} ${memberNames.length === 1 ? "member" : "members"}`)
    );
    const actions = makeElement("div", "record-actions");
    if (canManageTeam(team)) {
      const editButton = makeElement("button", "button button-secondary button-small", "Edit");
      editButton.type = "button";
      editButton.addEventListener("click", () => beginTeamEdit(team));
      const deleteButton = makeElement("button", "button button-danger button-small", "Delete");
      deleteButton.type = "button";
      deleteButton.addEventListener("click", () => void deleteTeam(team));
      actions.append(editButton, deleteButton);
    }
    item.append(detail, actions);
    teamList.append(item);
  }
}

function beginTeamEdit(team) {
  editingTeamId = team.id;
  teamForm.hidden = false;
  teamNameInput.value = team.name;
  teamDescriptionInput.value = team.description || "";
  teamLeaderSelect.value = team.leaderId || "";
  renderMemberSelectors((team.members || []).map((member) => member.userId));
  teamLeaderSelect.value = team.leaderId || "";
  saveTeamButton.textContent = "Save team";
  cancelTeamEditButton.hidden = false;
  teamForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetTeamForm() {
  editingTeamId = null;
  teamForm.hidden = !canManageWorkspace();
  teamForm.reset();
  renderMemberSelectors([]);
  saveTeamButton.textContent = "Create team";
  cancelTeamEditButton.hidden = true;
}

async function loadWorkspace() {
  showFeedback("");
  try {
    const [session, workspaceResult, memberResult, workResult] = await Promise.all([
      apiRequest("/api/auth/session"),
      apiRequest("/api/organizations/me"),
      apiRequest("/api/organizations/members"),
      apiRequest("/api/organisation/workspace"),
    ]);
    currentUser = session.user;
    if (!currentUser) {
      window.location.replace("index.html");
      return;
    }
    organization = workspaceResult.organization;
    members = memberResult.members || [];
    workspaceData = workResult;
    teams = workResult.teams || [];
    renderWorkspaceData(workspaceData);
    renderWorkspace();
    const managerCanCreate = canManageWorkspace();
    teamForm.hidden = !managerCanCreate;
    teamPermissionNote.textContent = managerCanCreate
      ? "Team leaders can edit their own teams. Workspace managers and admins can manage all teams."
      : "Only workspace managers and admins can create teams.";
    return true;
  } catch (error) {
    showFeedback(error instanceof Error ? error.message : "Could not load workspace details.");
    memberList.replaceChildren(makeElement("li", "empty-state", "Workspace members could not be loaded."));
    teamList.replaceChildren(makeElement("li", "empty-state", "Teams could not be loaded."));
    [
      workspaceTaskList,
      workspaceDeadlinesList,
      workspaceProgressList,
      workspaceActivityList,
      workspaceEventsList,
      workspaceSubmissionsList,
    ].forEach((container) => {
      container.replaceChildren(makeElement("li", "empty-state", "Workspace data could not be loaded."));
    });
    return false;
  }
}

teamLeaderSelect.addEventListener("change", () => {
  const selectedLeaderId = teamLeaderSelect.value;
  for (const checkbox of teamMemberOptions.querySelectorAll('input[name="memberIds"]')) {
    if (checkbox.value === selectedLeaderId) checkbox.checked = true;
  }
});

teamForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!teamForm.reportValidity()) return;
  const selectedIds = [...teamMemberOptions.querySelectorAll('input[name="memberIds"]:checked')]
    .map((checkbox) => checkbox.value);
  const payload = {
    name: teamNameInput.value.trim(),
    description: teamDescriptionInput.value.trim(),
    leaderId: teamLeaderSelect.value,
    memberIds: [...new Set([...selectedIds, teamLeaderSelect.value])],
  };
  const isEditing = Boolean(editingTeamId);
  saveTeamButton.disabled = true;
  showFeedback("");
  try {
    await apiRequest(
      editingTeamId ? `/api/teams/${encodeURIComponent(editingTeamId)}` : "/api/teams",
      {
        method: editingTeamId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      }
    );
    resetTeamForm();
    if (await loadWorkspace()) {
      showFeedback(isEditing ? "Team updated." : "Team created.", false);
    } else {
      showFeedback("Team saved, but workspace data could not be refreshed.");
    }
  } catch (error) {
    showFeedback(error instanceof Error ? error.message : "Could not save this team.");
  } finally {
    saveTeamButton.disabled = false;
  }
});

cancelTeamEditButton.addEventListener("click", resetTeamForm);

async function deleteTeam(team) {
  if (!window.confirm(`Delete the ${team.name} team?`)) return;
  try {
    await apiRequest(`/api/teams/${encodeURIComponent(team.id)}`, { method: "DELETE" });
    if (await loadWorkspace()) showFeedback("Team deleted.", false);
  } catch (error) {
    showFeedback(error instanceof Error ? error.message : "Could not delete this team.");
  }
}

copyInviteButton.addEventListener("click", async () => {
  if (!organization?.inviteCode) return;
  try {
    await navigator.clipboard.writeText(organization.inviteCode);
    showFeedback("Invitation code copied.", false);
  } catch {
    showFeedback("Could not copy the invitation code. Select and copy it manually.");
  }
});

rotateInviteButton.addEventListener("click", async () => {
  if (!window.confirm("Rotate the invitation code? The old code will stop working.")) return;
  rotateInviteButton.disabled = true;
  try {
    const result = await apiRequest("/api/organizations/me/invite-code", { method: "POST" });
    organization = result.organization;
    renderWorkspace();
    showFeedback("Invitation code rotated.", false);
  } catch (error) {
    showFeedback(error instanceof Error ? error.message : "Could not rotate the invitation code.");
  } finally {
    rotateInviteButton.disabled = false;
  }
});

void loadWorkspace();
