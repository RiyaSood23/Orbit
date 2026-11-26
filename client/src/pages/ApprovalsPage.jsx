import { useCallback, useEffect, useMemo, useState } from "react";
import { requestJson } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import Modal from "../components/Modal.jsx";

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function reviewStatusClass(status) {
  const classes = {
    Submitted: "status-pending",
    "Under review": "status-reviewing",
    "Revision requested": "status-changes",
    Approved: "status-approved",
    Rejected: "status-rejected",
  };
  return `review-status ${classes[status] || "status-pending"}`;
}

function reviewStatusLabel(status) {
  if (status === "Submitted") return "Pending review";
  if (status === "Revision requested") return "Changes requested";
  return status || "Pending review";
}

function initials(name) {
  return String(name || "Member")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

function ApprovalsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [submissions, setSubmissions] = useState([]);
  const [allSubmissions, setAllSubmissions] = useState([]);
  const [adminTasks, setAdminTasks] = useState([]);
  const [adminQueueError, setAdminQueueError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [members, setMembers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [teamTasks, setTeamTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const [directoryError, setDirectoryError] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackIsError, setFeedbackIsError] = useState(false);
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [commentText, setCommentText] = useState("");
  const [reviewDialog, setReviewDialog] = useState("");
  const [dialogFeedback, setDialogFeedback] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    setSubmissionError("");
    try {
      const result = await requestJson("/api/submissions");
      const allRecords = result.submissions || [];
      setAllSubmissions(allRecords);
      setSubmissions(allRecords);
      setSelectedId((current) => allRecords.some((item) => item.id === current) ? current : allRecords[0]?.id || "");
      if (isAdmin) {
        try {
          const queue = await requestJson("/api/submissions/queue");
          setAdminTasks(queue.tasks || []);
          setAdminQueueError("");
        } catch (error) {
          setAdminTasks([]);
          setAdminQueueError(error instanceof Error ? error.message : "The task queue could not be loaded.");
        }
      } else {
        setAdminTasks([]);
        setAdminQueueError("");
      }
      return true;
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "Submissions could not be loaded.");
      setSubmissions([]);
      setAllSubmissions([]);
      setSelectedId("");
      setAdminTasks([]);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  useEffect(() => {
    let active = true;
    Promise.allSettled([requestJson("/api/members"), requestJson("/api/teams")]).then(async (results) => {
      if (!active) return;
      if (results[0].status === "fulfilled") setMembers(results[0].value.users || []);
      else setDirectoryError(results[0].reason instanceof Error ? results[0].reason.message : "Member details could not be loaded.");
      if (results[1].status !== "fulfilled") return;
      const loadedTeams = results[1].value.teams || [];
      setTeams(loadedTeams);
      const dashboards = await Promise.allSettled(loadedTeams.map((team) =>
        requestJson(`/api/teams/${encodeURIComponent(team.id)}/dashboard`)
      ));
      if (active) {
        setTeamTasks(dashboards.flatMap((result) => result.status === "fulfilled" ? result.value.tasks || [] : []));
      }
    });
    return () => {
      active = false;
    };
  }, []);

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
  const taskById = useMemo(
    () => new Map([...teamTasks, ...adminTasks].map((task) => [task.id, task])),
    [adminTasks, teamTasks]
  );
  const canReview = Boolean(isAdmin && selectedSubmission && selectedSubmission.submittedBy !== user?.id);
  const isSubmitter = Boolean(selectedSubmission && selectedSubmission.submittedBy === user?.id);
  const selectedTask = selectedSubmission ? taskById.get(selectedSubmission.taskId) : null;
  const selectedTeam = selectedTask ? teams.find((team) => team.id === selectedTask.teamId) : null;
  const canDownloadFiles = Boolean(selectedTask && (
    ["manager", "admin"].includes(user?.role || "member")
    || selectedTask.assignee === user?.id
    || selectedTeam?.leaderId === user?.id
    || selectedTeam?.members?.some((member) => member.userId === user?.id)
  ));
  const teamLead = selectedTeam ? memberById.get(selectedTeam.leaderId) : null;
  const canAskLead = Boolean(canReview && teamLead && teamLead.id !== user?.id);
  const submitter = selectedSubmission ? memberById.get(selectedSubmission.submittedBy) : null;
  const reviewer = selectedSubmission?.reviewedBy ? memberById.get(selectedSubmission.reviewedBy) : null;
  const collaborators = [
    selectedTask?.assignee ? [memberById.get(selectedTask.assignee), "Assignee"] : [submitter, "Assignee"],
    [reviewer, "Reviewer"],
    [teamLead, "Lead"],
  ].filter(([member]) => member).filter(([member], index, list) =>
    list.findIndex(([other]) => other.id === member.id) === index
  );
  const activity = selectedSubmission ? [
    {
      id: "submitted",
      title: `${submitter?.name || "A team member"} submitted the work`,
      date: selectedSubmission.createdAt,
      description: selectedSubmission.description,
      dot: "dot-blue",
    },
    ...(selectedSubmission.reviewedAt || selectedSubmission.feedback ? [{
      id: "review",
      title: selectedSubmission.status === "Revision requested"
        ? "Changes were requested"
        : selectedSubmission.status === "Approved"
          ? "The submission was approved"
          : selectedSubmission.status === "Rejected"
            ? "The submission was rejected"
            : `${reviewer?.name || "A reviewer"} shared feedback`,
      date: selectedSubmission.reviewedAt || selectedSubmission.updatedAt,
      description: selectedSubmission.feedback || `Current status: ${selectedSubmission.status}.`,
      dot: selectedSubmission.status === "Approved" ? "dot-green" : "dot-purple",
    }] : []),
  ] : [];
  const existingByTask = new Map();
  for (const submission of [...allSubmissions].sort(
    (left, right) => new Date(right.createdAt) - new Date(left.createdAt)
  )) {
    if (!existingByTask.has(submission.taskId)) existingByTask.set(submission.taskId, submission);
  }
  const latestSubmissionByTask = existingByTask;
  const readyTasks = teamTasks.filter((task) => {
    const team = teams.find((item) => item.id === task.teamId);
    const isTaskMember = task.assignee === user?.id
      || team?.leaderId === user?.id
      || team?.members?.some((member) => member.userId === user?.id);
    if (!isTaskMember || task.status !== "Completed") return false;
    const existing = existingByTask.get(task.id);
    return !existing || existing.status === "Revision requested";
  });

  function showMessage(message, isError = false) {
    setFeedbackMessage(message);
    setFeedbackIsError(isError);
  }

  function updateSubmission(submission) {
    setSelectedSubmission(submission);
    setReviewFeedback(submission.feedback || "");
    setSubmissions((current) => {
      const found = current.some((item) => item.id === submission.id);
      return found
        ? current.map((item) => item.id === submission.id ? submission : item)
        : [submission, ...current];
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
          refreshed ? "Your work was submitted for admin review." : "Submission created, but the list could not be refreshed.",
          !refreshed,
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

  async function deleteComment(commentId) {
    if (!selectedSubmission) return;
    setReviewing(true);
    showMessage("");
    try {
      const result = await requestJson(
        `/api/submissions/${encodeURIComponent(selectedSubmission.id)}/comments/${encodeURIComponent(commentId)}`,
        { method: "DELETE" }
      );
      updateSubmission(result.submission);
      showMessage("Comment deleted.");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "The comment could not be deleted.", true);
    } finally {
      setReviewing(false);
    }
  }

  function openReviewDialog(name) {
    setDialogFeedback(reviewFeedback);
    setReviewDialog(name);
  }

  async function submitReview(status, feedbackValue = dialogFeedback) {
    if (!selectedSubmission) return;
    const feedback = feedbackValue.trim();
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
      setReviewDialog("");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "The review could not be saved.", true);
    } finally {
      setReviewing(false);
    }
  }

  async function requestLeadReview(event) {
    event.preventDefault();
    const note = dialogFeedback.trim();
    if (!selectedSubmission || !note) {
      showMessage("Describe what the team lead should review.", true);
      return;
    }
    setReviewing(true);
    showMessage("");
    try {
      const result = await requestJson(`/api/submissions/${encodeURIComponent(selectedSubmission.id)}/comments`, {
        method: "POST",
        body: JSON.stringify({ text: `Lead review requested: ${note}` }),
      });
      updateSubmission(result.submission);
      setReviewDialog("");
      setDialogFeedback("");
      showMessage("Review request posted to the submission comments.");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "The review request could not be posted.", true);
    } finally {
      setReviewing(false);
    }
  }

  return (
    <div className="approvals-page approval-review-page">
      <header className="approval-page-header">
        <div>
          <p className="page-eyebrow">Workspace / Approvals</p>
          <h1>Review task</h1>
          <p>Check the submission and share feedback with your team.</p>
        </div>
        <div className="approval-current-user">
          <span>Viewing as</span>
          <strong>{user?.name || user?.email || "Member"}</strong>
          <small>{user?.role || "member"}</small>
        </div>
      </header>

      {isAdmin && (
        <section className="admin-task-queue" aria-labelledby="admin-task-queue-title">
          <div className="admin-task-queue-heading">
            <div>
              <h2 id="admin-task-queue-title">All tasks</h2>
              <p>Track task progress and open any submission sent for review.</p>
            </div>
            <span>{adminTasks.length} tasks</span>
          </div>
          {adminQueueError && <p className="management-feedback is-error" role="alert">{adminQueueError}</p>}
          {loading && <p className="management-state" role="status">Loading task queue…</p>}
          {!loading && !adminQueueError && !adminTasks.length && (
            <p className="management-state">There are no tasks in this workspace yet.</p>
          )}
          {adminTasks.length > 0 && (
            <div className="admin-task-table-scroll">
              <table className="admin-task-table">
                <thead>
                  <tr>
                    <th scope="col">Task</th>
                    <th scope="col">Team / assignee</th>
                    <th scope="col">Task status</th>
                    <th scope="col">Submission</th>
                    <th scope="col"><span className="visually-hidden">Action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {adminTasks.map((task) => {
                    const submission = latestSubmissionByTask.get(task.id);
                    const team = teams.find((item) => item.id === task.teamId);
                    const assignee = memberById.get(task.assignee);
                    return (
                      <tr key={task.id}>
                        <td>
                          <strong>{task.title || "Untitled task"}</strong>
                          <small>{task.id}</small>
                        </td>
                        <td>
                          <strong>{team?.name || task.team || "Unassigned team"}</strong>
                          <small>{assignee?.name || task.assignee || "Unassigned"}</small>
                        </td>
                        <td><span className="admin-task-status">{task.status || "Unknown"}</span></td>
                        <td>{submission ? reviewStatusLabel(submission.status) : "Not submitted"}</td>
                        <td>
                          {submission && (
                            <button
                              className="admin-task-review-button"
                              type="button"
                              onClick={() => setSelectedId(submission.id)}
                            >
                              {selectedId === submission.id ? "Selected" : "Review"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <div className="approval-submission-toolbar">
        <label className="approval-submission-picker">
          Select submission
          <select
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            disabled={!submissions.length}
          >
            {!submissions.length && <option value="">No submissions yet</option>}
            {submissions.map((submission) => (
              <option key={submission.id} value={submission.id}>
                {taskById.get(submission.taskId)?.title || `Task ${submission.taskId}`} — {reviewStatusLabel(submission.status)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="management-secondary-button" onClick={loadSubmissions} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {feedbackMessage && (
        <p className={`management-feedback${feedbackIsError ? " is-error" : ""}`} role={feedbackIsError ? "alert" : "status"}>
          {feedbackMessage}
        </p>
      )}
      {directoryError && <p className="management-feedback is-error" role="alert">{directoryError}</p>}

      {loading && <p className="management-state" role="status">Loading submissions…</p>}
      {!loading && submissionError && (
        <div className="management-state management-state-error" role="alert">
          <span>{submissionError}</span>
          <button type="button" className="management-text-button" onClick={loadSubmissions}>Retry</button>
        </div>
      )}
      {!loading && !submissionError && !selectedSubmission && (
        <section className="review-card approval-empty-state">
          <div className="task-heading">
            <div>
              <span className="review-status status-pending">No submission selected</span>
              <h2>Review task</h2>
              <p className="task-description">Completed work submitted by your team will appear here for comments and review.</p>
            </div>
          </div>
        </section>
      )}

      {selectedSubmission && (
        <section className="review-card" aria-labelledby="approval-task-title">
          <div className="action-toolbar">
            <span className="toolbar-label">{canReview ? "Admin review actions" : "Submission activity"}</span>
            <div className="action-buttons">
              {canReview && ["Submitted", "Under review"].includes(selectedSubmission.status) && (
                <>
                  <button className="button button-warning" type="button" onClick={() => openReviewDialog("changes")} disabled={reviewing}>Request Changes</button>
                  {canAskLead && <button className="button button-primary" type="button" onClick={() => openReviewDialog("lead")} disabled={reviewing}>Ask Lead to Review</button>}
                  <button className="button button-success" type="button" onClick={() => submitReview("Approved", "")} disabled={reviewing}>Approve</button>
                  <button className="button button-danger" type="button" onClick={() => openReviewDialog("reject")} disabled={reviewing}>Reject</button>
                </>
              )}
            </div>
          </div>

          <div className="task-heading">
            <div>
              <span className={reviewStatusClass(selectedSubmission.status)}>{reviewStatusLabel(selectedSubmission.status)}</span>
              <h2 id="approval-task-title">{selectedTask?.title || "Task submission"}</h2>
              <p className="task-description">{selectedTask?.description || selectedSubmission.description}</p>
            </div>
            <div className="task-code">{selectedTask?.id || selectedSubmission.taskId}</div>
          </div>

          <div className="task-details">
            <div><span className="detail-label">Assigned member</span><strong>{memberById.get(selectedTask?.assignee)?.name || submitter?.name || "Unknown"}</strong></div>
            <div><span className="detail-label">Due date</span><strong>{selectedTask?.dueDate ? formatDate(selectedTask.dueDate) : "Not set"}</strong></div>
            <div><span className="detail-label">Submitted</span><strong>{formatDate(selectedSubmission.createdAt)}</strong></div>
            <div className="approval-submission-files">
              <span className="detail-label">Submission</span>
              {selectedSubmission.files?.length ? selectedSubmission.files.map((file) => (
                canDownloadFiles ? (
                  <a
                    key={file.id}
                    className="submission-link"
                    href={`/api/submissions/${encodeURIComponent(selectedSubmission.id)}/files/${encodeURIComponent(file.id)}`}
                    download={file.originalName}
                  >
                    {file.originalName} <small>({formatSize(file.size)})</small>
                  </a>
                ) : (
                  <span key={file.id} className="submission-link">
                    {file.originalName} <small>({formatSize(file.size)})</small>
                  </span>
                )
              )) : <strong>No files attached</strong>}
              {isSubmitter && selectedSubmission.status === "Submitted" && (selectedSubmission.files?.length || 0) < 5 && (
                <label className="approval-upload-more">Add files<input type="file" multiple disabled={submitting} onChange={uploadMoreFiles} /></label>
              )}
            </div>
          </div>

          {selectedSubmission.feedback && (
            <div className="approval-formal-feedback">
              <strong>Review feedback</strong>
              <p>{selectedSubmission.feedback}</p>
            </div>
          )}

          <div className="workspace-grid">
            <section className="timeline-section" aria-labelledby="activity-title">
              <div className="section-heading">
                <h3 id="activity-title">Activity</h3>
                <span>Latest updates</span>
              </div>
              {detailLoading ? <p className="management-state" role="status">Loading activity…</p> : (
                <ol className="timeline">
                  {activity.map((item) => (
                    <li key={item.id}>
                      <span className={`timeline-dot ${item.dot}`} />
                      <div>
                        <strong>{item.title}</strong>
                        <time>{formatDate(item.date)}</time>
                        <p>{item.description}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="collaborators-section" aria-labelledby="collaborators-title">
              <div className="section-heading"><h3 id="collaborators-title">Collaborators</h3></div>
              {collaborators.length ? collaborators.map(([member, role]) => (
                <div className="collaborator" key={member.id}>
                  <span className="avatar avatar-green">{initials(member.name)}</span>
                  <div><strong>{member.name}</strong><span>{role}</span></div>
                </div>
              )) : <p className="management-state">Collaborator details are unavailable.</p>}
            </section>
          </div>

          {selectedSubmission.status === "Revision requested" && isSubmitter && (
            <p className="approval-revision-note">Your reviewer requested changes. Update the completed work and submit a new version above.</p>
          )}

          <section className="comments-section" aria-labelledby="comments-title">
            <div className="section-heading">
              <h3 id="comments-title">Comments and feedback</h3>
              <span>{selectedSubmission.comments?.length || 0} messages</span>
            </div>
            {selectedSubmission.comments?.length ? (
              <div className="conversation">
                {selectedSubmission.comments.map((comment) => {
                  const author = memberById.get(comment.authorId);
                  return (
                    <article className="message" key={comment.id}>
                      <span className="avatar avatar-blue">{initials(author?.name)}</span>
                      <div>
                        <div className="message-meta"><strong>{author?.name || "Workspace member"}</strong><time>{formatDate(comment.createdAt)}</time></div>
                        <p>{comment.text}</p>
                      </div>
                      {isAdmin && (
                        <button
                          className="comment-delete-button"
                          type="button"
                          onClick={() => deleteComment(comment.id)}
                          disabled={reviewing}
                          aria-label={`Delete comment from ${author?.name || "workspace member"}`}
                        >
                          Delete
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : <p className="management-state">No comments yet. Start the conversation with your team.</p>}
            <form className="comment-form" onSubmit={addComment}>
              <label htmlFor="approval-comment">Add a comment</label>
              <div className="comment-input-row">
                <textarea
                  id="approval-comment"
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  rows="2"
                  maxLength="2000"
                  required
                  placeholder="Write feedback for the team…"
                />
                <button className="button button-primary" type="submit" disabled={reviewing || !commentText.trim()}>
                  {reviewing ? "Sending…" : "Send Comment"}
                </button>
              </div>
            </form>
          </section>
        </section>
      )}

      {readyTasks.length > 0 && (
        <details className="submission-create-panel" open={!submissions.length}>
          <summary>Submit completed work ({readyTasks.length})</summary>
          <form className="submission-create-form" onSubmit={submitWork}>
            <label>
              Completed task
              <select name="taskId" required>
                {readyTasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
              </select>
            </label>
            <label>
              Submission notes
              <textarea name="description" rows="3" maxLength="5000" required placeholder="Describe the work you completed." />
            </label>
            <label>
              Attach files <span className="management-optional">(optional, up to 5 files / 10 MB each)</span>
              <input type="file" multiple onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))} />
            </label>
            {selectedFiles.length > 0 && <p className="management-field-hint">{selectedFiles.length} file(s) selected.</p>}
            <button type="submit" className="management-primary-button" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit for admin review"}
            </button>
          </form>
        </details>
      )}

      {reviewDialog && selectedSubmission && (
        <Modal
          open
          title={reviewDialog === "changes" ? "Request changes" : reviewDialog === "reject" ? "Reject task" : "Ask the team lead to review"}
          onClose={() => setReviewDialog("")}
          className="app-modal review-action-dialog"
        >
          <form
            className="management-form"
            onSubmit={reviewDialog === "lead"
              ? requestLeadReview
              : (event) => {
                event.preventDefault();
                submitReview(reviewDialog === "reject" ? "Rejected" : "Revision requested");
              }}
          >
            <p className="dialog-description">
              {reviewDialog === "changes"
                ? "Describe what the assignee needs to update before this task can be approved."
                : reviewDialog === "reject"
                  ? "Tell the assignee why this submission was rejected."
                  : `Write a review request for ${teamLead?.name || "the team lead"}.`}
            </p>
            <label>
              {reviewDialog === "changes" ? "Required changes" : reviewDialog === "reject" ? "Reason for rejection" : "Review request"}
              <textarea
                rows="5"
                maxLength="5000"
                value={dialogFeedback}
                onChange={(event) => setDialogFeedback(event.target.value)}
                required
                autoFocus
                placeholder="Write your feedback…"
              />
            </label>
            <div className="management-form-actions">
              <button type="button" className="management-secondary-button" onClick={() => setReviewDialog("")}>Cancel</button>
              <button type="submit" className={reviewDialog === "reject" ? "management-danger-button" : "management-primary-button"} disabled={reviewing}>
                {reviewing ? "Saving…" : reviewDialog === "changes" ? "Request Changes" : reviewDialog === "reject" ? "Reject Task" : "Send Review Request"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default ApprovalsPage;
