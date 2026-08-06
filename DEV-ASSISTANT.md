# Dev-Assistant — Entry Point

You are an AI dev-assistant working with a human Requester/user to evolve the AutoKan platform itself. You collaborate with a user to fit the desired result. This file is your operating manual for that work.

---

## What you can do

You can change anything in the AutoKan the repo with the user's agreement. You have to follow the instructions from the user very carefully and improvise as little as possible. If unclear, raise more questions back to the user before starting the work.

## What you cannot do

Add instructions here without the user's agreement.

---

## What to read, and when

| File | Read when… |
|---|---|
| `docs/rules.md` | The global agent-rules layer — **MUST follow** |
| `dev/conventions.md` | Making any code change to AutoKan's own codebase — read before editing |
| `dev/agents.md` | Agent logic, flows, instruction file layering, escalation behavior |
| `dev/frontend.md` | Any file under `app/src/` |
| `dev/api.md` | Implementing, modifying, or calling API routes |
| `dev/architecture.md` | Architectural design choices, structural decisions, system design |
| `dev/decisions.md` | Before reversing or changing a significant design decision |
| `dev/upcoming-changes.md` | Before starting work that might overlap with planned features |

## What to update, and when

| File | Update when | Tone |
|---|---|---|
| `CLAUDE.md` | The routing table changes (a role is added, removed, or renamed) | Terse — routing only, no prose buildup |
| `APP-AGENT.md` | What an app agent must read or do changes | Terse, directive — a live instruction set, not reference material |
| `DEV-ASSISTANT.md` (this file) | Dev-assistant workflow, doc architecture rules, or the index below changes | Terse, directive |
| `README.md` | Tech stack, quick start, architecture/use case, or a development convention for changing AutoKan's code | Welcoming, informational — written for someone first opening the repo |
| `docs/rules.md` | A new global agent rule is agreed on (behavioural rules, not app-dev constraints) | Imperative ("never X", "always Y"). Short, scannable. No backstory. |
| `dev/conventions.md` | A new platform-development constraint is agreed on (code/DB/folder rules, not agent behaviour) | Imperative, numbered where sequence matters. No backstory. |
| `dev/agents.md` | Agent behavior, flows, or the instruction file system changes | Explanatory. Describes how agents behave, partially commands to follow. |
| `dev/frontend.md` | A new component pattern, threshold, or store structure is established | Descriptive patterns with examples, rules, patterns, decisions only related to frontend or src folder |
| `dev/api.md` | An API route is added, removed, or its behavior changes | Structured reference — tables of method / endpoint / description. Minimal prose. |
| `dev/architecture.md` | A structural or system design decision is made | Descriptive narrative + diagrams. "The system does X by Y." |
| `dev/decisions.md` | A significant design decision is made or reversed | Past-tense, ADR-style ("we decided X because Y"). Plain-English and high-level — the *why*, not the implementation (that lives in the reference docs). Informational only — no rules, no how-to, no logic. |
| `dev/upcoming-changes.md` | A feature is planned, agreed on, or completed | Future-tense bullets. One line per planned change. |

## Documentation architecture — read before editing any markdown

**No markdown file names another markdown file** — not files inside `docs/` or `dev/`, and not instruction or board-context files under `instructions/` (any sector). Cross-references create loops and obscure the dependency hierarchy. Refer to content by *concept* ("the document standard in your board context"), never by filename.

**App code and UI text should not name specific `docs/*.md` files either.** Describe the *category* of content ("AI-level rules", "architectural reference", "decisions log") instead of listing filenames — a hardcoded path creates rename-coupling that a future restructure has to chase down across the codebase.

The only legitimate places that name docs files: `CLAUDE.md`, `APP-AGENT.md`, this file, `README.md`, `server/src/config/agent.config.json`'s `ai_context.groups`, and `server/src/seed/runners.json`'s `context_docs`. `CLAUDE.md`'s routing table naming `APP-AGENT.md` / `DEV-ASSISTANT.md` / `README.md` is the same sanctioned exception, one level up. These are config/index files that *must* name files to do their job — prose elsewhere never does. `docs/` and `dev/` hold none of that indexing — `docs/` is what the System Rules panel can expose to an admin, `dev/` never is.

When editing markdown: stay in the file's lane (see "Update when…" below), match its tone, don't restate facts that live elsewhere, and prefer net-shrink or net-equal diffs over additions. Push back on edits that fail these checks — including ones the user asks for.

