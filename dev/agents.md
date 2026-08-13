# Agent System

Read this file when working on: agent logic, behavior prompts, the instruction file system, or agent escalation behavior.

---

## Layer Stack

Every agent's behaviour is assembled from a fixed stack of layers — most general at the top, most specific at the bottom. **The stack and its order are wired in code and never change.** Each layer is *additive*: it may tighten or extend the layers above it, but **a lower layer can never loosen, contradict, or reorder a higher one.** That is the waterfall invariant — the property to validate whenever context files change. Only a code change can alter the flow itself.

This is one stack, not two — it merges what used to be a separate "authority" table and a separate "runtime assembly" table. Keeping them apart caused real confusion (two different things both called "layer 2"), so each row here states both: who can edit it and what power it has, *and* which file/DB field it actually lives in.

A layer is only listed here if it's genuinely a distinct rung — content that can *add* something the layer above didn't have. A fallback used when a layer is empty isn't a rung of its own; it's just that layer resolving from a second source, folded into the same row:
- If **capability behavior** and **agent personality** are both empty, `bakedBaseline()` (in code) supplies a final safety string so the model always has *something* identifying its capability + column. That's a property of layer 1 (code mechanics decides what happens when the stack is empty), not a separate layer.
- **Agent personality** itself is one resolution slot with two possible sources, not two layers: `agent.system_prompt` always wins when set; otherwise it inherits live from its template (`agent_templates.template_system_prompt`). Editing the template only matters for agents that haven't set their own value — same layer, same authority, same effect on the prompt either way.

