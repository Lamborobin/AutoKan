# Runner runtime prompts

System-owned markdown templates for the runtime "## Instructions" block each handler sends to the model alongside the task brief. Read by `agentRunner.js` via `loadRunnerPrompt(name, vars)`.

**Not** in `instructions/` because these are NOT user-editable. Editing them changes runner mechanics — git workflow, exit semantics, tool usage. They live in the codebase next to the handlers, version-controlled with the runner logic, and ship with deploys.

## Template syntax

Plain markdown with `{varName}` placeholders. The loader substitutes them at runtime. Unknown placeholders are left as-is so they're easy to spot.

Example: `[{taskId}] {taskTitle}` → `[task_abc123] Add navigation button`

## Files

| File | Used by handler | When |
|---|---|---|
| `implement-in-worktree.md` | `runImplementInWorktree` | Every turn — combined with the task brief into the initial user message |
| `test-with-retry.md` | `runTestWithRetry` | Same |
| `clarify-first-contact.md` | `runClarifyAndApprove` | When the conversation log is empty |
| `clarify-followup.md` | `runClarifyAndApprove` | After the human has answered at least once |
| `clarify-final-review.md` | `runClarifyAndApprove` | When all checklist items are resolved but the task isn't yet approved |
