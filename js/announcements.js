const announcementList = document.querySelector("#announcement-list");
const announcementFeedback = document.querySelector("#announcement-feedback");
const priorityFilter = document.querySelector("#priority-filter");
const announcementForm = document.querySelector("#announcement-form");
const announcementFormCard = document.querySelector("#announcement-form-card");
const announcementFormHeading = document.querySelector("#announcement-form-heading");
const announcementTitle = document.querySelector("#announcement-title");
const announcementPriority = document.querySelector("#announcement-priority");
const announcementMessage = document.querySelector("#announcement-message");
const cancelAnnouncementEdit = document.querySelector("#cancel-announcement-edit");
const pageLabel = document.querySelector("#page-label");
const previousPageButton = document.querySelector("#previous-page");
const nextPageButton = document.querySelector("#next-page");

const pageSize = 10;
let page = 1;
let totalPages = 1;
let editingId = null;

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
  announcementFeedback.textContent = message;
  announcementFeedback.classList.toggle("is-error", Boolean(message) && isError);
  announcementFeedback.classList.toggle("is-success", Boolean(message) && !isError);
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function renderAnnouncements(announcements) {
  announcementList.replaceChildren();
  if (!announcements.length) {
    announcementList.append(makeElement("li", "empty-state", "No announcements match this filter."));
    return;
  }
  for (const announcement of announcements) {
    const item = makeElement("li", "record-item announcement-record");
    const detail = makeElement("div", "record-item-copy");
    const meta = makeElement("span", "record-meta", `${announcement.priority || "Normal"} · ${formatDate(announcement.createdAt)}`);
    const message = makeElement("p", "announcement-message", announcement.message || announcement.content || "");
    message.style.whiteSpace = "pre-wrap";
    detail.append(
      makeElement("strong", "", announcement.title),
      meta,
      message
    );
    item.append(detail);
    const actions = makeElement("div", "record-actions");
    const editButton = makeElement("button", "button button-secondary button-small", "Edit");
    editButton.type = "button";
    editButton.addEventListener("click", () => beginEdit(announcement));
    const deleteButton = makeElement("button", "button button-danger button-small", "Delete");
    deleteButton.type = "button";
    deleteButton.addEventListener("click", () => void deleteAnnouncement(announcement));
    actions.append(editButton, deleteButton);
    item.append(actions);
    announcementList.append(item);
  }
}

async function loadAnnouncements() {
  showFeedback("");
  announcementList.replaceChildren(makeElement("li", "empty-state", "Loading announcements…"));
  const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
  if (priorityFilter.value) params.set("priority", priorityFilter.value);
  try {
    const result = await apiRequest(`/api/announcements?${params.toString()}`);
    renderAnnouncements(result.announcements || []);
    totalPages = Math.max(1, result.pagination?.pages || 1);
    page = result.pagination?.page || page;
    pageLabel.textContent = `Page ${page} of ${totalPages}`;
    previousPageButton.disabled = page <= 1;
    nextPageButton.disabled = page >= totalPages;
    return true;
  } catch (error) {
    announcementList.replaceChildren(makeElement("li", "empty-state", "Announcements could not be loaded."));
    showFeedback(error instanceof Error ? error.message : "Could not load announcements.");
    return false;
  }
}

function resetForm() {
  editingId = null;
  announcementForm.reset();
  announcementPriority.value = "Normal";
  announcementFormHeading.textContent = "Create announcement";
  announcementForm.querySelector('button[type="submit"]').textContent = "Publish announcement";
  cancelAnnouncementEdit.hidden = true;
}

function beginEdit(announcement) {
  editingId = announcement.id;
  announcementTitle.value = announcement.title || "";
  announcementPriority.value = announcement.priority || "Normal";
  announcementMessage.value = announcement.message || announcement.content || "";
  announcementFormHeading.textContent = "Edit announcement";
  announcementForm.querySelector('button[type="submit"]').textContent = "Save changes";
  cancelAnnouncementEdit.hidden = false;
  announcementFormCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

announcementForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!announcementForm.reportValidity()) return;
  const submitButton = announcementForm.querySelector('button[type="submit"]');
  const isEditing = Boolean(editingId);
  submitButton.disabled = true;
  showFeedback("");
  try {
    const payload = {
      title: announcementTitle.value.trim(),
      message: announcementMessage.value.trim(),
      priority: announcementPriority.value,
    };
    await apiRequest(
      editingId ? `/api/announcements/${encodeURIComponent(editingId)}` : "/api/announcements",
      {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      }
    );
    resetForm();
    page = 1;
    if (await loadAnnouncements()) {
      showFeedback(isEditing ? "Announcement updated." : "Announcement published.", false);
    } else {
      showFeedback("Announcement saved, but the list could not be refreshed.");
    }
  } catch (error) {
    showFeedback(error instanceof Error ? error.message : "Could not save this announcement.");
  } finally {
    submitButton.disabled = false;
  }
});

cancelAnnouncementEdit.addEventListener("click", resetForm);

async function deleteAnnouncement(announcement) {
  if (!window.confirm(`Delete "${announcement.title}"?`)) return;
  try {
    await apiRequest(`/api/announcements/${encodeURIComponent(announcement.id)}`, { method: "DELETE" });
    if (page > 1) page -= 1;
    if (await loadAnnouncements()) showFeedback("Announcement deleted.", false);
  } catch (error) {
    showFeedback(error instanceof Error ? error.message : "Could not delete this announcement.");
  }
}

priorityFilter.addEventListener("change", () => {
  page = 1;
  void loadAnnouncements();
});
previousPageButton.addEventListener("click", () => {
  if (page > 1) {
    page -= 1;
    void loadAnnouncements();
  }
});
nextPageButton.addEventListener("click", () => {
  if (page < totalPages) {
    page += 1;
    void loadAnnouncements();
  }
});

async function initialize() {
  announcementFormCard.hidden = true;
  try {
    const session = await apiRequest("/api/auth/session");
    if (!session.user) {
      window.location.replace("index.html");
      return;
    }
    announcementFormCard.hidden = false;
    await loadAnnouncements();
  } catch (error) {
    announcementList.replaceChildren(makeElement("li", "empty-state", "Announcements could not be loaded."));
    showFeedback(error instanceof Error ? error.message : "Could not verify your session.");
  }
}

void initialize();
