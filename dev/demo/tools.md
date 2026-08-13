# Demo & Test Tools

A catalog of proof-of-concept agent tools built for testing, kept here for reference and re-testing. This is the "what exists and how to exercise it" list — not the "how to build one" guide (that's the "Adding a New Agent Tool" checklist in the agent-system doc).

---

## Action hooks — generic, any capability

`invoke_action_hook` is a generic tool available to every capability's tool set, backed by a small developer-curated registry (`ACTION_HOOKS` in `server/src/services/actionHooks.js`). Nothing is invokable unless it has an entry there — that registry is the actual safety boundary, since there's deliberately no per-capability or per-install permission gating on top of it yet.

**Convention for referencing an action in prose:** wrap the bare name in underscores, e.g. `_notify_all_`, in System Rules or any capability behavior file. The model passes the bare name (no underscores) as the `action` argument when it calls `invoke_action_hook`.

### notify_all

**What it does:** sends an in-app notification to every user in the app, via the existing notification pipeline.

**Why it exists:** the first entry in the action-hooks registry — proof-of-concept for both the mechanism itself and the underscore-naming convention, evolved from an earlier Planner-only tool of the same name.

**Where the trigger lives:** System Rules, worded capability-neutral ("the first time you begin working on a task — no prior actions taken yet") so it's not tied to any one capability's interaction shape. Deliberately *not* in the Planner's capability behavior file — an earlier version lived there, which only proved the Planner could call it, not that the mechanism was actually capability-agnostic.

**How to test it:** create (or benchmark-run) a task assigned to any capability, then check the notifications table / bell icon for a "New task: <title>" entry. Benchmark scoring also surfaces this automatically — any `note`-action task log shows up as "Also fired" under a benchmark run's Technical Check.

**Tested:** confirmed working as a Planner-only tool via a benchmark run, 2026-08-13. That version only fired through the Planner's own tool set, which is what proved the mechanism needed to be capability-agnostic rather than staying Planner-only — leading to `invoke_action_hook`/`ACTION_HOOKS`, and then to moving the trigger itself out of the Planner's file into System Rules so it's no longer coupled to one capability at all. Not yet re-verified from System Rules with the new wording — worth a fresh benchmark run.

---

_Add future demo/test tools below the same way: what it does, why it exists, where its trigger lives (by capability, not filename), how to verify it worked, and whether/when it was actually tested._
