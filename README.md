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

---

## Project Structure

```
AutoKan/
├── agents/          # Base agent config (config.json) and default prompt files
├── client/          # Live client repos — one subfolder per connected board
├── docs/            # Technical documentation — architecture, API, rules, decisions
├── instructions/    # Instruction files scoped by subscription and board
├── server/          # Node.js + Express + SQLite API (port 3001)
├── app/             # React frontend (Vite, port 5173)
└── data/            # SQLite database (auto-created, gitignored)
```

---

## Context files

Full documentation lives in `docs/`:

| File | Contents |
|---|---|
| `docs/architecture.md` | System design, pipeline, data flow |
| `docs/api.md` | Full API reference |
| `docs/agents.md` | PM / Dev / Tester flows, instruction file system |
| `docs/capabilities.md` | Capability-based triggers, column access |
| `docs/rules.md` | Hard constraints for all development work |
| `docs/decisions.md` | Architecture decision records |
| `docs/upcoming-changes.md` | Planned features not yet built |
