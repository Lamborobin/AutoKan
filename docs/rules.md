# Rules

**Always read this file before starting any task.** These are hard constraints — they apply regardless of what is being built or changed. If a user requests a change to these rules, update this file accordingly.

---

## Boundaries

**AutoKan is the app. The Client is client/ folder** Everything under `client/` folder is the work-in-progress of a specific board's client project (a website, a folder of files, whatever — its shape is up to that client). Agents who specifically code or execute commands exist to work on the client folder, not ouside, then request for human action if so, not on AutoKan itself. Other clients could potentially work outside like scripting or perhaps not touching any files or folders at all.

### What app agents can write

Agents can WRITE only within their **capability's declared scope**, defined in `server/src/seed/runners.json` (`capabilities[].write_access`). The tool layer enforces this — any write outside scope is rejected at the call site.

### What agents NEVER touch

The AutoKan app itself is off-limits to all agents. That includes `server/`, `app/`, `docs/`, `CLAUDE.md`, `README.md`, `package.json`, the runner registry, the seed data, and any other configuration *above* the client/instructions scope. Only a real human (typically a superadmin) edits AutoKan's own code, templates, base instruction files, or runner registry — that's product development on AutoKan, not agent work.

When to update each docs file is indexed in `CLAUDE.md` (the master delegator), not here. Docs files do not reference each other — see CLAUDE.md for the rule.

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

Once answered, create the folder and update the related markdown files start from `Claude.md`.

**Exempt:** folders created by system scaffolding (e.g. `instructions/{subscriptionId}/{projectId}/`) are part of the app's programmatic behavior and do not require this check — this rule only applies when explicitly requested by a user or agent.

---

## Code & Architecture Rules

When implementing any task, follow these in order:

1. **Read before touching** — read the full file before editing; never edit by filename alone
2. **Check for existing utilities** — search `store/`, `api/`, `hooks/`, and shared components before writing a new helper
3. **Match the local pattern** — naming, error handling, data fetching style (`api.get(...).then(r => r.data)`)
4. **Prefer the smallest change** — add to existing file → create new file → create new folder (only when ≥3 files belong in it)
5. **Respect size thresholds** — if a file is already >600 lines and your change adds 50+ lines, extract first then add
6. **One unit of change** — feature + its architectural cleanup go in the same commit, not a follow-up
7. **Use capabilities + the runner registry, not hardcoded IDs** — never gate agent behavior on a specific agent ID (e.g. `if agentId === 'agent_pm'`). Runner dispatch lives in `server/src/services/agentRunner.js` and looks up `(agent.capability, task.column)` in `server/src/seed/runners.json`. To add a new behavior: add a registry entry + a prompt file + (if no existing handler fits) a handler function. One `perm_*` capability per agent is enforced server-side.

---

## Database Rules

### Never destroy user data
The following are personal data and must NEVER be reset or overwritten by an agent:
- All tasks
- Custom agents and columns created by the user
- Any edits made via the UI (behaviour prompts, agent configs, instruction file changes)

### Schema changes require a user-initiated DB reset
`server/src/db/index.js` is `CREATE TABLE` + seeds only — no `ALTER TABLE`, no conditional column checks, no migrations. When you change a column, table, or index, surface the requirement clearly and **ask the user** to run `npm run db:reset` and restart the server when they're ready.

**Never run `db:reset` automatically — always ask first.** A misconfigured `DB_PATH` or environment variable could point the reset script at data you don't intend to wipe (a production-shaped setup, a backup someone's working against, etc.). The user is the only one who knows which DB they're pointed at the moment of execution. Asking takes one exchange; recovering from an accidental wipe takes hours.

This policy is local-dev only; see the decisions log for the rationale and when it'll be revisited.

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
