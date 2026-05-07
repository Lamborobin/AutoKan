# Project Context — AutoKan

This file gives the PM agent background knowledge about the project so it can ask smarter planning questions.

## What Is AutoKan?
An autonomous AI agent task orchestration system — a kanban board where AI agents (PM, Developer, Tester) work through software tasks autonomously. Human stays in the loop at key checkpoints.

## Tech Stack
- **Backend**: Node.js + Express + SQLite (better-sqlite3) — port 3001
- **Frontend**: React + Tailwind CSS + Vite — port 5173
- **State**: Zustand
- **Drag & Drop**: @dnd-kit
- **DB**: SQLite via better-sqlite3 (no ORM)

## Project Structure
```
AutoKan/
├── server/src/
│   ├── db/index.js          # Schema + seeding
│   ├── middleware/auth.js   # Agent auth via X-Agent-Id header
│   └── routes/              # tasks.js, agents.js, columns.js, secrets.js
├── app/src/
│   ├── api/index.js         # Axios API client
│   ├── store/index.js       # Zustand global state
│   └── components/          # React UI components
├── agents/                  # System prompts (pm.md, developer.md, tester.md)
└── data/                    # SQLite DB (auto-created at runtime)
```

## Coding Conventions
- Backend: plain Node.js CommonJS (`require`/`module.exports`), no TypeScript
- Frontend: React functional components with hooks, JSX, Tailwind utility classes
- No ORM — raw SQL via `db.prepare().run()` / `.get()` / `.all()`
- API always returns JSON; errors use `{ error: "message" }` shape
- Agent auth: every API request needs `X-Agent-Id` header matching an agent in DB

## Current State of the App
The following is built and working:
- Kanban board with columns: Backlog, In Progress, Testing, Human Action, Human Review, Done
- Task CRUD with priority, complexity, tags, progress tracking
- Agent management (PM, Developer, Tester)
- PM planning conversation workflow (Q&A before tasks go to In Progress)
- Approval gate: both PM + human must approve before Backlog → In Progress
- Developer git workflow: create branch, commit, push on task assignment
- Column-based assignment restrictions (PM in Backlog, Dev in Progress, etc.)
- Activity log on every task

## What Is NOT Built Yet
- Automatic agent triggering (agents are run manually via CLI)
- Tester agent workflow (testing pipeline not yet wired)
- Docker isolated test environment
- Secrets management UI
- Webhooks / real-time notifications
- GitHub PR creation (branches are pushed, PRs created manually)

## Design Principles
1. Human stays in control — agents can't approve their own work
2. No third-party services beyond Anthropic API
3. Everything is customizable — agents are markdown files, columns are DB rows
4. One retry by default — prevents infinite loops

## When Reviewing Tasks, Consider:
- Does the task fit within the existing React + Express + SQLite stack?
- Is it scoped to a single concern (not mixing frontend + backend + DB in one task)?
- Does the developer need to know about any existing components or API patterns?
- Is there a dependency on something not yet built (e.g., auth, Docker, webhooks)?
- Is the scope right for one PR / one branch?
