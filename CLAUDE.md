# FlowAgent — Claude Code Orientation

**What This Is**: Autonomous AI agent task orchestration system — a kanban board where AI agents (PM, Developer, Tester) work through tasks autonomously with human checkpoints. Built for full ownership without third-party dependencies.

## Tech Stack
- **Backend**: Node.js + Express + SQLite (better-sqlite3)
- **Frontend**: React + Tailwind + Vite
- **Drag & Drop**: @dnd-kit
- **State**: Zustand
- **Future**: Docker for test environments

## Monorepo Structure
```
flowagent/
├── instructions/            # Agent system prompts + context files (selectable in UI)
│   ├── pm.md                # PM agent system prompt (methodology, not identity)
│   ├── developer.md         # Developer agent system prompt
│   ├── tester.md            # Tester agent system prompt
│   ├── project.md           # Full project context (tech stack, conventions, state)
│   └── client.md            # Client context (priorities, expectations, style)
├── server/                  # Node.js + Express + SQLite API (port 3001)
│   └── src/
│       ├── db/index.js      # Schema, init, seeding, migrations
│       ├── middleware/auth.js
│       ├── services/agentRunner.js  # PM AI auto-trigger via Anthropic SDK
│       └── routes/          # tasks.js, other.js (agents/columns/secrets/instructions/agent-templates)
├── app/                     # React frontend (Vite, port 5173)
│   └── src/
│       ├── api/index.js     # Axios API client
│       ├── store/index.js   # Zustand global state
│       └── components/      # Sidebar, Column, TaskCard, TaskDetail, Modals, AgentForm, TemplatesModal
├── data/                    # SQLite DB (auto-created, never committed)
└── README.md
```

## Pipeline
```
Backlog → In Progress → Testing → Human Review → Done
  (PM Q&A)   (Dev branch)            ↑
             ↑      |         (Tester passes)
             └──────┘  (1 retry on failure)
                    ↓
             Human Action  (blocked: secrets, errors, max retries)
```

### Column IDs
| Column | ID |
|---|---|
| Backlog | `col_backlog` |
| In Progress | `col_inprogress` |
| Testing | `col_testing` |
| Human Action | `col_humanaction` |
| Human Review | `col_humanreview` |
| Done | `col_done` |

## Capability-Based Agent Triggers

**IMPORTANT: All agent runners are triggered by capabilities, never by hardcoded agent IDs.**

Any agent can be given a capability via the Capabilities section in the agent editor. Default agents have their capabilities auto-assigned on every server start (idempotent).

| Capability | Trigger column | Runner | Default agent |
|---|---|---|---|
| `perm_pm_planning` | `col_backlog` | `triggerPmAgent` | `agent_pm` |
| `perm_coding` | `col_inprogress` | `triggerDevAgent` | `agent_dev` |
| `perm_coding_tester` | `col_testing` | `triggerTesterAgent` | `agent_test` |

The generic helper in `tasks.js`:
```js
function agentHasCapability(agentId, capability, db) { ... }
```
This is used at all three trigger points: task create, PATCH (re-assign), and move.

### PM Planning — How the trigger works
- Task created or agent assigned in `col_backlog` → check if assigned agent has `perm_pm_planning`
- If yes → set `pm_approval_status = 'pending'` → call `triggerPmAgent(taskId)`
- `runPmAgent` uses the **actually assigned agent's** system prompt, behavior prompt, and instruction files — not a hardcoded agent
- `isPmPlanning` in the frontend is determined by `!!task.pm_approval_status` — not by agent ID

### Dev Agent — How the trigger works
- Agent with `perm_coding` assigned to a task in `col_inprogress` → `triggerDevAgent(taskId)`
- `runDevAgent` uses the actually assigned agent's model + system prompt
- Creates an isolated git worktree, implements, commits to `feature/<taskId>`, creates a PR, moves to Human Action or Testing depending on `auto_complete`

### Tester Agent — How the trigger works
- Agent with `perm_coding_tester` assigned to a task in `col_testing` → `triggerTesterAgent(taskId)`
- `runTesterAgent` uses the actually assigned agent's model + system prompt
- Runs in PROJECT_ROOT (no worktree), can only write test files (*.test.*, *.spec.*, __tests__/, test/)
- `task_complete { passed: true }` → moves to `col_humanreview`
- `task_complete { passed: false }` → retry 0: back to `col_inprogress`; retry 1+: `col_humanaction`
- Retry count tracked in `task.metadata.test_retry_count`

