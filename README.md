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

3. Start MongoDB locally, or set `MONGODB_URI` to an Atlas connection string.

4. Optionally create a `.env` file:

   ```env
   MONGODB_URI=mongodb://127.0.0.1:27017
   MONGODB_DB=Orbit
   JWT_SECRET=replace-with-a-long-random-secret
   PORT=3000
   ```

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
