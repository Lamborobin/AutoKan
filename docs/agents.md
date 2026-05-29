# Agent System

Read this file when working on: agent logic, behavior prompts, the instruction file system, or agent escalation behavior.

---

## Default Seeded Agents

Agents are server-side processes triggered automatically by the pipeline — they fire when a task lands in the right column, not when invoked directly.

| Agent | ID | Capabilities |
|---|---|---|
| Project Manager | `agent_pm` | `perm_planning` |
| Developer | `agent_dev` | `perm_coding` |
| Tester | `agent_test` | `perm_coding_tester`|

---

## Escalating to Human

If an agent cannot proceed — missing credentials, files not found, an endpoint returning an error, a task that doesn't make sense, or any blocker it cannot resolve itself — it must stop and call for human help rather than retrying or guessing.

```
POST /api/tasks/:id/request_human
{ "reason": "..." }
```

This moves the task to `col_humanaction`. The human reads the reason, resolves the blocker, and moves the task back to continue.

### The reason field is required

The `reason` must describe the blocker clearly enough that a different person — who has no context from the agent's session — can understand what happened and what to do next.

**Good reasons:**
- `"No PDF files found in client/clientX/uploads/. The folder exists but is empty — please add the files and move the task back."`
- `"API call to /api/projects returned 500. Could not continue without project data."`
- `"Received 401 on /api/agents — agent may not have access to this endpoint."`
- `"Task description references a staging URL that is not reachable. Please confirm the correct URL."`
- `"Could not find a test runner config (jest.config.js / vitest.config.js). Unable to run tests without one."`

**Bad reasons:**
- `"An error occurred"` — too vague, human cannot act on it
- `"Missing value for DATABASE_PASSWORD"` — never include secret names, credential names, or anything that looks like sensitive data
- `"Internal error"` — no context, no next step

### What counts as a blocker

Escalate whenever the agent cannot make a safe, confident decision:
- A required file, folder, or resource does not exist
- An environment variable or credential is missing (describe the gap, never the value)
- An API or external service returned an unexpected error
- The task description is ambiguous or contradicts the actual state of the project
- Max retries hit with no progress

When in doubt, escalate. A human review is cheaper than a wrong assumption.

---

## Personality Layering

Every agent's behaviour is shaped by stacked personality layers — each layer is **additive**, **optional**, and **cannot affect runner mechanics**. The runner's flow (which tool fires when, which column the task moves to, what the agent can write) lives in code and is immutable from these layers. If every personality layer is missing, the runner falls back to a baked-in baseline and still functions.

### The layers, ordered from most general to most specific

| # | Layer | Editable by | What it's for |
|---|---|---|---|
| 1 | **Baked-in baseline** (in code) | Developer | Final safety net — identifies the agent's capability + column so it always has *something* if every other layer is empty |
| 2 | **Capability personality file** (`runners[].personality_file` — e.g. `instructions/{sub}/dev-implement.md`) | Operator | General tone + methodology for *any* agent of this capability |
| 3 | **Subscription-level context files** (in `instructions/{subscriptionId}/`) | Operator | Cross-board standards, coding conventions, things that apply workspace-wide |
| 4 | **Board-level context files** (`client.md`, `project.md` in `instructions/{sub}/{projId}/`) | Board owner / planning agent | Board-specific domain knowledge, client priorities, board-only rules |
| 5 | **Template personality** (`agent_templates.template_system_prompt`) | UI editor | Persona shared across all agents created from that template. Fetched live at runtime — editing the template propagates to every agent that hasn't customised — supports `[STYLE]` + `[CONSTRAINTS]` |
| 6 | **Agent personality** (`agents.system_prompt`) | UI editor of the specific agent | Per-agent override that wins over the template's value. Leave blank to inherit from the template. |

### Worked example — a single Coder agent

| Layer | Example content |
|---|---|
| 1 — Baseline | (auto, used only if everything else is empty) "You are an agent operating in AutoKan with capability perm_coding…" |
| 2 — Capability (`dev-implement.md`) | "You're a professional coder. Read before you change. Smallest change that satisfies the spec. Don't fake completion." |
| 3 — Subscription (`coding-standards.md`) | "We use Clean Architecture. Never bypass the service layer." |
| 4 — Board (`project.md` for Velour) | "When touching the cart, always ask for human verification before merging." |
| 5 — Template (`agent_templates.template_system_prompt` for "Senior Backend Coder") | "[STYLE] direct, no hedging. [CONSTRAINTS] Never reveal business logic in PR descriptions." |
| 6 — Agent (`agents.system_prompt` for "Camila") | "Your name is Camila. You write commit messages in Spanish." (overrides layer 5) |

All six layers are concatenated into the system prompt. None of them can change which tool fires, which column a task moves to, or what files the agent can write — those are enforced at the runner/tool layer.

### `[STYLE]` and `[CONSTRAINTS]`

The personality text at layers 5 and 6 supports two semantic sections:
- `[STYLE]` — tone modifier (e.g. warm vs direct). Adjusts how the agent writes.
- `[CONSTRAINTS]` — hard rules, enforced above everything else (e.g. `Never ask about pricing`).

### Default seeded mapping

| Agent | personality_file | instruction_files |
|---|---|---|
| Planner | `instructions/planning.md` | `["instructions/client.md"]` |
| Coder | `instructions/dev-implement.md` | `["instructions/project.md", "instructions/client.md"]` |
| Code Test Runner | `instructions/run-code-tests.md` | `["instructions/project.md", "instructions/client.md"]` |

### Path resolution

Paths are stored as short references (e.g. `instructions/dev-implement.md`) without subscription or project IDs. At runtime, `resolveInstructionPath()` expands these to the most specific file that exists on disk:

1. `instructions/{subscriptionId}/{projectId}/X.md` — board-level (most specific, overrides subscription)
2. `instructions/{subscriptionId}/X.md` — subscription-level (shared template, applies to all boards)

### Two more files always loaded

- **`CLAUDE.md`** — loaded for every agent (project rules + context-files index)
- **`README.md`** — loaded only for agents whose capability has `is_coder: true` in `runners.json` (currently `perm_coding`, `perm_coding_tester`, `perm_frontend`, `perm_backend`, `perm_ux`, `perm_architect`, `perm_code_reader`, `perm_migrate`)
