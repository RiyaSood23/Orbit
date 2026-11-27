# Orbit - Team Collaboration & Work Management System

Orbit is a team collaboration and work management system designed to help teams organise projects, assign work, review submissions and communicate in one place.

The CE-2 frontend is a React single-page application in `client/`, covering the landing page, authentication, dashboard, team management, task creation, submission approvals, and announcements. The Workspace page is intentionally excluded from the React app. Legacy CE-1 static pages remain in the repository but are not part of the React navigation. The Node.js backend uses MongoDB for persistent users and tasks, bcrypt for password hashing, JWT for authentication, protected routes, and role-based authorization.

## Team members

- Riya Sood
- Meghna Rana
- Vaibhavi Jha
- Vanshita Taneja

## Project phases

- **CE-1:** HTML, CSS and JavaScript implementation
- **CE-2:** React frontend (Workspace page excluded)

## Requirements

- Node.js 20 or newer

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

5. Start the local backend server. This builds the React app and serves the production build on port 3000:

   ```powershell
   npm start
   ```

6. In a second terminal, start the React development server:

   ```powershell
   npm run dev
   ```

7. Open [http://127.0.0.1:5173](http://127.0.0.1:5173) for React development; Vite proxies `/api` requests to the backend on port 3000. The built React app is also served from [http://127.0.0.1:3000](http://127.0.0.1:3000), so the backend can be tested without Vite.

The React app is the active CE-2 frontend. Legacy CE-1 HTML files remain in the repository for reference; their page URLs redirect to the matching React routes when the app is built.

## Organisation dashboard, workspace, and announcement APIs

The dashboard uses authenticated, database-backed data from these endpoints:

- `GET /api/organisation/dashboard` returns task totals, completion percentage, total teams and organisation members, team completion rates, member task/contribution totals, top contributors, recent tasks, upcoming deadlines, and upcoming events. The React dashboard also loads recent submissions separately from `GET /api/submissions`. Completed tasks are those with status `Completed`; pending tasks are all other statuses. Overdue means an incomplete task with a `YYYY-MM-DD` due date earlier than the current UTC date. Team productivity is completed tasks divided by all team tasks; top performers are ranked by recorded all-time contribution points.
- `GET /api/organisation/workspace` returns the authenticated user's workspace view: admins/managers see organisation-wide tasks and teams, team leaders see their teams and their tasks, and members see tasks assigned to them plus tasks in their teams. The response includes task totals, deadlines, team productivity, the user's contribution points, recent contribution activity, and upcoming events. The dashboard and workspace API responses still return `recentSubmissions: []` with `submissionTrackingAvailable: false`; the React dashboard loads submissions separately from `GET /api/submissions`.
- Dashboard events: `GET|POST /api/organisation/events`, `GET|PATCH|PUT|DELETE /api/organisation/events/:id`, `POST /api/organisation/events/:id/checklist`, `PATCH|DELETE /api/organisation/events/:id/checklist/:itemId`.
- Dashboard announcements: `GET|POST /api/organisation/announcements`, `GET|PATCH|PUT|DELETE /api/organisation/announcements/:id`.
- Workspace: `GET /api/organisation/workspace`, `GET /api/organizations/me`, `GET /api/organizations/members`, manager/admin `GET /api/organizations/me/invite-code`, and admin-only `POST /api/organizations/me/invite-code`.
- Announcements page: `GET|POST /api/announcements` and `GET|PUT|PATCH|DELETE /api/announcements/:id`. List accepts `page` (default 1), `limit` (default 10, maximum 50), and optional `priority` (`Normal`, `Important`, or `Urgent`); the response includes `{ "announcements": [...], "pagination": { "page": 1, "limit": 10, "total": 0, "pages": 0 } }`. The page API accepts `message` and maps it to the existing `content` field; create/update accept `title`, `message`, and `priority`. Writes to the announcement APIs require authentication, and use the app's existing authenticated-member access rule.
- Team management supports `PUT /api/teams/:id` with `name`, `description`, `leaderId`, and/or `memberIds`. Team and member lookups are scoped to the current workspace.

Except for file uploads, writes use JSON. Event create/update fields are `title`, `description`, `date` (ISO date or datetime), and `location`; an optional `checklist` array can be included at creation. The dashboard announcement API uses `title` and `content`. Checklist item creation accepts `{ "text": "..." }`; updates accept `text`, `completed`, or both. Successful creates return `201` and an `{ "event": ... }` or `{ "announcement": ... }` object. Dashboard list responses use `{ "events": [...] }` and `{ "announcements": [...] }`; dashboard responses contain `stats`, `teams`, `members`, `topPerformers`, `upcomingDeadlines`, `recentTasks`, `upcomingEvents`, and the submission availability flag. Failures return `{ "error": "..." }`.

### Submission and review APIs

- `POST /api/tasks/:taskId/submissions` lets the assigned member submit a completed task with a required `description` (up to 5,000 characters). A new submission is allowed after a reviewer requests a revision; duplicate active or final submissions are rejected.
- `GET /api/submissions` lists all submissions in the authenticated member's organisation; optional `taskId` and `status` filters are supported. Each entry includes task, team, assignee, and due-date metadata.
- `GET /api/submissions/:id` retrieves any submission in the authenticated member's organisation.
- `PATCH /api/submissions/:id/review` accepts `status` (`Under review`, `Revision requested`, `Approved`, or `Rejected`) and optional `feedback`. Any organisation member except the submitter may review; feedback is required for revision requests and rejections. Final decisions cannot be changed.
- `POST /api/submissions/:id/files` accepts multipart form data with one or more files in the `files` field. Up to five files are allowed per submission, with a 10 MB limit per file; supported types include common documents, images, text/code files, ZIP, and Figma exports.
- `GET /api/submissions/:id/files/:fileId` downloads an attachment after checking organisation access.
- `PATCH /api/submissions/:id/feedback` adds or updates formal feedback without changing the review status; any other organisation member may use it before a final decision.
- `POST /api/submissions/:id/comments` adds a comment from any member of the same organisation.

Submission, review, feedback, and comment activity is stored on each submission and displayed in the Approvals activity timeline. Submitters can add files and cannot review their own submissions.

Uploads use Multer and are stored under the ignored `.orbit-data/submissions/` directory, outside the static web root. They are only served through the authenticated download endpoint.

For compatibility, startup creates the default `Orbit Workspace`, assigns legacy users, teams, and tasks without an organisation to it, and new signups without an invitation code join it. Signup accepts an optional workspace invite code; invitation codes are generated per workspace, and an admin can rotate the current workspace's code. The repository does not yet include a workspace-creation flow, so additional workspaces must be provisioned through the existing database/model. Organisation IDs are taken from the authenticated account, never from request bodies. Dashboard events and announcements follow the app's authenticated-member access rule.

Run the focused route tests with `node --test server/routes/organisation.test.js server/routes/submissions.test.js`. They use in-memory model stubs and do not replace live MongoDB integration testing.

## Project structure

- `client/` - React application; routes include `/`, `/login`, `/dashboard`, `/team`, `/create-task`, `/approvals`, and `/announcements`
- `client/src/pages/` - React screens; there is intentionally no Workspace route or page
- `index.html`, `dashboard.html`, `workspace.html`, `announcements.html`, `create-task.html`, `approvals.html` - legacy CE-1 static pages, retained for reference; their routes redirect to React when built
- `css/` and `js/` - legacy CE-1 stylesheets and scripts
- `assets/images/` - image assets
- `server.js` - Node.js API and static server
- `vite.config.mjs` - React development server and API proxy
