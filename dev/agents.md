# Agent System

Read this file when working on: agent logic, behavior prompts, the instruction file system, or agent escalation behavior.

---

## Context layer model

Every agent's behaviour is assembled from a fixed stack of layers — most general at the top, most specific at the bottom. **The stack and its order are wired in code and never change.** Each layer is *additive*: it may tighten or extend the layers above it, but **a lower layer can never loosen, contradict, or reorder a higher one.** That is the waterfall invariant — the property to validate whenever context files change. Only a code change can alter the flow itself.

| # | Layer | Editable by | What it may do |
|---|---|---|---|
| 1 | **Code mechanics** | Developer (code only) | The flow itself — which tool fires, which column a task moves to, what an agent may write, and the order of these layers. Immutable from any prompt. |
| 2 | **Runner prompts** | Developer (code only) | Per-capability methodology baked into the runner. System-owned. |
| 3 | **System Rules** | Superadmin / dev | Global, cross-subscription rules with technical depth. The **only** layer that may invoke code-exposed actions/hooks (e.g. "at 100 units → call the email endpoint") on top of plain rules ("reply in Spanish", "never reveal business secrets"). Cannot change the flow. |
| 4 | **Workspace rules** | Admin | Declarative boundaries shared across a workspace's boards — no new actions ("don't generate reports about X — GDPR"). |
| 5 | **Board rules** | Board owner / admin | The same, scoped to one board ("don't send the PR-ready email here — it spams person X"). |
| 6 | **Personality** (template / agent) | UI editor | Cosmetic traits only — tone, sign-off, phrasing. Effectively no effect on logic. |

The gradient is **actions → constraints → cosmetics**: layer 3 can add new actions (within code-exposed extension points); layers 4–5 can only add constraints; layer 6 is cosmetic. These layers are the **extension surface** — a fork or tenant customises behaviour through them without touching core code.

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
| 4 — Board (`project.md` for a client board) | "When touching the cart, always ask for human verification before merging." |
| 5 — Template (`agent_templates.template_system_prompt` for "Senior Backend Coder") | "[STYLE] direct, no hedging. [CONSTRAINTS] Never reveal business logic in PR descriptions." |
| 6 — Agent (`agents.system_prompt` for "Camila") | "Your name is Camila. You write commit messages in Spanish." (overrides layer 5) |

These layers, plus the always-loaded files below, are assembled **once** into the agent's starting context when a run begins — the personality layers (1, 2, 5, 6) form the system prompt; the context files (layers 3 & 4, plus the always-loaded base files) are injected as the agent's initial message. Where each piece lands is just SDK placement — conceptually it is **one bundle**: everything the agent knows for that run. From there the agent works the task within that single session, on that context alone — it does not re-read instruction or doc files mid-run.

None of these layers can change which tool fires, which column a task moves to, or what files the agent can write — those are enforced at the runner/tool layer.

### `[STYLE]` and `[CONSTRAINTS]`

The personality text at layers 5 and 6 supports two semantic sections:
- `[STYLE]` — tone modifier (e.g. warm vs direct). Adjusts how the agent writes.
- `[CONSTRAINTS]` — hard rules, enforced above everything else (e.g. `Never ask about pricing`).

### What each agent loads as context

Assembled once into the agent's starting context bundle (see the layering note above), all dedup'd:

- **Capability personality** — the runner's `personality_file` (e.g. `dev-implement.md`), resolved to the most specific version that exists.
- **Capability docs** — the `docs/` files mapped to the agent's capability, picked up from `context_docs` in `runners.json` (the registry holds the mapping — not listed here).
- **Subscription files** — every top-level `.md` in `instructions/{sub}/` (excluding runner personality files, already in the system prompt).
- **Board files** — every top-level `.md` in `instructions/{sub}/{proj}/` (e.g. `client.md`, `project.md`). Auto-scanned — drop a `.md` in and it loads, no per-agent wiring.
- **Always** — the app agent's base instruction file, for every agent; the project's human-facing setup file, additionally, for `is_coder` capabilities (the registry is the source of truth — the coder set is not duplicated here).

### Path resolution

The `personality_file` is stored as a short reference (e.g. `instructions/dev-implement.md`) without subscription or project IDs. At runtime, `resolveInstructionPath()` expands it to the most specific file that exists on disk:

1. `instructions/{subscriptionId}/{projectId}/X.md` — board-level (most specific, overrides subscription)
2. `instructions/{subscriptionId}/X.md` — subscription-level (shared, applies to all boards)
