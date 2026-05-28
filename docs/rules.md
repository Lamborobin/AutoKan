# Rules

**Always read this file before starting any task.** These are hard constraints — they apply regardless of what is being built or changed. If a user requests a change to these rules, update this file accordingly.

---

## Boundaries

Agents only read and write within the repo root. Permitted paths: `client/`, `instructions/`, and the local API at `http://localhost:3001/api`. Nothing outside the repo root — no system files, no other users' files, no server configuration. If additional action is required outside these boundaries, call for human review.

### What app agents can write

App agents can read any markdown file — `CLAUDE.md`, `docs/`, `README.md`, `instructions/`. The context file hierarchy guides them to what they need before starting work.

Write access is scoped by agent type:
- **Dev agent** — `client/` folder only
- **Tester agent** — test files only (`*.test.*`, `*.spec.*`, `__tests__/`, `test/`)
- **Planning agent** (`perm_planning`) — `instructions/{subscriptionId}/{projectId}/` only (e.g. updating `client.md` with context gathered during planning)

`CLAUDE.md` and `docs/` are never written to by app agents. These are maintained by the developer or operator only.

### When docs files should be updated (developer/operator only)

| File | Update when |
|---|---|
| `CLAUDE.md` | A new docs file is added to `docs/` |
| `README.md` | Tech stack, quick start steps, or project structure changes |
| `docs/rules.md` | A new hard constraint is agreed on |
| `docs/agents.md` | Agent behavior, flows, or the instruction file system changes |
| `docs/capabilities.md` | A capability is added, renamed, or gets a runner implemented |
| `docs/frontend.md` | A new component pattern, threshold, or store structure is established |
| `docs/api.md` | An API route is added, removed, or its behavior changes |
| `docs/architecture.md` | A structural or system design decision is made |
| `docs/decisions.md` | A significant design decision is made or reversed |
| `docs/upcoming-changes.md` | A feature is planned, agreed on, or completed |

---

## Language Rules

- All UI text must be in **English** — labels, placeholders, button text, error messages, headings, tooltips. English is the default; the user's selected language overrides it when a language picker is active. DB content (task names, file contents, etc.) is always displayed as-is.
- All code must be written in English.

---

## Folder Creation Rule

Create new folders only when a new segment is introduced that isn't already covered
(e.g. `services/` or `utils/` appearing for the first time in a given location).

Before creating, scan the repo for an existing folder at the desired location:
- **Folder already exists** — tell the requester, point to it, and ask if it covers the need.
- **No folder exists** — ask before proceeding:
  - What is the purpose of this folder?
  - What files will live in it?

Do not create the folder until these questions are answered.
This applies even when the user gives a direct instruction without explanation — do not skip the questions.

Once answered, create the folder and update the Monorepo Structure in `CLAUDE.md` in the same commit.

**Exempt:** folders created by system scaffolding (e.g. `instructions/{subscriptionId}/{projectId}/`) are part of the app's programmatic behavior and do not require this check — this rule only applies when explicitly requested by a user or agent.

---
**Use case — building a product**
Client X wants a new website. Their entire codebase lives in `client/clientX/`. Agents read that folder, implement work on the board, and commit back to it. The board tracks every task from brief to deployment. Any non-technical user can drive the workflow through the UI — no terminal required.

**Use case — processing files**
Client Y drops files into `client/clientY/`. Agents read those files, interpret the client's intent from their contents, create tasks on the board, and act on them. The app surfaces what the agent understood and what it did, so the human can confirm or correct.

## Code & Architecture Rules

When implementing any task, follow these in order:

1. **Read before touching** — read the full file before editing; never edit by filename alone
2. **Check for existing utilities** — search `store/`, `api/`, `hooks/`, and shared components before writing a new helper
3. **Match the local pattern** — naming, error handling, data fetching style (`api.get(...).then(r => r.data)`)
4. **Prefer the smallest change** — add to existing file → create new file → create new folder (only when ≥3 files belong in it)
5. **Respect size thresholds** — if a file is already >600 lines and your change adds 50+ lines, extract first then add
6. **One unit of change** — feature + its architectural cleanup go in the same commit, not a follow-up

---

## Database Rules

### Seeding safety
- **Always use `INSERT OR IGNORE`** for seeding default data — safe to run on every server start
- Never seed data that the user can edit in the UI without a `WHERE ... IS NULL` guard
- **Never use `UPDATE` unconditionally** on user-owned rows — this overwrites customisations on every server restart

### Schema changes — no migrations (local dev)
- **Do not add migrations.** `server/src/db/index.js` is a single source of truth: `CREATE TABLE` + seeds only. We're early enough that wiping the DB is cheap.
- When you add or change a column, table, or index in `server/src/db/index.js`, **tell the user**: "This change requires a database reset — run `npm run db:reset` from `server/` and restart." Do not silently add an `ALTER TABLE` or any conditional migration code.
- `npm run db:reset` (→ `server/scripts/reset-db.js`) is the canonical full reset: deletes `autokan.db`, `docs/.versions/` (AI context edit history), and per-project instruction folders (`instructions/sub_default/prj_*/`). Subscription-level instruction files are preserved. Always use this instead of manually deleting files.
- Seeds must remain idempotent (`INSERT OR IGNORE`). Never use unconditional `UPDATE` on user-editable rows — it would overwrite UI customisations on every restart.
- This policy is **local dev only**. Once the app has real users, migrations become mandatory — revisit this rule then.

### Personal data — never reset, never overwrite
- All tasks
- Custom agents and columns created by the user
- Any edits made via the UI (behavior prompts, agent configs, instruction file changes, etc.)

---

## Archive / Delete Convention

**Rule: has dependencies → archive; no dependencies → delete.**

| Condition | Action |
|---|---|
| Entity has no relations/dependents | Hard delete (remove from DB) |
| Entity has dependents (tasks, agents, etc.) | Archive only — set `archived_at`, preserve in DB |

### Per-entity rules
| Entity | Delete when | Archive when |
|---|---|---|
| **Task** | `human_approval_status != 'approved'` (never worked on) | Has been approved and entered the pipeline |
| **Agent** | No tasks assigned (`assigned_agent_id` count = 0) | Has assigned tasks |
| **Agent Template** | No agents created from it | Agents exist that were created from it |
| **Column** | No tasks in column | Has tasks |

### Server implementation pattern
- `POST /api/:resource/:id/archive` → set `archived_at = CURRENT_TIMESTAMP` (+ `active = 0` for agents)
- `POST /api/:resource/:id/unarchive` → set `archived_at = NULL` (+ `active = 1` for agents)
- `DELETE /api/:resource/:id` → hard delete if no dependents; return `409 { has_dependencies: true }` if blocked
- GET endpoints accept `?include_archived=true`

### Frontend implementation pattern
- Always show both Archive and Delete options
- If DELETE returns `409 { has_dependencies: true }`, show the error and nudge toward archive
- Archived items fetched on `load()` with `include_archived=true` so they can be restored

## Agent header rule
Agents identify to the API via HTTP header: `X-Agent-Id: <agent_id>`
