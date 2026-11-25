# Orbit - Team Collaboration & Work Management System

Orbit is a team collaboration and work management system designed to help teams organise projects, assign work, review submissions and communicate in one place.

The CE-1 frontend is retained as static HTML, CSS and JavaScript. The Node.js backend now uses MongoDB for persistent users and tasks, bcrypt for password hashing, JWT for authentication, protected routes, and role-based authorization.

## Team members

- Aarav Sharma
- Ishita Verma
- Rohan Kapoor
- Ananya Singh

## Project phases

- **CE-1:** HTML, CSS and JavaScript implementation
- **CE-2:** Conversion to React

## Requirements

- Node.js 18 or newer

## Run locally

1. Open a terminal in the project folder.
2. Install the project metadata and lockfile dependencies:

   ```powershell
   npm install
   ```

3. Configure MongoDB. The repository includes an ignored local `.env` file and a safe `.env.example` template. For Atlas, set `MONGODB_CLUSTER`, `MONGODB_USERNAME`, and `MONGODB_PASSWORD` in `.env`; use a rotated database-user password. The cluster must allow your current IP in Atlas Network Access. For a local MongoDB instance, remove the three Atlas settings and set `MONGODB_URI=mongodb://127.0.0.1:27017`.

4. Optionally create a `.env` file:

   ```env
   MONGODB_DB=Orbit
   MONGODB_CLUSTER=cluster0.example.mongodb.net
   MONGODB_USERNAME=your-atlas-database-user
   MONGODB_PASSWORD=your-rotated-password
   JWT_SECRET=replace-with-a-long-random-secret
   PORT=3000
   ```

   The password is URI-encoded by the server, so special characters are supported. Never commit `.env` or paste database credentials into source control.

5. Start the local server:

   ```powershell
   npm start
   ```

6. Open [http://localhost:3000](http://localhost:3000) in a browser.

The review workspace is available at [http://localhost:3000/approvals.html](http://localhost:3000/approvals.html). Approval decisions and comments are demo interactions and reset when the page is refreshed.

## Project structure

- `index.html` - login/landing page
- `dashboard.html` - dashboard page
- Team information is displayed as static cards on `dashboard.html`
- `create-task.html` - task creation page
- `approvals.html` - task review workspace
- `css/` - page stylesheets
- `js/` - page scripts
- `assets/images/` - image assets
- `server.js` - dependency-free static Node.js server
