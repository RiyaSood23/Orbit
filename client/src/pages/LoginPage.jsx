import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

const protectedPaths = new Set([
  "/dashboard",
  "/workspace",
  "/team",
  "/create-task",
  "/approvals",
  "/announcements",
]);

function getSafeReturnPath(location) {
  const requestedPath = location.state?.from?.pathname;
  return protectedPaths.has(requestedPath) ? requestedPath : "/dashboard";
}

export default function LoginPage() {
  const { login, signup, sessionError, clearSessionError } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    clearSessionError();
    setPending(true);
    const formData = new FormData(event.currentTarget);

    try {
      if (mode === "signup") {
        const password = String(formData.get("password") || "");
        const confirmPassword = String(formData.get("confirmPassword") || "");
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }
        await signup({
          name: formData.get("name"),
          email: formData.get("email"),
          password,
          inviteCode: formData.get("inviteCode"),
        });
      } else {
        await login({
          email: formData.get("email"),
          password: formData.get("password"),
          remember: formData.get("remember") === "on",
        });
      }
      navigate(getSafeReturnPath(location), { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The request could not be completed.");
    } finally {
      setPending(false);
    }
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    setError("");
    setNotice("");
    clearSessionError();
  }

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="auth-title">
        <Link className="auth-logo" to="/" aria-label="Orbit home">
          <span className="auth-logo-mark">O</span>
          <span>Orbit</span>
        </Link>
        <p className="auth-kicker">TeamFlow workspace</p>
        <h1 id="auth-title">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="auth-intro">
          {mode === "login"
            ? "Sign in to pick up where your team left off."
            : "Create an account to get started with your team."}
        </p>

        {(error || notice || sessionError) && (
          <p
            className={`auth-message${notice && !error ? " is-success" : ""}`}
            role={notice && !error ? "status" : "alert"}
          >
            {error || notice || sessionError}
          </p>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "signup" && (
            <label>
              Full name
              <input name="name" autoComplete="name" minLength="2" maxLength="80" placeholder="Your name" required />
            </label>
          )}
          <label>
            Work email
            <input
              name="email"
              type="email"
              autoComplete={mode === "login" ? "username" : "email"}
              maxLength="254"
              placeholder="you@company.com"
              required
            />
          </label>
          {mode === "signup" && (
            <label>
              Workspace invitation code <span className="auth-optional">(optional)</span>
              <input name="inviteCode" autoComplete="off" maxLength="32" placeholder="Enter your workspace code" />
            </label>
          )}
          <label>
            Password
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "signup" ? "10" : undefined}
              maxLength="128"
              placeholder={mode === "login" ? "Enter your password" : "At least 10 characters"}
              required
            />
          </label>
          {mode === "signup" ? (
            <label>
              Confirm password
              <input
                name="confirmPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength="10"
                maxLength="128"
                placeholder="Enter your password again"
                required
              />
            </label>
          ) : (
            <div className="auth-options">
              <label className="remember-option">
                <input type="checkbox" name="remember" />
                <span>Remember me</span>
              </label>
              <button
                className="auth-text-button"
                type="button"
                onClick={() => {
                  setError("");
                  setNotice("Password reset isn’t configured. Contact your workspace administrator.");
                }}
              >
                Forgot password?
              </button>
            </div>
          )}
          <label className="remember-option show-password">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
            />
            <span>Show password</span>
          </label>
          <button className="auth-submit" type="submit" disabled={pending}>
            {pending ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="auth-mode-switch">
          {mode === "login" ? "New to Orbit? " : "Already have an account? "}
          <button
            type="button"
            onClick={() => changeMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </p>
        <p className="auth-footnote">Accounts are stored securely in your Orbit workspace.</p>
      </section>
    </main>
  );
}
