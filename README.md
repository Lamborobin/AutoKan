# AutoKan

Autonomous AI agent task orchestration system. A kanban board where AI agents (PM, Developer, Tester) work through tasks in a pipeline, with human checkpoints for review and secrets.

## Architecture

```
AutoKan/
├── server/          # Node.js + Express + SQLite API
├── app/             # React + Tailwind frontend
├── agents/          # Agent prompts + config
│   ├── pm.md        # Project Manager agent system prompt
│   ├── developer.md # Developer agent system prompt
│   ├── tester.md    # Tester agent system prompt
│   └── config.json  # Permissions, models, pipeline config
└── data/            # SQLite database (auto-created)
```

## Pipeline

```
Backlog → In Progress → Testing → Human Review → Done
                 ↑           |
                 └───────────┘  (retry once on failure)
                               ↓
                         Human Action  (blocked: secrets, errors)
```

## Quick Start

### 1. Prerequisites
- Node.js 18+
- Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)

### 2. Install dependencies
```bash
npm run install:all
```

### 3. Start the app
```bash
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001/api

### 4. Run an agent (Claude Code)
```bash
# PM Agent — creates and plans tasks
claude --system-prompt agents/pm.md

# Developer Agent
claude --system-prompt agents/developer.md

# Tester Agent
claude --system-prompt agents/tester.md
```

## API Reference

All requests from the UI use `X-Agent-Id: human` (full access).
Agent requests use their specific ID (e.g. `X-Agent-Id: agent_pm`).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/tasks | List all tasks |
| POST | /api/tasks | Create task (PM/human) |
| PATCH | /api/tasks/:id | Update task |
| POST | /api/tasks/:id/move | Move to column |
| POST | /api/tasks/:id/log | Add activity log |
| POST | /api/tasks/:id/request_human | Flag for human action |
| DELETE | /api/tasks/:id | Delete task |
| GET | /api/agents | List agents |
| POST | /api/agents | Create agent (human only) |
| GET | /api/columns | List columns |
| POST | /api/columns | Create column (human only) |
| GET | /api/secrets | List secrets (human only) |
| POST | /api/secrets | Request secret |

## Adding a New Agent

1. Add a prompt file: `agents/my_agent.md`
2. Add to `agents/config.json`
3. Add via UI (Sidebar → Add agent) or API:

```bash
curl -X POST http://localhost:3001/api/agents \
  -H "X-Agent-Id: human" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CTO Reviewer",
    "role": "cto",
    "model": "claude-opus-4-5",
    "permissions": ["task:read", "task:move", "task:log"],
    "prompt_file": "agents/cto.md"
  }'
```

## Customizing Columns

Columns are fully customizable from the UI or API. You can add, rename, reorder, or delete columns. The pipeline config in `agents/config.json` defines the flow order.
