const statusElement = document.querySelector("#task-status");
const activityList = document.querySelector("#activity-list");
const commentForm = document.querySelector("#comment-form");
const commentInput = document.querySelector("#comment-input");
const conversation = document.querySelector("#conversation");
const commentCount = document.querySelector("#comment-count");
const changesDialog = document.querySelector("#changes-dialog");
const rejectDialog = document.querySelector("#reject-dialog");
const changesForm = document.querySelector("#changes-form");
const rejectForm = document.querySelector("#reject-form");
const leadReviewDialog = document.querySelector("#lead-review-dialog");
const leadReviewForm = document.querySelector("#lead-review-form");
const roleSelect = document.querySelector("#role-select");
const leadOnlyControls = document.querySelectorAll(".lead-only");
const toolbarLabel = document.querySelector("#toolbar-label");
const leadReviewButton = document.querySelector("#lead-review-button");

function updateStatus(status, className, activityText) {
  statusElement.textContent = status;
  statusElement.className = `status ${className}`;

  const activity = document.createElement("li");
  activity.innerHTML = `
    <span class="timeline-dot dot-green"></span>
    <div><strong>${activityText}</strong><time>Just now</time><p>This demo update is visible locally for the current session.</p></div>
  `;
  activityList.prepend(activity);
}

function addFeedbackMessage(text) {
  const message = document.createElement("article");
  message.className = "message";
  message.innerHTML = `
    <span class="avatar avatar-blue">V</span>
    <div><div class="message-meta"><strong>Rohan Kapoor</strong><time>Just now</time></div><p></p></div>
  `;
  message.querySelector("p").textContent = text;
  conversation.append(message);
  commentCount.textContent = `${conversation.children.length} messages`;
}

function openReviewDialog(dialog) {
  dialog.showModal();
  dialog.querySelector("textarea").focus();
}

function closeReviewDialog(dialog) {
  dialog.close();
  dialog.querySelector("form").reset();
  dialog.querySelector(".dialog-error").textContent = "";
}

function updateRole() {
  const isTeamLead = roleSelect.value === "team-lead";
  leadOnlyControls.forEach((control) => {
    control.hidden = !isTeamLead;
  });
  leadReviewButton.hidden = isTeamLead;
  toolbarLabel.textContent = isTeamLead ? "Lead actions" : "Reviewer actions";
}

document.querySelector("#approve-button").addEventListener("click", () => {
  updateStatus("Approved", "status-approved", "Task was approved");
});

document.querySelector("#changes-button").addEventListener("click", () => {
  openReviewDialog(changesDialog);
});

document.querySelector("#reject-button").addEventListener("click", () => {
  openReviewDialog(rejectDialog);
});

leadReviewButton.addEventListener("click", () => {
  openReviewDialog(leadReviewDialog);
});

document.querySelector("#submission-link").addEventListener("click", (event) => {
  event.preventDefault();
  window.alert("Demo placeholder: no file is attached to this prototype.");
});

commentForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = commentInput.value.trim();
  if (!text) {
    return;
  }

  addFeedbackMessage(text);
  commentInput.value = "";
});

changesForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const feedback = document.querySelector("#changes-feedback").value.trim();
  if (!feedback) {
    document.querySelector("#changes-error").textContent = "Please describe the changes required.";
    return;
  }

  updateStatus("Changes requested", "status-changes", "Changes were requested");
  addFeedbackMessage(`Changes requested: ${feedback}`);
  closeReviewDialog(changesDialog);
});

rejectForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const feedback = document.querySelector("#reject-feedback").value.trim();
  if (!feedback) {
    document.querySelector("#reject-error").textContent = "Please provide a reason for rejecting this task.";
    return;
  }

  updateStatus("Rejected", "status-rejected", "Task was rejected");
  addFeedbackMessage(`Task rejected: ${feedback}`);
  closeReviewDialog(rejectDialog);
});

leadReviewForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const feedback = document.querySelector("#lead-review-feedback").value.trim();
  if (!feedback) {
    document.querySelector("#lead-review-error").textContent = "Please write a review request for Aarav.";
    return;
  }

  addFeedbackMessage(`Review request sent to Aarav: ${feedback}`);
  const activity = document.createElement("li");
  activity.innerHTML = `<span class="timeline-dot dot-purple"></span><div><strong>Rohan Kapoor asked Aarav to review the entire task</strong><time>Just now</time><p></p></div>`;
  activity.querySelector("p").textContent = feedback;
  activityList.prepend(activity);
  closeReviewDialog(leadReviewDialog);
});

document.querySelectorAll("[data-close-dialog], .dialog-close").forEach((button) => {
  button.addEventListener("click", () => {
    closeReviewDialog(button.closest("dialog"));
  });
});

document.querySelectorAll(".review-dialog").forEach((dialog) => {
  dialog.addEventListener("cancel", () => {
    dialog.querySelector("form").reset();
    dialog.querySelector(".dialog-error").textContent = "";
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      closeReviewDialog(dialog);
    }
  });
});

roleSelect.addEventListener("change", updateRole);
updateRole();