import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import { requestJson } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import Modal from "../components/Modal.jsx";

const taskFilters = ["all", "In progress", "To do", "In review", "Completed"];

function initials(name) {
  return String(name || "Member").trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
}

function displayDate(value) {
  if (!value) return "No deadline";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "No deadline" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function todayString() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function taskStatus(task) {
  return task.status === "Assigned" ? "To do" : task.status || "To do";
}

function DataDialog({ title, onClose, onSubmit, submitLabel, children }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await onSubmit(new FormData(event.currentTarget));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The request could not be completed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title={title} onClose={onClose} className="app-modal team-modal">
      <form className="management-form" onSubmit={handleSubmit}>
        {children}
        {error && <p className="management-feedback is-error" role="alert">{error}</p>}
        <div className="management-form-actions">
          <button type="button" className="management-secondary-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="management-primary-button" disabled={saving}>{saving ? "Saving…" : submitLabel}</button>
        </div>
      </form>
    </Modal>
  );
}

function TeamsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [teams, setTeams] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(searchParams.get("team") || "");
  const [dashboard, setDashboard] = useState(null);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [directoryError, setDirectoryError] = useState("");
  const [toast, setToast] = useState("");
  const [dialog, setDialog] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberSort, setMemberSort] = useState("name");
  const [taskFilter, setTaskFilter] = useState("all");
  const [taskSort, setTaskSort] = useState("deadline");
  const [performerSort, setPerformerSort] = useState("desc");
  const [expandedMembers, setExpandedMembers] = useState({});
  const [busyTaskId, setBusyTaskId] = useState("");

  useEffect(() => {
    let active = true;
    Promise.allSettled([requestJson("/api/teams"), requestJson("/api/members")]).then((results) => {
      if (!active) return;
      if (results[0].status === "fulfilled") {
        const loadedTeams = results[0].value.teams || [];
        setTeams(loadedTeams);
        const requestedTeam = searchParams.get("team");
        const initialTeam = loadedTeams.find((team) => team.id === requestedTeam) || loadedTeams[0];
        setSelectedTeamId(initialTeam?.id || "");
      } else {
        setPageError(results[0].reason instanceof Error ? results[0].reason.message : "Teams could not be loaded.");
      }
      if (results[1].status === "fulfilled") {
        setDirectory(results[1].value.users || []);
      } else {
        setDirectoryError(results[1].reason instanceof Error ? results[1].reason.message : "Workspace members could not be loaded.");
      }
      setTeamsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [searchParams]);

  const loadTeam = useCallback(async (teamId) => {
    if (!teamId) return;
    setDashboardLoading(true);
    setPageError("");
    try {
      const result = await requestJson(`/api/teams/${encodeURIComponent(teamId)}/dashboard`);
      setDashboard(result);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "The team dashboard could not be loaded.");
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedTeamId) {
      setDashboard(null);
      setDashboardLoading(false);
      return undefined;
    }
    let active = true;
    setDashboardLoading(true);
    setPageError("");
    requestJson(`/api/teams/${encodeURIComponent(selectedTeamId)}/dashboard`)
      .then((result) => {
        if (active) setDashboard(result);
      })
      .catch((error) => {
        if (active) setPageError(error instanceof Error ? error.message : "The team dashboard could not be loaded.");
      })
      .finally(() => {
        if (active) setDashboardLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedTeamId]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const team = dashboard?.team;
  const members = dashboard?.members || [];
  const tasks = useMemo(() => (dashboard?.tasks || []).map((task) => ({
    ...task,
    deadline: task.dueDate,
    points: task.contributionPoints || 0,
    progress: task.status === "Completed" ? 100 : Math.max(0, Math.min(100, Number(task.progress) || 0)),
    status: taskStatus(task),
  })), [dashboard]);
  const checkpoints = dashboard?.checkpoints || [];
  const reminders = dashboard?.reminders || [];
  const contributions = dashboard?.contributions || [];
  const isManager = ["manager", "admin"].includes(user?.role || "member");
  const canManageTeam = Boolean(team && (isManager || team.leaderId === user?.id));

  const pointsByMember = new Map();
  for (const contribution of contributions) {
    pointsByMember.set(contribution.memberId, (pointsByMember.get(contribution.memberId) || 0) + (Number(contribution.points) || 0));
  }
  const mappedMembers = members.map((member) => {
    const profile = member.profile || {};
    return {
      id: member.userId,
      name: profile.name || member.userId,
      email: profile.email || "",
      role: member.role || profile.role || "Member",
      skills: profile.skills || member.skills || [],
      progress: Math.max(0, Math.min(100, Number(member.progress) || 0)),
      completed: member.completedTasks || 0,
      assigned: member.assignedTasks || 0,
      points: pointsByMember.get(member.userId) || 0,
    };
  });

  const filteredMembers = mappedMembers
    .filter((member) => `${member.name} ${member.role} ${member.skills.join(" ")}`.toLowerCase().includes(memberSearch.trim().toLowerCase()))
    .sort((left, right) => memberSort === "progress"
      ? right.progress - left.progress || left.name.localeCompare(right.name)
      : left.name.localeCompare(right.name));

  const shownTasks = [...tasks]
    .filter((task) => taskFilter === "all" || task.status === taskFilter)
    .sort((left, right) => {
      if (taskSort === "priority") {
        const rank = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
        return (rank[left.priority] ?? 4) - (rank[right.priority] ?? 4) || String(left.deadline).localeCompare(String(right.deadline));
      }
      if (taskSort === "progress") return right.progress - left.progress;
      return String(left.deadline).localeCompare(String(right.deadline));
    });

  const upcomingTasks = [...tasks]
    .filter((task) => task.status !== "Completed")
    .sort((left, right) => String(left.deadline).localeCompare(String(right.deadline)))
    .slice(0, 3);
  const priorityTasks = [...tasks]
    .filter((task) => task.status !== "Completed" && ["High", "Urgent"].includes(task.priority))
    .sort((left, right) => String(left.deadline).localeCompare(String(right.deadline)))
    .slice(0, 3);
  const performers = [...mappedMembers].sort((left, right) => {
    const points = performerSort === "asc" ? left.points - right.points : right.points - left.points;
    return points || left.name.localeCompare(right.name);
  });
  const overallProgress = tasks.length ? Math.round(tasks.reduce((total, task) => total + task.progress, 0) / tasks.length) : 0;
  const eligibleMembers = directory.filter((member) => !members.some((current) => current.userId === member.id));

  function chooseTeam(teamId) {
    setSelectedTeamId(teamId);
    setDashboard(null);
    setPageError("");
    if (teamId) setSearchParams({ team: teamId }, { replace: true });
    else setSearchParams({}, { replace: true });
  }

  async function refreshCurrentTeam() {
    if (!selectedTeamId) return;
    await loadTeam(selectedTeamId);
  }

  async function finishMutation(message) {
    setDialog("");
    setToast(message);
    try {
      await refreshCurrentTeam();
    } catch (error) {
      setPageError(`${message} The team view could not be refreshed: ${error instanceof Error ? error.message : "Unknown error."}`);
    }
  }

  async function createTeam(formData) {
    if (directoryError) throw new Error(directoryError);
    const leaderId = String(formData.get("leaderId") || "");
    const memberIds = [...new Set([...formData.getAll("memberIds").map(String), leaderId].filter(Boolean))];
    const { team: createdTeam } = await requestJson("/api/teams", {
      method: "POST",
      body: JSON.stringify({
        name: String(formData.get("name") || "").trim(),
        description: String(formData.get("description") || "").trim(),
        leaderId,
        memberIds,
      }),
    });
    setDialog("");
    setToast(`${createdTeam.name} was created.`);
    setTeams((current) => current.some((item) => item.id === createdTeam.id) ? current : [...current, createdTeam]);
    try {
      const result = await requestJson("/api/teams");
      setTeams(result.teams || []);
    } catch (error) {
      setPageError(`Team created, but the team list could not be refreshed: ${error instanceof Error ? error.message : "Unknown error."}`);
    }
    chooseTeam(createdTeam.id);
  }

  async function addMember(formData) {
    await requestJson(`/api/teams/${encodeURIComponent(selectedTeamId)}/members`, {
      method: "POST",
      body: JSON.stringify({ userId: String(formData.get("userId") || "") }),
    });
    await finishMutation("Member added to the team.");
  }

  async function removeMember(member) {
    if (!window.confirm(`Remove ${member.name} from this team?`)) return;
    try {
      await requestJson(`/api/teams/${encodeURIComponent(selectedTeamId)}/members`, {
        method: "DELETE",
        body: JSON.stringify({ userId: member.id }),
      });
      setToast("Member removed from the team.");
      await refreshCurrentTeam();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not remove this member.");
    }
  }

  async function createTask(formData) {
    const assignee = String(formData.get("assignee") || "");
    const deadline = String(formData.get("deadline") || "");
    if (deadline < todayString()) throw new Error("Choose today or a future deadline.");
    await requestJson("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: String(formData.get("title") || "").trim(),
        description: String(formData.get("description") || "").trim(),
        assignee,
        priority: String(formData.get("priority") || "Medium"),
        dueDate: deadline,
        progress: Math.min(99, Math.max(0, Number(formData.get("progress")) || 0)),
        contributionPoints: Math.min(1000, Math.max(1, Number(formData.get("points")) || 1)),
        team: team.name,
        teamId: selectedTeamId,
        project: "",
      }),
    });
    await finishMutation("Task added successfully.");
    setTaskFilter("all");
  }

  async function updateTask(taskId, changes, successMessage) {
    setBusyTaskId(taskId);
    try {
      await requestJson(`/api/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      setToast(successMessage);
      await refreshCurrentTeam();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Task could not be updated.");
      await refreshCurrentTeam();
    } finally {
      setBusyTaskId("");
    }
  }

  async function deleteTask(task) {
    if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
    try {
      await requestJson(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE" });
      setToast("Task deleted.");
      await refreshCurrentTeam();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Task could not be deleted.");
    }
  }

  async function addCheckpoint(formData) {
    await requestJson(`/api/teams/${encodeURIComponent(selectedTeamId)}/checkpoints`, {
      method: "POST",
      body: JSON.stringify({ text: String(formData.get("text") || "").trim() }),
    });
    await finishMutation("Checklist item added.");
  }

  async function updateCheckpoint(checkpoint, changes) {
    try {
      await requestJson(`/api/teams/${encodeURIComponent(selectedTeamId)}/checkpoints/${encodeURIComponent(checkpoint.id)}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      await refreshCurrentTeam();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Checklist item could not be updated.");
    }
  }

  async function deleteCheckpoint(checkpoint) {
    try {
      await requestJson(`/api/teams/${encodeURIComponent(selectedTeamId)}/checkpoints/${encodeURIComponent(checkpoint.id)}`, { method: "DELETE" });
      setToast("Checklist item deleted.");
      await refreshCurrentTeam();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Checklist item could not be deleted.");
    }
  }

  async function addReminder(formData) {
    await requestJson(`/api/teams/${encodeURIComponent(selectedTeamId)}/reminders`, {
      method: "POST",
      body: JSON.stringify({
        title: String(formData.get("title") || "").trim(),
        dueDate: String(formData.get("dueDate") || ""),
      }),
    });
    await finishMutation("Reminder added.");
  }

  async function updateReminder(reminder, changes) {
    try {
      await requestJson(`/api/teams/${encodeURIComponent(selectedTeamId)}/reminders/${encodeURIComponent(reminder.id)}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      await refreshCurrentTeam();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Reminder could not be updated.");
    }
  }

  async function deleteReminder(reminder) {
    try {
      await requestJson(`/api/teams/${encodeURIComponent(selectedTeamId)}/reminders/${encodeURIComponent(reminder.id)}`, { method: "DELETE" });
      setToast("Reminder deleted.");
      await refreshCurrentTeam();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Reminder could not be deleted.");
    }
  }

  async function awardContribution(formData) {
    const points = Number(formData.get("points"));
    if (!Number.isInteger(points) || points < 1 || points > 1000) throw new Error("Points must be a whole number from 1 to 1000.");
    await requestJson("/api/contributions", {
      method: "POST",
      body: JSON.stringify({
        teamId: selectedTeamId,
        memberId: String(formData.get("memberId") || ""),
        points,
        reason: String(formData.get("reason") || "").trim(),
      }),
    });
    await finishMutation("Contribution saved.");
  }

  const completedCheckpoints = checkpoints.filter((item) => item.done).length;
  const checkpointProgress = checkpoints.length ? Math.round((completedCheckpoints / checkpoints.length) * 100) : 0;
  const teamLeader = team?.leader?.name || mappedMembers.find((member) => member.id === team?.leaderId)?.name || "Not assigned";

  return (
    <div className="team-page">
      <header className="management-page-header team-page-header">
        <div>
          <p className="page-eyebrow">Team workspace</p>
          <h1>{team?.name || "Teams"}</h1>
          <p>{team?.description || "Choose a team to view tasks, members, and progress."}</p>
        </div>
        <div className="team-header-actions">
          {teams.length > 0 && (
            <label className="management-filter">
              Choose team
              <select aria-label="Choose team" value={selectedTeamId} onChange={(event) => chooseTeam(event.target.value)}>
                {teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          )}
          <button type="button" className="management-primary-button" onClick={() => setDialog("team")}>＋ Create team</button>
        </div>
      </header>

      {toast && <p className="management-feedback" role="status">{toast}</p>}
      {pageError && (
        <div className="management-feedback is-error" role="alert">
          <span>{pageError}</span>
          {selectedTeamId && <button className="management-text-button" type="button" onClick={() => loadTeam(selectedTeamId)}>Retry</button>}
        </div>
      )}
      {teamsLoading ? <p className="management-state" role="status">Loading teams…</p> : teams.length === 0 ? (
        <section className="management-card team-empty">
          <h2>No teams yet</h2>
          <p>Create a team to add members, assign tasks, and track progress.</p>
          <button type="button" className="management-primary-button" onClick={() => setDialog("team")}>Create your first team</button>
        </section>
      ) : dashboardLoading && !dashboard ? <p className="management-state" role="status">Loading team dashboard…</p> : team && (
        <>
          <div className="team-meta-row">
            <span>Team lead: <strong>{teamLeader}</strong></span>
            <span>{mappedMembers.length} members</span>
            {canManageTeam && <span className="team-permission-badge">Team manager</span>}
          </div>

          <section className="team-summary-grid" aria-label="Team summary">
            <article className="team-summary-card"><span>Team members</span><strong>{mappedMembers.length}</strong><small>People in this team</small></article>
            <article className="team-summary-card"><span>Active tasks</span><strong>{tasks.filter((task) => task.status !== "Completed").length}</strong><small>Work in progress</small></article>
            <article className="team-summary-card"><span>Completed tasks</span><strong>{tasks.filter((task) => task.status === "Completed").length}</strong><small>Finished by the team</small></article>
            <article className="team-summary-card"><span>Team progress</span><strong>{overallProgress}%</strong><small>Average task completion</small></article>
          </section>

          <div className="team-main-grid">
            <section className="management-card team-members-card">
              <div className="management-card-heading">
                <div><h2>Team members <span className="team-count-pill">{mappedMembers.length}</span></h2><p>People behind the progress</p></div>
                <div className="team-member-actions">
                  <select aria-label="Sort team members" value={memberSort} onChange={(event) => setMemberSort(event.target.value)}>
                    <option value="name">Name A–Z</option><option value="progress">Highest progress</option>
                  </select>
                  {canManageTeam && <button type="button" className="management-secondary-button" onClick={() => setDialog("member")}>＋ Add member</button>}
                </div>
              </div>
              <input className="team-search" type="search" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search members or skills…" aria-label="Search team members" />
              {filteredMembers.length ? (
                <div className="team-member-list">
                  {filteredMembers.map((member) => (
                    <article className="team-member-card" key={member.id}>
                      <div className="team-member-card-top">
                        <span className="team-member-avatar">{initials(member.name)}</span>
                        <div className="team-member-main">
                          <strong>{member.name}</strong><small>{member.role}</small>
                        </div>
                        <button type="button" className="team-expand-button" aria-expanded={Boolean(expandedMembers[member.id])} aria-label={`${expandedMembers[member.id] ? "Hide" : "Show"} ${member.name} details`} onClick={() => setExpandedMembers((current) => ({ ...current, [member.id]: !current[member.id] }))}>
                          {expandedMembers[member.id] ? "Hide" : "Details"}
                        </button>
                        {canManageTeam && member.id !== team.leaderId && <button type="button" className="management-text-button is-danger" onClick={() => removeMember(member)}>Remove</button>}
                      </div>
                      <div className="team-member-progress">
                        <div className="team-progress-label"><span>Progress</span><strong>{member.progress}%</strong></div>
                        <div className="management-progress-track"><span style={{ width: `${member.progress}%` }} /></div>
                      </div>
                      <div className="team-skills">{member.skills.length ? member.skills.map((skill) => <span key={skill}>{skill}</span>) : <small>No skills listed</small>}</div>
                      {expandedMembers[member.id] && (
                        <div className="team-member-details">
                          <span><small>Contribution points</small><strong>{member.points}</strong></span>
                          <span><small>Tasks completed</small><strong>{member.completed} / {member.assigned}</strong></span>
                          {member.email && <span><small>Email</small><strong>{member.email}</strong></span>}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              ) : <p className="management-state">No members match your search.</p>}
            </section>

            <aside className="management-card team-checklist-card">
              <div className="management-card-heading"><div><h2>Task checklist</h2><p>Small steps, bigger outcomes.</p></div><strong>{checkpointProgress}%</strong></div>
              <div className="management-progress-track"><span style={{ width: `${checkpointProgress}%` }} /></div>
              <ul className="team-checklist-list">
                {checkpoints.map((checkpoint) => (
                  <li key={checkpoint.id}>
                    <label className={checkpoint.done ? "is-done" : ""}>
                      <input type="checkbox" checked={Boolean(checkpoint.done)} disabled={!canManageTeam} onChange={() => updateCheckpoint(checkpoint, { done: !checkpoint.done })} />
                      <span>{checkpoint.text}</span>
                    </label>
                    {canManageTeam && <button type="button" aria-label={`Delete ${checkpoint.text}`} onClick={() => deleteCheckpoint(checkpoint)}>×</button>}
                  </li>
                ))}
                {!checkpoints.length && <li className="team-list-empty">Add your first checklist item.</li>}
              </ul>
              {canManageTeam && <button type="button" className="management-secondary-button management-full-button" onClick={() => setDialog("checkpoint")}>＋ Add checklist item</button>}

              <div className="management-divider" />
              <div className="management-card-heading"><div><h3>Reminders</h3><p>Keep important dates visible.</p></div></div>
              <ul className="team-checklist-list">
                {reminders.map((reminder) => (
                  <li key={reminder.id}>
                    <label className={reminder.completed ? "is-done" : ""}>
                      <input type="checkbox" checked={Boolean(reminder.completed)} disabled={!canManageTeam} onChange={() => updateReminder(reminder, { completed: !reminder.completed })} />
                      <span>{reminder.title}<small>{displayDate(reminder.dueDate)}</small></span>
                    </label>
                    {canManageTeam && <button type="button" aria-label={`Delete ${reminder.title}`} onClick={() => deleteReminder(reminder)}>×</button>}
                  </li>
                ))}
                {!reminders.length && <li className="team-list-empty">No reminders yet.</li>}
              </ul>
              {canManageTeam && <button type="button" className="management-secondary-button management-full-button" onClick={() => setDialog("reminder")}>＋ Add reminder</button>}
            </aside>
          </div>

          <section className="management-card team-tasks-card">
            <div className="management-card-heading team-task-heading">
              <div><h2>Task progress</h2><p>Track ownership, priorities, and completion.</p></div>
              <button type="button" className="management-primary-button" onClick={() => setDialog("task")} disabled={!mappedMembers.length}>＋ Add task</button>
            </div>
            <div className="team-task-toolbar">
              <div className="team-filter-tabs" role="group" aria-label="Filter tasks by status">
                {taskFilters.map((filter) => (
                  <button type="button" key={filter} className={taskFilter === filter ? "is-selected" : ""} onClick={() => setTaskFilter(filter)}>
                    {filter === "all" ? "All" : filter} <span>{filter === "all" ? tasks.length : tasks.filter((task) => task.status === filter).length}</span>
                  </button>
                ))}
              </div>
              <label className="team-sort-control">Sort by
                <select aria-label="Sort tasks" value={taskSort} onChange={(event) => setTaskSort(event.target.value)}>
                  <option value="deadline">Due date</option><option value="priority">Priority</option><option value="progress">Progress</option>
                </select>
              </label>
            </div>
            {shownTasks.length ? (
              <div className="team-task-grid">
                {shownTasks.map((task) => {
                  const assignee = mappedMembers.find((member) => member.id === task.assignee);
                  const isTeamMember = team?.leaderId === user?.id || team?.members?.some((member) => member.userId === user?.id);
                  const canUpdate = user?.id === task.assignee || isTeamMember || canManageTeam || task.createdBy === user?.id;
                  const taskBusy = busyTaskId === task.id;
                  const hasAwardedContribution = contributions.some((contribution) => contribution.taskId === task.id);
                  const overdue = task.status !== "Completed" && task.deadline < todayString();
                  return (
                    <article className="team-task-card" key={task.id}>
                      <div className="team-task-card-top">
                        <span className={`priority-badge priority-${String(task.priority || "medium").toLowerCase()}`}>{task.priority || "Medium"} priority</span>
                        <span className="team-task-status">{task.status}</span>
                        {canManageTeam && <button type="button" className="team-delete-task" aria-label={`Delete ${task.title}`} disabled={taskBusy} onClick={() => deleteTask(task)}>×</button>}
                      </div>
                      <h3>{task.title}</h3>
                      <p className="team-task-description">{task.description || "No description added."}</p>
                      <div className="team-progress-label"><span>Task completion</span><strong>{task.progress}%</strong></div>
                      <div className="management-progress-track"><span style={{ width: `${task.progress}%` }} /></div>
                      <div className="team-task-meta">
                        <span><small>Assigned to</small><strong>{assignee?.name || "Unassigned"}</strong></span>
                        <span className={overdue ? "is-overdue" : ""}><small>{overdue ? "Overdue" : "Due date"}</small><strong>{displayDate(task.deadline)}</strong></span>
                      </div>
                      <div className="team-task-controls">
                        <label className="team-complete-control">
                          <input type="checkbox" checked={task.status === "Completed"} disabled={!canUpdate || taskBusy} title={canUpdate ? "" : "Only a member of this team can update this task"} onChange={(event) => updateTask(task.id, { progress: event.target.checked ? 100 : 99 }, event.target.checked ? "Task completed." : "Task reopened.")} />
                          Complete
                        </label>
                        {task.status === "Completed" && task.assignee === user?.id && <Link className="team-submit-review-link" to="/approvals">Submit for review</Link>}
                        <label>Progress %
                          <input type="number" min="0" max="100" defaultValue={task.progress} disabled={!canUpdate || taskBusy} aria-label={`${task.title} progress percentage`} onBlur={(event) => {
                            const value = Number(event.target.value);
                            if (Number.isInteger(value) && value >= 0 && value <= 100 && value !== task.progress) updateTask(task.id, { progress: value }, "Task progress saved.");
                            else if (!Number.isInteger(value) || value < 0 || value > 100) event.target.value = String(task.progress);
                          }} />
                        </label>
                        {canManageTeam && task.status !== "Completed" && !hasAwardedContribution && (
                          <label>Points
                            <input type="number" min="1" max="1000" defaultValue={task.points} disabled={taskBusy} aria-label={`${task.title} contribution points`} onBlur={(event) => {
                              const value = Number(event.target.value);
                              if (Number.isInteger(value) && value >= 1 && value <= 1000 && value !== task.points) updateTask(task.id, { contributionPoints: value }, "Task points saved.");
                              else if (!Number.isInteger(value) || value < 1 || value > 1000) event.target.value = String(task.points);
                            }} />
                          </label>
                        )}
                        {canManageTeam && task.status !== "Completed" && !hasAwardedContribution && (
                          <label className="team-reassign-control">Reassign
                            <select value={task.assignee || ""} disabled={taskBusy} aria-label={`Reassign ${task.title}`} onChange={(event) => updateTask(task.id, { assignee: event.target.value }, "Task reassigned.")}>
                              {mappedMembers.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}
                            </select>
                          </label>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : <p className="management-state">No tasks found for this filter.</p>}
          </section>

          <div className="team-lower-grid">
            <section className="management-card">
              <div className="management-card-heading"><div><h2>Upcoming deadlines</h2><p>Work that needs attention next.</p></div></div>
              {upcomingTasks.length ? <ul className="team-simple-list">{upcomingTasks.map((task) => <li key={task.id}><span className="team-date-tile">{displayDate(task.deadline)}</span><div><strong>{task.title}</strong><small>{task.priority} priority · {mappedMembers.find((member) => member.id === task.assignee)?.name || "Unassigned"}</small></div></li>)}</ul> : <p className="management-state">No open tasks.</p>}
            </section>
            <section className="management-card">
              <div className="management-card-heading"><div><h2>Priority tasks</h2><p>High-priority tasks still in progress.</p></div></div>
              {priorityTasks.length ? <ul className="team-simple-list">{priorityTasks.map((task) => <li key={task.id}><span className="priority-badge priority-high">{task.priority}</span><div><strong>{task.title}</strong><small>{mappedMembers.find((member) => member.id === task.assignee)?.name || "Unassigned"} · {task.progress}% complete</small></div></li>)}</ul> : <p className="management-state">No high-priority open tasks.</p>}
            </section>
            <section className="management-card">
              <div className="management-card-heading">
                <div><h2>Top performers</h2><p>Contribution points from the team.</p></div>
                {canManageTeam && <button type="button" className="management-secondary-button" onClick={() => setDialog("contribution")}>＋ Award points</button>}
              </div>
              <label className="team-performer-sort">Sort points
                <select aria-label="Sort performers by contribution points" value={performerSort} onChange={(event) => setPerformerSort(event.target.value)}>
                  <option value="desc">Highest first</option><option value="asc">Lowest first</option>
                </select>
              </label>
              {performers.length ? <ol className="team-performer-list">{performers.map((member, index) => <li key={member.id}><span>{index + 1}</span><i>{initials(member.name)}</i><div><strong>{member.name}</strong><small>{member.role}</small></div><b>{member.points} pts</b></li>)}</ol> : <p className="management-state">No team contributions to rank yet.</p>}
              <div className="team-contribution-history">
                <h3>Recent contribution history</h3>
                {contributions.length ? [...contributions].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 8).map((item) => <div key={item.id} className="team-history-row"><span><strong>{mappedMembers.find((member) => member.id === item.memberId)?.name || "Team member"}</strong><small>{item.reason || "Contribution"} · {displayDate(item.createdAt)}</small></span><b>+{item.points} pts</b></div>) : <p className="management-state">No contribution records yet.</p>}
              </div>
            </section>
          </div>
        </>
      )}

      {dialog === "team" && (
        <DataDialog title="Create a team" onClose={() => setDialog("")} onSubmit={createTeam} submitLabel="Create team">
          <label>Team name<input name="name" required minLength="2" maxLength="60" placeholder="e.g. Team Nova" /></label>
          <label>Description<textarea name="description" rows="3" required minLength="2" maxLength="500" /></label>
          {directoryError && <p className="management-feedback is-error">{directoryError}</p>}
          <label>Team lead<select name="leaderId" required disabled={!directory.length}><option value="">Select a member</option>{directory.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
          <label>Team members <span className="management-optional">(optional)</span><select name="memberIds" multiple size="4">{directory.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
          <p className="management-field-hint">The team lead is included automatically.</p>
        </DataDialog>
      )}
      {dialog === "member" && (
        <DataDialog title="Add a team member" onClose={() => setDialog("")} onSubmit={addMember} submitLabel="Add member">
          {directoryError && <p className="management-feedback is-error">{directoryError}</p>}
          <label>Workspace member<select name="userId" required><option value="">Select a member</option>{eligibleMembers.map((member) => <option key={member.id} value={member.id}>{member.name}{member.email ? ` · ${member.email}` : ""}</option>)}</select></label>
          {!eligibleMembers.length && <p className="management-field-hint">All workspace members are already on this team.</p>}
        </DataDialog>
      )}
      {dialog === "task" && (
        <DataDialog title="Create a team task" onClose={() => setDialog("")} onSubmit={createTask} submitLabel="Create task">
          <label>Task title<input name="title" required maxLength="100" /></label>
          <label>Description<textarea name="description" rows="3" maxLength="1000" /></label>
          <div className="task-form-row">
            <label>Assign member<select name="assignee" required>{mappedMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
            <label>Priority<select name="priority" defaultValue="Medium"><option>High</option><option>Medium</option><option>Low</option><option>Urgent</option></select></label>
          </div>
          <div className="task-form-row">
            <label>Deadline<input name="deadline" type="date" min={todayString()} defaultValue={(() => { const date = new Date(); date.setDate(date.getDate() + 7); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; })()} required /></label>
            <label>Initial progress<input name="progress" type="number" min="0" max="99" defaultValue="0" /></label>
          </div>
          <label>Contribution points<input name="points" type="number" min="1" max="1000" defaultValue="50" required /></label>
        </DataDialog>
      )}
      {dialog === "checkpoint" && (
        <DataDialog title="Add checklist item" onClose={() => setDialog("")} onSubmit={addCheckpoint} submitLabel="Add item">
          <label>Item description<input name="text" required maxLength="120" placeholder="e.g. Review final designs" /></label>
        </DataDialog>
      )}
      {dialog === "reminder" && (
        <DataDialog title="Add reminder" onClose={() => setDialog("")} onSubmit={addReminder} submitLabel="Add reminder">
          <label>Reminder<input name="title" required maxLength="120" placeholder="Submit the weekly update" /></label>
          <label>Due date<input name="dueDate" type="date" min={todayString()} required /></label>
        </DataDialog>
      )}
      {dialog === "contribution" && (
        <DataDialog title="Award contribution points" onClose={() => setDialog("")} onSubmit={awardContribution} submitLabel="Save contribution">
          <label>Team member<select name="memberId" required>{mappedMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
          <label>Points<input name="points" type="number" min="1" max="1000" step="1" required /></label>
          <label>Description<textarea name="reason" rows="3" maxLength="300" required placeholder="Describe the contribution" /></label>
        </DataDialog>
      )}
    </div>
  );
}

export default TeamsPage;
