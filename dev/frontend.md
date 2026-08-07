# Frontend Architecture (`app/src/`)

Read this file when working on any file under `app/src/`.

---

## `app/src/` structure

```
app/src/
├── api/index.js            # Axios client — one named export group per resource (tasksApi, agentsApi, …)
├── store/                  # Zustand — slices combined in index.js
│   ├── index.js
│   ├── authSlice.js
│   ├── boardSlice.js
│   ├── workspaceSlice.js
│   └── uiSlice.js
├── constants/              # columns.js, agents.js, tasks.js
└── components/
    ├── Sidebar.jsx         # (root) board sidebar + agent panel
    ├── LoginPage.jsx       # (root)
    ├── agent/              # AgentForm, NewAgentModal, EditAgentModal, TemplatesModal
    ├── board/              # Column, TaskCard
    ├── task/               # TaskDetail, TaskComments, NewTaskModal
    ├── settings/           # SettingsPage, AiContextPanel, InfoModal, contextInfo, BoardRepoSettings
    └── shared/             # BoardsModal, InviteModal, MembersModal, ArchivedTasksModal, MarkdownText
```

Feature subdirectories are created **on demand** — only when 3+ related files exist (see this repo's folder-creation convention).

## File Size Thresholds
| Lines | Action |
|---|---|
| >400 | Look for extraction opportunities |
| >600 | Extract at least one sub-component or hook |
| >900 | Must extract before adding more features |

## When to Create a New File
**Extract to its own file when:**
- The piece manages its own local state (`useState`, `useEffect`)
- It is used in 2+ parent components
- Extracting it reduces the parent by 80+ lines
- It represents a distinct, named UI panel (e.g. "Connections panel", "PM conversation")

**Keep inline when:**
- No local state, used once, under 40 lines, name only meaningful in parent context

---

## Store Slices (`app/src/store/`)

Four slices combined in `store/index.js`:

| Slice | Owns |
|---|---|
| `authSlice.js` | Auth, login, user list |
| `boardSlice.js` | Tasks, columns, agents, members, teams, instruction files |
| `workspaceSlice.js` | Subscription, clients, projects |
| `uiSlice.js` | Modal state, selected task, theme |

Don't split a slice until >900 lines — then use one file per domain, re-export from `index.js`.

## API Client (`app/src/api/index.js`)
One named export group per resource: `tasksApi`, `agentsApi`, `projectsApi`, `membersApi`, etc.
Split at 400 lines — when splitting, one file per resource group, re-export from `api/index.js` for backward compat.

## Constants (`app/src/constants/`)
| File | Contents |
|---|---|
| `columns.js` | `COL_BACKLOG`, `COL_INPROGRESS`, etc. |
| `agents.js` | Default agent IDs, `MODELS`, `COLORS` |
| `tasks.js` | Priority/complexity enums |

---

## Audience-appropriate UI

Settings/admin surfaces are used by non-technical roles (PMs, admins), not only developers. Never render raw backend output — rubric field names, comparison strings, internal check identifiers, JSON shapes — directly in these views. The backend can return whatever's useful for debugging; translating it into something a non-technical reader can act on is the frontend's job, not something pushed onto the viewer.

## Settings Page

Single full-page view (`app/src/components/settings/SettingsPage.jsx`) — left nav + right panel. The left nav has three groups:

**Board** (per-board):
- **Board Context** — lists this board's instruction files; create / archive / delete, with auto-save on a 1.5s debounce. `client.md` and `project.md` are hidden on personal boards (no `client_id`).
- **Connections** — board ↔ client folder/repo link (client boards only).

**Subscription** (superadmin only):
- **Overview** — workspace name + subscription ID.
- **Clients** — manage client entities.
- **Workspace Context** — subscription-level instruction files shared by all boards (same editor as Board Context).
- **Team**, **Boards**, **Members** (placeholder), **Superadmins**.

**System**:
- **System Rules** — edits the governance docs surfaced from `agent.config.json`'s `ai_context` groups (component: `AiContextPanel`); edits are versioned server-side.

The right-panel **instruction-file editor** is shared by Board Context and Workspace Context: auto-saves (1.5s debounce), archived files are read-only, and a delete that would orphan an agent reference returns `409` → the UI nudges toward archive. An `InfoModal` gives a per-section "what is this?" explainer.

### Connections panel (`ConnectionsPanel`)
Defined inline in `SettingsPage.jsx`. Links a board to a client folder.

**Two modes:**
| Mode | What it does |
|---|---|
| Clone from GitHub | Clones into `client/<reponame>` → links board |
| Link local folder | Pick from existing subfolders of `client/` on this machine |

- Tabs are **disabled** when a connection is already active
- To switch mode: use the inline `Use GitHub instead` / `Use local instead` red link → confirm → disconnects and switches tab
- Connected state: `● Connected locally` or `● Connected via GitHub`; amber warning if `path_exists = false`
- `enrichProject()` on the server calls `fs.existsSync` on every project fetch — always live
- `loadProjects()` called on SettingsPage mount and when navigating to Connections
- Manual refresh button (↺) re-fetches both project state and folder list

**Windows path note:** normalize with `.replace(/\\/g, '/')` before checking `startsWith('client/')` — `path.normalize` on Windows returns backslashes.

**API:** `GET /api/projects/client-repos` → `{ basePath, folders: [{ name, client_path, abs_path, is_git }] }`

### Nav status dots (Connections)
- 🔴 Red — no folder connected
- 🟡 Amber — connected but folder not found on disk
- No dot — connected and healthy

### Cloud mode (not yet implemented)
`CLOUD_MODE=true` → hide "Link local folder" tab; agent must work against a GitHub repo (forces git workflow).

### Preferences
Light/dark theme was removed from Settings — it lives at profile level only.
