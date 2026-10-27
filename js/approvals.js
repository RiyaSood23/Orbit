const statusElement = document.querySelector("#task-status");
const activityList = document.querySelector("#activity-list");
const commentForm = document.querySelector("#comment-form");
const commentInput = document.querySelector("#comment-input");
const conversation = document.querySelector("#conversation");
const commentCount = document.querySelector("#comment-count");

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

document.querySelector("#approve-button").addEventListener("click", () => {
  updateStatus("Approved", "status-approved", "Task was approved");
});

document.querySelector("#changes-button").addEventListener("click", () => {
  updateStatus("Changes requested", "status-changes", "Changes were requested");
  commentInput.focus();
  commentInput.placeholder = "Explain what should be changed...";
});

document.querySelector("#reject-button").addEventListener("click", () => {
  updateStatus("Rejected", "status-rejected", "Task was rejected");
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

  const message = document.createElement("article");
  message.className = "message";
  message.innerHTML = `
    <span class="avatar avatar-blue">RS</span>
    <div><div class="message-meta"><strong>Riya Sood</strong><time>Just now</time></div><p></p></div>
  `;
  message.querySelector("p").textContent = text;
  conversation.append(message);
  commentInput.value = "";
  commentCount.textContent = `${conversation.children.length} messages`;
});