### Code Reader (`perm_code_reader`)
Agents with only `perm_code_reader` are NOT auto-triggered in any column. They can be assigned to tasks and will read code but no runner fires automatically.

### PM Planning Conversation Flow
```
1. Human creates task in Backlog with a PM-capable agent assigned
2. pm_approval_status → 'pending' (auto-set)
3. PM reads description + context files
4. Two-phase approach:
   - Phase 1: Can the PM summarize the goal? If not → ask ONE goal question
   - Phase 2: Goal is clear → build checklist of only genuinely missing decisions
5. PM asks questions → pm_approval_status = 'questioning'
6. Human answers inline in task detail
7. PM re-evaluates → approves or asks one follow-up
8. PM approves → POST /api/tasks/:id/pm_review { approved: true }
9. Human gives sign-off → task unlocked for In Progress
```

### PM Behavior Prompt (template_system_prompt)
- Stored per-agent in DB, editable in the agent editor UI
- Short (≤1000 chars), 1–5 sentences — identity and modifiers only
- Main methodology lives in `instructions/pm.md`, NOT in the behavior prompt
- Supports `[STYLE]` and `[CONSTRAINTS]` sections:
  - `[STYLE]` — concrete tone modifier. warm/bubbly/chatty → adds one extra sentence. direct → strips filler.
  - `[CONSTRAINTS]` — hard rules, highest priority, always enforced above everything else
- Example: `[STYLE] Warm and conversational. [CONSTRAINTS] Never ask about pricing.`

## Agent Roles & Permissions

Agents identify via HTTP header: `X-Agent-Id: <agent_id>`

### Default Agents
| Agent | ID | Model | Trigger |
|---|---|---|---|
| Project Manager | `agent_pm` | claude-opus-4-5 | `perm_pm_planning` capability + Backlog |
| Developer | `agent_dev` | claude-sonnet-4-5 | `agent_dev` ID + In Progress |
| Tester | `agent_test` | claude-sonnet-4-5 | manual |

### Human (`X-Agent-Id: human` or Bearer JWT)
- Full access to everything
- Participates in PM planning conversation (answers PM questions in task detail)
- Gives final sign-off after PM approves
- Only one who can: create/edit/delete agents, create/edit columns, view/resolve secrets

## Seeding vs User Data

**Critical distinction — never confuse these.**

### What gets seeded (everyone who clones the repo gets these)
All seeded via `INSERT OR IGNORE` — safe to run on every server start, never overwrites existing data:
- System columns (Backlog, In Progress, Testing, Human Action, Done)
- System roles: column_access roles + permission roles (including `perm_pm_planning`)
- Agent templates: PM, Developer, Tester blueprints
- Default agents: `agent_pm`, `agent_dev`, `agent_test`
- Default `template_system_prompt` for `agent_pm` — **only if it has never been set**

### What is personal data (lives only in the user's local DB)
Never reset, never overwritten by migrations:
- All tasks
- Any custom agents the user creates
- Any custom columns
- Any edits made via the UI (behavior prompts, agent configs, instruction file changes, etc.)

### Migration safety rules
- **Always use `INSERT OR IGNORE`** for seeding defaults
- **Never use `UPDATE` without `WHERE ... IS NULL`** for fields the user can edit in the UI
- **Never use `UPDATE` unconditionally** on user-owned rows — this overwrites user customisations on every server restart
- The `template_system_prompt` of `agent_pm` uses `WHERE template_system_prompt IS NULL` so a user who customised it keeps their version

## Model Assignment Strategy
| Complexity | Model |
|---|---|
| low | claude-haiku-4-5-20251001 |
| medium | claude-sonnet-4-5 |
| high | claude-opus-4-5 |

## Secrets / Human Action Flow
1. Agent discovers it needs a secret → calls `POST /api/tasks/:id/request_human`
2. Task moves to `col_humanaction`
3. Human adds secret to environment
4. Human resolves via UI (`/api/secrets/:id/resolve`)
5. Agent continues

## Design Principles
- You own everything — no third-party services beyond Anthropic
- Human stays in control — agents can't approve their own work or touch secrets
- Customizable by design — agents are markdown files, columns are database rows, permissions are JSON arrays
- PM planning is capability-based, not ID-based — any agent with `perm_pm_planning` is a PM
- One retry by default — prevents infinite loops while allowing self-correction
- Agents talk to API (the database is the shared state), not to each other directly

