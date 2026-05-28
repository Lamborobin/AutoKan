# Agent Capabilities

Read this file when working on agent capabilities, permissions, or column-to-agent assignment.

Capabilities are string identifiers stored as a JSON array on each agent (`permissions` field in DB). They define what an agent is scoped to do and, when a runner exists, automatically trigger work when a task lands in the matching column.

The **identifier** (e.g. `perm_coding`, `perm_planning`) is what the code checks. The label is the display name shown in the UI to the user and can be changed to any language or convention without affecting behavior.

---

## Capabilities with a Runner

When an agent with this capability is assigned to a task in the matching column, the runner fires automatically.

---

### perm_planning — `col_backlog`

Triggers the planning phase. Agent clarifies requirements through Q&A before any work begins.

1. Task lands in `col_backlog` → runner fires
2. Agent calls `ask_question` tool → posts clarifying questions, builds a checklist
3. Human answers → agent re-evaluates; marks resolved checklist items
4. When all items resolved → agent calls `approve_task` → writes requirements summary, acceptance criteria, priority, complexity
5. Task waits for human sign-off (`human_approval_status = 'approved'`) → unlocks for In Progress

---

### perm_coding — `col_inprogress`

Full code access — any file in `client/`. Uses the assigned agent's model and system prompt.

1. Task lands in In Progress with a coding-capable agent assigned
2. Agent creates an isolated git worktree (`AutoKan-wt-<taskId>` / branch `feature/<taskId>`)
3. Implements inside the worktree — write access scoped to `client/` only
4. `git add -A && git commit && git push feature/<taskId>`
5. Agent calls `task_complete` → server creates GitHub PR automatically

**Exit — `auto_complete = true`:**
- Server attempts to auto-merge the PR
- Merge succeeds → task moves to `col_testing`
- Merge fails → task moves to `col_humanaction` ("Auto-merge failed — please review manually")

**Exit — `auto_complete = false`:**
- Task moves to `col_humanaction` ("PR ready for review")

If blocked at any point → agent calls `request_human` → task moves to `col_humanaction` with reason.

---

### perm_coding_tester — `col_testing`

Tests code against acceptance criteria. Runs in `PROJECT_ROOT` (no worktree). Write access scoped to test files only (`*.test.*`, `*.spec.*`, `__tests__/`, `test/`).

1. Task lands in Testing with a tester-capable agent assigned
2. Agent reads relevant source files and runs the existing test suite (`bash`)
3. Writes additional tests if coverage is missing for acceptance criteria
4. Agent calls `task_complete { passed: true | false }`

**Exit — passed:**
- Task moves to `col_humanaction` (ready for human sign-off)

**Exit — failed:**
- Retry 0 → task moves back to `col_inprogress`
- Retry 1+ (max retries exceeded) → task moves to `col_humanaction` with failure summary

Retry count tracked in `task.metadata.test_retry_count`.

---

## Capabilities without a Runner

Defined and assignable but no active runner yet. Sections below specify scope, write access, tools, and exit conditions — ready to be built from when a runner is added.

---

### perm_frontend — `col_inprogress`

Frontend-only code changes. Scoped to the `app/` folder. Intended for agents that should not touch backend code.

**Write access:** `app/` only — any attempt to write outside `app/` is denied at the tool level.

**Flow (mirrors `perm_coding`, narrower scope):**
1. Task lands in In Progress with a frontend-capable agent assigned
2. Agent creates an isolated git worktree
3. Implements inside the worktree — write access scoped to `app/` only
4. Commits and pushes `feature/<taskId>`
5. Calls `task_complete` → server creates PR; same `auto_complete` exit logic as `perm_coding`

---

### perm_backend — `col_inprogress`

Backend-only code changes. Scoped to the `server/` folder. Intended for agents that should not touch frontend code.

**Write access:** `server/` only — any attempt to write outside `server/` is denied at the tool level.

**Flow (mirrors `perm_coding`, narrower scope):**
1. Task lands in In Progress with a backend-capable agent assigned
2. Agent creates an isolated git worktree
3. Implements inside the worktree — write access scoped to `server/` only
4. Commits and pushes `feature/<taskId>`
5. Calls `task_complete` → server creates PR; same `auto_complete` exit logic as `perm_coding`

---

### perm_architect — `col_inprogress`

Architectural analysis and design. Produces structural recommendations — does not write production code.

**Write access:** `instructions/{subscriptionId}/{projectId}/` only (e.g. writing an `architecture-proposal.md` file).

