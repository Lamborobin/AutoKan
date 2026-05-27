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

## Agent Instruction File System

Each agent's context is assembled from these sources before the Anthropic API is called:

| Layer | Source | Notes |
|---|---|---|
| 1 | `template_system_prompt` (DB field) | Short identity/modifier prompt, ≤1000 chars |
| 2 | `prompt_file` | Primary methodology file for the agent's role |
| 3 | `instruction_files` | JSON array of additional context files |
| 4 | `CLAUDE.md` | All agents — contains project rules and context file table |
| 5 | `README.md` | Coder agents only (`perm_coding`, `perm_backend`, `perm_frontend`, `perm_coding_tester`) |

The `template_system_prompt` supports `[STYLE]` and `[CONSTRAINTS]` sections:
- `[STYLE]` — tone modifier (e.g. warm/direct). Adjusts how the agent writes responses.
- `[CONSTRAINTS]` — hard rules, enforced above everything else (e.g. `Never ask about pricing`)

### Default file assignments

| Agent | prompt_file | instruction_files |
|---|---|---|
| PM | `instructions/project-manager.md` | `["instructions/client.md"]` |
| Developer | `instructions/developer.md` | `["instructions/project.md", "instructions/client.md"]` |
| Tester | `instructions/tester.md` | `["instructions/project.md", "instructions/client.md"]` |

### Path resolution

Paths are stored as short references (e.g. `instructions/developer.md`) without subscription or project IDs. At runtime, `resolveInstructionPath()` expands these to the most specific file that exists on disk:

1. `instructions/{subscriptionId}/{projectId}/X.md` — board-level (most specific, overrides subscription)
2. `instructions/{subscriptionId}/X.md` — subscription-level (shared template, applies to all boards)

The subscription level holds shared methodology files. The board level holds board-specific context (`client.md`, `project.md`) and any per-board overrides.
