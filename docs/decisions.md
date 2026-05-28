# Decisions

A running log of architectural decisions — what was decided, why, and what the current state is. Update this file when a significant decision is made or reversed.

Format: **Decision** → **Reason** → **Status**

---

## Capability-based triggers over hardcoded agent IDs
**Decided:** Early build  
**Reason:** Hardcoding `if agentId === 'agent_pm'` locks the system to exactly one PM agent forever. Capabilities let any agent take any role by changing data, not code. A team can have multiple PM agents, client-specific PMs, or custom roles without touching the server.  
**Status:** Implemented. `agentHasCapability()` in `server/src/routes/tasks.js`. Default capabilities seeded once on first DB connection (idempotent `INSERT OR IGNORE`).

---

## Single-tenant subscription model for v1
**Decided:** Initial architecture  
**Reason:** One install = one workspace (`sub_default`). Eliminates multi-tenancy complexity while still structuring data in a way that can be extended. All subscription-scoped resources already carry a `subscription_id` foreign key.  
**Status:** Implemented. `sub_default` is the only subscription. Multi-tenancy would require auth changes but the data model already supports it.

---

## Soft archive over hard delete for entities with dependencies
**Decided:** During task/agent management build  
**Reason:** Hard-deleting an agent that has tasks assigned would create orphaned task records or require cascading deletes that destroy history. Archiving preserves the full record — tasks still reference their original agent, the activity log is intact.  
**Status:** Implemented across tasks, agents, columns, agent templates.

---

## JWT + Google OAuth only — no username/password
**Decided:** Auth implementation  
**Reason:** Username/password auth requires password storage, reset flows, and brute-force protection. Google OAuth delegates all of that to Google. Simpler, more secure for a tool used by small teams.  
**Status:** Implemented. `server/src/routes/auth.js`. JWT stored in `localStorage`, sent as `Authorization: Bearer`.

---

## role_ids as a JSON array on agents/members, not a junction table
**Decided:** Permissions system  
**Reason:** The number of roles per agent is small (2–6) and roles are read on almost every request. A junction table adds a JOIN on every capability check. JSON array is simpler and fast enough for this scale.  
**Status:** Implemented. `agents.role_ids` and `project_members.role_ids` are both `TEXT` columns storing JSON arrays. Parsed in JS.

---

## Per-board instruction files, not global
**Decided:** Instruction file system design  
**Reason:** Different boards have different contexts — one board's `client.md` should not be visible to an agent working on another. Scoping files to `instructions/{subscriptionId}/{projectId}/` gives each board its own isolated context.  
**Status:** Implemented. Subscription-level files (shared methodology) live at `instructions/{subscriptionId}/`. Board-level files live in the `{projectId}/` subdirectory. Personal boards don't scaffold `client.md` or `project.md`.

---

## PM gate + Human gate as two separate approval steps
**Decided:** Pipeline design  
**Reason:** PM approval alone isn't enough — the human (client/product owner) needs to confirm the PM understood the brief correctly before dev starts. Two gates mean: (1) the spec is clear, and (2) the spec is correct. Either can fail independently.  
**Status:** Implemented. `pm_approval_status` and `human_approval_status` are separate fields on tasks. Both must be `approved` before the task can leave Backlog.

---

## Human Action absorbs Human Review — single human column
**Decided:** During doc/code audit  
**Reason:** Two columns for "needs human" (Human Review for sign-off, Human Action for blockers) was redundant — both required the same human action: open the task and decide what's next. The distinction was carried by log entries and the task's reason field anyway. One column is simpler for the UI, simpler for agents to target, and matches how users actually triage.  
**Status:** Implemented. `col_humanreview` removed from seed, agent.config.json, frontend constants. Tester pass now moves the task to `col_humanaction` with reason "Ready for human sign-off". The `human_review_comment` / `human_review_date` columns on `tasks` are kept — they describe the *sign-off action*, not the column.

---

## No migrations in local dev — drop and reseed instead
**Decided:** Early development phase  
**Reason:** Maintaining `ALTER TABLE` migrations adds friction and complexity before the schema is stable. At this stage the data model is still being shaped — a wipe and reseed is faster, safer, and keeps `db/index.js` clean. Migrations become mandatory once real user data exists.  
**Status:** Active policy. `server/src/db/index.js` contains only `CREATE TABLE IF NOT EXISTS` — no `ALTER TABLE`, no conditional column checks. Schema changes require running `npm run db:reset` (local dev only). Documented in `docs/rules.md` → Schema changes section.

---

## server/src split into db/, seed/, config/
**Decided:** Refactor during early build  
**Reason:** The original `db/index.js` mixed three unrelated concerns: schema definition, seed data, and app constants. Separating them makes each file's purpose obvious and makes seed data editable without touching schema code.  
**Status:** Implemented. `db/` = schema only (`CREATE TABLE`). `seed/` = default data (`seedDefaults`, `agent-templates.json`). `config/` = stable constants and app config (`constants.js`, `agent.config.json`). `getDb()` self-initialises on first call — no separate `initDb` step.

---

## Agents call the API — they do not share memory or call each other
**Decided:** System architecture  
**Reason:** Direct agent-to-agent communication creates ordering dependencies and makes state hard to reason about. The DB is the single source of truth. Any agent reading the task gets the same state. Coordination happens through task state transitions, not message passing.  
**Status:** Implemented. All agent actions go through `POST /api/tasks/:id/*` endpoints.
