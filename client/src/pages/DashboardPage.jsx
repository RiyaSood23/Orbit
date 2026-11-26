import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { requestJson } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import Modal from "../components/Modal.jsx";

const dashboardUrl = "/api/organisation/dashboard";
const eventsUrl = "/api/organisation/events";
const announcementsUrl = "/api/organisation/announcements";
const submissionsUrl = "/api/submissions";

function messageFrom(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}

function formatDate(value, options = { dateStyle: "medium" }) {
  if (!value) return "No date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No date" : new Intl.DateTimeFormat(undefined, options).format(date);
}

function toLocalDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function getInitials(name) {
  return (name || "Member")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function LoadingState({ label }) {
  return <p className="dashboard-state" role="status">{label}</p>;
}

function ErrorState({ error, onRetry }) {
  return (
    <div className="dashboard-state dashboard-state-error" role="alert">
      <span>{error}</span>
      {onRetry && <button className="dashboard-link-button" type="button" onClick={onRetry}>Retry</button>}
    </div>
  );
}

function EmptyState({ children }) {
  return <p className="dashboard-state">{children}</p>;
}

function Panel({ title, subtitle, action, className = "", children }) {
  return (
    <section className={`dashboard-panel ${className}`.trim()}>
      <div className="dashboard-panel-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function DashboardDialog({ title, onClose, children }) {
  return (
    <Modal
      className="dashboard-dialog"
      headerClassName="dashboard-dialog-heading"
      closeButtonClassName="dashboard-icon-button"
      open
      title={title}
      onClose={onClose}
    >
      {children}
    </Modal>
  );
}

function EventDialog({ event, onClose, onSave }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(formEvent) {
    formEvent.preventDefault();
    setError("");
    setSaving(true);
    const formData = new FormData(formEvent.currentTarget);
    try {
      const date = new Date(formData.get("date"));
      if (Number.isNaN(date.getTime())) throw new Error("Choose a valid event date and time.");
      await onSave({
        title: formData.get("title"),
        date: date.toISOString(),
        location: formData.get("location"),
        description: formData.get("description"),
      });
    } catch (saveError) {
      setError(messageFrom(saveError, "The event could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardDialog title={event ? "Edit event" : "Create event"} onClose={onClose}>
      <form className="dashboard-form" onSubmit={handleSubmit}>
        <label>Title<input name="title" required minLength="2" maxLength="120" defaultValue={event?.title || ""} /></label>
        <label>Date and time<input name="date" type="datetime-local" required defaultValue={event ? toLocalDateTime(event.date) : ""} /></label>
        <label>Location<input name="location" maxLength="200" defaultValue={event?.location || ""} /></label>
        <label>Description<textarea name="description" rows="3" maxLength="2000" defaultValue={event?.description || ""} /></label>
        {error && <p className="dashboard-form-error" role="alert">{error}</p>}
        <div className="dashboard-dialog-actions">
          <button className="dashboard-secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="dashboard-primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save event"}</button>
        </div>
      </form>
    </DashboardDialog>
  );
}

function AnnouncementDialog({ announcement, onClose, onSave }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(formEvent) {
    formEvent.preventDefault();
    setError("");
    setSaving(true);
    const formData = new FormData(formEvent.currentTarget);
    try {
      await onSave({ title: formData.get("title"), content: formData.get("content") });
    } catch (saveError) {
      setError(messageFrom(saveError, "The announcement could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardDialog
      title={announcement ? "Edit announcement" : "Create announcement"}
      onClose={onClose}
    >
      <form className="dashboard-form" onSubmit={handleSubmit}>
        <label>Title<input name="title" required minLength="2" maxLength="120" defaultValue={announcement?.title || ""} /></label>
        <label>Announcement<textarea name="content" rows="5" required maxLength="5000" defaultValue={announcement?.content || ""} /></label>
        {error && <p className="dashboard-form-error" role="alert">{error}</p>}
        <div className="dashboard-dialog-actions">
          <button className="dashboard-secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="dashboard-primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save announcement"}</button>
        </div>
      </form>
    </DashboardDialog>
  );
}

function EventCard({ event, onEdit, onDelete, onChecklistChange }) {
  const [checklistError, setChecklistError] = useState("");
  const [savingItem, setSavingItem] = useState(false);

  async function submitChecklistItem(formEvent) {
    formEvent.preventDefault();
    setChecklistError("");
    const form = formEvent.currentTarget;
    const formData = new FormData(form);
    const text = formData.get("text");
    try {
      setSavingItem(true);
      await requestJson(`${eventsUrl}/${encodeURIComponent(event.id)}/checklist`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      form.reset();
      await onChecklistChange();
    } catch (error) {
      setChecklistError(messageFrom(error, "The checklist item could not be added."));
    } finally {
      setSavingItem(false);
    }
  }

  async function updateChecklistItem(item, changes) {
    setChecklistError("");
    try {
      setSavingItem(true);
      await requestJson(
        `${eventsUrl}/${encodeURIComponent(event.id)}/checklist/${encodeURIComponent(item.id)}`,
        { method: "PATCH", body: JSON.stringify(changes) },
      );
      await onChecklistChange();
    } catch (error) {
      setChecklistError(messageFrom(error, "The checklist item could not be updated."));
    } finally {
      setSavingItem(false);
    }
  }

  async function deleteChecklistItem(item) {
    setChecklistError("");
    try {
      setSavingItem(true);
      await requestJson(
        `${eventsUrl}/${encodeURIComponent(event.id)}/checklist/${encodeURIComponent(item.id)}`,
        { method: "DELETE" },
      );
      await onChecklistChange();
    } catch (error) {
      setChecklistError(messageFrom(error, "The checklist item could not be deleted."));
    } finally {
      setSavingItem(false);
    }
  }

  return (
    <article className="dashboard-event-card">
      <div className="dashboard-event-date">
        <strong>{formatDate(event.date, { month: "short", day: "numeric" })}</strong>
        <span>{formatDate(event.date, { hour: "numeric", minute: "2-digit" })}</span>
      </div>
      <div className="dashboard-event-content">
        <div className="dashboard-event-title-row">
          <div>
            <h3>{event.title}</h3>
            <p className="dashboard-event-meta">{event.location || "Location not set"}</p>
          </div>
          <div className="dashboard-record-actions">
            <button type="button" onClick={() => onEdit(event)}>Edit</button>
            <button type="button" onClick={() => onDelete(event)}>Delete</button>
          </div>
        </div>
        {event.description && <p className="dashboard-event-description">{event.description}</p>}
        <ul className="dashboard-checklist">
          {(event.checklist || []).map((item) => (
            <li key={item.id}>
              <label>
                <input
                  type="checkbox"
                  checked={item.completed}
                  disabled={savingItem}
                  onChange={() => updateChecklistItem(item, { completed: !item.completed })}
                />
                <span className={item.completed ? "is-completed" : ""}>{item.text}</span>
              </label>
              <div className="dashboard-record-actions">
                <button
                  type="button"
                  disabled={savingItem}
                  onClick={() => {
                    const text = window.prompt("Update checklist item", item.text);
                    if (text !== null && text.trim()) updateChecklistItem(item, { text: text.trim() });
                  }}
                >Edit</button>
                <button type="button" disabled={savingItem} onClick={() => deleteChecklistItem(item)}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
        <form className="dashboard-checklist-form" onSubmit={submitChecklistItem}>
          <input name="text" required maxLength="200" placeholder="Add a checklist item" aria-label="New checklist item" />
          <button className="dashboard-secondary-button" type="submit" disabled={savingItem}>Add item</button>
        </form>
        {checklistError && <p className="dashboard-form-error" role="alert">{checklistError}</p>}
      </div>
    </article>
  );
}

function getStatusClass(status) {
  const normalized = (status || "").toLowerCase().replace(/\s+/g, "-");
  return `dashboard-status dashboard-status-${normalized || "unknown"}`;
}

function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [events, setEvents] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState("");
  const [eventEditor, setEventEditor] = useState(null);
  const [announcementEditor, setAnnouncementEditor] = useState(null);
  const [activeMetric, setActiveMetric] = useState("totalTasks");

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const results = await Promise.allSettled([
      requestJson(dashboardUrl),
      requestJson(eventsUrl),
      requestJson(announcementsUrl),
      requestJson(submissionsUrl),
    ]);
    setErrors({
      dashboard: results[0].status === "rejected" ? messageFrom(results[0].reason, "Dashboard data could not be loaded.") : "",
      events: results[1].status === "rejected" ? messageFrom(results[1].reason, "Events could not be loaded.") : "",
      announcements: results[2].status === "rejected" ? messageFrom(results[2].reason, "Announcements could not be loaded.") : "",
      submissions: results[3].status === "rejected" ? messageFrom(results[3].reason, "Submissions could not be loaded.") : "",
    });
    if (results[0].status === "fulfilled") setData(results[0].value);
    if (results[1].status === "fulfilled") setEvents(results[1].value.events);
    if (results[2].status === "fulfilled") setAnnouncements(results[2].value.announcements);
    if (results[3].status === "fulfilled") setSubmissions(results[3].value.submissions);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const refreshEvents = useCallback(async () => {
    const result = await requestJson(eventsUrl);
    setEvents(result.events);
    setErrors((current) => ({ ...current, events: "" }));
  }, []);

  const refreshAnnouncements = useCallback(async () => {
    const result = await requestJson(announcementsUrl);
    setAnnouncements(result.announcements);
    setErrors((current) => ({ ...current, announcements: "" }));
  }, []);

  async function saveEvent(values) {
    const editing = eventEditor?.id;
    await requestJson(editing ? `${eventsUrl}/${encodeURIComponent(editing)}` : eventsUrl, {
      method: editing ? "PATCH" : "POST",
      body: JSON.stringify(values),
    });
    setEventEditor(null);
    setToast(editing ? "Event updated." : "Event created.");
    const results = await Promise.allSettled([refreshEvents(), requestJson(dashboardUrl)]);
    if (results[1].status === "fulfilled") setData(results[1].value);
    else setErrors((current) => ({ ...current, dashboard: messageFrom(results[1].reason, "Dashboard data could not be refreshed.") }));
    if (results[0].status === "rejected") setErrors((current) => ({ ...current, events: messageFrom(results[0].reason, "Events could not be refreshed.") }));
  }

  async function deleteEvent(event) {
    if (!window.confirm("Delete this event and its checklist?")) return;
    try {
      await requestJson(`${eventsUrl}/${encodeURIComponent(event.id)}`, { method: "DELETE" });
      setToast("Event deleted.");
      const results = await Promise.allSettled([refreshEvents(), requestJson(dashboardUrl)]);
      if (results[1].status === "fulfilled") setData(results[1].value);
      else setErrors((current) => ({ ...current, dashboard: messageFrom(results[1].reason, "Dashboard data could not be refreshed.") }));
      if (results[0].status === "rejected") setErrors((current) => ({ ...current, events: messageFrom(results[0].reason, "Events could not be refreshed.") }));
    } catch (error) {
      setToast(messageFrom(error, "The event could not be deleted."));
    }
  }

  async function saveAnnouncement(values) {
    const editing = announcementEditor?.id;
    await requestJson(
      editing ? `${announcementsUrl}/${encodeURIComponent(editing)}` : announcementsUrl,
      { method: editing ? "PATCH" : "POST", body: JSON.stringify(values) },
    );
    setAnnouncementEditor(null);
    setToast(editing ? "Announcement updated." : "Announcement posted.");
    try {
      await refreshAnnouncements();
    } catch (error) {
      setErrors((current) => ({ ...current, announcements: messageFrom(error, "Announcements could not be refreshed.") }));
    }
  }

  async function deleteAnnouncement(announcement) {
    if (!window.confirm("Delete this announcement?")) return;
    try {
      await requestJson(`${announcementsUrl}/${encodeURIComponent(announcement.id)}`, { method: "DELETE" });
      setToast("Announcement deleted.");
      try {
        await refreshAnnouncements();
      } catch (error) {
        setErrors((current) => ({ ...current, announcements: messageFrom(error, "Announcements could not be refreshed.") }));
      }
    } catch (error) {
      setToast(messageFrom(error, "The announcement could not be deleted."));
    }
  }

  const stats = data?.stats || {};
  const metricOptions = [
    ["totalTasks", "All tasks"],
    ["completedTasks", "Completed"],
    ["pendingTasks", "Pending"],
    ["overdueTasks", "Overdue"],
  ];
  const completion = stats.completionPercentage || 0;
  const metricValue = stats[activeMetric] || 0;
  const tasks = data?.recentTasks || [];
  const deadlines = data?.upcomingDeadlines || [];
  const recentSubmissions = submissions.slice(0, 5);
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="dashboard-page">
      <div className="dashboard-heading">
        <div>
          <p className="page-eyebrow">Organisation overview</p>
          <h1>{greeting}, {user?.name?.split(" ")[0] || "there"}</h1>
          <p className="dashboard-intro">Here’s what’s happening across your workspace.</p>
        </div>
        <button
          className="dashboard-secondary-button dashboard-refresh-button"
          type="button"
          onClick={() => loadDashboard(true)}
          disabled={loading || refreshing}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {toast && <p className="dashboard-toast" role="status">{toast}</p>}

      {errors.dashboard && (
        <ErrorState
          error={errors.dashboard}
          onRetry={() => loadDashboard(true)}
        />
      )}

      <div className="dashboard-stat-grid">
        {[
          ["Total tasks", stats.totalTasks, "totalTasks"],
          ["Completed", stats.completedTasks, "completedTasks"],
          ["Pending", stats.pendingTasks, "pendingTasks"],
          ["Overdue", stats.overdueTasks, "overdueTasks"],
        ].map(([label, value, key]) => (
          <button
            className={`dashboard-stat-card${activeMetric === key ? " is-active" : ""}`}
            key={key}
            type="button"
            onClick={() => setActiveMetric(key)}
            aria-pressed={activeMetric === key}
          >
            <span>{label}</span>
            <strong>{loading && !data ? "—" : value ?? 0}</strong>
            <small>Task overview</small>
          </button>
        ))}
      </div>

      <div className="dashboard-overview-grid">
        <Panel title="Team overview" subtitle="Progress across your organisation" className="dashboard-teams-panel">
          {loading && !data ? <LoadingState label="Loading teams…" /> : errors.dashboard ? null : data?.teams?.length ? (
            <div className="dashboard-team-grid">
              {data.teams.map((team) => (
                <Link className="dashboard-team-card" to="/team" key={team.id}>
                  <span className="dashboard-team-icon" aria-hidden="true">{getInitials(team.name)}</span>
                  <h3>{team.name}</h3>
                  <p>{team.leader?.name || "No team lead"}</p>
                  <div className="dashboard-progress-label">
                    <span>{team.completedTasks} of {team.totalTasks} tasks</span>
                    <strong>{team.productivity}%</strong>
                  </div>
                  <div className="dashboard-progress-track" role="progressbar" aria-label={`${team.name} task completion`} aria-valuenow={team.productivity} aria-valuemin="0" aria-valuemax="100">
                    <span style={{ width: `${team.productivity}%` }} />
                  </div>
                  <small>{team.memberCount} members · {team.overdueTasks} overdue</small>
                </Link>
              ))}
            </div>
          ) : <EmptyState>No teams found for this organisation.</EmptyState>}
        </Panel>

        <Panel title="Task progress" subtitle="Completion at a glance" className="dashboard-progress-panel">
          {loading && !data ? <LoadingState label="Loading task progress…" /> : errors.dashboard ? null : (
            <>
              <div className="dashboard-progress-ring" style={{ "--completion": `${completion}%` }} role="img" aria-label={`${completion}% of tasks completed`}>
                <div><strong>{activeMetric === "totalTasks" ? `${completion}%` : metricValue}</strong><span>{activeMetric === "totalTasks" ? "complete" : metricOptions.find(([key]) => key === activeMetric)?.[1]}</span></div>
              </div>
              <div className="dashboard-metric-options">
                {metricOptions.map(([key, label]) => (
                  <button className={activeMetric === key ? "is-active" : ""} type="button" key={key} onClick={() => setActiveMetric(key)}>
                    <span>{label}</span><strong>{stats[key] ?? 0}</strong>
                  </button>
                ))}
              </div>
              <div className="dashboard-org-counts">
                <span><strong>{stats.totalTeams ?? data?.totalTeams ?? 0}</strong> teams</span>
                <span><strong>{stats.totalMembers ?? data?.totalMembers ?? 0}</strong> members</span>
              </div>
            </>
          )}
        </Panel>
      </div>

      <div className="dashboard-content-grid">
        <Panel title="Upcoming deadlines" subtitle="The next tasks to keep an eye on" className="dashboard-deadlines-panel">
          {loading && !data ? <LoadingState label="Loading deadlines…" /> : errors.dashboard ? null : deadlines.length ? (
            <ul className="dashboard-list">
              {deadlines.map((task) => (
                <li className="dashboard-task-row" key={task.id}>
                  <span className="dashboard-list-icon" aria-hidden="true">⌁</span>
                  <div><strong>{task.title}</strong><small>{task.team} · {task.assignee}</small></div>
                  <time>{formatDate(task.dueDate)}</time>
                </li>
              ))}
            </ul>
          ) : <EmptyState>No upcoming deadlines.</EmptyState>}
        </Panel>

        <Panel title="Recent tasks" subtitle="Latest work added to your workspace" className="dashboard-recent-panel">
          {loading && !data ? <LoadingState label="Loading recent tasks…" /> : errors.dashboard ? null : tasks.length ? (
            <ul className="dashboard-list">
              {tasks.map((task) => (
                <li className="dashboard-task-row" key={task.id}>
                  <span className="dashboard-list-icon" aria-hidden="true">✓</span>
                  <div><strong>{task.title}</strong><small>{task.team} · {task.assignee}</small></div>
                  <span className={getStatusClass(task.status)}>{task.status}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState>No tasks have been created yet.</EmptyState>}
        </Panel>

        <Panel title="Recent submissions" subtitle="Latest member work submitted for review" className="dashboard-submissions-panel">
          {loading && !errors.submissions ? <LoadingState label="Loading submissions…" /> : errors.submissions ? <ErrorState error={errors.submissions} /> : recentSubmissions.length ? (
            <ul className="dashboard-list">
              {recentSubmissions.map((submission) => (
                <li className="dashboard-task-row" key={submission.id}>
                  <span className="dashboard-list-icon" aria-hidden="true">↗</span>
                  <div><strong>{submission.description}</strong><small>Task {submission.taskId} · {formatDate(submission.updatedAt || submission.createdAt)}</small></div>
                  <span className={getStatusClass(submission.status)}>{submission.status}</span>
                </li>
              ))}
            </ul>
          ) : <><EmptyState>No submissions to show yet.</EmptyState><Link className="dashboard-inline-link" to="/approvals">Open approvals</Link></>}
        </Panel>
      </div>

      <div className="dashboard-content-grid dashboard-lower-grid">
        <Panel title="Upcoming events" subtitle="What's next in your organisation">
          {loading && !data ? <LoadingState label="Loading events…" /> : errors.dashboard ? null : data?.upcomingEvents?.length ? (
            <ul className="dashboard-list">
              {data.upcomingEvents.map((event) => (
                <li className="dashboard-event-preview" key={event.id}>
                  <span className="dashboard-date-tile">{formatDate(event.date, { month: "short", day: "numeric" })}</span>
                  <div><strong>{event.title}</strong><small>{formatDate(event.date, { hour: "numeric", minute: "2-digit" })}{event.location ? ` · ${event.location}` : ""}</small></div>
                </li>
              ))}
            </ul>
          ) : <EmptyState>No upcoming events.</EmptyState>}
        </Panel>

        <Panel title="Top performers" subtitle="Members with the most contribution points">
          {loading && !data ? <LoadingState label="Loading contributors…" /> : errors.dashboard ? null : data?.topPerformers?.length ? (
            <ol className="dashboard-performer-list">
              {data.topPerformers.map((member, index) => (
                <li key={member.id}>
                  <span className="dashboard-rank">{index + 1}</span>
                  <span className="dashboard-member-avatar">{getInitials(member.name)}</span>
                  <div><strong>{member.name}</strong><small>{member.contributionCount} contributions</small></div>
                  <b>{member.contributionPoints} pts</b>
                </li>
              ))}
            </ol>
          ) : <EmptyState>No contribution activity yet.</EmptyState>}
        </Panel>

        <Panel title="Members" subtitle="Task completion by member">
          {loading && !data ? <LoadingState label="Loading members…" /> : errors.dashboard ? null : data?.members?.length ? (
            <ul className="dashboard-member-list">
              {data.members.slice(0, 6).map((member) => {
                const progress = member.assignedTasks ? Math.round((member.completedTasks / member.assignedTasks) * 100) : 0;
                return (
                  <li key={member.id}>
                    <span className="dashboard-member-avatar">{getInitials(member.name)}</span>
                    <div className="dashboard-member-detail">
                      <strong>{member.name}</strong><small>{member.teams.join(", ") || member.role}</small>
                      <div className="dashboard-progress-track" role="progressbar" aria-label={`${member.name} task completion`} aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${progress}%` }} /></div>
                    </div>
                    <span className="dashboard-member-count">{member.completedTasks}/{member.assignedTasks}</span>
                  </li>
                );
              })}
            </ul>
          ) : <EmptyState>No members found.</EmptyState>}
        </Panel>
      </div>

      <div className="dashboard-content-grid dashboard-management-grid">
        <Panel
          title="Announcements"
          subtitle="Updates for your organisation"
          action={<button className="dashboard-primary-button" type="button" onClick={() => setAnnouncementEditor({})}>＋ Announcement</button>}
        >
          {loading && !errors.announcements ? <LoadingState label="Loading announcements…" /> : errors.announcements ? <ErrorState error={errors.announcements} onRetry={refreshAnnouncements} /> : announcements.length ? (
            <ul className="dashboard-announcement-list">
              {announcements.map((announcement) => (
                <li key={announcement.id}>
                  <div><strong>{announcement.title}</strong><p>{announcement.content}</p><small>Posted {formatDate(announcement.createdAt)}</small></div>
                  <div className="dashboard-record-actions">
                    <button type="button" onClick={() => setAnnouncementEditor(announcement)}>Edit</button>
                    <button type="button" onClick={() => deleteAnnouncement(announcement)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : <EmptyState>No announcements have been posted.</EmptyState>}
        </Panel>

        <Panel
          title="Organisation events"
          subtitle="Events and their checklists"
          action={<button className="dashboard-primary-button" type="button" onClick={() => setEventEditor({})}>＋ Event</button>}
        >
          {loading && !errors.events ? <LoadingState label="Loading events…" /> : errors.events ? <ErrorState error={errors.events} onRetry={refreshEvents} /> : events.length ? (
            <div className="dashboard-events-list">
              {events.map((event) => (
                <EventCard
                  event={event}
                  key={event.id}
                  onEdit={setEventEditor}
                  onDelete={deleteEvent}
                  onChecklistChange={refreshEvents}
                />
              ))}
            </div>
          ) : <EmptyState>No events have been added.</EmptyState>}
        </Panel>
      </div>

      {eventEditor && <EventDialog key={eventEditor.id || "new"} event={eventEditor.id ? eventEditor : null} onClose={() => setEventEditor(null)} onSave={saveEvent} />}
      {announcementEditor && <AnnouncementDialog key={announcementEditor.id || "new"} announcement={announcementEditor.id ? announcementEditor : null} onClose={() => setAnnouncementEditor(null)} onSave={saveAnnouncement} />}
    </div>
  );
}

export default DashboardPage;
