# Decisions

A running log of architectural decisions — what was decided, why, and what the current state is. Update this file when a significant decision is made or reversed.

Format: **Decision** → **Reason** → **Status**

---

## Capability-based triggers over hardcoded agent IDs
**Decided:** Early build  
**Reason:** Hardcoding `if agentId === 'agent_pm'` locks the system to exactly one PM agent forever. Capabilities let any agent take any role by changing data, not code. A team can have multiple PM agents, client-specific PMs, or custom roles without touching the server.  
**Status:** Implemented. `agentHasCapability()` in `server/src/routes/tasks.js`. Default capabilities seeded on every server start (idempotent).

---

## SQLite over Postgres
**Decided:** Initial architecture  
**Reason:** Self-hosted tool — no external infrastructure, no connection pooling, no docker-compose dependency just to run the DB. Single file is trivial to back up. `better-sqlite3` is synchronous which simplifies the route handlers.  
**Status:** Implemented. All queries are standard SQL — migration to Postgres is straightforward if multi-user scale requires it.

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

## Zustand slices over a single store file
**Decided:** When store.js exceeded 400 lines  
**Reason:** A single 700-line store file made it hard to find anything and caused merge conflicts on parallel feature work. Splitting by domain (auth, board, workspace, ui) keeps each slice focused and under the 400-line soft limit.  
**Status:** Implemented. `store/index.js` combines four slices.

---

## Per-board instruction files, not global
**Decided:** Instruction file system design  
**Reason:** Different clients have different contexts — Velour's client.md should not be visible to an agent working on another board. Scoping files to `instructions/{subscriptionId}/{projectId}/` gives each board its own isolated context.  
**Status:** Implemented. Subscription-level files (shared methodology) live at `instructions/{subscriptionId}/`. Board-level files live in the `{projectId}/` subdirectory. Personal boards don't scaffold `client.md` or `project.md`.

---

## Tester retry once before Human Action
**Decided:** Pipeline design
**Reason:** A single test failure is often a flaky test or a minor oversight — sending it straight to Human Action would create too much noise. One automatic retry gives the dev agent a chance to self-correct. A second failure signals a real problem that needs human input.
**Status:** Implemented. `task.metadata.test_retry_count` tracks retries. First failure → back to In Progress. Second failure → Human Action.

---

## PM gate + Human gate as two separate approval steps
**Decided:** Pipeline design  
**Reason:** PM approval alone isn't enough — the human (client/product owner) needs to confirm the PM understood the brief correctly before dev starts. Two gates mean: (1) the spec is clear, and (2) the spec is correct. Either can fail independently.  
**Status:** Implemented. `pm_approval_status` and `human_approval_status` are separate fields on tasks. Both must be `approved` before the task can leave Backlog.

---

## Agents call the API — they do not share memory or call each other
**Decided:** System architecture  
**Reason:** Direct agent-to-agent communication creates ordering dependencies and makes state hard to reason about. The DB is the single source of truth. Any agent reading the task gets the same state. Coordination happens through task state transitions, not message passing.  
**Status:** Implemented. All agent actions go through `POST /api/tasks/:id/*` endpoints.
