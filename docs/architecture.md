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
│       ├── project-manager.md   # Shared PM methodology — all boards
│       ├── developer.md         # Shared dev instructions — all boards
│       ├── tester.md            # Shared test instructions — all boards
│       ├── archived/
│       └── {projectId}/         # Per-board context (auto-scaffolded on board creation)
│           ├── client.md        # Client boards only
│           ├── project.md       # Client boards only
│           └── archived/
├── server/
│   └── src/
│       ├── config/          # App configuration — constants.js (stable IDs), agent.config.json (models, pipeline, AI context groups)
│       ├── db/              # Schema only — CREATE TABLE definitions, calls seed/ on init
│       ├── middleware/      # JWT verification, isSuperAdmin, agent header passthrough
│       ├── routes/          # One file per resource group (tasks, agents, projects, members…)
│       ├── seed/            # Default data — index.js (seedDefaults), agent-templates.json (PM/Dev/Test templates)
│       ├── services/        # agentRunner.js (AI triggers), emailService.js (notifications)
│       └── utils/           # instructions.js (scaffold/manage instruction file structure)
├── app/
│   └── src/
│       ├── api/             # Axios client — one export group per resource
│       ├── store/           # Zustand slices: auth, board, workspace, ui
│       ├── constants/       # Column IDs, agent IDs, enums
│       └── components/      # Feature subdirs: agent/, board/, settings/, shared/, task/
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
     ├── SQLite DB           ← tasks, agents, columns, members, instructions
     ├── instructions/       ← markdown files agents read as context
     └── client/{name}/      ← the actual client repo agents work inside
```

---

## Pipeline

Happy path:

```
Backlog → In Progress → Testing → Human Review → Done
```

Branches:

- **Tester fails (retry 0)** → back to `In Progress` for one more attempt
- **Tester fails (retry exceeded)** → `Human Action` with failure summary
- **Agent escalates / blocked / max retries** (any column) → `Human Action`
- **Human resolves blocker** in Human Action → moves task back to continue

### Column IDs

| Column | ID | Intent |
|---|---|---|
| Backlog | `col_backlog` | Tasks not yet started. PM planning runs here before any work begins. |
| In Progress | `col_inprogress` | Agent or human works the task based on their capabilities. |
| Testing | `col_testing` | Tester agent runs automated checks. Pass → Human Review. Fail → retry once, then Human Action. |
| Human Action | `col_humanaction` | Task is blocked — agent escalated, max retries hit, or explicit flag. |
| Human Review | `col_humanreview` | Work is complete and tested. Human gives final sign-off. |
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
7.  Dev agent creates git worktree → implements → commits to feature/<taskId> → opens PR
8.  Task moves to Testing → tester agent triggered
9.  Tester runs checks → passes (Human Review) or fails (retry → In Progress or Human Action)
10. Human reviews PR → approves → task moves to Done
```

