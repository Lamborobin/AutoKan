# Decisions

This file is **information only** — a running log of decisions made between the user and the AI agent, kept for future context. It does not impose rules or constraints on agents.

Update this file when a significant decision is made or reversed.

---

## Per-board instruction files, not global
**Decided:** Instruction file system design
**Context:** Different boards have different contexts — one board's `client.md` should not bleed into an agent working on another. Scoping files to `instructions/{subscriptionId}/{projectId}/` gives each board its own isolated context. Subscription-level files hold shared methodology; board-level files hold board-specific context. Personal boards don't scaffold `client.md` or `project.md`.

---

## Google OAuth chosen for v1 auth
**Decided:** Auth implementation
**Context:** Google OAuth was picked for v1 simplicity — no password storage, reset flows, or brute-force handling needed. Username/password auth and additional providers (Microsoft, etc.) may be added later if requested. JWTs are stored in `localStorage` and sent as `Authorization: Bearer`.

---

## Agents call the API — they do not share memory or call each other
**Decided:** System architecture
**Context:** Direct agent-to-agent communication would create ordering dependencies and make state hard to reason about. The DB is the single source of truth. Any agent reading the task gets the same state. Coordination happens through task state transitions, not message passing. All agent actions go through `POST /api/tasks/:id/*` endpoints.

---

## Human Action absorbs Human Review — single human column
**Decided:** During doc/code audit
**Context:** Two columns for the same human-attention state was a design error from the original pipeline — this consolidation corrects it. Human Review (sign-off) and Human Action (blockers) both required the same response: open the task and decide what's next. One column is simpler for the UI, simpler for agents to target, and matches how users actually triage. Tester pass now moves the task to `col_humanaction` with reason "Ready for human sign-off". The `human_review_comment` / `human_review_date` columns on `tasks` are kept — they describe the *sign-off action*, not the column.

---

## Instruction files are personality, not mechanics
**Decided:** Editing experience pass  
**Context:** Instruction files — both subscription-level prompts (`planning.md`, `dev-implement.md`, `run-code-tests.md`) and board-level files (`client.md`, `project.md`) — are meant to be edited by anyone, including non-technical users adding domain context, tone, or methodology hints. They MUST NOT describe runner mechanics: tool names, git workflows, write-scope paths, retry behaviour, column transitions, PR creation, exit conditions, etc. That information already lives where the system enforces it — handler code, tool descriptions, `runners.json`. This separation is a guardrail: nothing written in an instruction file can break the runner's contract. The prompt layer only adds personality, judgment, and context on top of a mechanically-correct flow. The seeded prompts are the reference shape — voice, methodology, ethics, communication style; never which tool to call when.

---

## Personality files are additive, never required
**Decided:** Robustness pass  
**Context:** Every personality layer (capability personality_file, subscription/board instruction files, the template's personality, the agent's own system_prompt) is **optional**. The runner is self-sufficient via:
- The handler's runtime initial prompt (task brief + workflow), built in code
- Tool definitions with their own descriptions and JSON schemas
- A baked-in minimal baseline in `buildSystemPrompt` that identifies the agent's capability and column when every personality layer is empty

If a superadmin (or a typo) deletes `instructions/sub_default/dev-implement.md`, the next agent run logs a one-time warning (`[AgentRunner] Personality file not found: …`) and continues — the runner reaches its baseline + any other available layers (template's personality, board files, etc.) and the agent still does its job. The field was renamed from `prompt_file` to `personality_file` in `runners.json`, the DB column, the API body, and the frontend to make the additive intent explicit: this is flavour layered on top of a mechanically-correct flow, not a runtime dependency.

---

## No test suite for AutoKan itself
**Decided:** Early development phase  
**Context:** AutoKan (the app) ships without a test suite — no Jest, Vitest, Mocha, no `npm test` script, no CI test step. The seeded Code Test Runner exists for *client projects* under `client/`, not for AutoKan. Verification of AutoKan changes happens via running the app and observing behaviour (`npm run dev`), plus the smoke checks built into the refactor work. If a test suite becomes worthwhile later, this decision gets revisited.

---

## No migrations in local dev — drop and reseed instead
**Decided:** Early development phase
**Context:** Maintaining `ALTER TABLE` migrations adds friction and complexity before the schema is stable. At this stage the data model is still being shaped — a wipe and reseed is faster, safer, and keeps `db/index.js` clean. `server/src/db/index.js` contains only `CREATE TABLE IF NOT EXISTS` — no `ALTER TABLE`, no conditional column checks. Schema changes require running `npm run db:reset`. Once the app has real users, migrations become mandatory — revisit then.

---

## May 2026 — db/seed/config refactor
**Decided:** Refactor pass
**Context:** Full rewrite of `server/src/db/index.js` removed every migration and all legacy code; schema is now a single clean `CREATE TABLE` block. Default data extracted into `server/src/seed/` (`index.js` + `agent-templates.json`). Stable IDs and app config moved to `server/src/config/` (`constants.js`, `agent.config.json`). `getDb()` self-initialises on first call — no separate `initDb` step. Net change ~700 lines removed.