## Running the Project
```bash
npm run install:all        # Install all dependencies
npm run dev                # Start frontend + backend

# Frontend: http://localhost:5173
# API: http://localhost:3001/api
```

## Agent Instruction File System
Each agent has three layers:
1. **`template_system_prompt`** (DB field) — short identity/modifier prompt (≤1000 chars). Supports `[STYLE]` and `[CONSTRAINTS]`.
2. **`prompt_file`** — the agent's primary methodology file (e.g. `instructions/pm.md`)
3. **`instruction_files`** — JSON array of additional context files (e.g. `["instructions/client.md"]`)

Global files (`CLAUDE.md`, `README.md`) are loaded for technical agents (dev, tester) but NOT for PM — PM knows the client, not the codebase.

Default assignments:
- **PM**: prompt=`instructions/pm.md`, context=`[instructions/client.md]`
- **Developer**: prompt=`instructions/developer.md`, context=`[instructions/project.md, instructions/client.md]`
- **Tester**: prompt=`instructions/tester.md`, context=`[instructions/project.md, instructions/client.md]`

## API Reference

### Tasks
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/tasks | List all tasks (filter: column_id, assigned_agent_id, project_id) |
| POST | /api/tasks | Create task |
| PATCH | /api/tasks/:id | Update task fields |
| POST | /api/tasks/:id/move | Move to column (enforces approval gate) |
| POST | /api/tasks/:id/log | Add activity log entry |
| POST | /api/tasks/:id/request_human | Flag for human action |
| DELETE | /api/tasks/:id | Delete task |

### PM Planning Conversation
| Method | Endpoint | Who | Description |
|--------|----------|-----|-------------|
| POST | /api/tasks/:id/pm_question | any PM-capable agent | PM posts a clarifying question |
| POST | /api/tasks/:id/answer | human | Human answers PM's pending question |
| POST | /api/tasks/:id/pm_review | any PM-capable agent | PM approves or rejects (final) |
| POST | /api/tasks/:id/request_pm_review | human | Manually trigger PM review |

### Human Approval
| Method | Endpoint | Who | Description |
|--------|----------|-----|-------------|
| POST | /api/tasks/:id/approve | human | Human gives sign-off (after PM approves) |
| POST | /api/tasks/:id/reject | human | Human rejects (resets cycle) |

### Agents / Columns / Secrets
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/agents | List agents |
| POST | /api/agents | Create agent (human only) |
| POST | /api/agents/:id/archive | Soft-archive agent (human only) |
| POST | /api/agents/:id/unarchive | Restore archived agent (human only) |
| DELETE | /api/agents/:id | Hard delete if no tasks; 409 if has tasks |
| GET | /api/columns | List columns (`?include_archived=true`) |
| POST | /api/columns | Create column (human only) |
| POST | /api/columns/:id/archive | Soft-archive column (human only) |
| POST | /api/columns/:id/unarchive | Restore archived column (human only) |
| DELETE | /api/columns/:id | Hard delete if no tasks; 409 if has tasks |
| GET | /api/secrets | List secrets (human only) |
| POST | /api/secrets | Request secret |

## Task Schema (key fields)
```json
{
  "id": "task_xxxxxxxxxxxx",
  "title": "...",
  "description": "...",
  "column_id": "col_backlog",
  "assigned_agent_id": "agent_pm",
  "priority": "low|medium|high|critical",
  "complexity": "low|medium|high",
  "progress": 0,
  "pm_approval_status": "pending|questioning|approved|rejected",
  "pm_pending_question": "Current unanswered PM question (null if none)",
  "pm_review_comment": "PM's final summary for the developer",
  "human_approval_status": "pending|approved|rejected",
  "acceptance_criteria": "...",
  "tags": [],
  "metadata": {}
}
```

## Task Log Action Types
| Action | Who | Meaning |
|--------|-----|---------|
| created | system | Task was created |
| updated | any | Fields changed |
| moved | any | Column changed |
| pm_review_requested | human | PM review triggered |
| pm_question | PM-capable agent | PM asked a clarifying question |
| human_answer | human | Human answered PM's question |
| pm_reviewed | PM-capable agent | PM gave final approval |
| human_approved | human | Human gave sign-off |
| human_rejected | human | Human rejected |
| developer_assigned | system | Developer assigned in In Progress |
| branch_created | agent_dev | Git branch created and pushed |
| human_action_requested | any | Blocked, needs human |

