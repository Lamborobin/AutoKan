# AutoKan

Autonomous AI agent task orchestration — a kanban board where AI agents (PM, Developer, Tester) and humans collaborate on tasks through a structured pipeline. Built to be fully self-hosted with no third-party dependencies beyond Anthropic.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express + SQLite (better-sqlite3) |
| Frontend | React 18 + Vite + Tailwind CSS |
| State | Zustand (split into domain slices) |
| Drag & Drop | @dnd-kit |
| Auth | Google OAuth + JWT |
| AI | Anthropic SDK (Claude Opus / Sonnet / Haiku) |

---

## Quick Start

### 1. Prerequisites
- Node.js 18+
- A Google OAuth client ID
- An Anthropic API key

### 2. Environment
Create `server/.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_CLIENT_ID=...
JWT_SECRET=...           # optional, defaults to dev secret
```

### 3. Install and run
```bash
npm run install:all      # install all dependencies
npm run dev              # start frontend + backend
```

- Frontend: http://localhost:5173
- API: http://localhost:3001/api

### 4. Sign in
Open the frontend and sign in with Google. The first user is automatically made a superadmin.

### 5. (Optional) Customise the default agents

The three default agents (PM, Developer, Tester) are seeded from a single source: **`server/src/seed/agent-templates.json`**. Each entry defines both the template and the corresponding default agent — edit the file to change a default's name, model, description, system prompt, instruction files, permissions, or role IDs. Changes only take effect on a fresh DB — run `npm run db:reset` and restart.

---

## Project Structure

```
AutoKan/
├── client/          # Live client repos — one subfolder per connected board
├── docs/            # System Rules — the one file the AI Context panel exposes to admins
├── dev/             # Technical reference for contributors — architecture, API, decisions
├── instructions/    # Instruction files scoped by subscription and board
├── server/          # Node.js + Express + SQLite API (port 3001)
│   └── src/
│       ├── config/  # Stable IDs (constants.js), agent.config.json
│       ├── db/      # Schema only (CREATE TABLE)
│       ├── seed/    # Default data — seedDefaults + agent-templates.json
│       ├── routes/  # One file per resource group
│       ├── services/# agentRunner, emailService
│       └── utils/   # ids.js (generators), instructions.js (scaffolding)
├── app/             # React frontend (Vite, port 5173)
└── data/            # SQLite database (auto-created, gitignored)
```

See `dev/architecture.md` for the full tree.

---

## Use cases

**Building a product** — Client X wants a new website. Their entire codebase lives in `client/clientX/`. Agents read that folder, implement work on the board, and commit back to it. The board tracks every task from brief to deployment. Any non-technical user can drive the workflow through the UI — no terminal required.

**Processing files** — Client Y drops files into `client/clientY/`. Agents read those files, interpret the client's intent from their contents, create tasks on the board, and act on them. The app surfaces what the agent understood and what it did, so the human can confirm or correct.

---

## Demo & distribution

This repository doubles as the **official demo** — a fully-functional install seeded with the default agents (PM, Developer, Tester), their templates, and one sample client, **Velour**, so the whole pipeline runs out of the box. A cloud-hosted variant is planned but not yet implemented.

AutoKan is **proprietary software** — all rights reserved by the owning company. It is distributed on the company's terms (e.g. per-client installs or a hosted offering); it is not open-source, and may not be copied, redistributed, or resold without authorization.

---

## Documentation

`CLAUDE.md` is the entry point for every reader of this repo, human or AI. Technical and process reference material for contributors lives in `dev/`; the one agent-facing, admin-editable rules file lives in `docs/`.