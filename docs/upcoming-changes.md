# Upcoming Changes

Features that are planned or partially designed but not yet implemented. Read this file before starting a task that might overlap with planned work — to avoid building something that conflicts with the intended approach.

Update this file when:
- A new feature is planned (add it here)
- A planned feature gets built — remove it from this file once it ships

---

## Not Yet Built

- **Sectors and non-software capabilities** — extend AutoKan beyond software development into any knowledge-work sector. Agents are optional — boards work as normal human-operated kanban without any agents assigned. Agents add acceleration on specific tasks where automation makes sense. Core design:

  **Infrastructure (build once, all sectors benefit):**
  1. `sector` field on boards — set at creation, locked after. Wrong sector = new board.
  2. Capability visibility toggle per board in Settings — sector provides the default set, user can adjust. Hides irrelevant capabilities from agent assignment UI without deleting them.
  3. Two new cross-sector capability types:
     - `perm_producing` — agent writes a structured `.md` summary or checklist to `client/outputs/` (never edits the source document). Task moves to Human Action for review, same flow as PR-ready today.
     - `perm_verifying` — reads files from the client folder, checks structure/content against criteria in instruction files, outputs a pass/fail report. Same retry/escalation logic as the test runner. Read-only — never writes to source files.
  4. Sector-scoped rules and guidelines — each sector seeds its own starter instruction files into the board's existing `instructions/{subscriptionId}/{projectId}/` folder at creation time, same path as today. No new folder structure. The sector determines which templates are dropped in — a manufacturing board gets safety and SOP templates, a software board gets the current defaults. A steel factory board should never have git workflow rules in its instruction files.
  5. File reading utility — shared helper that detects file type and returns clean text/structure. Supported formats: PDF (Claude native), Word/docx (`mammoth`), Excel/csv (`sheetjs`), PowerPoint/pptx (ZIP+XML parse), plain text, JSON, XML, YAML, SQL, DXF (AutoCAD text format), IFC (construction BIM, STEP text format), XBRL (financial XML), EDI (logistics text), HL7 v2 (text), FHIR (JSON/XML), SCORM (ZIP+XML), Sketch/XD (ZIP+JSON), PSD layer metadata (`psd` library, MIT), Premiere Pro/DaVinci project files (XML/JSON inside ZIP), Unity/Unreal project files (YAML/JSON). Writes nothing.

  **Sector rollout priority — discuss and design each before building:**
  1. `manufacturing` — SOPs, incident reports, maintenance checklists, safety compliance, supplier qualification. Key formats: PDF, Word, Excel, DXF. First non-software proof sector.
  2. `healthcare` — clinical protocols, training materials, regulatory submission checklists, literature summaries. Key formats: PDF, Word, HL7, FHIR. Compliance rules stored in instructions (ICH/FDA format guidelines).
  3. `legal` — contract review, clause verification, filing compliance, matter tracking. Key formats: PDF, Word. High value — clear validation rules, structured approval chains already match AutoKan's flow.
  4. `finance` — audit workflows, reconciliation, financial reporting compliance. Key formats: Excel, CSV, PDF, XBRL (SEC/IFRS reporting XML standard).
  5. `aec` — architecture/engineering/construction. Design review, planning approval, spec compliance. Key formats: PDF, DXF, IFC (Building Information Modeling open standard).
  6. `logistics` — order management, shipment workflows, supplier compliance. Key formats: CSV, Excel, EDI (Electronic Data Interchange — plain text, widely used for purchase orders and invoices between companies).
  7. `realestate` — deal pipelines, lease review, property management tasks. Key formats: PDF, Word, Excel. Agents useful for document checklist verification and lease clause checks — fully human-operated otherwise.
  8. `government` — procurement, policy compliance, public reporting workflows. Key formats: PDF, Word, XML schemas vary by jurisdiction. Agents useful for checklist verification, not drafting.
  9. `hr` — hiring pipelines, onboarding, offer letter compliance. Key formats: PDF, Word, Excel.
  10. `education` — course development, curriculum review, accreditation compliance. Key formats: Word, PDF, SCORM (ZIP-based eLearning packages).

  Each sector discussion should cover: specific use cases, which capabilities make sense, what instruction templates to seed, and what validation rules agents can realistically check. Sectors that are purely human-operated (no agents) are still valid — the board structure and task pipeline have value without automation.

