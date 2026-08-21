# Architecture

Read this file when making structural changes, or when the reason behind a system design is unclear.

---

## Monorepo Structure

```
AutoKan/
├── client/                  # Live client repos — one subfolder per connected board
│   └── {clientName}/        # one subfolder per board — the actual code agents work in
├── docs/                    # Extended documentation — read on demand, per the entry-point routing
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
│       ├── config/          # App configuration — constants.js (stable IDs), agent.config.json (System Behavior panel groups)
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

## Effects & Run Modes

Anything that leaves the system — a notification to a human, a GitHub PR, a merge, an action hook — is an **effect**, and every effect routes through `server/src/services/effects.js`. That module is the only place deciding whether an effect is really performed or merely recorded, so a new handler inherits the decision instead of having to remember it.

Two axes decide:

- **Run mode**, resolved per task. `live` is real work for a real board; `benchmark` is a synthetic probing task. A `test` mode is reserved for the planned test capabilities — their orchestration notices are legitimately real (a human *is* waiting to hear that tests passed) while effects of the code under test are not, which is why kind exists rather than this being one boolean.
- **Effect kind**, declared where the effect is defined. `orchestration` is AutoKan telling a human about pipeline state; `external` is anything reaching outside AutoKan, or produced by the behavior under test.

| | orchestration | external |
|---|---|---|
| **live** | perform | perform |
| **benchmark** | record | record |

Both axes fail closed: an unrecognised run mode falls back to the most restrictive row, and an undeclared effect kind is recorded rather than performed.

**The agent's path is never forked.** A benchmark probe runs the same handler, the same tools, and receives the same tool results as a real task — a suppressed action hook still returns an ordinary success. Only the outermost boundary changes, and it changes invisibly to the agent, because a blind test measures real behavior only while the agent cannot tell the difference.

Recorded effects are written as plain `note` task logs — already the convention benchmark scoring reads — so a suppressed effect is scoreable with no extra wiring, and that same list is the assertion surface a test capability needs.

Three layers decide whether an effect actually happens, and they answer different questions:

| Layer | Question | Lives in |
|---|---|---|
| **Capability** | what may this role *ever* do? | `actions` in `runners.json`, plus every registered action hook implicitly |
| **Task** | what is *enabled* for this run? | `tasks.allowed_effects`, chosen at Start |
| **Run mode** | does an enabled effect *really leave*? | the policy table above |

The task layer is authoritative when set: a configured task performs exactly what its list names. `NULL` means never configured and falls back to the run-mode default, which is what keeps tasks predating the column — and any created straight through the API — behaving as before. An empty array is a real choice, not an absent one: perform nothing.

Only capability-specific effects are declared in `runners.json` (today just `perm_coding`'s `pr_create`/`pr_merge`). Action hooks are implicit for every capability, because `invoke_action_hook` already sits in every tool set — so registering a hook makes it available everywhere with no registry edit, and a hook's registry key doubles as its effect id.

Reassigning a task intersects its enabled set with the new capability's surface, so moving work from Coder to Tester drops `pr_create`/`pr_merge` instead of leaving a stale grant behind. A benchmark case's own `allowed_effects` rides onto its probing task the same way — matched per effect id, never per kind, so allowing one effect can't quietly unlock another.

Coding capabilities work inside the board's own linked folder (`projects.client_path`), not inside AutoKan — the same scoping Producing and Verifying use. What that folder supports decides how much of the git flow runs: a plain directory gets direct edits, a repo without a remote gets a branch and a commit, and only a repo with a remote gets a push and a pull request. The runner prompt is generated per target so the workflow the agent is told to follow is the one that will actually work.

**Transport is not an effect, and is not renamed either.** A branch push carries work between pipeline stages (Coder → Tester) and is the only shared state once handlers no longer share a filesystem, so suppressing it would break the pipeline a benchmark exists to exercise. Renaming it per run mode fails for a different reason: the runner prompt hands the agent its branch and its push command, so a benchmark-only branch name would make the prompt untrue and the push fail. Probe branches are identified for cleanup from `benchmark_runs.probing_task_id`, which already records exactly which tasks were probes.

This is the general boundary. Effects the agent *triggers but never acts on* can be suppressed invisibly. Anything the agent *operates on* — a branch name, a path, a tool result it reasons from — must stay true, because lying there breaks the run rather than protecting the test.

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

