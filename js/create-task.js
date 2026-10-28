const taskForm = document.querySelector("#task-form");
const formFeedback = document.querySelector("#form-feedback");
const taskSubmitButton = taskForm.querySelector('button[type="submit"]');
const userAvatar = document.querySelector("#user-avatar");
const dueDateInput = document.querySelector("#due-date");
const teamInput = document.querySelector("#team");
const assigneeInput = document.querySelector("#assignee");
const memberHint = document.querySelector("#member-hint");
const taskPreviewDialog = document.querySelector("#task-preview-dialog");
const assignTaskButton = document.querySelector("#assign-task-button");
const teamMembers = {
  Design: ["Arjun Mehta", "Nisha Kapoor"],
  Product: ["Riya Sood"],
};

function showTaskFeedback(message, isError = false) {
  formFeedback.textContent = message;
  formFeedback.classList.toggle("is-visible", Boolean(message));
  formFeedback.classList.toggle("is-error", isError);
  formFeedback.setAttribute("role", isError ? "alert" : "status");
}

function setUserDetails(user) {
  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
  userAvatar.textContent = initials;
  userAvatar.setAttribute("aria-label", `Signed in as ${user.name}`);
}

async function getSession() {
  const response = await fetch("/api/auth/session", { credentials: "same-origin" });
  if (response.status === 401) {
    window.location.replace("index.html");
    return null;
  }
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "Could not verify your session.");
  }
  if (!result.user) {
    window.location.replace("index.html");
    return null;
  }
  return result.user;
}

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function updateTeamMembers() {
  const members = teamMembers[teamInput.value] || [];
  assigneeInput.replaceChildren(new Option(members.length ? "Select a team member" : "Select a team first", ""));
  assigneeInput.disabled = members.length === 0;
  assigneeInput.required = true;
  memberHint.textContent = members.length
    ? "Choose a member from the selected team."
    : "Choose a team to see its members.";
  for (const member of members) {
    assigneeInput.add(new Option(member, member));
  }
}

function formattedDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date(year, month - 1, day));
}

function showTaskPreview(task) {
  document.querySelector("#preview-task-title").textContent = task.title;
  document.querySelector("#preview-team").textContent = task.team;
  document.querySelector("#preview-assignee").textContent = task.assignee;
  document.querySelector("#preview-points").textContent = `${task.contributionPoints} pts`;
  document.querySelector("#preview-project").textContent = task.project || "No project";
  document.querySelector("#preview-deadline").textContent = formattedDate(task.dueDate);
  document.querySelector("#preview-priority").textContent = task.priority;
  document.querySelector("#preview-priority-detail").textContent = task.priority;
  document.querySelector("#preview-description").textContent = task.description;
  taskPreviewDialog.showModal();
}

teamInput.addEventListener("change", updateTeamMembers);
updateTeamMembers();
dueDateInput.min = localDateString(new Date());

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!taskForm.reportValidity()) {
    return;
  }

  showTaskFeedback("");
  const formData = new FormData(taskForm);
  const task = Object.fromEntries(formData.entries());
  showTaskPreview(task);
});

document.querySelector("#edit-task-button").addEventListener("click", () => {
  taskPreviewDialog.close();
});

assignTaskButton.addEventListener("click", async () => {
  if (!taskForm.reportValidity()) {
    taskPreviewDialog.close();
    return;
  }

  assignTaskButton.disabled = true;
  taskSubmitButton.disabled = true;
  const task = Object.fromEntries(new FormData(taskForm).entries());
  try {
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(task),
    });
    const result = await response.json();
    if (response.status === 401) {
      window.location.replace("index.html");
      return;
    }
    if (!response.ok) {
      throw new Error(result.error || "The task could not be created.");
    }

    taskPreviewDialog.close();
    taskForm.reset();
    updateTeamMembers();
    showTaskFeedback(`“${result.task.title}” has been assigned to ${result.task.assignee} in ${result.task.team}.`);
  } catch (error) {
    taskPreviewDialog.close();
    showTaskFeedback(error instanceof Error ? error.message : "The task could not be created.", true);
  } finally {
    taskSubmitButton.disabled = false;
    assignTaskButton.disabled = false;
  }
});

taskForm.addEventListener("reset", () => {
  showTaskFeedback("");
  window.setTimeout(updateTeamMembers, 0);
});

getSession()
  .then((user) => {
    if (user) {
      setUserDetails(user);
    }
  })
  .catch((error) => {
    showTaskFeedback(error instanceof Error ? error.message : "Could not verify your session.", true);
  });