(function () {
  "use strict";

  const dashboardUrl = "/api/organisation/dashboard";
  const eventUrl = "/api/organisation/events";
  const announcementUrl = "/api/organisation/announcements";
  let chart = null;
  let dashboardData = null;
  let eventRecords = [];
  let announcementRecords = [];
  let editingEventId = null;
  let editingAnnouncementId = null;
  let toastTimer;

  async function apiRequest(url, options) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options && options.headers),
        ...(options && options.body ? { "Content-Type": "application/json" } : {}),
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

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function setState(container, message, isError) {
    const tag = container.matches("ul, ol") ? "li" : "p";
    container.replaceChildren(element(tag, "dashboard-state" + (isError ? " is-error" : ""), message));
  }

  function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 2800);
  }

  function formatDate(value, options) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "Date unavailable";
    return new Intl.DateTimeFormat(undefined, options || {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function setGreeting() {
    const greeting = document.getElementById("greeting-time");
    const hour = new Date().getHours();
    greeting.textContent = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  }

  async function loadSession() {
    const result = await apiRequest("/api/auth/session");
    if (!result.user) {
      window.location.replace("index.html");
      return false;
    }
    document.getElementById("user-name").textContent = result.user.name || "Member";
    return true;
  }

  function renderMetrics(stats) {
    const values = {
      totalTasks: stats.totalTasks,
      completedTasks: stats.completedTasks,
      pendingTasks: stats.pendingTasks,
      overdueTasks: stats.overdueTasks,
    };
    document.querySelectorAll(".stat-number[data-key]").forEach(function (counter) {
      counter.textContent = String(values[counter.dataset.key] || 0);
    });
    const completionRate = stats.totalTasks
      ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
      : 0;
    document.getElementById("productivity-score").textContent = completionRate + "%";
    document.getElementById("org-spotlight").textContent =
      stats.completedTasks + " of " + stats.totalTasks + " tasks completed · " +
      stats.pendingTasks + " incomplete · " + stats.overdueTasks + " overdue.";

    const total = stats.totalTasks || 1;
    const chartData = [
      stats.completedTasks,
      Math.max(0, stats.pendingTasks - stats.overdueTasks),
      stats.overdueTasks,
    ];
    document.querySelectorAll("#task-pipeline [data-key]").forEach(function (segment) {
      const key = segment.dataset.key;
      const value =       key === "completed" ? stats.completedTasks :
      key === "pending" ? Math.max(0, stats.pendingTasks - stats.overdueTasks) : stats.overdueTasks;
      segment.style.width = (value / total * 100) + "%";
    });

    if (typeof Chart !== "undefined") {
      const canvas = document.getElementById("completion-chart");
      if (!chart) {
        chart = new Chart(canvas, {
          type: "doughnut",
          data: {
            labels: ["Completed", "Incomplete", "Overdue"],
            datasets: [{
              data: chartData,
              backgroundColor: ["#5d9a7a", "#6aabcc", "#e57373"],
              borderWidth: 0,
              hoverOffset: 8,
            }],
          },
          options: {
            cutout: "74%",
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false } },
          },
        });
      } else {
        chart.data.datasets[0].data = chartData;
        chart.update();
      }
    }
    document.getElementById("chart-percent").textContent = completionRate + "%";
    document.getElementById("chart-center-caption").textContent = "Complete";
    document.getElementById("org-insight").textContent =
      "Task status across all teams · productivity is completed tasks divided by assigned tasks.";
    document.getElementById("dashboard-total-teams").textContent = String(stats.totalTeams || 0);
    document.getElementById("dashboard-total-members").textContent = String(stats.totalMembers || 0);
  }

  function renderTeams(teams) {
    const container = document.getElementById("teams-grid");
    container.replaceChildren();
    if (!teams.length) {
      container.append(element("p", "dashboard-state", "No teams have been created yet."));
      return;
    }
    teams.forEach(function (team) {
      const card = element("a", "team-card team-card-active");
      card.href = "team.html";
      card.setAttribute("aria-label", "Open " + team.name + " team");
      const body = element("div", "team-card-body");
      body.append(element("h3", "", team.name));
      body.append(element("p", "team-lead", "Lead: " + (team.leader?.name || "Not assigned")));
      const stats = element("div", "team-stats-row");
      stats.append(element("span", "", team.memberCount + " members"));
      stats.append(element("span", "", team.completedTasks + " / " + team.totalTasks + " tasks complete"));
      body.append(stats);
      const progressWrap = element("div", "progress-wrap");
      const progressLabel = element("div", "progress-label");
      progressLabel.append(element("span", "", "Completion"));
      progressLabel.append(element("span", "progress-value", team.productivity + "%"));
      const progressBar = element("div", "progress-bar");
      const progressFill = element("div", "progress-fill");
      progressFill.style.width = team.productivity + "%";
      progressBar.append(progressFill);
      progressWrap.append(progressLabel, progressBar);
      body.append(progressWrap);
      body.append(element("p", "overdue-tag" + (team.overdueTasks ? " overdue-warning" : ""),
        team.overdueTasks + " overdue"));
      card.append(body, element("span", "card-arrow", "→"));
      container.append(card);
    });
  }

  function renderDeadlines(deadlines) {
    const container = document.getElementById("deadlines-list");
    container.replaceChildren();
    if (!deadlines.length) {
      setState(container, "No upcoming task deadlines.", false);
      return;
    }
    deadlines.forEach(function (task) {
      const item = element("li", "deadline-item");
      const info = element("div", "deadline-info");
      const priority = (task.priority || "Medium").toLowerCase();
      info.append(element("span", "priority-badge " + priority, task.priority || "Task"));
      info.append(element("strong", "", task.title || "Untitled task"));
      info.append(element("span", "deadline-meta", task.team + " · " + (task.assignee || "Unassigned")));
      item.append(info, element("span", "deadline-time", "Due " + formatDate(task.dueDate, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })));
      container.append(item);
    });
  }

  function renderRecentTasks(tasks) {
    const container = document.getElementById("recent-tasks-list");
    container.replaceChildren();
    if (!tasks.length) {
      setState(container, "No tasks have been created yet.", false);
      return;
    }
    tasks.forEach(function (task) {
      const item = element("li", "deadline-item");
      const info = element("div", "deadline-info");
      info.append(element("strong", "", task.title || "Untitled task"));
      info.append(element("span", "deadline-meta", (task.team || "Unassigned team") +
        " · " + (task.assignee || "Unassigned") + " · " + (task.status || "Pending")));
      item.append(info, element("span", "deadline-time", task.dueDate
        ? "Due " + formatDate(task.dueDate, { month: "short", day: "numeric", year: "numeric" })
        : "No due date"));
      container.append(item);
    });
  }

  function renderUpcomingEvents(events) {
    const container = document.getElementById("upcoming-events-list");
    container.replaceChildren();
    if (!events.length) {
      setState(container, "No upcoming events have been scheduled.", false);
      return;
    }
    events.forEach(function (event) {
      const item = element("li", "deadline-item");
      const info = element("div", "deadline-info");
      info.append(element("strong", "", event.title || "Untitled event"));
      info.append(element("span", "deadline-meta", event.location || event.description || "Organisation event"));
      item.append(info, element("span", "deadline-time", formatDate(event.date)));
      container.append(item);
    });
  }

  function renderRecentSubmissions(submissions, available) {
    const container = document.getElementById("recent-submissions-list");
    container.replaceChildren();
    if (!available) {
      setState(container, "Submission records are unavailable: this project has no submission model or API.", false);
      return;
    }
    if (!submissions.length) {
      setState(container, "No submissions have been recorded.", false);
      return;
    }
    submissions.forEach(function (submission) {
      const item = element("li", "deadline-item");
      const info = element("div", "deadline-info");
      info.append(element("strong", "", submission.title || submission.taskTitle || "Task submission"));
      info.append(element("span", "deadline-meta", (submission.memberName || submission.member || "Member") +
        " · " + (submission.status || "Submitted")));
      item.append(info, element("span", "deadline-time", submission.updatedAt
        ? formatDate(submission.updatedAt)
        : "Date unavailable"));
      container.append(item);
    });
  }

  function initials(name) {
    return String(name || "?").split(/\s+/).slice(0, 2).map(function (part) {
      return part.charAt(0).toUpperCase();
    }).join("");
  }

  function renderPerformers(performers) {
    const container = document.getElementById("performers-list");
    container.replaceChildren();
    if (!performers.length) {
      setState(container, "No contributions have been recorded yet.", false);
      return;
    }
    const medals = ["🥇", "🥈", "🥉"];
    performers.forEach(function (performer, index) {
      const item = element("li", "performer-item rank-" + (index + 1));
      item.append(element("span", "rank-medal", medals[index] || String(index + 1)));
      item.append(element("span", "performer-avatar avatar-" +
        (index === 0 ? "gold" : index === 1 ? "silver" : "bronze"), initials(performer.name)));
      const info = element("div", "performer-info");
      info.append(element("strong", "", performer.name));
      info.append(element("span", "", performer.teams.join(", ") || "No team"));
      item.append(info, element("span", "performer-points",
        Number(performer.contributionPoints).toLocaleString() + " pts"));
      container.append(item);
    });
  }

  function renderMembers(members) {
    const container = document.getElementById("members-list");
    container.replaceChildren();
    if (!members.length) {
      setState(container, "No organisation members found.", false);
      return;
    }
    members.forEach(function (member) {
      const item = element("li", "member-contribution-item");
      const info = element("div", "performer-info");
      info.append(element("strong", "", member.name));
      info.append(element("span", "", member.teams.join(", ") || "No team"));
      const taskCount = member.assignedTasks
        ? member.completedTasks + " / " + member.assignedTasks + " tasks complete"
        : "No assigned tasks";
      const contributionCount = member.contributionCount
        ? Number(member.contributionPoints).toLocaleString() + " points · " + member.contributionCount + " contributions"
        : "No contributions yet";
      const metrics = element("span", "member-contribution-metrics");
      metrics.append(element("span", "", taskCount));
      metrics.append(element("span", "", contributionCount));
      item.append(info, metrics);
      container.append(item);
    });
  }

  function renderDashboard(data) {
    dashboardData = data;
    renderMetrics(data.stats);
    renderTeams(data.teams);
    renderDeadlines(data.upcomingDeadlines);
    renderRecentTasks(data.recentTasks || []);
    renderUpcomingEvents(data.upcomingEvents || []);
    renderRecentSubmissions(data.recentSubmissions || [], data.submissionTrackingAvailable === true);
    renderPerformers(data.topPerformers);
    renderMembers(data.members);
  }

  function setDialogError(form, message) {
    form.querySelector("[data-form-error]").textContent = message || "";
  }

  function localDateTimeValue(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function renderEvents(events) {
    eventRecords = events;
    const container = document.getElementById("events-list");
    container.replaceChildren();
    if (!events.length) {
      container.append(element("p", "dashboard-state", "No events have been scheduled."));
      return;
    }
    events.forEach(function (event) {
      const card = element("article", "event-entry");
      card.dataset.eventId = event.id;
      const eventCard = element("div", "event-card");
      const dateBlock = element("div", "event-date-block");
      const eventDate = new Date(event.date);
      dateBlock.append(element("span", "event-month",
        Number.isFinite(eventDate.getTime()) ? new Intl.DateTimeFormat(undefined, { month: "short" }).format(eventDate) : "—"));
      dateBlock.append(element("strong", "event-day",
        Number.isFinite(eventDate.getTime()) ? String(eventDate.getDate()) : "—"));
      const details = element("div", "event-details");
      details.append(element("strong", "", event.title));
      details.append(element("p", "", event.description || "No description"));
      details.append(element("span", "event-time",
        formatDate(event.date) + (event.location ? " · " + event.location : "")));
      eventCard.append(dateBlock, details);
      const actions = element("div", "record-actions");
      actions.append(actionButton("Edit", "edit-event", event.id));
      actions.append(actionButton("Delete", "delete-event", event.id));
      eventCard.append(actions);
      card.append(eventCard);

      const checklistTitle = element("h3", "checklist-title", "Event Checklist");
      card.append(checklistTitle);
      const checklist = element("ul", "checklist");
      (event.checklist || []).forEach(function (item) {
        const row = element("li", "checklist-item" + (item.completed ? " done" : ""));
        const toggle = actionButton(item.completed ? "✓" : "○", "toggle-checklist", item.id);
        toggle.classList.add("check-btn");
        toggle.setAttribute("aria-pressed", item.completed ? "true" : "false");
        toggle.setAttribute("aria-label", item.completed ? "Mark incomplete" : "Mark complete");
        row.append(toggle, element("span", "", item.text));
        row.append(actionButton("Edit", "edit-checklist", item.id));
        row.append(actionButton("Remove", "delete-checklist", item.id));
        checklist.append(row);
      });
      if (!event.checklist?.length) checklist.append(element("li", "dashboard-state", "No checklist items."));
      card.append(checklist);

      const addForm = element("form", "checklist-add-form");
      addForm.dataset.eventId = event.id;
      const input = element("input");
      input.name = "text";
      input.maxLength = 200;
      input.required = true;
      input.placeholder = "Add a checklist item";
      input.setAttribute("aria-label", "New checklist item");
      const submit = element("button", "secondary-btn", "Add item");
      submit.type = "submit";
      addForm.append(input, submit);
      card.append(addForm);
      container.append(card);
    });
  }

  function actionButton(label, action, id) {
    const button = element("button", "record-action", label);
    button.type = "button";
    button.dataset.action = action;
    button.dataset.id = id;
    return button;
  }

  function renderAnnouncements(announcements) {
    announcementRecords = announcements;
    const container = document.getElementById("announcements-list");
    container.replaceChildren();
    if (!announcements.length) {
      setState(container, "No announcements have been posted.", false);
      return;
    }
    announcements.forEach(function (announcement) {
      const item = element("li", "announcement-entry");
      const info = element("div", "announcement-copy");
      info.append(element("strong", "", announcement.title));
      info.append(element("p", "", announcement.content));
      info.append(element("time", "", "Posted " + formatDate(announcement.createdAt)));
      const actions = element("div", "record-actions");
      actions.append(actionButton("Edit", "edit-announcement", announcement.id));
      actions.append(actionButton("Delete", "delete-announcement", announcement.id));
      item.append(info, actions);
      container.append(item);
    });
  }

  async function refreshDashboard() {
    const data = await apiRequest(dashboardUrl);
    renderDashboard(data);
  }

  async function refreshEvents() {
    const result = await apiRequest(eventUrl);
    renderEvents(result.events);
  }

  async function refreshAnnouncements() {
    const result = await apiRequest(announcementUrl);
    renderAnnouncements(result.announcements);
  }

  async function refreshAll() {
    const results = await Promise.allSettled([
      refreshDashboard(),
      refreshEvents(),
      refreshAnnouncements(),
    ]);
    const sections = [
      { result: results[0], container: document.getElementById("teams-grid"), message: "Dashboard data could not be loaded." },
      { result: results[1], container: document.getElementById("events-list"), message: "Events could not be loaded." },
      { result: results[2], container: document.getElementById("announcements-list"), message: "Announcements could not be loaded." },
    ];
    sections.forEach(function (section) {
      if (section.result.status === "rejected") {
        setState(section.container, section.result.reason.message || section.message, true);
      }
    });
    if (results[0].status === "rejected") {
      [
        document.getElementById("deadlines-list"),
        document.getElementById("performers-list"),
        document.getElementById("members-list"),
        document.getElementById("recent-tasks-list"),
        document.getElementById("upcoming-events-list"),
        document.getElementById("recent-submissions-list"),
      ].forEach(function (container) {
        setState(container, results[0].reason.message || "Dashboard data could not be loaded.", true);
      });
      document.querySelectorAll(".stat-number[data-key]").forEach(function (counter) {
        counter.textContent = "—";
      });
      document.getElementById("org-spotlight").textContent =
        results[0].reason.message || "Dashboard data could not be loaded.";
    }
  }

  function initMetricInteractions() {
    document.querySelectorAll(".metric-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        if (!dashboardData) return;
        const key = chip.dataset.key;
        const statsKey = key === "total" ? "totalTasks" :
          key === "completed" ? "completedTasks" :
            key === "pendingTasks" ? "pendingTasks" : "overdueTasks";
        const value = dashboardData.stats[statsKey];
        document.getElementById("chart-center-caption").textContent = chip.textContent.trim().replace(/\s+/g, " ");
        document.getElementById("chart-percent").textContent = String(value);
        document.querySelectorAll(".metric-chip").forEach(function (item) {
          item.classList.toggle("is-active", item === chip);
        });
      });
    });
  }

  function initDialogs() {
    const eventDialog = document.getElementById("event-dialog");
    const eventForm = document.getElementById("event-form");
    const announcementDialog = document.getElementById("announcement-dialog");
    const announcementForm = document.getElementById("announcement-form");

    document.querySelectorAll("[data-close-dialog]").forEach(function (button) {
      button.addEventListener("click", function () {
        button.closest("dialog").close();
      });
    });
    document.getElementById("create-event-btn").addEventListener("click", function () {
      editingEventId = null;
      eventForm.reset();
      setDialogError(eventForm, "");
      document.getElementById("event-dialog-title").textContent = "Create event";
      eventDialog.showModal();
    });
    document.getElementById("create-announcement-btn").addEventListener("click", function () {
      editingAnnouncementId = null;
      announcementForm.reset();
      setDialogError(announcementForm, "");
      document.getElementById("announcement-dialog-title").textContent = "Create announcement";
      announcementDialog.showModal();
    });

    eventForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      const values = new FormData(eventForm);
      const date = new Date(values.get("date"));
      const body = {
        title: values.get("title"),
        date: date.toISOString(),
        location: values.get("location"),
        description: values.get("description"),
      };
      try {
        await apiRequest(editingEventId ? eventUrl + "/" + encodeURIComponent(editingEventId) : eventUrl, {
          method: editingEventId ? "PATCH" : "POST",
          body: JSON.stringify(body),
        });
        eventDialog.close();
        await Promise.all([refreshEvents(), refreshDashboard()]);
        showToast(editingEventId ? "Event updated." : "Event created.");
      } catch (error) {
        setDialogError(eventForm, error.message);
      }
    });

    announcementForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      const values = new FormData(announcementForm);
      const body = { title: values.get("title"), content: values.get("content") };
      try {
        await apiRequest(editingAnnouncementId
          ? announcementUrl + "/" + encodeURIComponent(editingAnnouncementId)
          : announcementUrl, {
          method: editingAnnouncementId ? "PATCH" : "POST",
          body: JSON.stringify(body),
        });
        announcementDialog.close();
        await refreshAnnouncements();
        showToast(editingAnnouncementId ? "Announcement updated." : "Announcement posted.");
      } catch (error) {
        setDialogError(announcementForm, error.message);
      }
    });

    document.getElementById("events-list").addEventListener("click", async function (event) {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const { action, id } = button.dataset;
      const selectedEvent = eventRecords.find(function (entry) {
        return entry.id === (action === "edit-event" || action === "delete-event"
          ? id
          : button.closest(".event-entry")?.dataset.eventId);
      });
      if (action === "edit-event") {
        const eventRecord = eventRecords.find(function (entry) { return entry.id === id; });
        if (!eventRecord) return;
        editingEventId = id;
        eventForm.elements.title.value = eventRecord.title;
        eventForm.elements.date.value = localDateTimeValue(eventRecord.date);
        eventForm.elements.location.value = eventRecord.location || "";
        eventForm.elements.description.value = eventRecord.description || "";
        setDialogError(eventForm, "");
        document.getElementById("event-dialog-title").textContent = "Edit event";
        eventDialog.showModal();
      } else if (action === "delete-event" && window.confirm("Delete this event and its checklist?")) {
        try {
          await apiRequest(eventUrl + "/" + encodeURIComponent(id), { method: "DELETE" });
          await Promise.all([refreshEvents(), refreshDashboard()]);
          showToast("Event deleted.");
        } catch (error) {
          showToast(error.message);
        }
      } else if (action === "toggle-checklist" || action === "delete-checklist") {
        const eventRecord = selectedEvent;
        const item = eventRecord?.checklist.find(function (entry) { return entry.id === id; });
        if (!eventRecord || !item) return;
        try {
          if (action === "toggle-checklist") {
            await apiRequest(eventUrl + "/" + encodeURIComponent(eventRecord.id) +
              "/checklist/" + encodeURIComponent(id), {
              method: "PATCH",
              body: JSON.stringify({ completed: !item.completed }),
            });
          } else {
            await apiRequest(eventUrl + "/" + encodeURIComponent(eventRecord.id) +
              "/checklist/" + encodeURIComponent(id), { method: "DELETE" });
          }
          await refreshEvents();
        } catch (error) {
          showToast(error.message);
        }
      } else if (action === "edit-checklist") {
        const eventRecord = selectedEvent;
        const item = eventRecord?.checklist.find(function (entry) { return entry.id === id; });
        if (!eventRecord || !item) return;
        const updatedText = window.prompt("Update checklist item", item.text);
        if (updatedText === null) return;
        try {
          await apiRequest(eventUrl + "/" + encodeURIComponent(eventRecord.id) +
            "/checklist/" + encodeURIComponent(id), {
            method: "PATCH",
            body: JSON.stringify({ text: updatedText }),
          });
          await refreshEvents();
        } catch (error) {
          showToast(error.message);
        }
      }
    });

    document.getElementById("events-list").addEventListener("submit", async function (event) {
      const form = event.target.closest(".checklist-add-form");
      if (!form) return;
      event.preventDefault();
      try {
        await apiRequest(eventUrl + "/" + encodeURIComponent(form.dataset.eventId) + "/checklist", {
          method: "POST",
          body: JSON.stringify({ text: new FormData(form).get("text") }),
        });
        await refreshEvents();
      } catch (error) {
        showToast(error.message);
      }
    });

    document.getElementById("announcements-list").addEventListener("click", async function (event) {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const { action, id } = button.dataset;
      const announcement = announcementRecords.find(function (entry) { return entry.id === id; });
      if (action === "edit-announcement" && announcement) {
        editingAnnouncementId = id;
        announcementForm.elements.title.value = announcement.title;
        announcementForm.elements.content.value = announcement.content;
        setDialogError(announcementForm, "");
        document.getElementById("announcement-dialog-title").textContent = "Edit announcement";
        announcementDialog.showModal();
      } else if (action === "delete-announcement" && window.confirm("Delete this announcement?")) {
        try {
          await apiRequest(announcementUrl + "/" + encodeURIComponent(id), { method: "DELETE" });
          await refreshAnnouncements();
          showToast("Announcement deleted.");
        } catch (error) {
          showToast(error.message);
        }
      }
    });
  }

  function initSearch() {
    const search = document.querySelector(".search-bar input");
    if (!search) return;
    search.addEventListener("input", function () {
      const query = search.value.trim().toLowerCase();
      document.querySelectorAll(".team-card").forEach(function (card) {
        card.hidden = query && !card.textContent.toLowerCase().includes(query);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", async function () {
    setGreeting();
    initMetricInteractions();
    initDialogs();
    initSearch();
    try {
      if (await loadSession()) await refreshAll();
    } catch (error) {
      showToast(error.message);
      if (error.message.includes("Authentication")) window.location.replace("index.html");
    }
  });
})();
