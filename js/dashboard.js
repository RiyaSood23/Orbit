(function () {
  "use strict";

  /* ── Greeting based on time of day ── */
  function setGreeting() {
    const hour = new Date().getHours();
    const greetingEl = document.getElementById("greeting-time");
    if (!greetingEl) return;

    let greeting = "Good evening";
    if (hour < 12) greeting = "Good morning";
    else if (hour < 17) greeting = "Good afternoon";

    greetingEl.textContent = greeting;
  }

  /* ── Load the signed-in user from the local server ── */
  async function setUserName() {
    const nameEl = document.getElementById("user-name");
    if (!nameEl) return;

    try {
      const response = await fetch("/api/auth/session", { credentials: "same-origin" });
      const result = await response.json();

      if (!response.ok || !result.user) {
        window.location.replace("index.html");
        return;
      }

      const name = typeof result.user.name === "string" ? result.user.name.trim() : "";
      nameEl.textContent = name || "Team Lead";
    } catch {
      window.location.replace("index.html");
    }
  }

  /* ── Animate progress bars on load ── */
  function animateProgressBars() {
    const fills = document.querySelectorAll(".progress-fill");
    fills.forEach(function (fill) {
      const target = fill.getAttribute("data-progress") || "0";
      requestAnimationFrame(function () {
        setTimeout(function () {
          fill.style.width = target + "%";
        }, 300);
      });
    });
  }

  /* ── Organisation overview ── */
  const overviewData = {
    month: {
      totals: { total: 156, completed: 89, inProgress: 42, review: 18, overdue: 7 },
      daily: {
        total: [28, 34, 25, 38, 31, 12, 8],
        completed: [18, 22, 16, 24, 20, 9, 6],
        inProgress: [6, 8, 5, 9, 7, 2, 1],
        review: [3, 3, 2, 4, 3, 1, 1],
        overdue: [1, 1, 2, 1, 1, 0, 0],
      },
    },
    week: {
      totals: { total: 38, completed: 21, inProgress: 9, review: 5, overdue: 3 },
      daily: {
        total: [6, 8, 5, 9, 7, 2, 1],
        completed: [4, 5, 3, 6, 3, 0, 0],
        inProgress: [1, 2, 1, 2, 2, 1, 0],
        review: [1, 1, 1, 1, 1, 0, 0],
        overdue: [0, 0, 0, 0, 1, 1, 1],
      },
    },
  };

  const metricCopy = {
    total: { caption: "All tasks", kicker: "Overall health" },
    completed: { caption: "Completed", kicker: "Done this period" },
    inProgress: { caption: "In progress", kicker: "Active work" },
    review: { caption: "Pending review", kicker: "Waiting on leads" },
    overdue: { caption: "Overdue", kicker: "Needs attention" },
  };

  const chartColors = {
    full: ["#5d9a7a", "#6aabcc", "#a78bfa", "#e57373"],
    dim: ["rgba(93,154,122,0.22)", "rgba(106,171,204,0.22)", "rgba(167,139,250,0.22)", "rgba(229,115,115,0.22)"],
  };

  let overviewState = { range: "month", metric: "total", chart: null };

  function animateCounterTo(el, target) {
    const duration = 700;
    const startValue = parseInt(el.textContent, 10) || 0;
    const start = performance.now();

    function step(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(startValue + (target - startValue) * eased);
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  function animateCounters() {
    document.querySelectorAll(".stat-number").forEach(function (counter) {
      const target = parseInt(counter.getAttribute("data-target"), 10);
      animateCounterTo(counter, target);
    });
  }

  function setCenterLabel(value, caption) {
    const percentEl = document.getElementById("chart-percent");
    const captionEl = document.getElementById("chart-center-caption");
    if (percentEl) percentEl.textContent = value;
    if (captionEl) captionEl.textContent = caption;
  }

  function updatePipeline(totals, metric) {
    const pipeline = document.getElementById("task-pipeline");
    if (!pipeline) return;

    const keys = ["completed", "inProgress", "review", "overdue"];
    const sum = keys.reduce(function (acc, key) { return acc + totals[key]; }, 0) || 1;

    pipeline.classList.toggle("is-filtered", metric !== "total");
    keys.forEach(function (key) {
      const pipe = pipeline.querySelector('[data-key="' + key + '"]');
      if (!pipe) return;
      pipe.style.width = ((totals[key] / sum) * 100) + "%";
      pipe.classList.toggle("is-focus", metric === key);
    });
  }

  function updateWeekBars(range, metric) {
    const values = overviewData[range].daily[metric];
    const max = Math.max.apply(null, values.concat([1]));
    const bars = document.querySelectorAll(".week-bar");
    const caption = document.getElementById("week-caption");
    const label = metricCopy[metric].caption.toLowerCase();

    bars.forEach(function (bar, index) {
      const value = values[index] || 0;
      bar.setAttribute("data-value", String(value));
      bar.setAttribute("data-tone", metric);
      bar.style.setProperty("--h", Math.max(10, Math.round((value / max) * 100)) + "%");
      bar.title = bar.getAttribute("data-day") + " · " + value + " " + label;
    });

    if (caption) caption.textContent = "Daily " + label + " · hover a bar";
  }

  function updateInsight(range, metric) {
    const totals = overviewData[range].totals;
    const rangeLabel = range === "week" ? "this week" : "this month";
    const spotlight = document.getElementById("org-spotlight");
    const kicker = document.getElementById("org-kicker");
    const insight = document.getElementById("org-insight");
    const copy = metricCopy[metric];
    const share = Math.round((totals[metric === "total" ? "completed" : metric] / totals.total) * 100);

    if (kicker) kicker.textContent = copy.kicker;

    if (spotlight) {
      if (metric === "total") {
        spotlight.textContent = share + "% of " + totals.total + " tasks are complete " + rangeLabel + ".";
      } else if (metric === "overdue") {
        spotlight.textContent = totals.overdue + " overdue tasks need a nudge " + rangeLabel + ".";
      } else {
        spotlight.textContent = totals[metric] + " " + copy.caption.toLowerCase() + " · " + share + "% of the pipeline.";
      }
    }

    if (insight) {
      insight.textContent = range === "week"
        ? "Week view · tap a chip or chart slice to filter."
        : "Month view · tap a chip or chart slice to filter.";
    }
  }

  function highlightChart(metric) {
    const chart = overviewState.chart;
    if (!chart) return;

    const colors = metric === "total"
      ? chartColors.full.slice()
      : chartColors.dim.slice();

    if (metric === "completed") colors[0] = chartColors.full[0];
    if (metric === "inProgress") colors[1] = chartColors.full[1];
    if (metric === "review") colors[2] = chartColors.full[2];
    if (metric === "overdue") colors[3] = chartColors.full[3];

    chart.data.datasets[0].backgroundColor = colors;
    chart.update();
  }

  function selectMetric(metric, announce) {
    overviewState.metric = metric;
    const totals = overviewData[overviewState.range].totals;
    const copy = metricCopy[metric];

    document.querySelectorAll(".metric-chip").forEach(function (chip) {
      chip.classList.toggle("is-active", chip.getAttribute("data-key") === metric);
    });

    if (metric === "total") {
      setCenterLabel(Math.round((totals.completed / totals.total) * 100) + "%", "Complete");
    } else {
      setCenterLabel(String(totals[metric]), copy.caption);
    }

    highlightChart(metric);
    updatePipeline(totals, metric);
    updateWeekBars(overviewState.range, metric);
    updateInsight(overviewState.range, metric);

    if (announce) {
      showToast((metric === "total" ? "All tasks" : copy.caption) + " · " + totals[metric]);
    }
  }

  function applyRange(range) {
    overviewState.range = range;
    const totals = overviewData[range].totals;

    document.querySelectorAll(".range-btn").forEach(function (btn) {
      const active = btn.getAttribute("data-range") === range;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    document.querySelectorAll(".metric-chip").forEach(function (chip) {
      const key = chip.getAttribute("data-key");
      const number = chip.querySelector(".stat-number");
      if (number) {
        number.setAttribute("data-target", String(totals[key]));
        animateCounterTo(number, totals[key]);
      }
    });

    if (overviewState.chart) {
      overviewState.chart.data.datasets[0].data = [
        totals.completed,
        totals.inProgress,
        totals.review,
        totals.overdue,
      ];
      overviewState.chart.update();
    }

    selectMetric(overviewState.metric, false);
  }

  function initChart() {
    const canvas = document.getElementById("completion-chart");
    if (!canvas || typeof Chart === "undefined") {
      applyRange("month");
      return;
    }

    const totals = overviewData.month.totals;
    overviewState.chart = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: ["Completed", "In Progress", "Pending Review", "Overdue"],
        datasets: [{
          data: [totals.completed, totals.inProgress, totals.review, totals.overdue],
          backgroundColor: chartColors.full.slice(),
          borderWidth: 0,
          hoverOffset: 10,
        }],
      },
      options: {
        cutout: "74%",
        responsive: true,
        maintainAspectRatio: true,
        animation: { animateRotate: true, duration: 1100, easing: "easeOutQuart" },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#1a2e24",
            titleFont: { family: "'Plus Jakarta Sans', sans-serif", weight: "700" },
            bodyFont: { family: "'Plus Jakarta Sans', sans-serif" },
            padding: 10,
            cornerRadius: 10,
          },
        },
        onClick: function (_event, elements) {
          const keys = ["completed", "inProgress", "review", "overdue"];
          if (!elements.length) {
            selectMetric("total", true);
            return;
          }
          selectMetric(keys[elements[0].index], true);
        },
      },
    });

    applyRange("month");
  }

  function initOverviewInteractions() {
    document.querySelectorAll(".range-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyRange(btn.getAttribute("data-range"));
      });
    });

    document.querySelectorAll(".metric-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        const key = chip.getAttribute("data-key");
        selectMetric(key === overviewState.metric ? "total" : key, true);
      });
    });

    document.querySelectorAll(".week-bar").forEach(function (bar) {
      bar.addEventListener("mouseenter", function () {
        bar.classList.add("is-hot");
        const caption = document.getElementById("week-caption");
        if (caption) {
          caption.textContent = bar.getAttribute("data-day") + " · " + bar.getAttribute("data-value") + " tasks";
        }
      });
      bar.addEventListener("mouseleave", function () {
        bar.classList.remove("is-hot");
        updateWeekBars(overviewState.range, overviewState.metric);
      });
      bar.addEventListener("click", function () {
        showToast(bar.getAttribute("data-day") + " · " + bar.getAttribute("data-value") + " tasks");
      });
    });
  }

  /* ── Toast notifications ── */
  let toastTimer;
  function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("show");
    }, 2800);
  }

  /* ── Interactive checklist ── */
  function initChecklist() {
    const checklist = document.getElementById("event-checklist");
    if (!checklist) return;

    checklist.addEventListener("click", function (event) {
      const btn = event.target.closest(".check-btn");
      if (!btn) return;

      const item = btn.closest(".checklist-item");
      const isChecked = btn.classList.contains("checked");

      if (isChecked) {
        btn.classList.remove("checked");
        btn.textContent = "○";
        btn.setAttribute("aria-pressed", "false");
        item.classList.remove("done");
      } else {
        btn.classList.add("checked");
        btn.textContent = "✓";
        btn.setAttribute("aria-pressed", "true");
        item.classList.add("done");
        showToast("✅ Checklist item completed!");
      }
    });
  }

  /* ── Placeholder button handlers ── */
  function initButtons() {
    const addTeamButton = document.getElementById("add-team-btn");
    if (addTeamButton) {
      addTeamButton.addEventListener("click", function () {
        window.location.assign("team.html");
      });
    }

    const searchInput = document.querySelector(".search-bar input");
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        const query = searchInput.value.trim().toLowerCase();
        document.querySelectorAll(".team-card").forEach(function (card) {
          const matches = !query || card.textContent.toLowerCase().includes(query);
          card.hidden = !matches;
        });
      });
    }

    document.querySelectorAll(".team-card[role='button']").forEach(function (card) {
      card.addEventListener("click", function () {
        selectTeamCard(card);
      });

      card.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectTeamCard(card);
        }
      });
    });
  }

  function selectTeamCard(card) {
    document.querySelectorAll(".team-card").forEach(function (item) {
      item.classList.remove("is-selected");
      item.setAttribute("aria-pressed", "false");
    });

    card.classList.add("is-selected");
    card.setAttribute("aria-pressed", "true");
    const team = card.getAttribute("data-team");
    const name = team ? team.charAt(0).toUpperCase() + team.slice(1) : "Team";
    showToast(name + " team selected");
  }

  /* ── Subtle parallax on team card hover ── */
  function initCardHoverEffects() {
    document.querySelectorAll(".team-card-active").forEach(function (card) {
      card.addEventListener("mousemove", function (event) {
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = "translateY(-4px) perspective(400px) rotateY(" + (x * 4) + "deg) rotateX(" + (-y * 4) + "deg)";
      });

      card.addEventListener("mouseleave", function () {
        card.style.transform = "";
      });
    });
  }

  /* ── Init ── */
  document.addEventListener("DOMContentLoaded", function () {
    setGreeting();
    setUserName();
    animateProgressBars();
    initChart();
    initOverviewInteractions();
    initChecklist();
    initButtons();
    initCardHoverEffects();
  });
})();
