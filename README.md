# Orbit - Team Collaboration & Work Management System

Orbit is a team collaboration and work management system designed to help teams organise projects, assign work, review submissions and communicate in one place.

The CE-1 frontend is retained as static HTML, CSS and JavaScript. The Node.js backend now uses MongoDB for persistent users and tasks, bcrypt for password hashing, JWT for authentication, protected routes, and role-based authorization.

## Team members

- Riya Sood
- Meghna Rana
- Vaibhavi Jha
- Vanshita Taneja

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

## Organisation dashboard, workspace, and announcement APIs

The dashboard uses authenticated, database-backed data from these endpoints:

- `GET /api/organisation/dashboard` returns task totals, completion percentage, total teams and organisation members, team completion rates, member task/contribution totals, top contributors, recent tasks, upcoming deadlines, and upcoming events. Completed tasks are those with status `Completed`; pending tasks are all other statuses. Overdue means an incomplete task with a `YYYY-MM-DD` due date earlier than the current UTC date. Team productivity is completed tasks divided by all team tasks; top performers are ranked by recorded all-time contribution points.
- `GET /api/organisation/workspace` returns the authenticated user's workspace view: admins/managers see organisation-wide tasks and teams, team leaders see their teams and their tasks, and members see tasks assigned to them plus tasks in their teams. The response includes task totals, deadlines, team productivity, the user's contribution points, recent contribution activity, and upcoming events. Both dashboard endpoints return `recentSubmissions: []` with `submissionTrackingAvailable: false`: the Submission model defines the data schema, but submission APIs and dashboard integration are not implemented yet.
- Dashboard events: `GET|POST /api/organisation/events`, `GET|PATCH|PUT|DELETE /api/organisation/events/:id`, `POST /api/organisation/events/:id/checklist`, `PATCH|DELETE /api/organisation/events/:id/checklist/:itemId`.
- Dashboard announcements: `GET|POST /api/organisation/announcements`, `GET|PATCH|PUT|DELETE /api/organisation/announcements/:id`.
- Workspace: `GET /api/organisation/workspace`, `GET /api/organizations/me`, `GET /api/organizations/members`, manager/admin `GET /api/organizations/me/invite-code`, and admin-only `POST /api/organizations/me/invite-code`.
- Announcements page: `GET|POST /api/announcements` and `GET|PUT|PATCH|DELETE /api/announcements/:id`. List accepts `page` (default 1), `limit` (default 10, maximum 50), and optional `priority` (`Normal`, `Important`, or `Urgent`); the response includes `{ "announcements": [...], "pagination": { "page": 1, "limit": 10, "total": 0, "pages": 0 } }`. The page API accepts `message` and maps it to the existing `content` field; create/update accept `title`, `message`, and `priority`. Writes to the announcement APIs require authentication, and use the app's existing authenticated-member access rule.
- Team editing from the workspace supports `PUT /api/teams/:id` with `name`, `description`, `leaderId`, and/or `memberIds`. Team and member lookups are scoped to the current workspace.

All writes use JSON. Event create/update fields are `title`, `description`, `date` (ISO date or datetime), and `location`; an optional `checklist` array can be included at creation. The dashboard announcement API uses `title` and `content`. Checklist item creation accepts `{ "text": "..." }`; updates accept `text`, `completed`, or both. Successful creates return `201` and an `{ "event": ... }` or `{ "announcement": ... }` object. Dashboard list responses use `{ "events": [...] }` and `{ "announcements": [...] }`; dashboard responses contain `stats`, `teams`, `members`, `topPerformers`, `upcomingDeadlines`, `recentTasks`, `upcomingEvents`, and the submission availability flag. Failures return `{ "error": "..." }`.

For compatibility, startup creates the default `Orbit Workspace`, assigns legacy users, teams, and tasks without an organisation to it, and new signups without an invitation code join it. Signup accepts an optional workspace invite code; invitation codes are generated per workspace, and an admin can rotate the current workspace's code. The repository does not yet include a workspace-creation flow, so additional workspaces must be provisioned through the existing database/model. Organisation IDs are taken from the authenticated account, never from request bodies. Dashboard events and announcements follow the app's authenticated-member access rule.

Run the focused organisation route/schema tests with `node --test server/routes/organisation.test.js`. They use in-memory model stubs and do not replace live MongoDB integration testing.

## Project structure

- `index.html` - login/landing page
- `dashboard.html` - dashboard page
- `workspace.html` - user-scoped tasks, team progress, activity, events, members, invitation code, and team management
- `announcements.html` - paginated workspace announcements
- Team information is displayed as static cards on `dashboard.html`
- `create-task.html` - task creation page
- `approvals.html` - task review workspace
- `css/` - page stylesheets
- `js/` - page scripts
- `assets/images/` - image assets
- `server.js` - dependency-free static Node.js server
