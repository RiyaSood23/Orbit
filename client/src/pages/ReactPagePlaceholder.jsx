import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="not-found-page">
      <h1>Page not found</h1>
      <p>The Orbit page you requested does not exist.</p>
      <Link to="/">Return to Orbit</Link>
    </main>
  );
}
