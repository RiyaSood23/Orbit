import { Link } from "react-router-dom";
import "../../../css/landing.css";
import { useAuth } from "../auth/AuthContext.jsx";

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <main className="landing-page">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-overlay" />
        <div className="hero-content">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-dot" />Make space for better work</p>
            <h1 id="hero-title">Orbit</h1>
            <p className="tagline">Team collaboration and<br />work management system</p>
            <p className="hero-description">
              Bring your people, projects, and priorities into one calm, focused workspace.
            </p>
            <Link className="login-button" to={user ? "/dashboard" : "/login"}>
              {user ? "Open workspace" : "Login"}
              <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <div className="scroll-hint" aria-hidden="true">
            <span className="scroll-line" />
            <span>Scroll to explore</span>
          </div>
        </div>
        <div className="orbit-mark orbit-mark-large" aria-hidden="true" />
        <div className="orbit-mark orbit-mark-small" aria-hidden="true" />
      </section>

      <section className="details" aria-labelledby="about-title">
        <div className="stats" aria-label="Orbit highlights">
          <div className="stat-card"><strong>100<span>+</span></strong><span>users per workspace</span></div>
          <div className="stat-card"><strong>24<span>/7</span></strong><span>clarity for your team</span></div>
          <div className="stat-card"><strong>1</strong><span>place for every project</span></div>
        </div>
        <div className="about">
          <p className="section-label">A clearer way to work</p>
          <h2 id="about-title">Everything your team needs, in orbit.</h2>
          <p>
            Orbit is a team management platform that simplifies task assignment, tracks team
            progress and makes individual contributions visible, all in one workspace.
          </p>
        </div>
        <footer className="footer">
          <span className="brand">Orbit</span>
          <span>Built for teams that move together.</span>
        </footer>
      </section>
    </main>
  );
}
