# Orbit - TeamFlow CE-1

Orbit is a static HTML, CSS and JavaScript prototype for the TeamFlow OSC team management system. The Node.js server only serves the prototype locally; there is no database, authentication, file upload, or persistent approval/comment storage.

## Requirements

- Node.js 18 or newer

## Run locally

1. Open a terminal in the project folder.
2. Install the project metadata and lockfile dependencies:

   ```powershell
   npm install
   ```

3. Start the local server:

   ```powershell
   npm start
   ```

4. Open [http://localhost:3000](http://localhost:3000) in a browser.

The review workspace is available at [http://localhost:3000/approvals.html](http://localhost:3000/approvals.html). Approval decisions and comments are demo interactions and reset when the page is refreshed.

## Project structure

- `index.html` - login/landing page
- `dashboard.html` - dashboard page
- `team.html` - teams page
- `create-task.html` - task creation page
- `approvals.html` - task review workspace
- `css/` - page stylesheets
- `js/` - page scripts
- `assets/images/` - image assets
- `server.js` - dependency-free static Node.js server
