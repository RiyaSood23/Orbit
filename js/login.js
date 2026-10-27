const loginForm = document.querySelector("#login-form");
const signupForm = document.querySelector("#signup-form");
const authFeedback = document.querySelector("#auth-feedback");
const loginTitle = document.querySelector("#login-title");
const loginIntro = document.querySelector("#login-intro");
const formKicker = document.querySelector("#form-kicker");
const modeSwitch = document.querySelector("#mode-switch");
const showSignupButton = document.querySelector("#show-signup");
const forgotPasswordButton = document.querySelector("#forgot-password");
const togglePasswordButton = document.querySelector("#toggle-password");
const loginPassword = document.querySelector("#password");
const signupPassword = document.querySelector("#signup-password");
const signupConfirmPassword = document.querySelector("#signup-confirm-password");
const workspacePreview = document.querySelector("#workspace-preview");
const workspaceVisual = document.querySelector("#workspace-visual");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

if (workspacePreview && workspaceVisual && !reduceMotion.matches) {
  workspacePreview.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") {
      return;
    }

    const bounds = workspacePreview.getBoundingClientRect();
    const horizontalPosition = (event.clientX - bounds.left) / bounds.width - 0.5;
    const verticalPosition = (event.clientY - bounds.top) / bounds.height - 0.5;
    const tiltX = Math.max(-5, Math.min(5, verticalPosition * -10));
    const tiltY = Math.max(-5, Math.min(5, horizontalPosition * 10));

    workspaceVisual.style.transform =
      `rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg) translateY(-3px) scale(1.015)`;
  });

  workspacePreview.addEventListener("pointerleave", () => {
    workspaceVisual.style.transform = "";
  });
}

function showFeedback(message, isSuccess = false) {
  authFeedback.textContent = message;
  authFeedback.classList.toggle("is-visible", Boolean(message));
  authFeedback.classList.toggle("is-success", isSuccess);
  authFeedback.setAttribute("role", isSuccess ? "status" : "alert");
}

function setFormMode(mode) {
  const isSignup = mode === "signup";
  document.body.classList.toggle("auth-signup", isSignup);
  loginForm.hidden = isSignup;
  signupForm.hidden = !isSignup;
  loginTitle.textContent = isSignup ? "Create your account" : "Welcome back";
  formKicker.textContent = isSignup ? "JOIN YOUR TEAM" : "TEAMFLOW ACCESS";
  loginIntro.textContent = isSignup
    ? "Create an account to get started with your team."
    : "Sign in to pick up where your team left off.";
  modeSwitch.replaceChildren();

  const prompt = document.createTextNode(isSignup ? "Already have an account? " : "New to Orbit? ");
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = isSignup ? "Sign in" : "Create an account";
  button.addEventListener("click", () => {
    showFeedback("");
    setFormMode(isSignup ? "login" : "signup");
  });
  modeSwitch.append(prompt, button);
  showFeedback("");
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(payload),
  });
  const result = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(result.error || "The request could not be completed.");
  }
  return result;
}

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("Orbit’s local server is not running the authentication API. Restart it with `npm start`.");
  }
  try {
    return await response.json();
  } catch {
    throw new Error("The authentication server returned an invalid response. Please restart the local server.");
  }
}

async function submitForm(button, action) {
  button.disabled = true;
  showFeedback("");
  try {
    await action();
    window.location.assign("dashboard.html");
  } catch (error) {
    showFeedback(error instanceof Error ? error.message : "The request could not be completed.");
  } finally {
    button.disabled = false;
  }
}

showSignupButton.addEventListener("click", () => setFormMode("signup"));
togglePasswordButton.addEventListener("click", () => {
  const isVisible = loginPassword.type === "text";
  loginPassword.type = isVisible ? "password" : "text";
  togglePasswordButton.setAttribute("aria-label", isVisible ? "Show password" : "Hide password");
  togglePasswordButton.setAttribute("aria-pressed", String(!isVisible));
});
forgotPasswordButton.addEventListener("click", () => {
  showFeedback("Password reset isn’t configured for this local app. Contact your workspace administrator.");
});

signupConfirmPassword.addEventListener("input", () => {
  signupConfirmPassword.setCustomValidity(
    signupConfirmPassword.value === signupPassword.value ? "" : "Passwords do not match."
  );
});
signupPassword.addEventListener("input", () => {
  signupConfirmPassword.setCustomValidity(
    signupConfirmPassword.value === signupPassword.value ? "" : "Passwords do not match."
  );
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!loginForm.reportValidity()) {
    return;
  }

  const formData = new FormData(loginForm);
  const button = loginForm.querySelector('button[type="submit"]');
  void submitForm(button, async () => {
    await postJson("/api/auth/login", {
      email: formData.get("email"),
      password: formData.get("password"),
      remember: formData.get("remember") === "on",
    });
  });
});

signupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!signupForm.reportValidity()) {
    return;
  }
  if (signupPassword.value !== signupConfirmPassword.value) {
    signupConfirmPassword.setCustomValidity("Passwords do not match.");
    signupConfirmPassword.reportValidity();
    return;
  }

  const formData = new FormData(signupForm);
  const button = signupForm.querySelector('button[type="submit"]');
  void submitForm(button, async () => {
    await postJson("/api/auth/signup", {
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
  });
});

fetch("/api/auth/session", { credentials: "same-origin" })
  .then(async (response) => {
    const result = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(result.error || "Could not check your session. Please try again.");
    }
    if (result.user) {
      window.location.replace("dashboard.html");
    }
  })
  .catch((error) => {
    showFeedback(error instanceof Error ? error.message : "Could not connect to Orbit.");
  });