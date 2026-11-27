import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestJson } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";

const reviewStatuses = ["Submitted", "Under review", "Revision requested", "Approved", "Rejected"];

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatDueDate(value) {
  const dateValue = String(value).includes("T") ? value : `${value}T00:00:00`;
  const date = new Date(dateValue);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusClass(status) {
  return `approval-status approval-status-${String(status || "unknown").toLowerCase().replace(/\s+/g, "-")}`;
}

function activityFor(submission) {
  if (submission.activity?.length) return submission.activity;
  const activity = [];
  if (submission.createdAt) {
    activity.push({
      id: `submitted-${submission.id}`,
      actorId: submission.submittedBy,
      action: "submitted",
      note: submission.description,
      createdAt: submission.createdAt,
    });
  }
  if (submission.reviewedAt && submission.reviewedBy) {
    activity.push({
      id: `review-${submission.id}`,
      actorId: submission.reviewedBy,
      action: submission.status === "Submitted" ? "feedback_added" : submission.status.toLowerCase().replace(/ /g, "_"),
      note: submission.feedback || "",
      createdAt: submission.reviewedAt,
    });
  }
  (submission.comments || []).forEach((comment) => {
    activity.push({
      id: `comment-${comment.id}`,
      actorId: comment.authorId,
      action: "commented",
      note: comment.text,
      createdAt: comment.createdAt,
    });
  });
  return activity.sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
}

function activityLabel(action) {
  return ({
    submitted: "asked for review",
    under_review: "started review",
    revision_requested: "requested changes",
    approved: "approved",
    rejected: "rejected",
    feedback_added: "shared feedback",
    commented: "commented",
  })[action] || "updated this submission";
}

function ApprovalsPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState("");
  const [submissions, setSubmissions] = useState([]);
  const [allSubmissions, setAllSubmissions] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [members, setMembers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [teamTasks, setTeamTasks] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [submissionTeamId, setSubmissionTeamId] = useState("");
  const [teamDataVersion, setTeamDataVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const [directoryError, setDirectoryError] = useState("");
  const [teamTasksError, setTeamTasksError] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackIsError, setFeedbackIsError] = useState(false);
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [commentText, setCommentText] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const submissionsRequest = useRef(0);

  const loadSubmissions = useCallback(async () => {
    const requestId = ++submissionsRequest.current;
    setLoading(true);
    setSubmissionError("");
    try {
      const result = await requestJson("/api/submissions");
      if (requestId !== submissionsRequest.current) return null;
      const allRecords = result.submissions || [];
      const records = filter ? allRecords.filter((item) => item.status === filter) : allRecords;
      setAllSubmissions(allRecords);
      setSubmissions(records);
      setSelectedId((current) => records.some((item) => item.id === current) ? current : records[0]?.id || "");
      return true;
    } catch (error) {
      if (requestId !== submissionsRequest.current) return null;
      setSubmissionError(error instanceof Error ? error.message : "Submissions could not be loaded.");
      setSubmissions([]);
      setAllSubmissions([]);
      setSelectedId("");
      return false;
    } finally {
      if (requestId === submissionsRequest.current) setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  useEffect(() => {
    let active = true;
    setTeamsLoading(true);
    setTeamTasksError("");
    Promise.allSettled([requestJson("/api/members"), requestJson("/api/teams")]).then(async (results) => {
      if (!active) return;
      if (results[0].status === "fulfilled") {
        setMembers(results[0].value.users || []);
        setDirectoryError("");
      } else {
        setDirectoryError(results[0].reason instanceof Error ? results[0].reason.message : "Member details could not be loaded.");
      }
      if (results[1].status !== "fulfilled") {
        setTeamTasksError(results[1].reason instanceof Error ? results[1].reason.message : "Teams could not be loaded.");
        setTeamsLoading(false);
        return;
      }
      setTeamTasksError("");
      const loadedTeams = results[1].value.teams || [];
      setTeams(loadedTeams);
      setSelectedTeamId((current) => loadedTeams.some((team) => team.id === current)
        ? current
        : "");
      setSubmissionTeamId((current) => loadedTeams.some((team) => team.id === current)
        ? current
        : loadedTeams[0]?.id || "");
      const dashboards = await Promise.allSettled(loadedTeams.map((team) =>
        requestJson(`/api/teams/${encodeURIComponent(team.id)}/dashboard`)
      ));
      if (active) {
        setTeamTasks(dashboards.flatMap((result) => result.status === "fulfilled" ? result.value.tasks || [] : []));
        const failures = dashboards.filter((result) => result.status === "rejected");
        if (failures.length) {
          setTeamTasksError("Some team tasks could not be loaded. Retry to see all available work.");
        }
      }
      if (active) setTeamsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [teamDataVersion]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedSubmission(null);
      return undefined;
    }
    let active = true;
    setDetailLoading(true);
    requestJson(`/api/submissions/${encodeURIComponent(selectedId)}`)
      .then(({ submission }) => {
        if (active) {
          setSelectedSubmission(submission);
          setReviewFeedback(submission.feedback || "");
          setCommentText("");
        }
      })
      .catch((error) => {
        if (active) {
          setSelectedSubmission(null);
          setFeedbackMessage(error instanceof Error ? error.message : "Submission details could not be loaded.");
          setFeedbackIsError(true);
        }
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const taskById = useMemo(() => new Map(teamTasks.map((task) => [task.id, task])), [teamTasks]);
  const selectedTeam = teams.find((team) => team.id === selectedTeamId);
  const submissionTeam = teams.find((team) => team.id === submissionTeamId);
  const canReview = Boolean(selectedSubmission && selectedSubmission.submittedBy !== user?.id);
  const isSubmitter = Boolean(selectedSubmission && selectedSubmission.submittedBy === user?.id);
  const selectedTask = selectedSubmission
    ? selectedSubmission.task || taskById.get(selectedSubmission.taskId)
    : null;
  const selectedActivity = useMemo(
    () => selectedSubmission ? activityFor(selectedSubmission) : [],
    [selectedSubmission]
  );
  const existingByTask = new Map();
  for (const submission of allSubmissions) {
    if (submission.submittedBy === user?.id && !existingByTask.has(submission.taskId)) {
      existingByTask.set(submission.taskId, submission);
    }
  }
  const readyTasks = teamTasks.filter((task) => {
    if (task.teamId !== submissionTeamId || task.assignee !== user?.id || task.status !== "Completed") return false;
    const existing = existingByTask.get(task.id);
    return !existing || existing.status === "Revision requested";
  });
  const visibleSubmissions = submissions.filter((submission) => (
    !selectedTeamId
    || (submission.task?.teamId || taskById.get(submission.taskId)?.teamId) === selectedTeamId
  ));
  const visibleAllSubmissions = allSubmissions.filter((submission) => (
    !selectedTeamId
    || (submission.task?.teamId || taskById.get(submission.taskId)?.teamId) === selectedTeamId
  ));
  const visibleTasks = teamTasks.filter((task) => !selectedTeamId || task.teamId === selectedTeamId);
  const submissionsByTask = new Map();
  for (const submission of allSubmissions) {
    const previous = submissionsByTask.get(submission.taskId);
    if (!previous || new Date(submission.createdAt) > new Date(previous.createdAt)) {
      submissionsByTask.set(submission.taskId, submission);
    }
  }
  const reviewCounts = {
    tasks: visibleTasks.length,
    awaiting: visibleAllSubmissions.filter((item) => ["Submitted", "Under review"].includes(item.status)).length,
    approved: visibleAllSubmissions.filter((item) => item.status === "Approved").length,
    rejected: visibleAllSubmissions.filter((item) => item.status === "Rejected").length,
  };

  useEffect(() => {
    setSelectedId((current) => (
      visibleSubmissions.some((submission) => submission.id === current)
        ? current
        : visibleSubmissions[0]?.id || ""
    ));
  }, [selectedTeamId, submissions, teamTasks]);

  function showMessage(message, isError = false) {
    setFeedbackMessage(message);
    setFeedbackIsError(isError);
  }

  function updateSubmission(submission) {
    setSelectedSubmission(submission);
    setReviewFeedback(submission.feedback || "");
    setSubmissions((current) => {
      const found = current.some((item) => item.id === submission.id);
      if (filter && submission.status !== filter) {
        return current.filter((item) => item.id !== submission.id);
      }
      return found ? current.map((item) => item.id === submission.id ? submission : item) : [submission, ...current];
    });
    setAllSubmissions((current) => {
      const found = current.some((item) => item.id === submission.id);
      return found
        ? current.map((item) => item.id === submission.id ? submission : item)
        : [submission, ...current];
    });
  }

  async function submitWork(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const taskId = String(formData.get("taskId") || "");
    const description = String(formData.get("description") || "").trim();
    const files = selectedFiles;
    if (files.length > 5) {
      showMessage("A submission can contain at most five files.", true);
      return;
    }
    if (files.some((file) => file.size > 10 * 1024 * 1024)) {
      showMessage("Each uploaded file must be 10 MB or smaller.", true);
      return;
    }
    setSubmitting(true);
    showMessage("");
    try {
      const { submission } = await requestJson(`/api/tasks/${encodeURIComponent(taskId)}/submissions`, {
        method: "POST",
        body: JSON.stringify({ description }),
      });
      let uploadFailed = false;
      if (files.length) {
        const upload = new FormData();
        files.forEach((file) => upload.append("files", file));
        try {
          const result = await requestJson(`/api/submissions/${encodeURIComponent(submission.id)}/files`, {
            method: "POST",
            body: upload,
          });
          updateSubmission(result.submission);
          setSelectedId(result.submission.id);
        } catch (uploadError) {
          uploadFailed = true;
          updateSubmission(submission);
          setSelectedId(submission.id);
          showMessage(`Submission created, but its files could not be uploaded: ${uploadError instanceof Error ? uploadError.message : "Upload failed."}`, true);
        }
      } else {
        updateSubmission(submission);
        setSelectedId(submission.id);
      }
      setSelectedFiles([]);
      form.reset();
      const refreshed = await loadSubmissions();
      if (!uploadFailed) {
        showMessage(
          refreshed === false ? "Submission created, but the list could not be refreshed." : "Your work was submitted for review.",
          refreshed === false,
        );
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "The submission could not be created.", true);
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadMoreFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length || !selectedSubmission) return;
    if ((selectedSubmission.files?.length || 0) + files.length > 5) {
      showMessage("A submission can contain at most five files.", true);
      event.target.value = "";
      return;
    }
    if (files.some((file) => file.size > 10 * 1024 * 1024)) {
      showMessage("Each uploaded file must be 10 MB or smaller.", true);
      event.target.value = "";
      return;
    }
    setSubmitting(true);
    showMessage("");
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    try {
      const result = await requestJson(`/api/submissions/${encodeURIComponent(selectedSubmission.id)}/files`, {
        method: "POST",
        body: formData,
      });
      updateSubmission(result.submission);
      showMessage("Files added to the submission.");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Files could not be uploaded.", true);
    } finally {
      setSubmitting(false);
      event.target.value = "";
    }
  }

  async function addComment(event) {
    event.preventDefault();
    const text = commentText.trim();
    if (!text || !selectedSubmission) return;
    setReviewing(true);
    showMessage("");
    try {
      const result = await requestJson(`/api/submissions/${encodeURIComponent(selectedSubmission.id)}/comments`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      updateSubmission(result.submission);
      setCommentText("");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "The comment could not be added.", true);
    } finally {
      setReviewing(false);
    }
  }

  async function submitReview(status) {
    if (!selectedSubmission) return;
    const feedback = reviewFeedback.trim();
    if (["Revision requested", "Rejected"].includes(status) && !feedback) {
      showMessage(`Feedback is required to ${status === "Rejected" ? "reject" : "request changes"}.`, true);
      return;
    }
    setReviewing(true);
    showMessage("");
    try {
      const result = await requestJson(`/api/submissions/${encodeURIComponent(selectedSubmission.id)}/review`, {
        method: "PATCH",
        body: JSON.stringify({ status, feedback }),
      });
      updateSubmission(result.submission);
      showMessage(`Submission marked ${status.toLowerCase()}.`);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "The review could not be saved.", true);
    } finally {
      setReviewing(false);
    }
  }

  async function saveFeedback(event) {
    event.preventDefault();
    if (!selectedSubmission || !reviewFeedback.trim()) {
      showMessage("Enter feedback before saving.", true);
      return;
    }
    setReviewing(true);
    showMessage("");
    try {
      const result = await requestJson(`/api/submissions/${encodeURIComponent(selectedSubmission.id)}/feedback`, {
        method: "PATCH",
        body: JSON.stringify({ feedback: reviewFeedback.trim() }),
      });
      updateSubmission(result.submission);
      showMessage("Feedback saved.");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Feedback could not be saved.", true);
    } finally {
      setReviewing(false);
    }
  }

  return (
    <div className="approvals-page">
      <header className="management-page-header">
        <div>
          <p className="page-eyebrow">Review and feedback</p>
          <h1>Approvals</h1>
          <p>View and review submissions from everyone in your organization.</p>
        </div>
        <label className="management-filter">
          Status
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="">All statuses</option>
            {reviewStatuses.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
      </header>

      <section className="management-card approval-team-filter">
        <label className="management-filter" htmlFor="approval-team">
          Team
          <select
            id="approval-team"
            value={selectedTeamId}
            onChange={(event) => setSelectedTeamId(event.target.value)}
            disabled={teamsLoading || !teams.length}
          >
            {!teams.length && <option value="">No teams available</option>}
            <option value="">All teams</option>
            {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </label>
        <p>The history shows every team by default. Choose a team to filter it; the submit-work form has its own team selector.</p>
        <button type="button" className="management-text-button" onClick={() => setTeamDataVersion((version) => version + 1)} disabled={teamsLoading}>Refresh team tasks</button>
        {teamTasksError && (
          <p className="management-feedback is-error" role="alert">
            {teamTasksError}{" "}
            <button type="button" className="management-text-button" onClick={() => setTeamDataVersion((version) => version + 1)}>
              Retry
            </button>
          </p>
        )}
      </section>

      {feedbackMessage && <p className={`management-feedback${feedbackIsError ? " is-error" : ""}`} role={feedbackIsError ? "alert" : "status"}>{feedbackMessage}</p>}
      {directoryError && <p className="management-feedback is-error" role="alert">{directoryError}</p>}

      <section className="approval-stats" aria-label="Task and review statistics">
        <article className="management-card approval-stat"><span>Team tasks</span><strong>{reviewCounts.tasks}</strong><small>Created in this workspace</small></article>
        <article className="management-card approval-stat"><span>Awaiting review</span><strong>{reviewCounts.awaiting}</strong><small>Submitted or under review</small></article>
        <article className="management-card approval-stat"><span>Approved</span><strong>{reviewCounts.approved}</strong><small>Final approved submissions</small></article>
        <article className="management-card approval-stat"><span>Rejected</span><strong>{reviewCounts.rejected}</strong><small>Final rejected submissions</small></article>
      </section>

      <section className="management-card approval-task-tracking">
        <div className="management-card-heading"><div><h2>{selectedTeam ? `${selectedTeam.name} task tracking` : "Team task tracking"}</h2><p>Newly created tasks appear here. A submission is recorded after the assignee completes the task and sends it for review.</p></div></div>
        {teamsLoading ? <p className="management-state" role="status">Loading team tasks…</p> : visibleTasks.length ? (
          <ul className="approval-task-list">
            {visibleTasks.map((task) => {
              const submission = submissionsByTask.get(task.id);
              return <li key={task.id}>
                <div><strong>{task.title}</strong><small>{teams.find((team) => team.id === task.teamId)?.name || task.team || "Team"} · {memberById.get(task.assignee)?.name || "Assigned member unavailable"}</small></div>
                <span className="approval-task-progress">{task.status || "To do"}</span>
                <span className={statusClass(submission?.status || "Not submitted")}>{submission?.status || "Not submitted"}</span>
              </li>;
            })}
          </ul>
        ) : <p className="management-state">No tasks have been created for this team yet.</p>}
      </section>

      <section className="management-card submission-create-card">
          <div className="management-card-heading">
            <div><h2>Submit work for review</h2><p>{submissionTeam ? `${submissionTeam.name}: ` : ""}select one of your completed tasks to send for review.</p></div>
          </div>
          {teamsLoading ? <p className="management-state" role="status">Loading team tasks…</p> : teams.length ? (
            <form className="submission-create-form" onSubmit={submitWork}>
              <label>
                Team
                <select
                  value={submissionTeamId}
                  onChange={(event) => setSubmissionTeamId(event.target.value)}
                  required
                >
                  {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </label>
              {readyTasks.length ? <>
                <label>
                  Completed task
                  <select name="taskId" required>
                    {readyTasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                  </select>
                </label>
                <label>
                  Submission notes
                  <textarea name="description" rows="3" maxLength="5000" required placeholder="Summarize what you completed and anything the reviewer should know." />
                </label>
                <label>
                  Attach files <span className="management-optional">(optional, up to 5 files / 10 MB each)</span>
                  <input type="file" multiple onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))} />
                </label>
                {selectedFiles.length > 0 && <p className="management-field-hint">{selectedFiles.length} file(s) selected.</p>}
                <button type="submit" className="management-primary-button" disabled={submitting}>{submitting ? "Submitting…" : "Send task for review"}</button>
              </> : (
                <p className="management-state">
                  {teamTasksError
                    ? "Task options are unavailable until the team tasks load."
                    : "No completed tasks assigned to you are ready to submit in this team. Complete one of your tasks from the Team page first; it will appear here."}
                </p>
              )}
            </form>
          ) : <p className="management-state">No teams are available for this organization.</p>}
      </section>

      <div className="approvals-workspace">
        <section className="management-card approvals-queue" aria-labelledby="submission-queue-title">
          <div className="management-card-heading">
            <div><h2 id="submission-queue-title">{selectedTeam ? `${selectedTeam.name} submission history` : "Organization approval queue"}</h2><p>{visibleSubmissions.length} submission(s)</p></div>
            <button type="button" className="management-text-button" onClick={loadSubmissions} disabled={loading}>Refresh</button>
          </div>
          {loading ? <p className="management-state" role="status">Loading submissions…</p> : submissionError ? (
            <div className="management-state management-state-error" role="alert"><span>{submissionError}</span><button type="button" className="management-text-button" onClick={loadSubmissions}>Retry</button></div>
          ) : visibleSubmissions.length ? (
            <ul className="approval-submission-list">
              {visibleSubmissions.map((submission) => {
                const task = submission.task || taskById.get(submission.taskId);
                const submitter = memberById.get(submission.submittedBy);
                const teamName = teams.find((team) => team.id === task?.teamId)?.name || task?.team;
                return (
                  <li key={submission.id}>
                    <button className={`approval-submission-button${selectedId === submission.id ? " is-selected" : ""}`} type="button" onClick={() => setSelectedId(submission.id)}>
                      <span className="approval-submission-top"><strong>{task?.title || `Task ${submission.taskId}`}</strong><span className={statusClass(submission.status)}>{submission.status}</span></span>
                      <small>{submitter?.name || "Workspace member"}{teamName ? ` · ${teamName}` : ""} · {formatDate(submission.updatedAt || submission.createdAt)}</small>
                      <span className="approval-submission-preview">{submission.description}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : <p className="management-state">
            {selectedTeam
              ? `No previous submissions for ${selectedTeam.name} yet.`
              : "No submissions have been sent for review in this organization yet."}
          </p>}
        </section>

        <section className="management-card approval-detail" aria-labelledby="submission-detail-title">
          {detailLoading ? <p className="management-state" role="status">Loading submission…</p> : !selectedSubmission ? (
            <div className="approval-detail-empty"><h2 id="submission-detail-title">Select a submission</h2><p>Choose an item from the list to view its details and activity.</p></div>
          ) : (
            <>
              <div className="approval-detail-header">
                <div>
                  <p className="page-eyebrow">Task {selectedSubmission.taskId}</p>
                  <h2 id="submission-detail-title">{selectedTask?.title || "Task submission"}</h2>
                  <p>{memberById.get(selectedSubmission.submittedBy)?.name || "Workspace member"} · Submitted {formatDate(selectedSubmission.createdAt)}</p>
                </div>
                <span className={statusClass(selectedSubmission.status)}>{selectedSubmission.status}</span>
              </div>

              {canReview && ["Submitted", "Under review"].includes(selectedSubmission.status) && (
                <section className="approval-detail-section approval-review-tools">
                  <h3>Review this submission</h3>
                  <form className="management-form" onSubmit={saveFeedback}>
                    <label>Review note<textarea rows="3" maxLength="5000" value={reviewFeedback} onChange={(event) => setReviewFeedback(event.target.value)} placeholder="Add a note for the submitter. A note is required to request changes or reject." /></label>
                    <div className="approval-action-buttons">
                      {selectedSubmission.status === "Submitted" && <button type="button" className="management-secondary-button" disabled={reviewing} onClick={() => submitReview("Under review")}>Start review</button>}
                      <button type="submit" className="management-secondary-button" disabled={reviewing || !reviewFeedback.trim()}>Save note</button>
                      <button type="button" className="management-warning-button" disabled={reviewing} onClick={() => submitReview("Revision requested")}>Request changes</button>
                      <button type="button" className="management-primary-button" disabled={reviewing} onClick={() => submitReview("Approved")}>Approve</button>
                      <button type="button" className="management-danger-button" disabled={reviewing} onClick={() => submitReview("Rejected")}>Reject</button>
                    </div>
                  </form>
                </section>
              )}

              <section className="approval-meta-grid" aria-label="Task details">
                <div><small>Team</small><strong>{teams.find((team) => team.id === selectedTask?.teamId)?.name || selectedTask?.team || "Team unavailable"}</strong></div>
                <div><small>Assignee</small><strong>{memberById.get(selectedTask?.assignee)?.name || "Unassigned"}</strong></div>
                <div><small>Due date</small><strong>{selectedTask?.dueDate ? formatDueDate(selectedTask.dueDate) : "No due date"}</strong></div>
              </section>

              <section className="approval-detail-section">
                <h3>Submission notes</h3>
                <p className="approval-submission-description">{selectedSubmission.description}</p>
              </section>

              <section className="approval-detail-section">
                <div className="approval-section-heading"><h3>Attached files</h3><span>{selectedSubmission.files?.length || 0}</span></div>
                {selectedSubmission.files?.length ? (
                  <ul className="approval-file-list">
                    {selectedSubmission.files.map((file) => (
                      <li key={file.id}>
                        <span className="approval-file-icon" aria-hidden="true">↧</span>
                        <span><strong>{file.originalName}</strong><small>{formatSize(file.size)}</small></span>
                        <a href={`/api/submissions/${encodeURIComponent(selectedSubmission.id)}/files/${encodeURIComponent(file.id)}`} download={file.originalName}>Download</a>
                      </li>
                    ))}
                  </ul>
                ) : <p className="management-state">No files attached.</p>}
                {isSubmitter && selectedSubmission.status === "Submitted" && (selectedSubmission.files?.length || 0) < 5 && (
                  <label className="approval-upload-more">Add files<input type="file" multiple disabled={submitting} onChange={uploadMoreFiles} /></label>
                )}
              </section>

              <section className="approval-detail-section">
                <div className="approval-section-heading"><h3>Activity</h3><span>{selectedActivity.length} update(s)</span></div>
                {selectedActivity.length ? (
                  <ol className="approval-activity-list">
                    {selectedActivity.map((activity) => (
                      <li key={activity.id}>
                        <div className="approval-activity-heading">
                          <strong>{memberById.get(activity.actorId)?.name || "Workspace member"} {activityLabel(activity.action)}</strong>
                          <time>{formatDate(activity.createdAt)}</time>
                        </div>
                        {activity.note && <p>{activity.note}</p>}
                      </li>
                    ))}
                  </ol>
                ) : <p className="management-state">No activity recorded yet.</p>}
              </section>

              {selectedSubmission.feedback && (
                <section className="approval-feedback-box">
                  <h3>Reviewer feedback</h3>
                  <p>{selectedSubmission.feedback}</p>
                </section>
              )}

              {selectedSubmission.status === "Revision requested" && isSubmitter && <p className="approval-revision-note">Your reviewer requested a revision. Update the completed work and submit a new version above.</p>}

              <section className="approval-detail-section">
                <div className="approval-section-heading"><h3>Comments</h3><span>{selectedSubmission.comments?.length || 0}</span></div>
                {selectedSubmission.comments?.length ? (
                  <div className="approval-comments">
                    {selectedSubmission.comments.map((comment) => (
                      <article className="approval-comment" key={comment.id}>
                        <span className="approval-comment-avatar">{(memberById.get(comment.authorId)?.name || "M").slice(0, 1).toUpperCase()}</span>
                        <div><div className="approval-comment-meta"><strong>{memberById.get(comment.authorId)?.name || "Workspace member"}</strong><time>{formatDate(comment.createdAt)}</time></div><p>{comment.text}</p></div>
                      </article>
                    ))}
                  </div>
                ) : <p className="management-state">No comments yet.</p>}
                <form className="approval-comment-form" onSubmit={addComment}>
                  <label htmlFor="approval-comment">Add a comment</label>
                  <textarea id="approval-comment" value={commentText} onChange={(event) => setCommentText(event.target.value)} rows="3" maxLength="2000" required placeholder="Write feedback for the team…" />
                  <button type="submit" className="management-primary-button" disabled={reviewing || !commentText.trim()}>Send comment</button>
                </form>
              </section>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default ApprovalsPage;
