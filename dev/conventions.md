# Development Conventions

Constraints for anyone (human or AI dev-assistant) changing AutoKan's own code. These are platform-development rules — they are **not** agent behaviour rules (those live in the editable System Behavior layer).

**Code & architecture**
1. Read the full file before editing — never edit by filename alone.
2. Check for existing utilities (`store/`, `api/`, shared components) before writing a new helper.
3. Match the local pattern — naming, error handling, data fetching (`api.get(...).then(r => r.data)`).
4. Prefer the smallest change: add to an existing file → new file → new folder (only when ≥3 files belong in it).
5. If a file is already >600 lines and your change adds 50+ lines, extract first, then add.
6. Feature + its architectural cleanup go in the same commit, not a follow-up.
7. Use capabilities + the runner registry, never hardcoded agent IDs. Runner dispatch lives in `server/src/services/agentRunner.js`, looking up `(capability, column)` in `server/src/seed/runners.json`. One `perm_*` capability per agent, enforced server-side.
8. No legacy or dead code — delete the old path when you supersede it; git history is the archive.

**Database**
- Never reset or overwrite user data: tasks, user-created agents/columns, and any UI edits are personal data.
- `server/src/db/index.js` is `CREATE TABLE` + seeds only — no `ALTER TABLE`/migrations. A schema change requires a user-initiated `npm run db:reset` + restart. **Never run `db:reset` automatically — always ask first** (a misconfigured `DB_PATH` could wipe the wrong database).

**Folders** — create a new folder only for a genuinely new segment. First scan for an existing one; if none, ask the purpose and what files will live in it before creating. (System scaffolding like `instructions/{sub}/{proj}/` is exempt.)

**Archive vs delete** — has dependents → archive (`archived_at`, `active = 0` for agents); no dependents → hard delete. `DELETE` returns `409 { has_dependencies: true }` when blocked. GET endpoints accept `?include_archived=true`.

**Other**
- Agents identify to the API via the `X-Agent-Id: <agent_id>` header.
- Before adding any timeout/delay/dedup constant, check whether `NOTIFICATION_DEDUP_SECONDS` (or a shared timing constant) already covers it — one knob per concept, not per feature. Ask before introducing a new configurable timeout.
- All UI text and code is written in English.
