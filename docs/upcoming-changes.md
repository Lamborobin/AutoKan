# Upcoming Changes

Features that are planned or partially designed but not yet implemented. Read this file before starting a task that might overlap with planned work — to avoid building something that conflicts with the intended approach.

Update this file when:
- A new feature is planned (add it here)
- A planned feature gets built — remove it from this file once it ships

---

## Not Yet Built

- **Ownership / copyright notice** — add a proprietary copyright line (`© <Company>, all rights reserved`) to the README and a top-of-repo notice once the owning company name and IP terms are confirmed. Default stays all-rights-reserved (no `LICENSE` file) until the company decides on any public release.
- **Test suite for AutoKan** — none today; AutoKan changes are verified by running the app (`npm run dev`) and observing behaviour, while client projects under `client/` test themselves. Add a real suite (Jest/Vitest) + a CI test step once the surface stabilises.
- **Docker test environment** — isolated Linux container for the Tester agent to run tests safely without touching the host machine
- **GitHub PR comment ↔ task activity sync** — when a task is linked to a PR (`task.pr_url`), inbound GitHub comments on that PR should appear as activity-log entries on the task, and in-app comments on the task should optionally post back to the PR. Implementation: GitHub webhook → `POST /api/github/webhook` → look up task by `pr_url` → insert a `task_log` entry with the commenter's GitHub username and body. Mirroring task → PR is a bool toggle on the task. Useful so reviewers who live in GitHub don't need to open the AutoKan UI to leave feedback, and so the task stays the single source of truth for activity.
- **CTO/Reviewer agent** — optional code review step between Testing and Human Action; checks code quality before the human sees it
- **Cloud mode** — when `CLOUD_MODE=true` (or `NODE_ENV=production`), hide the "Link local folder" tab in Connections; force GitHub workflow only. The `CLOUD_MODE` env var is the planned gate but the logic isn't implemented.
- **Language picker** — UI language switching is designed (English default, user-selected language overrides) but the picker component and i18n system aren't built yet
- **PM agent writes to client.md** — during the planning phase, the PM agent should append any new context gathered (client preferences, constraints, agreed decisions) to the board's `instructions/{subId}/{projectId}/client.md` file. This keeps the instruction file up to date automatically. A toggle in Settings to enable/disable this behavior is planned; default should be enabled.
- **Specialised test runners** — the seeded Code Test Runner is intentionally narrow (automated test suite only). Future capabilities and runners for the other testing modes that don't fit shell execution: `perm_test_migration` (verify data state after a migration), `perm_test_e2e` (full-stack end-to-end against a live env), `perm_test_infra` (verify environment / config health), `perm_test_regression` (targeted regression checks for a specific bug fix). Each gets its own capability entry + runner config + prompt file when built.