- **Per-role progress tracking** — replace the single global `progress` field on a task with per-role progress derived from each agent's own checklist. Today progress is a manually set integer (0–100) that only makes sense for the coder; PM runs, tester runs, and any other capability contribute nothing to it. The rework: each capability that has a checklist (the PM already writes `pm_checklist`; the coder and tester would write their own structured checklists) exposes its own completion ratio — resolved items ÷ total items — displayed as a small labelled progress bar per role inside the task card and detail panel. The single global bar is removed from the card exterior. A task with three roles (PM, Developer, Tester) would show three separate bars, each only visible once that role has started and produced a checklist. Implementation touches: `task_logs` or a new `task_role_checklists` structure to store per-role items; the runner prompts for coder and tester updated to emit structured checklists the same way the PM does today; the card and detail UI updated to render per-role bars instead of one global bar.

- **Per-capability context file filtering** — currently every `.md` file in `instructions/{sub}/{proj}/` is loaded for every agent regardless of capability. The PM reads the tech stack, the developer reads the client brand values — all of it goes to everyone. The fix: support an optional `audience` front-matter field on instruction files (e.g. `audience: [perm_coding, perm_coding_tester]`). The context loader respects this when building each agent's bundle — the PM only gets files with no audience restriction or `audience: [perm_planning]`. This enables clean file separation: `client.md` and `project.md` for all agents, `tech.md` for developers and testers only. Until this is built the workaround is section markers inside `project.md` and PM prompt instructions to ignore technical sections.

- **Ownership / copyright notice** — add a proprietary copyright line (`© <Company>, all rights reserved`) to the README and a top-of-repo notice once the owning company name and IP terms are confirmed. Default stays all-rights-reserved (no `LICENSE` file) until the company decides on any public release.
- **Test suite for AutoKan** — none today; AutoKan changes are verified by running the app (`npm run dev`) and observing behaviour, while client projects under `client/` test themselves. Add a real suite (Jest/Vitest) + a CI test step once the surface stabilises.
- **Docker test environment** — isolated Linux container for the Tester agent to run tests safely without touching the host machine
- **Task → PR comment mirroring** — in-app comments on the task optionally post back to the GitHub PR as a GitHub comment. Requires a bool toggle on the task. The inbound direction (GitHub → task) is already implemented via `POST /api/tasks/:id/sync_github` (polling on task open).
- **CTO/Reviewer agent** — optional code review step between Testing and Human Action; checks code quality before the human sees it
- **Cloud mode** — when `CLOUD_MODE=true` (or `NODE_ENV=production`), hide the "Link local folder" tab in Connections; force GitHub workflow only. The `CLOUD_MODE` env var is the planned gate but the logic isn't implemented.
- **Language picker** — UI language switching is designed (English default, user-selected language overrides) but the picker component and i18n system aren't built yet
- **PM client.md toggle** — a per-board on/off switch in Settings to prevent the PM from even proposing context drafts. The confirmation step (human approves before anything is written) already guards accidental writes, so this toggle is low priority.
- **Planning analytics dashboard (per board)** — a board-level view that tracks planning conversation outcomes over time. Each PM planning session gets a result type: `accepted` (PM approved, human approved, no bouncebacks), `bounced` (PM pushed back or asked clarifying questions that revealed a misalignment), `discontinued` (task was dropped or moved off the board during planning), `revised` (task was significantly rewritten after PM feedback). Goal: surface patterns — is the PM frequently confused about what this project is? Is the human often approving tasks the PM flags as unclear? Start narrow: instrument the PM flow only (`perm_planning`), add other agents later. Stats to capture per board: total tasks planned, acceptance rate, bounceback rate, average questions asked per task, tasks discontinued. A bounceback is defined as a PM question that reveals the task doesn't fit the board context (like the pricing page on a fashion store), not just a normal clarifying question.
- **Specialised test runners** — the seeded Code Test Runner is intentionally narrow (automated test suite only). Future capabilities and runners for the other testing modes that don't fit shell execution: `perm_test_migration` (verify data state after a migration), `perm_test_e2e` (full-stack end-to-end against a live env), `perm_test_infra` (verify environment / config health), `perm_test_regression` (targeted regression checks for a specific bug fix). Each gets its own capability entry + runner config + prompt file when built.
