# Orbit - Team Collaboration & Work Management System

Orbit is a team collaboration and work management system designed to help teams organise projects, assign work, review submissions and communicate in one place.

For CE-1, the project is being developed as a static HTML, CSS and JavaScript implementation. For CE-2, this implementation will be converted into a React application. The current Node.js server only serves the front-end files locally; it does not provide a database, authentication, file uploads, or persistent data storage.

## Team members

- Riya
- Meghna
- Vaibhavi
- Vanshita

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

3. Start the local server:

   ```powershell
   npm start
   ```

4. Open [http://localhost:3000](http://localhost:3000) in a browser.

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
