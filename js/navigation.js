(() => {
  "use strict";

  document.querySelectorAll(".logout-link").forEach((logoutLink) => {
    logoutLink.addEventListener("click", async (event) => {
      event.preventDefault();
      if (logoutLink.getAttribute("aria-disabled") === "true") return;

      logoutLink.setAttribute("aria-disabled", "true");
      try {
        const response = await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "same-origin",
        });
        if (!response.ok) throw new Error("Could not sign out.");
        window.location.assign("index.html");
      } catch {
        logoutLink.removeAttribute("aria-disabled");
      }
    });
  });
})();
