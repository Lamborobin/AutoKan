# Architecture

Read this file when making structural changes, or when the reason behind a system design is unclear.

---

## Monorepo Structure

```
AutoKan/
├── client/                  # Live client repos — one subfolder per connected board
│   └── {clientName}/        # one subfolder per board — the actual code agents work in
├── docs/                    # Extended documentation — read on demand via CLAUDE.md
├── instructions/            # Instruction files — scoped by subscription and board
│   └── {subscriptionId}/    # e.g. sub_default/
│       ├── planning.md          # Shared planner methodology — all boards
│       ├── dev-implement.md     # Shared coder methodology — all boards
│       ├── run-code-tests.md    # Shared tester methodology — all boards
│       ├── archived/
│       └── {projectId}/         # Per-board context (auto-scaffolded on board creation)
│           ├── client.md        # Client boards only
│           ├── project.md       # Client boards only
│           └── archived/
├── server/
│   └── src/
│       ├── config/          # App configuration — constants.js (stable IDs), agent.config.json (AI Context panel groups)
│       ├── db/              # Schema only — CREATE TABLE definitions, calls seed/ on init
│       ├── middleware/      # JWT verification, isSuperAdmin, agent header passthrough
│       ├── routes/          # One file per resource group (tasks, agents, projects, members…)
│       ├── seed/            # Default data — index.js (seedDefaults), runners.json (capability + runner registry), agent-templates.json (PM/Dev/Test templates)
│       ├── services/        # agentRunner.js (AI triggers), runner-prompts/ (system-owned flow prompts), emailService.js (notifications)
│       └── utils/           # ids.js (ID generators), instructions.js (scaffold/manage instruction file structure)
├── app/                     # React + Vite frontend — app/src holds api/, store/, constants/, components/
├── data/                    # SQLite DB (auto-created, gitignored)
├── package.json             # Root workspace scripts
└── README.md
```

---

## System Overview

The database is the shared state — agents never talk to each other directly. Every agent action goes through the REST API, which enforces capability checks and access control.

```
Human / Agent
     │
     ▼
REST API (Express)          ← single source of truth for all state changes
     │
     ├── SQLite DB           ← tasks, agents, columns, members, projects, roles
     ├── instructions/       ← markdown files agents read as context
     └── client/{name}/      ← the actual client repo agents work inside
```

---

## Pipeline

Happy path:

```
Backlog → In Progress → Testing → Human Action → Done
```

Human Action is the single column for anything that needs human attention — whether that's a blocker, a sign-off after testing passes, or a max-retry failure. The task's reason / log entries distinguish *why* it's there.

Branches:

- **Tester passes** → `Human Action` with "Ready for sign-off"
- **Tester fails (retry 0)** → back to `In Progress` for one more attempt
- **Tester fails (retry exceeded)** → `Human Action` with failure summary
- **Agent escalates / blocked** (any column) → `Human Action` with reason
- **Human resolves / signs off** in Human Action → moves task back to continue (or to Done)

### Column IDs

| Column | ID | Intent |
|---|---|---|
| Backlog | `col_backlog` | Tasks not yet started. PM planning runs here before any work begins. |
| In Progress | `col_inprogress` | Agent or human works the task based on their capabilities. |
| Testing | `col_testing` | Tester agent runs automated checks. Pass → Human Action. Fail → retry once, then Human Action. |
| Human Action | `col_humanaction` | Task needs a human — blocker, sign-off, max retries, or explicit flag. |
| Done | `col_done` | Task complete. Human approved. |
| Unassigned | `col_unassigned` | Holding bucket (position `-1`) — not part of the pipeline flow. |

---

## Scope: Board vs Subscription

| Level | Represents | Owns |
|---|---|---|
| **Subscription** | The workspace (one per install) | Agents, clients, teams, superadmins, shared instruction files |
| **Board (Project)** | A single client engagement | Tasks, columns, board members, board-specific instruction files, client folder connection |

Personal boards have `client_id = NULL` — they don't scaffold `client.md` or `project.md`.

---

## Capabilities & Runners

Agent behavior is driven by a registry, not hardcoded dispatch.

- **Capabilities** (`perm_*`) are skills an agent has. An agent has **exactly one** `perm_*` capability — server validates this on create/update.
- **Runners** map a `(capability, column)` pair to an executable flow (prompt file, model, exit behavior). Same capability in a different column = a different runner = a different flow. Example: `perm_coding` in `col_inprogress` writes code and opens a PR; the same capability could in future have a runner in `col_humanaction` that responds to PR review comments.
- Registry lives in `server/src/seed/runners.json` — the single source of truth.
- Dispatch lives in `server/src/services/agentRunner.js`. On task column change or assignment change, it looks up the registered runner for `(agent.capability, task.column)` and invokes the named handler (`clarify_and_approve`, `implement_in_worktree`, `test_with_retry`, …).
- Adding a new (capability × column) behavior: add a registry entry + the prompt file + (if no existing handler fits) a handler in `agentRunner.js`.

Each capability in the registry also declares its write-access scope (e.g. `perm_coding` → `client/`, `perm_coding_tester` → test files only), whether it's a coder (`is_coder`), and which `docs/` files load into its agents' context (`context_docs`).

---

## Authentication

- **Humans** — Google OAuth → JWT stored in `localStorage`. All requests carry `Authorization: Bearer <token>`.
- **Agents** — HTTP header `X-Agent-Id: <agent_id>`. No JWT — agents are server-side processes.
- **Superadmins** — flagged in `subscription_admins` table. Bypass board membership checks and role restrictions.

---

## Data Flow: Task Lifecycle

```
1.  Human creates task in Backlog → assigned agent has perm_planning
2.  Server detects perm_planning → sets pm_approval_status = 'pending' → triggers planning runner
3.  Planning agent reads task + context files → asks questions or approves
4.  Human answers → pm_approval_status = 'approved'
5.  Human gives sign-off → human_approval_status = 'approved' → task unlocked
6.  Human moves task to In Progress → dev agent triggered
7.  Server creates an isolated git worktree on feature/<taskId> → dev agent implements, commits, pushes the feature branch (never master — merges and non-feature pushes are blocked) → calls task_complete → server opens a PR
8.  If task.auto_complete → server merges the PR to master and moves the task to Testing automatically; otherwise the task moves to Human Action ("PR ready for review") for a human to review and merge
9.  Testing → tester agent triggered: pass → Human Action ("Ready for sign-off"); fail → retry (In Progress), then Human Action after max retries
10. Human signs off / merges the PR in Human Action → moves the task onward to Done
```