**Flow:**
1. Task lands in In Progress with an architect-capable agent assigned
2. Agent reads the codebase (`read_file`, `bash` for analysis commands)
3. Produces a written architectural proposal or review in the project's instruction folder
4. Calls `task_complete` with a summary → task moves to `col_humanaction` (ready for human sign-off) (always — no auto-merge)
5. Human reviews the proposal and decides next steps

If the scope requires code changes, agent documents them in the proposal rather than implementing them directly.

---

### perm_ux — `col_inprogress`

Frontend UX-specialised tasks. Same scope as `perm_frontend` but limited to UI/component files — layout, styling, interaction patterns.

**Write access:** `app/src/` only — scoped to component, style, and view files.

**Flow:** Same as `perm_frontend`. Agent focuses on user-facing presentation and interaction, not data fetching or business logic.

---

### perm_code_reader

Read-only code analysis. Agent reads and understands the codebase but cannot modify any files. Intended for review, audit, or observer agents.

**Write access:** none.

**Flow:**
1. Task assigned to agent in any column
2. Agent reads relevant files (`read_file`, `bash` for read-only commands like `grep`, `find`)
3. Logs findings progressively via `task_log`
4. Calls `task_complete` with a full analysis summary → task moves to `col_humanaction` (ready for human sign-off)

---

### perm_migrate

Data migration tasks — schema changes, data transformations, migration scripts. Touches only affected migration files, no wider code changes.

**Write access:** migration files only — files matching `*migration*`, `migrations/`, `*schema*`, or explicitly scoped directories agreed per project.

**Flow:**
1. Task lands in assigned column with a migration-capable agent
2. Agent reads the current schema and existing migrations
3. Writes migration script(s) — write access enforced to migration paths
4. Runs the migration in a dry-run or staging context (`bash`)
5. Calls `task_complete` with migration summary → task moves to `col_humanaction` (ready for human sign-off) for human to apply or approve

---

### perm_network

Network testing and external endpoint checks. Runs locally or against reachable external targets.

**Write access:** none.

**Flow:**
1. Task assigned with a network-capable agent
2. Agent runs network commands (`bash` — `curl`, `ping`, `traceroute`, port checks)
3. Logs results via `task_log`
4. Calls `task_complete` with findings → task moves to `col_humanaction` (ready for human sign-off)

Agent must not initiate destructive or unauthorized external requests. If a target is unreachable or credentials are missing, calls `request_human`.

---

### perm_cloud

Cloud environment access — health checks, deployment status, safe operational commands. Does not modify infrastructure configuration.

**Write access:** none (observes only; infrastructure changes are human-approved).

**Flow:**
1. Task assigned with a cloud-capable agent
2. Agent queries cloud APIs or runs read-only cloud CLI commands (`bash`)
3. Reports status, logs, or health check results via `task_log`
4. Calls `task_complete` with findings → task moves to `col_humanaction` (ready for human sign-off)

If action is required (scaling, restart, config change), agent documents the recommendation and calls `request_human` — it does not act.

---

### perm_security_control

Security analysis and vulnerability review. Reads code and `.env` usage — never modifies files.

**Write access:** none.

**Flow:**
1. Task assigned with a security-capable agent
2. Agent reads source files, checks `.env` usage, scans for known patterns (`bash` — static analysis tools, `grep`)
3. Logs findings progressively via `task_log`
4. Calls `task_complete` with a structured findings report → task moves to `col_humanaction` (ready for human sign-off)

Agent never logs secret values — only describes the gap (e.g. "hardcoded credential found in `server/config.js:42`").

---

### perm_log_reader

Reads and summarises logs from the filesystem and cloud (when cloud access is enabled).

**Write access:** none.

**Flow:**
1. Task assigned with a log-reader agent
2. Agent reads log files (`read_file`, `bash` — `tail`, `grep`, log CLI commands)
3. Identifies errors, warnings, or anomalies
4. Calls `task_complete` with a structured summary → task moves to `col_humanaction` (ready for human sign-off)

---

### perm_data_analytic

Extracts and analyses data from relevant project areas. Read-only. Does not modify source data.

**Write access:** none (analysis output goes to `task_log` and `task_complete` summary only).

**Flow:**
1. Task assigned with an analytics-capable agent
2. Agent reads data files or queries relevant exports (`read_file`, `bash`)
3. Runs analysis, builds summaries, identifies patterns
4. Calls `task_complete` with findings → task moves to `col_humanaction` (ready for human sign-off)

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
| `col_inprogress` | `perm_coding` (future: `perm_frontend`, `perm_backend`, `perm_architect`, `perm_ux`) |
| `col_testing` | `perm_coding_tester` |

Superadmins bypass all column access checks.
