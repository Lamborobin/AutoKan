# API Reference

Read this file when implementing or modifying API routes, or when an agent needs to call the API.

Base URL: `http://{ENVIRONMENT_URL}/api`
Auth: `Authorization: Bearer <jwt>` for humans · `X-Agent-Id: <agent_id>` for agents

---

## Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/health | Liveness check — returns `{ status: 'ok' }`. No auth. |

---

## Real-time

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/events | Server-Sent Events stream. The frontend subscribes for live `broadcast()` updates (task / agent / board changes). |

---

## Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/google | Exchange a Google ID token for a JWT. Body: `{ credential, inviteToken? }`. First user auto-promoted to superadmin. |
| GET | /api/auth/me | Current user profile + `isSuperAdmin` flag |
| PATCH | /api/auth/profile | Update `first_name`, `last_name`, `company_name` |
| GET | /api/auth/users | List users (for invite/admin pickers) |

---

## AI Context Docs (superadmin)

The `/api/docs` group serves the editable doc files driven by `agent.config.json`'s `ai_context` groups (consumed by the Settings → AI Context panel). Edit history is stored in `docs/.versions/` and is wiped by `npm run db:reset`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/docs | Get all doc groups with file content + last_modified |
| GET | /api/docs/:key/versions | List saved versions for a doc (superadmin) |
| GET | /api/docs/:key/versions/:filename | Read a specific version (superadmin) |
| PATCH | /api/docs/:key | Overwrite doc content (archives current as a new version) (superadmin) |

---

## Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/tasks | List tasks (`?column_id=`, `?assigned_agent_id=`, `?project_id=`, `?include_archived=true`) |
| GET | /api/tasks/:id | Get single task |
| POST | /api/tasks | Create task |
| PATCH | /api/tasks/:id | Update task fields |
| POST | /api/tasks/:id/move | Move to a column |
| POST | /api/tasks/:id/toggle_checklist_item | Check/uncheck a checklist item |
| POST | /api/tasks/:id/log | Add an activity log entry |
| POST | /api/tasks/:id/request_human | Flag as blocked, move to Human Action |
| POST | /api/tasks/:id/approve_pr | Approve the task's PR |
| GET | /api/tasks/:id/check_pr | Check PR status |
| POST | /api/tasks/:id/archive | Archive task |
| POST | /api/tasks/:id/unarchive | Restore archived task |
| POST | /api/tasks/:id/bypass_pm | Skip PM planning gate |
| POST | /api/tasks/:id/save_client_context | Append PM's context draft to `client.md` and clear draft |
| POST | /api/tasks/:id/dismiss_client_context | Discard PM's context draft without saving |
| DELETE | /api/tasks/:id | Delete task |

### PM Planning

| Method | Endpoint | Who | Description |
|--------|----------|-----|-------------|
| POST | /api/tasks/:id/pm_question | Planning agent | Post a clarifying question |
| POST | /api/tasks/:id/answer | Human | Answer planning agent's pending question |
| POST | /api/tasks/:id/request_pm_review | Human | Manually trigger planning review |
| POST | /api/tasks/:id/pm_review | Planning agent | Approve or reject spec |

### Human Approval

| Method | Endpoint | Who | Description |
|--------|----------|-----|-------------|
| POST | /api/tasks/:id/approve | Human | Give sign-off (after PM approves) |
| POST | /api/tasks/:id/reject | Human | Reject and reset cycle |

### Comments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/tasks/:id/comments | List comments |
| POST | /api/tasks/:id/comments | Add comment |
| PATCH | /api/tasks/:id/comments/:commentId | Edit comment |
| DELETE | /api/tasks/:id/comments/:commentId | Delete comment |

---

## Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/agents | List agents |
| GET | /api/agents/:id | Get single agent |
| POST | /api/agents | Create agent |
| PATCH | /api/agents/:id | Update agent |
| POST | /api/agents/:id/save-as-template | Snapshot agent as a new template |
| POST | /api/agents/:id/archive | Archive agent |
| POST | /api/agents/:id/unarchive | Restore agent |
| DELETE | /api/agents/:id | Delete (hard) if no tasks; 409 if has tasks |

---

## Agent Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/agent-templates | List templates (`?include_archived=true`) |
| POST | /api/agent-templates | Create template |
| PATCH | /api/agent-templates/:id | Update template |
| POST | /api/agent-templates/:id/archive | Archive |
| POST | /api/agent-templates/:id/unarchive | Restore |
| DELETE | /api/agent-templates/:id | Delete if no agents created from it; 409 otherwise |

---

## Roles / Capabilities

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/roles | List all capabilities |

---

## Columns

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/columns | List columns (`?include_archived=true`, `?project_id=`) |
| POST | /api/columns | Create column |
| PATCH | /api/columns/:id | Update column |
| POST | /api/columns/:id/archive | Archive |
| POST | /api/columns/:id/unarchive | Restore |
| DELETE | /api/columns/:id | Delete if no tasks; 409 if has tasks |

---

## Projects (Boards)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/projects | List boards (`?include_archived=true`) |
| GET | /api/projects/:id | Get single board |
| POST | /api/projects | Create board |
| PATCH | /api/projects/:id | Update board |
| POST | /api/projects/:id/clone | Clone board |
| POST | /api/projects/:id/archive | Archive |
| POST | /api/projects/:id/unarchive | Restore |
| DELETE | /api/projects/:id | Delete board |
| GET | /api/projects/client-repos | List `client/` subfolders on disk |

### Board Members

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/projects/:id/members | List members |
| POST | /api/projects/:id/members | Add member by email |
| POST | /api/projects/:id/members/add-team | Add all members of a team |
| PATCH | /api/projects/:id/members/:memberId | Update member roles |
| DELETE | /api/projects/:id/members/:memberId | Remove member |

---

## Teams

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/teams | List teams |
| POST | /api/teams | Create team |
| PATCH | /api/teams/:id | Update team |
| DELETE | /api/teams/:id | Delete team |
| GET | /api/teams/:id/members | List team members |
| POST | /api/teams/:id/members | Add member by email |
| DELETE | /api/teams/:id/members/:email | Remove member |

---

## Clients

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/clients | List clients (`?include_archived=true`) |
| POST | /api/clients | Create client |
| PATCH | /api/clients/:id | Update client |
| POST | /api/clients/:id/archive | Archive |
| POST | /api/clients/:id/unarchive | Restore |
| DELETE | /api/clients/:id | Delete |

---

## Subscriptions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/subscriptions/me | Get workspace info and admins |
| PATCH | /api/subscriptions/me | Update workspace name (superadmin only) |
| POST | /api/subscriptions/admins | Add superadmin by email |
| DELETE | /api/subscriptions/admins/:userId | Remove superadmin |

---

## Instruction Files

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/instructions | List instruction files |
| GET | /api/instructions/:filename | Get file content |
| PATCH | /api/instructions/:filename | Update file content |
| POST | /api/instructions | Create file |
| POST | /api/instructions/:filename/archive | Archive |
| POST | /api/instructions/:filename/unarchive | Restore |
| DELETE | /api/instructions/:filename | Delete |

---

## Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/notifications | List notifications for current user (newest first, max 50) |
| PATCH | /api/notifications/:id/read | Mark one notification as read |
| POST | /api/notifications/read-all | Mark all unread notifications as read |

---

## Invites

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/invites | List invites |
| POST | /api/invites | Send invite |
| DELETE | /api/invites/:id | Remove invite |
| GET | /api/invites/verify | Verify invite token (`?token=`) |
