# Demo & Test Tools

A catalog of proof-of-concept agent tools built for testing, kept here for reference and re-testing. This is the "what exists and how to exercise it" list — not the "how to build one" guide (that's the "Adding a New Agent Tool" checklist in the agent-system doc).

---

## notify_all — Planner capability tool

**What it does:** sends an in-app notification to every user in the app, via the existing notification pipeline.

**Why it exists:** proof-of-concept for a capability behavior file instructing an agent to fire a real action mid-task — not just ask a question or approve.

**Where the trigger lives:** the Planner's capability behavior file, under "Notification Test — Broadcast Tool." Fires once per task, on first contact, in the same turn as the Planner's first question or approval.

**How to test it:** create (or benchmark-run) a task assigned to a Planner-capable agent, then check the notifications table / bell icon for a "New task: <title>" entry. Benchmark scoring also surfaces this automatically — any `note`-action task log shows up as "Also fired" under a benchmark run's Technical Check.

**Tested:** confirmed working via a benchmark run, 2026-08-13. A duplicate copy was briefly placed in the System Rules layer to test whether a generic (capability-agnostic) trigger location worked the same way — it did, for the Planner specifically, since `notify_all` is still only wired into the Planner's tool set. Removed from System Rules afterward to avoid the layer confusion that not being wired to any specific capability's tool set would eventually cause for other capabilities reading the same instruction.

---

_Add future demo/test tools below the same way: what it does, why it exists, where its trigger lives (by capability, not filename), how to verify it worked, and whether/when it was actually tested._