## Environment Setup
Add to `server/.env`:
```
ANTHROPIC_API_KEY=sk-ant-...   # Required for agent auto-triggering
GOOGLE_CLIENT_ID=...           # Required for Google OAuth login
JWT_SECRET=...                 # Optional, defaults to dev secret
```

## Agent Template System

Two distinct but related concepts — do not confuse them:

### 1. Agent Templates (`agent_templates` table)
Reusable blueprints for creating new agents. Managed in the Templates modal (Sidebar → Templates button).

- Each template has: name, description, model, color, suggested_role, system_prompt_content, template_system_prompt, instruction_files, permissions, tags
- `system_prompt_content` — markdown text that prefills the inline prompt editor when creating an agent from this template
- `template_system_prompt` — optional behavioural framework prompt. If set, agents created from this template get `is_template = 1` and this prompt propagated automatically; they show a `T` badge
- Templates can be archived; editing a template only affects future agent creations
- 3 default templates seeded on first run: Project Manager, Developer, Tester
- **API**: `GET /api/agent-templates`, `POST`, `PATCH /:id`, `POST /:id/archive`, `POST /:id/unarchive`, `DELETE /:id`
- Delete is hard-delete only when no agents were created from the template; otherwise 409 → archive instead
- **API**: `POST /api/agents/:id/save-as-template` — snapshot an existing agent into a new template

### 2. Template Agents (`is_template` flag on agents)
Agents with a built-in behavioural framework prompt. These show:
- **Template Behaviour Prompt** (readonly by default, "Customize" / "Reset to default" toggle)
- **System Prompt File** (the role-specific instructions)

An agent gets `is_template = 1` either by seeding (PM) or by being created from an agent template that has `template_system_prompt`.

### T Badge
Shows on an agent in the Sidebar when `agent.is_template || agent.created_from_template_id`. Turns amber if the origin template was archived.

## Tasks — Additional Fields
- `acceptance_criteria TEXT` — concrete, testable done conditions
- `archived_at DATETIME` — soft-archive (excluded from default task list)
- `is_locked` (computed) — true when PM planning is in progress (`pm_approval_status` set but not both approvals done)
  - Locked tasks: amber border, drag disabled, move buttons hidden, content edits blocked for non-humans
- **API**: `POST /api/tasks/:id/archive`, `POST /api/tasks/:id/bypass_pm`

## Archive / Delete Convention (applies everywhere in the codebase)

**Rule: has dependencies → archive; no dependencies → delete.**

| Condition | Action |
|---|---|
| Entity has no relations/dependents | Hard delete (remove from DB) |
| Entity has dependents (tasks, agents, etc.) | Archive only (soft delete — set `archived_at`, preserve in DB) |

### Per-entity rules
| Entity | Delete condition | Archive condition |
|---|---|---|
| **Task** | `human_approval_status != 'approved'` (never worked on) | Has been approved and moved to pipeline |
| **Agent** | No tasks assigned (`assigned_agent_id` count = 0) | Has assigned tasks |
| **Agent Template** | No agents created from it (`created_from_template_id` count = 0) | Agents exist that were created from it |
| **Column** | No tasks in column | Has tasks |

### Implementation pattern (server)
- `POST /api/:resource/:id/archive` — set `archived_at = CURRENT_TIMESTAMP` (+ `active = 0` for agents)
- `POST /api/:resource/:id/unarchive` — set `archived_at = NULL` (+ `active = 1` for agents)
- `DELETE /api/:resource/:id` — hard delete if no dependents; return `409 { error: '...', has_dependencies: true }` if blocked
- GET endpoints accept `?include_archived=true` to return soft-deleted records

### Implementation pattern (frontend)
- Always show both Archive and Delete buttons/options
- If DELETE returns `409 { has_dependencies: true }`, show the error message and nudge toward archive
- Archived items are fetched on `load()` (with `include_archived=true`) so they can be restored in the UI

### DB schema fields
- `archived_at DATETIME` — present on: tasks, agent_templates, agents, columns
- `agents.active INTEGER` — also used for agents (alongside `archived_at`); Sidebar filters by `active = 1`

## Not Yet Built
- Docker test environment (isolated Linux for Tester agent)
- Secrets management UI panel
- Webhooks / desktop notifications
- CTO/Reviewer agent (optional code review before Human Review)
- Agent assignment dropdown restricted to allowed agents per column in the UI (API enforces it, but UI doesn't filter yet)
