import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { requestJson } from "../api.js";
import Modal from "../components/Modal.jsx";

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const initialForm = {
  title: "",
  description: "",
  teamId: "",
  assignee: "",
  contributionPoints: "5",
  project: "",
  dueDate: "",
  priority: "Medium",
};

function CreateTaskPage() {
  const [teams, setTeams] = useState([]);
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [feedbackIsError, setFeedbackIsError] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([requestJson("/api/teams"), requestJson("/api/members")])
      .then(([teamResult, memberResult]) => {
        if (!active) return;
        const loadedTeams = teamResult.teams || [];
        setTeams(loadedTeams);
        setMembers(memberResult.users || []);
        const requestedTeam = new URLSearchParams(window.location.search).get("team");
        const firstTeam = loadedTeams.find((team) => team.id === requestedTeam) || loadedTeams[0];
        setForm((current) => ({ ...current, teamId: firstTeam?.id || "" }));
      })
      .catch((error) => {
        if (active) setPageError(error instanceof Error ? error.message : "The task form could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedTeam = teams.find((team) => team.id === form.teamId);
  const teamMembers = useMemo(() => {
    if (!selectedTeam) return [];
    const ids = new Set((selectedTeam.members || []).map((member) => member.userId));
    return members.filter((member) => ids.has(member.id));
  }, [members, selectedTeam]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === "teamId" ? { assignee: "" } : {}),
    }));
    setFeedback("");
  }

  function showMessage(message, isError = false) {
    setFeedback(message);
    setFeedbackIsError(isError);
  }

  function openPreview(event) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    if (!selectedTeam || !teamMembers.some((member) => member.id === form.assignee)) {
      showMessage("Choose a team member from the selected team.", true);
      return;
    }
    setFeedback("");
    setShowPreview(true);
  }

  async function assignTask() {
    setSaving(true);
    setFeedback("");
    try {
      const { task } = await requestJson("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          team: selectedTeam.name,
          teamId: selectedTeam.id,
          assignee: form.assignee,
          contributionPoints: Number(form.contributionPoints),
          project: form.project.trim(),
          dueDate: form.dueDate,
          priority: form.priority,
        }),
      });
      setShowPreview(false);
      setForm({ ...initialForm, teamId: selectedTeam.id });
      showMessage(`“${task.title}” has been assigned to ${task.assigneeName || teamMembers.find((member) => member.id === task.assignee)?.name || "your teammate"}.`);
    } catch (error) {
      setShowPreview(false);
      showMessage(error instanceof Error ? error.message : "The task could not be created.", true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="task-create-page">
      <header className="management-page-header">
        <div>
          <p className="page-eyebrow">Plan the work</p>
          <h1>Create a task</h1>
          <p>Give your teammate the context and details they need to get started.</p>
        </div>
      </header>

      {feedback && <p className={`management-feedback${feedbackIsError ? " is-error" : ""}`} role={feedbackIsError ? "alert" : "status"}>{feedback}</p>}
      {pageError && <p className="management-feedback is-error" role="alert">{pageError}</p>}

      {loading ? <p className="management-state" role="status">Loading teams and members…</p> : (
        <div className="task-create-grid">
          <section className="management-card">
            <p className="management-card-intro">Complete the details, review the assignment, then confirm to assign it to your teammate.</p>
            {teams.length ? (
              <form className="management-form" onSubmit={openPreview}>
                <fieldset className="task-fieldset">
                  <legend>Task information</legend>
                  <label>
                    Task title
                    <input name="title" value={form.title} onChange={updateField} maxLength="100" required placeholder="e.g. Design the event announcement" />
                  </label>
                  <label>
                    Task description
                    <textarea name="description" value={form.description} onChange={updateField} maxLength="1000" required rows="5" placeholder="Describe the expected outcome, context, and requirements." />
                  </label>
                </fieldset>

                <fieldset className="task-fieldset">
                  <legend>Assignment</legend>
                  <div className="task-form-row">
                    <label>
                      Team
                      <select name="teamId" value={form.teamId} onChange={updateField} required>
                        {teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}
                      </select>
                    </label>
                    <label>
                      Team member
                      <select name="assignee" value={form.assignee} onChange={updateField} required disabled={!teamMembers.length}>
                        <option value="">{teamMembers.length ? "Select a team member" : "No members in this team"}</option>
                        {teamMembers.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}
                      </select>
                    </label>
                  </div>
                  {!teamMembers.length && <p className="management-field-hint">Add a member to this team before assigning a task.</p>}
                  <div className="task-form-row">
                    <label>
                      Contribution points
                      <input name="contributionPoints" type="number" value={form.contributionPoints} onChange={updateField} min="1" max="1000" step="1" required />
                    </label>
                    <label>
                      Project <span className="management-optional">(optional)</span>
                      <input name="project" value={form.project} onChange={updateField} maxLength="100" list="project-options" placeholder="Choose or enter a project" />
                      <datalist id="project-options">
                        <option value="TeamFlow" />
                        <option value="Website refresh" />
                        <option value="Internal operations" />
                      </datalist>
                    </label>
                  </div>
                </fieldset>

                <fieldset className="task-fieldset">
                  <legend>Deadline and priority</legend>
                  <div className="task-form-row">
                    <label>
                      Deadline
                      <input name="dueDate" type="date" value={form.dueDate} onChange={updateField} min={localDateString(new Date())} required />
                    </label>
                    <label>
                      Priority
                      <select name="priority" value={form.priority} onChange={updateField}>
                        {["Low", "Medium", "High", "Urgent"].map((item) => <option key={item}>{item}</option>)}
                      </select>
                    </label>
                  </div>
                </fieldset>

                <div className="management-form-actions">
                  <button className="management-secondary-button" type="reset" onClick={() => {
                    setForm({ ...initialForm, teamId: selectedTeam?.id || "" });
                    showMessage("");
                  }}>Clear form</button>
                  <button className="management-primary-button" type="submit">Preview task</button>
                </div>
              </form>
            ) : (
              <div className="management-empty-callout">
                <p>No teams are available yet. Create a team and add members before assigning work.</p>
                <Link className="management-primary-button" to="/team">Go to Teams</Link>
              </div>
            )}
          </section>

          <aside className="management-card task-help-card">
            <h2>Make it easy to start</h2>
            <p>A clear task name and a short description help your teammate understand the outcome you’re looking for.</p>
            <p>Include context, expected deliverables, and a due date that gives the team enough time.</p>
            <div className="management-divider" />
            <h2>Need to review work?</h2>
            <p>Once a task is complete, the assignee can submit it for review.</p>
            <Link to="/approvals">Go to approvals →</Link>
          </aside>
        </div>
      )}

      {showPreview && selectedTeam && (
        <Modal open title="Review task assignment" onClose={() => setShowPreview(false)} className="app-modal task-preview-modal">
          <div className="task-preview-content">
            <p className="task-preview-kicker">Final review</p>
            <h3>{form.title}</h3>
            <span className={`priority-badge priority-${form.priority.toLowerCase()}`}>{form.priority} priority</span>
            <p className="task-preview-description">{form.description}</p>
            <dl className="task-preview-details">
              <div><dt>Team</dt><dd>{selectedTeam.name}</dd></div>
              <div><dt>Team member</dt><dd>{teamMembers.find((member) => member.id === form.assignee)?.name}</dd></div>
              <div><dt>Contribution points</dt><dd>{form.contributionPoints} pts</dd></div>
              <div><dt>Project</dt><dd>{form.project || "No project"}</dd></div>
              <div><dt>Deadline</dt><dd>{form.dueDate ? new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date(`${form.dueDate}T12:00:00`)) : ""}</dd></div>
              <div><dt>Priority</dt><dd>{form.priority}</dd></div>
            </dl>
            <div className="management-form-actions">
              <button className="management-secondary-button" type="button" disabled={saving} onClick={() => setShowPreview(false)}>Back to edit</button>
              <button className="management-primary-button" type="button" disabled={saving} onClick={assignTask}>{saving ? "Assigning…" : "Confirm assignment"}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default CreateTaskPage;