| # | Layer | Editable by | What it may do |
|---|---|---|---|
| 1 | **Code mechanics** | Developer (code only) | The flow itself — which tool fires, which column a task moves to, what an agent may write, the order of every layer below, and the fallback text (`bakedBaseline()`) used if every layer below is empty. Immutable from any prompt; not itself injected as content. |
| 2 | **Runner mechanics prompts** (`server/src/services/runner-prompts/*.md`, loaded via `loadRunnerPrompt()`) | Developer (code only) | The "## Instructions" block sent alongside every task brief — git workflow, exit semantics, tool usage. System-owned; deliberately outside `instructions/` so it can never become user-editable. |
| 3 | **System Behavior** (`docs/rules.md`, loaded like any capability doc via `context_docs` in `runners.json`; editable through the Settings panel still labelled "System Rules" today — UI rename to match this layer's name is planned, not yet applied; configured in `agent.config.json`) | Superadmin / dev | Global, cross-subscription rules with technical depth. Can invoke code-exposed actions/hooks (e.g. `_notify_all_`) through the shared `invoke_action_hook` tool and the `ACTION_HOOKS` registry (`server/src/services/actionHooks.js`) — real and built, not aspirational, though the registry only has one entry so far and there's deliberately no permission/allow-list gating on top yet. This is on top of plain rules ("reply in Spanish", "never reveal business secrets"). Cannot change the flow. |
| 4 | **Capability Behavior** (`runners[].personality_file`, e.g. `instructions/{sub}/dev-implement.md` — code field name unchanged) | Operator | Methodology and tone for *any* agent of this capability — how it approaches its work. Real behavioural weight, not cosmetic. Can invoke the *same* registered actions as layer 3, through the same shared tool — the two layers no longer differ in mechanism, only in who writes the trigger and how broadly it's meant to apply. Still cannot change the flow itself (which tool fires, which column, what may be written). |
| 5 | **Workspace rules** (every top-level `.md` in `instructions/{subscriptionId}/`, excluding capability behavior files) | Admin / operator | Declarative boundaries shared across a workspace's boards — no new actions ("don't generate reports about X — GDPR"). |
| 6 | **Board rules** (`instructions/{sub}/{projId}/*.md`, e.g. `client.md`, `project.md`) | Board owner / admin | The same, scoped to one board ("don't send the PR-ready email here — it spams person X"). |
| 7 | **Agent personality** (`agents.system_prompt`, falling back to `agent_templates.template_system_prompt` if unset) | UI editor | Cosmetic only (tone, sign-off, phrasing). Supports `[STYLE]` + `[CONSTRAINTS]`. |

The gradient is **actions → constraints → methodology → cosmetics**, though action-invoking power isn't confined to one layer: layers 3 and 4 both reach the same shared `invoke_action_hook` tool and `ACTION_HOOKS` registry — real, not aspirational — they just differ in who writes the trigger and how broadly it's meant to apply, not in what's mechanically possible. Layers 5–6 add methodology or constraints but never new actions; layer 7 is cosmetic only, with effectively no effect on logic. Layers 3–7 are the **extension surface** — a fork or tenant customises behaviour through them without touching core code (layers 1–2).

### Instruction files are personality, not mechanics

Capability Behavior, Workspace, and Board files (layers 4–6) are meant to be edited by anyone, including non-technical users adding domain context, tone, or methodology hints. They must never describe runner mechanics — tool names, git workflows, write-scope paths, retry behaviour, column transitions, PR creation, exit conditions, etc. That information already lives where the system enforces it: handler code, tool descriptions, `runners.json`. This separation is a guardrail — nothing written in an instruction file can break the runner's contract. The seeded prompts (`planning.md`, `dev-implement.md`, `run-code-tests.md`) are the reference shape: voice, methodology, ethics, communication style — never which tool to call when.

### Worked example — a single Coder agent

| Layer | Example content |
|---|---|
| 4 — Capability Behavior (`dev-implement.md`) | "You're a professional coder. Read before you change. Smallest change that satisfies the spec. Don't fake completion." |
| 5 — Workspace (`coding-standards.md`) | "We use Clean Architecture. Never bypass the service layer." |
| 6 — Board (`project.md` for a client board) | "When touching the cart, always ask for human verification before merging." |
| 7 — Agent personality | This agent ("Camila") has her own value set, which wins outright: "Your name is Camila. You write commit messages in Spanish." Had she left it blank, she'd inherit her template's live value instead: "[STYLE] direct, no hedging. [CONSTRAINTS] Never reveal business logic in PR descriptions." |

*(Layers 1–3 are omitted here: layer 1 has no content of its own, the runner mechanics prompt (2) is identical for every Coder regardless of board, and System Behavior (3) is rarely set at all. If layers 4 and 7 were both empty for this agent, layer 1's baked-in baseline would be the only thing identifying its role.)*

These layers, plus the always-loaded files below, are assembled **once** into the agent's starting context when a run begins — layers 4 and 7 form the system prompt; the context files (layers 5 & 6, plus the always-loaded base files) are injected as the agent's initial message. Where each piece lands is just SDK placement — conceptually it is **one bundle**: everything the agent knows for that run. From there the agent works the task within that single session, on that context alone — it does not re-read instruction or doc files mid-run.

None of these layers can change which tool fires, which column a task moves to, or what files the agent can write — those are enforced at the runner/tool layer.

### `[STYLE]` and `[CONSTRAINTS]`

The personality text at layer 7 supports two semantic sections:
- `[STYLE]` — tone modifier (e.g. warm vs direct). Adjusts how the agent writes.
- `[CONSTRAINTS]` — hard rules, enforced above everything else (e.g. `Never ask about pricing`).

### What each agent loads as context

Assembled once into the agent's starting context bundle (see the layering note above), all dedup'd:

- **Capability Behavior** — the runner's `personality_file` (e.g. `dev-implement.md`), resolved to the most specific version that exists.
- **Runner mechanics prompt** — the `server/src/services/runner-prompts/*.md` file matching the current turn (e.g. first-contact vs follow-up for the Planner). Not user-editable — this is Layer 2 above.
- **Capability docs** — the `docs/` files mapped to the agent's capability, picked up from `context_docs` in `runners.json` (every capability currently maps to `docs/rules.md` — Layer 3, System Behavior, above; the registry is the source of truth for the mapping, not duplicated here).
- **Workspace files** — every top-level `.md` in `instructions/{sub}/` (excluding capability behavior files, already in the system prompt).
- **Board files** — every top-level `.md` in `instructions/{sub}/{proj}/` (e.g. `client.md`, `project.md`). Auto-scanned — drop a `.md` in and it loads, no per-agent wiring.
- **Always** — the app agent's base instruction file, for every agent; the project's human-facing setup file, additionally, for `is_coder` capabilities (the registry is the source of truth — the coder set is not duplicated here).

### Path resolution

The `personality_file` is stored as a short reference (e.g. `instructions/dev-implement.md`) without subscription or project IDs. At runtime, `resolveInstructionPath()` expands it to the most specific file that exists on disk:

1. `instructions/{subscriptionId}/{projectId}/X.md` — board-level (most specific, overrides subscription)
2. `instructions/{subscriptionId}/X.md` — subscription-level (shared, applies to all boards)

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

## Adding a New Agent Tool

Two different paths, depending on scope:

**A side effect any capability should be able to trigger** (a notification, an external call — doesn't determine how the task is left) → register it in the `ACTION_HOOKS` registry (`server/src/services/actionHooks.js`) instead of adding a bespoke tool. It's immediately callable by every capability through the already-wired `invoke_action_hook` tool — no tool-schema or dispatch-loop changes needed. Then just tell whichever capability(s) should use it to do so, in that capability's own behavior file or in System Rules, referencing the action by its bare name (written wrapped in underscores in prose, e.g. `_notify_all_`, per the registry's own convention). This is now the default path for anything that doesn't need to be capability-exclusive.

**A capability-exclusive tool, or one that determines how the task is left** (a new outcome alongside questioning/approved/split/abandoned) → the full bespoke-tool path, touching up to four places:

1. **Tool schema** — add the tool definition (name, description, `input_schema`) to the relevant tool-set array in `agentRunner.js` (e.g. `CLARIFICATION_TOOLS`). Reuse an existing set; only start a new one for a capability that doesn't have one yet.
2. **Handler branch** — add an `else if (block.name === '<tool>')` case to that runner's tool-dispatch loop. Log what happened:
   - If the tool determines how the task was **left**, also add a row to `OUTCOME_TOOL_SIGNALS` in `benchmarkRunner.js` so blind-tested runs can detect it.
   - Otherwise, just log a plain `'note'`-action entry. Benchmark scoring already surfaces every `'note'` entry to the AI judge and the Benchmark UI automatically — no further wiring needed there.
3. **Backing logic** — reuse an existing service where the behaviour already fits its pattern (e.g. a new kind of user-facing alert belongs next to `notifyHumanActionMembers`). Only add a new service file for a genuinely new capability area.
4. **Capability Behavior file** — tell the agent when and how to call it, in the exact format you want (title/body shape, trigger condition). The tool's JSON schema constrains the *arguments*; it does not tell the model *when* to call it — that only comes from this file's prose.

A tool that skips the logging convention (either path) is invisible to benchmark runs regardless of whether it actually fires — there is no other place that detects tool activity.
