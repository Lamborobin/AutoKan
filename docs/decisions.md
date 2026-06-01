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
**Context:** Direct agent-to-agent communication would create ordering dependencies and make state hard to reason about. The DB is the single source of truth. Any agent reading the task gets the same state. Coordination happens through task state transitions, not message passing — agent actions land in the DB as task-state changes (applied by the runner), never as direct calls between agents.

---

## Human Action absorbs Human Review — single human column
**Decided:** During doc/code audit
**Context:** The original pipeline had two separate columns for the same human-attention state — one for sign-off, one for blockers. That was a design error: both needed the same response, which is a human opening the task and deciding what's next. Merging them into one Human Action column is simpler for the UI, simpler for agents to target, and matches how people actually triage. The task's reason or log says *why* it's there — a blocker, a sign-off, or a max-retry failure.

---

## Instruction files are personality, not mechanics
**Decided:** Editing experience pass  
**Context:** Instruction files — both subscription-level prompts (`planning.md`, `dev-implement.md`, `run-code-tests.md`) and board-level files (`client.md`, `project.md`) — are meant to be edited by anyone, including non-technical users adding domain context, tone, or methodology hints. They MUST NOT describe runner mechanics: tool names, git workflows, write-scope paths, retry behaviour, column transitions, PR creation, exit conditions, etc. That information already lives where the system enforces it — handler code, tool descriptions, `runners.json`. This separation is a guardrail: nothing written in an instruction file can break the runner's contract. The prompt layer only adds personality, judgment, and context on top of a mechanically-correct flow. The seeded prompts are the reference shape — voice, methodology, ethics, communication style; never which tool to call when.

---

## Personality files are additive, never required
**Decided:** Robustness pass  
**Context:** Every layer of an agent's personality — the capability prompt, the workspace/board context, the template's personality, the agent's own prompt — is optional. If any is missing, even deleted by mistake, the agent still runs: it falls back to a built-in baseline plus whatever layers remain. Personality is flavour on top of an already-working flow, never something the runner depends on.

---

## No migrations in local dev — drop and reseed instead
**Decided:** Early development phase
**Context:** Maintaining `ALTER TABLE` migrations adds friction and complexity before the schema is stable. At this stage the data model is still being shaped — a wipe and reseed is faster, safer, and keeps `db/index.js` clean. `server/src/db/index.js` contains only `CREATE TABLE IF NOT EXISTS` — no `ALTER TABLE`, no conditional column checks. Schema changes require running `npm run db:reset`. Once the app has real users, migrations become mandatory — revisit then.

---

## Agents work at the command level, uniform across all capabilities
**Decided:** Agent instruction model
**Context:** An agent works through commands — its tools — plus a short, system-owned description of its flow: what to do, and where the task goes when it's done. That's all it needs. It never talks to the API directly; the tools handle that for it. The same shape applies to every kind of agent — planner, coder, tester today, and others as they're added — so building a new one follows a familiar pattern rather than a one-off. Each agent is given only the context relevant to it (every agent gets the core rules; coders also get the README), never the app's internal reference docs. This is already proven on the agents that exist today; the rest are planned.

---

## No legacy / back-compat code — delete it, git is the archive
**Decided:** Code-cleanliness principle
**Context:** Superseded code — back-compat shims, unused DB columns, dead branches, commented-out blocks — is removed outright rather than kept "just in case." Git history preserves anything worth recovering, so carrying legacy in the live tree only adds noise and false dependencies. Applies to schema too: an unused column is dropped on the next `db:reset`, not left dangling. First application: retiring the per-agent `instruction_files` list, superseded by the folder auto-scan of `instructions/{sub}/{proj}/`.

---

## Ownership & distribution — proprietary, company-owned
**Decided:** Distribution model
**Context:** AutoKan is developed under employment, so under a standard IP-assignment / work-for-hire arrangement the **employer owns the IP** (working assumption — confirm against the employment agreement and any company open-source/external-release policy). It is therefore proprietary, all-rights-reserved software — not an open-source project the author can license independently. Distribution is on the company's terms: the B2B model discussed (per-client installs, or a planned hosted variant). This repo doubles as the official demo, seeded with the default agents, their templates, and one sample client (Velour) so the full flow runs out of the box. Any public license or open-sourcing would require company approval; absent a `LICENSE` file the code is all-rights-reserved by default.

