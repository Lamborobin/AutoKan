# Agent Capabilities

Read this file when working on agent capabilities, permissions, or column-to-agent assignment.

Capabilities are string identifiers stored as a JSON array on each agent (`permissions` field in DB). They define what an agent is scoped to do and, when a runner exists, automatically trigger work when a task lands in the matching column.

The **identifier** (e.g. `perm_coding`, `perm_planning`) is what the code checks. The label is the display name shown in the UI to the user and can be changed to any language or convention without affecting behavior.

---

## Capabilities with a Runner

When an agent with this capability is assigned to a task in the matching column, the runner fires automatically.

### perm_planning — `col_backlog`

Triggers the planning phase. Requirements are clarified through Q&A before any work begins.

- Task assigned in `col_backlog` → `pm_approval_status = 'pending'` → runner fires
- Agent posts questions via `POST /api/tasks/:id/pm_question`
- Agent approves via `POST /api/tasks/:id/pm_review { approved: true }`
- Human gives sign-off → `human_approval_status = 'approved'` → task unlocked for In Progress

If no agent is assigned, falls back to any active agent with `perm_planning`. `isPmPlanning` is determined by `!!task.pm_approval_status`, not by agent ID.

---

### perm_coding — `col_inprogress`

Full code access — any file in the project. Uses the actually assigned agent's model and system prompt.

```
1. Task lands in In Progress with a coding-capable agent assigned
2. Agent creates an isolated git worktree for the task
3. Implements the task inside the worktree
4. Commits all changes to feature/<taskId>
5. Opens a PR for human review
6. Moves to Testing (auto_complete = true) or Human Action (auto_complete = false)
```

---

### perm_coding_tester — `col_testing`

Tests code — debugging, unit tests, integration tests. Runs in PROJECT_ROOT (no worktree). Can only write test files (`*.test.*`, `*.spec.*`, `__tests__/`, `test/`).

```
1. Task lands in Testing with a tester-capable agent assigned
2. Agent runs automated checks against the codebase
3. task_complete { passed: true }  → task moves to col_humanreview
4. task_complete { passed: false } → retry 0: back to col_inprogress
                                     retry 1+: col_humanaction (max retries exceeded)
```

Retry count tracked in `task.metadata.test_retry_count`.

---

## Capabilities without a Runner

Defined and assignable but no active runner yet. Describe the agent's scope and role. Runners will be added as the product grows.

---

### perm_frontend — `col_inprogress` (planned)

Frontend code changes only — scoped to the `app/` folder.

---

### perm_backend — `col_inprogress` (planned)

Backend code changes only — scoped to the `server/` folder.

---

### perm_architect — `col_inprogress` (planned)

Designs system foundations and high-level structure. Code analysis, architectural review, refactoring recommendations.

---

### perm_ux — `col_inprogress` (planned)

Frontend UX-specialised tasks only. *Not yet fully defined.*

---

### perm_code_reader

Reads and understands code but cannot modify it. Intended for read-only review or observer agents.

---

### perm_migrate

Handles data migrations — only affected areas, no wider code changes.

---

### perm_network

Network testing and external commands, locally or outside the project.

---

### perm_cloud

Cloud environment access — checks app health, operates cloud safely.

---

### perm_security_control

Security analysis, vulnerability scanning, `.env` usage review. No modifications.

---

### perm_log_reader

Reads logs in the file system and cloud (when cloud is enabled).

---

### perm_data_analytic

Extracts and analyses data from appropriate areas of the app.

---

## Column Access Roles

Column access and capabilities are two separate systems that compose together:

- **Column access** (`role_access_*`) — answers "can this agent/user be assigned here?" Pure gate. No column access = cannot be placed in that column at all.
- **Capability** (`perm_*`) — answers "what happens when they are here?" Triggers the runner. No matching capability = agent is in the column but nothing fires.

Both live in the `role_ids` array on the agent or member.

| Role | Access granted |
|---|---|
| `role_access_any` | All columns (default for most agents) |
| `role_access_backlog` | `col_backlog` only |
| `role_access_inprogress` | `col_inprogress` only |
| `role_access_testing` | `col_testing` only |
| `role_access_humanaction` | `col_humanaction` only |
| `role_access_done` | `col_done` only |

### Currently active capability→column pairs

| Column | Capability that fires a runner |
|---|---|
| `col_backlog` | `perm_planning` |
| `col_inprogress` | `perm_coding` (future: `perm_frontend`, `perm_backend`, etc.) |
| `col_testing` | `perm_coding_tester` |

Superadmins bypass all column access checks. Human capability scoping follows the same system and will be implemented in a future release.
