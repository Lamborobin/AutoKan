# Upcoming Changes

Features that are planned or partially designed but not yet implemented. Read this file before starting a task that might overlap with planned work — to avoid building something that conflicts with the intended approach.

Update this file when:
- A new feature is planned (add it here)
- A planned feature gets built — remove it from this file once it ships

---

## Not Yet Built

  **File reading utility** — shared helper that detects file type and returns clean text/structure. Read-only, writes nothing. Formats: PDF (Claude native), Word/docx (`mammoth`), Excel/csv (`sheetjs`), PowerPoint/pptx (ZIP+XML), plain text, JSON, XML, YAML, SQL, DXF (AutoCAD text), IFC (construction BIM, STEP text), XBRL (financial XML), EDI (logistics text), HL7 v2, FHIR (JSON/XML), SCORM (ZIP+XML), Sketch/XD (ZIP+JSON), PSD layer metadata (`psd` library, MIT), Premiere/DaVinci project files (XML/JSON in ZIP), Unity/Unreal project files (YAML/JSON).
  **Permission/allow-list for action hooks** — any capability can invoke any registered action; there is no per-capability or per-install allow-list. Distinct from the effects boundary, which only decides whether an invocation really fires in the current run mode, not whether that capability may invoke it at all. Cheaper to build now that every hook declares an effect kind — the allow-list becomes "which kinds may this capability produce" rather than a name-by-name matrix. Revisit once the registry holds more than the one demo entry.

- **Additional sectors — rollout priority.** Each needs an allow-list, seeded starter context, and a documented validation approach. Discuss and design before building.
  1. `healthcare` — clinical protocols, training materials, regulatory submission checklists, literature summaries. Formats: PDF, Word, HL7, FHIR. Compliance rules (ICH/FDA) seeded as board context.
  2. `legal` — contract review, clause verification, filing compliance, matter tracking. Formats: PDF, Word. High value — clear validation rules, approval chains already match the flow.
  3. `finance` — audit workflows, reconciliation, financial reporting compliance. Formats: Excel, CSV, PDF, XBRL (SEC/IFRS reporting XML standard).
  4. `aec` — architecture/engineering/construction. Design review, planning approval, spec compliance. Formats: PDF, DXF, IFC (Building Information Modeling open standard).
  5. `logistics` — order management, shipment workflows, supplier compliance. Formats: CSV, Excel, EDI (purchase orders / invoices between companies).
  6. `realestate` — deal pipelines, lease review, property management. Formats: PDF, Word, Excel. Mostly human-operated; agents useful for checklist and clause verification.
  7. `government` — procurement, policy compliance, public reporting. Formats: PDF, Word, jurisdiction-specific XML. Agents useful for checklist verification, not drafting.
  8. `hr` — hiring pipelines, onboarding, offer letter compliance. Formats: PDF, Word, Excel.
  9. `education` — course development, curriculum review, accreditation compliance. Formats: Word, PDF, SCORM (ZIP-based eLearning packages).

- **Ownership / copyright notice** — add a proprietary copyright line (`© <Company>, all rights reserved`) to the README and a top-of-repo notice once the owning company name and IP terms are confirmed. Default stays all-rights-reserved (no `LICENSE` file) until the company decides on any public release.
- **Clean v1 release** — eventually strip the development commit history and demo/seed data and push the result as a fresh repository, once the app is ready to ship.
- **Test suite for AutoKan** — none today; AutoKan changes are verified by running the app (`npm run dev`) and observing behaviour, while client projects under `client/` test themselves. Add a real suite (Jest/Vitest) + a CI test step once the surface stabilises.
- **Docker test environment** — isolated Linux container for the Tester agent to run tests safely without touching the host machine
- **Cloud mode** — when `CLOUD_MODE=true` (or `NODE_ENV=production`), hide the "Link local folder" tab in Connections; force GitHub workflow only. The `CLOUD_MODE` env var is the planned gate but the logic isn't implemented.
- **Language picker** — UI language switching is designed (English default, user-selected language overrides) but the picker component and i18n system aren't built yet
- **Add DeepSeek as an AI provider option** — extend the model registry (`server/src/config/models.json`, `server/src/services/modelRegistry.js`) and provider selection UI (`app/src/store/modelsSlice.js`) to support DeepSeek models alongside the existing providers.
- **Specialised test runners** — the seeded Code Test Runner is intentionally narrow (automated test suite only). Future capabilities and runners for the other testing modes that don't fit shell execution: `perm_test_migration` (verify data state after a migration), `perm_test_e2e` (full-stack end-to-end against a live env), `perm_test_infra` (verify environment / config health), `perm_test_regression` (targeted regression checks for a specific bug fix). Each gets its own capability entry + runner config + prompt file when built.
