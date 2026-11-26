import { useCallback, useEffect, useState } from "react";
import { requestJson } from "../api.js";

const pageSize = 10;

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState([]);
  const [priority, setPriority] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [feedbackIsError, setFeedbackIsError] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ title: "", message: "", priority: "Normal" });

  const loadAnnouncements = useCallback(async (requestedPage, requestedPriority) => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(requestedPage),
      limit: String(pageSize),
    });
    if (requestedPriority) params.set("priority", requestedPriority);
    try {
      const result = await requestJson(`/api/announcements?${params.toString()}`);
      setAnnouncements(result.announcements || []);
      setPage(result.pagination?.page || requestedPage);
      setTotalPages(Math.max(1, result.pagination?.pages || 1));
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Announcements could not be loaded.");
      setAnnouncements([]);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnnouncements(page, priority);
  }, [loadAnnouncements, page, priority]);

  function showFeedback(message, isError = false) {
    setFeedback(message);
    setFeedbackIsError(isError);
  }

  function resetForm() {
    setEditingId(null);
    setForm({ title: "", message: "", priority: "Normal" });
  }

  function beginEdit(announcement) {
    setEditingId(announcement.id);
    setForm({
      title: announcement.title || "",
      message: announcement.message || announcement.content || "",
      priority: announcement.priority || "Normal",
    });
    showFeedback("");
    document.getElementById("announcement-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    showFeedback("");
    const editing = Boolean(editingId);
    try {
      await requestJson(
        editingId ? `/api/announcements/${encodeURIComponent(editingId)}` : "/api/announcements",
        {
          method: editingId ? "PUT" : "POST",
          body: JSON.stringify({
            title: form.title.trim(),
            message: form.message.trim(),
            priority: form.priority,
          }),
        },
      );
      resetForm();
      const pageToLoad = editing ? page : 1;
      if (!editing) setPage(1);
      const refreshed = await loadAnnouncements(pageToLoad, priority);
      showFeedback(
        refreshed
          ? editing ? "Announcement updated." : "Announcement published."
          : "Announcement saved, but the list could not be refreshed.",
        !refreshed,
      );
    } catch (requestError) {
      showFeedback(requestError instanceof Error ? requestError.message : "Could not save this announcement.", true);
    } finally {
      setSaving(false);
    }
  }

  async function deleteAnnouncement(announcement) {
    if (!window.confirm(`Delete "${announcement.title}"?`)) return;
    showFeedback("");
    try {
      await requestJson(`/api/announcements/${encodeURIComponent(announcement.id)}`, { method: "DELETE" });
      const nextPage = announcements.length === 1 && page > 1 ? page - 1 : page;
      if (nextPage !== page) setPage(nextPage);
      const refreshed = await loadAnnouncements(nextPage, priority);
      showFeedback(
        refreshed ? "Announcement deleted." : "Announcement deleted, but the list could not be refreshed.",
        !refreshed,
      );
      if (editingId === announcement.id) resetForm();
    } catch (requestError) {
      showFeedback(requestError instanceof Error ? requestError.message : "Could not delete this announcement.", true);
    }
  }

  function updateForm(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  return (
    <div className="management-page">
      <header className="management-page-header">
        <div>
          <p className="page-eyebrow">Team communication</p>
          <h1>Announcements</h1>
          <p>Share important updates with your workspace.</p>
        </div>
        <label className="management-filter">
          Priority
          <select
            value={priority}
            onChange={(event) => {
              setPriority(event.target.value);
              setPage(1);
              showFeedback("");
            }}
          >
            <option value="">All priorities</option>
            <option value="Normal">Normal</option>
            <option value="Important">Important</option>
            <option value="Urgent">Urgent</option>
          </select>
        </label>
      </header>

      {feedback && (
        <p className={`management-feedback${feedbackIsError ? " is-error" : ""}`} role={feedbackIsError ? "alert" : "status"}>
          {feedback}
        </p>
      )}

      <div className="management-grid">
        <section className="management-card" aria-labelledby="announcements-heading">
          <div className="management-card-heading">
            <div>
              <h2 id="announcements-heading">Latest updates</h2>
              <p>Page {page} of {totalPages}</p>
            </div>
            <span className="management-count">{announcements.length}</span>
          </div>

          {loading ? <p className="management-state" role="status">Loading announcements…</p> : error ? (
            <div className="management-state management-state-error" role="alert">
              <span>{error}</span>
              <button type="button" className="management-text-button" onClick={() => loadAnnouncements(page, priority)}>Retry</button>
            </div>
          ) : announcements.length ? (
            <ul className="announcement-record-list">
              {announcements.map((announcement) => (
                <li key={announcement.id} className="announcement-record">
                  <div className="announcement-record-copy">
                    <div className="announcement-record-heading">
                      <strong>{announcement.title}</strong>
                      <span className={`priority-badge priority-${(announcement.priority || "Normal").toLowerCase()}`}>
                        {announcement.priority || "Normal"}
                      </span>
                    </div>
                    <time>{formatDate(announcement.createdAt)}</time>
                    <p>{announcement.message || announcement.content || ""}</p>
                  </div>
                  <div className="management-actions">
                    <button type="button" onClick={() => beginEdit(announcement)}>Edit</button>
                    <button type="button" className="is-danger" onClick={() => deleteAnnouncement(announcement)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="management-state">No announcements match this filter.</p>}

          <div className="management-pagination">
            <button type="button" className="management-secondary-button" disabled={loading || page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
            <span aria-live="polite">Page {page} of {totalPages}</span>
            <button type="button" className="management-secondary-button" disabled={loading || page >= totalPages} onClick={() => setPage((current) => current + 1)}>Next</button>
          </div>
        </section>

        <section className="management-card" id="announcement-editor" aria-labelledby="announcement-form-heading">
          <div className="management-card-heading">
            <div>
              <h2 id="announcement-form-heading">{editingId ? "Edit announcement" : "Create announcement"}</h2>
              <p>Keep your team informed.</p>
            </div>
          </div>
          <form className="management-form" onSubmit={handleSubmit}>
            <label>
              Title
              <input name="title" value={form.title} onChange={updateForm} minLength="2" maxLength="120" required />
            </label>
            <label>
              Priority
              <select name="priority" value={form.priority} onChange={updateForm}>
                <option>Normal</option>
                <option>Important</option>
                <option>Urgent</option>
              </select>
            </label>
            <label>
              Message
              <textarea name="message" rows="8" value={form.message} onChange={updateForm} maxLength="10000" required />
            </label>
            <div className="management-form-actions">
              {editingId && <button className="management-secondary-button" type="button" onClick={resetForm}>Cancel edit</button>}
              <button className="management-primary-button" type="submit" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Publish announcement"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

export default AnnouncementsPage;
