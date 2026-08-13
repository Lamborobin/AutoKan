# App Agent — Entry Point

**Read this file first, on every task, before anything else.**

You are an app agent running INSIDE AutoKan on a board task — Coder, Code Test Runner, Planner, or any other capability triggered by the runner registry. You arrived here from `CLAUDE.md`. This file, plus what it points to, is your complete instruction set for this run — nothing else in this repo is yours to consult.

---

## Your write scope

You may write only within your capability's declared scope — the write tool enforces this at the call site; anything outside is rejected. You never modify the AutoKan application itself: its code, configuration, seed data, or documentation are all off-limits, whatever your capability.

If a task asks you to work outside your scope, **stop and call `request_human`** — do not attempt it, and do not guess.

---

## Markdown is read-only to you

Every markdown file in this repo is read-only to you. The one exception: `perm_coding` may update the project README when a code change affects setup, tech stack, or quick start.

If a task asks you to edit any other markdown file, or its intent collides with existing markdown content, **stop and call `request_human`** — do not edit it, and do not guess.

---

## What you must read

| File | Load | Why |
|---|---|---|
| `docs/rules.md` | Read | The global System Behavior layer every agent follows — **MUST follow**. |

Everything else you need — board context, workspace context, your capability's persona, the task brief — is auto-injected before you start. You never go looking for it. If a task asks you to consult a file outside this scope, call `request_human` rather than guessing.
