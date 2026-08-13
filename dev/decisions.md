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

## Single timing variable for all spam / dedup windows
**Decided:** GitHub sync + notification dedup implementation
**Context:** When implementing the GitHub PR sync cooldown we realised there were already two separate places controlling similar "don't do this too often" windows — notification dedup and email throttling — both reading `NOTIFICATION_DEDUP_SECONDS`. Rather than introduce a third variable for GitHub sync, we reused the same one for the manual sync button. The 24 h auto-sync cycle is a hardcoded multiple, not a new env var, because operators don't need to tune it independently. The principle: one env var per concept, not one per feature. New timeout needs should be justified against this variable first; if they're genuinely different they get a new constant, but that decision is made explicitly rather than by default.

---

## Ownership & distribution — proprietary, company-owned
**Decided:** Distribution model
**Context:** AutoKan is developed under employment, so under a standard IP-assignment / work-for-hire arrangement the **employer owns the IP** (working assumption — confirm against the employment agreement and any company open-source/external-release policy). It is therefore proprietary, all-rights-reserved software — not an open-source project the author can license independently. Distribution is on the company's terms: the B2B model discussed (per-client installs, or a planned hosted variant). This repo doubles as the official demo, seeded with the default agents, their templates, and one sample client (Velour) so the full flow runs out of the box. Any public license or open-sourcing would require company approval; absent a `LICENSE` file the code is all-rights-reserved by default.

---

## Dev-only reference material moved out of `docs/`, out of the System Rules panel
**Decided:** Documentation architecture pass, entry-point restructure
**Context:** The System Rules panel is driven by a config file that lists which docs are editable through it — meant for an admin tuning *their* deployed instance's agent behaviour. This file (decisions) and the upcoming-changes log had been sitting in that same config, which meant any superadmin of any deployed AutoKan instance — including a client's own install — could see internal build decisions and roadmap that have nothing to do with configuring their agents. Neither file is read by any agent at runtime either, so nothing was gained by exposing them there. Both moved out of `docs/` into a sibling folder reserved for dev-assistant-only material, and out of the panel's config entirely. The remaining `docs/` files split the same way in spirit going forward: only content genuinely meant for admin configuration or agent runtime belongs in `docs/` and the panel; pure build-reference material doesn't.

---

## Docs never name another markdown file by filename
**Decided:** Entry-point restructure (`CLAUDE.md` split into role-specific files)
**Context:** Hardcoded filename references between docs broke repeatedly during the entry-point restructure — several docs files and a code comment pointed at the old master file by name, and every one went stale or broke the moment its role changed. Docs now refer to other content by *concept* ("the folder-creation convention," "the layer model"), never by filename, so a future rename or restructure can't silently break prose elsewhere. Only the files whose actual job is indexing may name a real path — the root entry-point files and the two JSON registries that drive the System Rules panel and per-capability context injection. The same rule extends to app code and UI text: no hardcoded doc paths there either, for the same rename-coupling reason.

---

## Dev-assistant edits stay in the file's lane
**Decided:** Documentation architecture pass
**Context:** Each doc file has an owner and a tone. When editing markdown, match the target file's tone, don't restate facts that already live elsewhere, and prefer net-shrink or net-equal diffs over additions — push back on edits, including user-requested ones, that would violate this. Without this discipline, doc content drifts and duplicates with no memory of why: an escalation example was found copy-pasted verbatim between two docs, and a board-specific example had leaked into a non-board-scoped file — both caught and fixed in the same pass that established this rule.

---

## Agent context layering unified into one 7-layer stack, not two 6-layer tables
**Decided:** Documentation accuracy pass — agent context layering
**Context:** The agent context/personality model was documented as two separate 6-layer tables — an "authority" table and a "runtime assembly" table — each numbering its rows independently, so "layer 2" meant the code-only runner-mechanics prompt in one and the user-editable capability personality file in the other. That collision was directly responsible for a real UI bug: capability-behaviour files (`dev-implement.md`, `planning.md`, `run-code-tests.md`) are physically stored in and labelled as "Workspace Context" in Settings, a genuinely different layer. Merged into one 7-layer stack. Two simplifications came out of untangling it: a fallback used only when a layer above it is empty (the baked-in baseline; the agent-personality-falls-back-to-template resolution) isn't a rung of its own, just a second source for the same layer, folded into that layer's row rather than counted separately. Also corrected while auditing the merged table: System Rules (layer 3) was documented as "the only layer that may invoke actions" — no longer true once a capability personality file (layer 4) gained a real action-triggering tool (`notify_all`). The actual distinction is scope, not exclusivity: layer 3's actions are meant to be capability-agnostic (not yet wired to any live mechanism), layer 4's are capability-scoped through that capability's own tool set (real, built). Segregating the capability-behaviour files out of the Workspace Context UI/storage into their own section is tracked as follow-up work in `dev/upcoming-changes.md`, not done yet.

