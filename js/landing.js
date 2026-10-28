const loginButton = document.querySelector(".login-button");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

fetch("/api/auth/session", { credentials: "same-origin" })
  .then((response) => response.json())
  .then((result) => {
    if (loginButton && result.user) {
      loginButton.setAttribute("href", "dashboard.html");
      loginButton.setAttribute("aria-label", "Open dashboard");
    }
  })
  .catch(() => {});

if (loginButton && !reduceMotion.matches) {
  loginButton.addEventListener("pointermove", (event) => {
    const bounds = loginButton.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 4;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 4;
    loginButton.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  });

  loginButton.addEventListener("pointerleave", () => {
    loginButton.style.transform = "";
  });
}