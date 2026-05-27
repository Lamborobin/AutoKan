# Upcoming Changes

Features that are planned or partially designed but not yet implemented. Read this file before starting a task that might overlap with planned work — to avoid building something that conflicts with the intended approach.

Update this file when:
- A new feature is planned (add it here)
- A planned feature gets built (move it to `decisions.md` with its decision rationale, remove from here)

---

## Not Yet Built

- **Docker test environment** — isolated Linux container for the Tester agent to run tests safely without touching the host machine
- **Secrets management UI panel** — currently secrets are added manually to `server/.env`; needs a UI for humans to add/view/rotate secrets without leaving the app
- **Webhooks / desktop notifications** — notify humans when a task needs their attention (Human Action, Human Review)
- **CTO/Reviewer agent** — optional code review step between Testing and Human Review; checks code quality before the human sees it
- **Agent assignment UI filtering** — the API enforces that agents can only be assigned to columns they have role access for, but the UI dropdown doesn't filter yet; it shows all agents regardless
- **Subscription-level Members panel** — Settings → Subscription → Members is a placeholder; subscription-wide member management not yet built
- **Cloud mode** — when `CLOUD_MODE=true` (or `NODE_ENV=production`), hide the "Link local folder" tab in Connections; force GitHub workflow only. The `CLOUD_MODE` env var is the planned gate but the logic isn't implemented.
- **Language picker** — UI language switching is designed (English default, user-selected language overrides) but the picker component and i18n system aren't built yet
- **PM agent writes to client.md** — during the planning phase, the PM agent should append any new context gathered (client preferences, constraints, agreed decisions) to the board's `instructions/{subId}/{projectId}/client.md` file. This keeps the instruction file up to date automatically. A toggle in Settings to enable/disable this behavior is planned; default should be enabled.
