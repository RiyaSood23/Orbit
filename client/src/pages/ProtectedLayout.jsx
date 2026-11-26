import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";

const navigation = [
  ["Dashboard", "/dashboard"],
  ["Team", "/team"],
  ["Create task", "/create-task"],
  ["Approvals", "/approvals"],
  ["Announcements", "/announcements"],
];

export default function ProtectedLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState("");

  async function handleLogout() {
    setLogoutError("");
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "Could not sign out.");
    }
  }

  return (
    <div className="workspace-app">
      <header className="workspace-header">
        <Link className="workspace-brand" to="/dashboard">
          <span className="workspace-brand-mark">O</span>
          Orbit
        </Link>
        <nav className="workspace-nav" aria-label="Main navigation">
          {navigation.map(([label, to]) => (
            <NavLink key={to} to={to} className={({ isActive }) => isActive ? "is-active" : ""}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="workspace-user">
          <span className="workspace-avatar" aria-hidden="true">
            {(user?.name || "U").slice(0, 1).toUpperCase()}
          </span>
          <span className="workspace-user-name">{user?.name || user?.email || "Member"}</span>
          <button className="workspace-logout" type="button" onClick={handleLogout}>Sign out</button>
        </div>
      </header>
      <main className="workspace-main">
        {logoutError && <p className="workspace-error" role="alert">{logoutError}</p>}
        <Outlet />
      </main>
    </div>
  );
}
