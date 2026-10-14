# Task Pilot

Task Pilot is a personal task manager with an AI chat assistant and optional GitHub integration. It is split into a React web app, an Express account service, a FastAPI application API/orchestrator, and two internal MCP tool servers.

## What is implemented

- Email/password registration, email verification, sign-in, password reset, and refresh-cookie sessions.
- Optional GitHub sign-in or GitHub connection for an existing account. Account linking is explicit; matching email addresses are not merged automatically.
- Home, task management, assistant chat, GitHub connection, and account settings pages.
- User-owned task CRUD for the web page and the same task records through assistant tools.
- Separate saved conversations with titles, history, rename, and delete actions.
- Gemini chat orchestration with internal task and optional GitHub MCP tools.
- Required configuration checks. Services stop with a named configuration error when required settings are missing; no credential, URL, or port fallback is supplied by application code.

## Services

| Service | Responsibility |
| --- | --- |
| `react-frontend` | Sign-in screens, home, manual task management, assistant, GitHub connection, and account settings. |
| `express-auth-service` | Account credentials, email delivery, GitHub OAuth, encrypted GitHub tokens, and access/refresh sessions. |
| `fastapi-orchestrator` | Authenticated task and conversation APIs, Gemini responses, and routing to MCP tools. |
| `mcp-task-manager` | Internal task tools used by the assistant. |
| `mcp-github` | Internal repository and issue tools used when a user has connected GitHub. |
| MongoDB | Shared account, task, and conversation storage. |

The email service is configured through SMTP. GitHub is optional for users who only need task management. Gemini, MongoDB, and SMTP are required for the planned app flows.

## Configuration

Each service has an `.env.example` containing the required variable names with blank values. Copy it to `.env` in that service directory and supply values for the environment where the service will run. Keep `.env` files out of version control. Do not put production secrets in frontend variables; Vite variables are visible to browsers.

### Frontend (`react-frontend`)

- `VITE_PORT`: the explicit Vite development and preview server port.
- `VITE_AUTH_URL`: reachable base URL for the Express auth service.
- `VITE_API_URL`: reachable base URL for the FastAPI service.

### Account service (`express-auth-service`)

- `NODE_ENV`, `PORT`, `FRONTEND_URL`, and `MONGO_URI`.
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`: distinct secrets, each at least 32 characters. The access secret must match the FastAPI service.
- `ENCRYPTION_KEY`: exactly 32 UTF-8 bytes, identical in Express and FastAPI. It protects GitHub tokens at rest.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM`.
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `GITHUB_CALLBACK_URL` together when enabling GitHub. Leave all three unset to disable GitHub sign-in and linking.

The GitHub OAuth app callback URL must exactly match `GITHUB_CALLBACK_URL`. The app currently requests `repo read:user` to support repository and issue actions, including private repositories. Review the requested GitHub access before deploying to users.
Disconnecting GitHub revokes the OAuth grant with GitHub before removing the saved connection; if revocation fails, the app keeps the connection active so the user can retry.

### Application API (`fastapi-orchestrator`)

- `PORT`, `FRONTEND_URL`, and `MONGO_URI`.
- `JWT_ACCESS_SECRET` and `ENCRYPTION_KEY`, matching the Express service.
- `GEMINI_API_KEY` and `GEMINI_MODEL`.
- `TASK_MCP_URL` and `GITHUB_MCP_URL`, pointing to the internal MCP SSE endpoints.

### MCP servers

- `mcp-task-manager`: `PORT` and `MONGO_URI`.
- `mcp-github`: `PORT`.

Use the same MongoDB URI, including its database name in the URI path, for Express, FastAPI, and the task MCP server. Assign distinct ports and service URLs for the environment, then use those same values consistently in CORS, OAuth callbacks, the frontend configuration, and MCP URLs.

## Running locally

1. Copy each `.env.example` to `.env` and provide every required value. Generate distinct random JWT secrets and a random 32-character ASCII encryption key (32 bytes in UTF-8); do not reuse the example file as a working configuration.
2. Use Node.js 20.19 or newer, or 22.12 or newer, for the frontend and Express service. Install their packages with `npm install` in their respective directories. Install each Python service's dependencies from its `requirements.txt`.
3. Start MongoDB, then run each service in its own terminal from its service directory: Express with `npm run dev`, FastAPI with `python main.py`, and each MCP server with `python server.py`.
4. Start the frontend with `npm run dev` from `react-frontend` and open the origin configured as `FRONTEND_URL`.

For production, use HTTPS, set `NODE_ENV=production`, configure secure cookie behavior, restrict internal MCP endpoints to the application network, and store credentials in the deployment platform's secret manager.

## Existing data

- Existing tasks and conversations remain user-scoped. Older conversation message arrays are read and converted into the new user-visible history format when opened and then saved in the new format after the next message.
- Existing encrypted GitHub tokens in the former CBC format can be read during the transition and are rewritten in authenticated AES-GCM format when used. If a token cannot be decrypted with the configured key, reconnect GitHub.
- The Express startup migrates the prior required, unique GitHub ID index to a sparse unique index so email-only accounts can coexist with GitHub accounts.
- Existing JWT and refresh-cookie sessions are invalidated by the new separate access/refresh secrets; each user signs in again after the update.
