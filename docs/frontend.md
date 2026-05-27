# Frontend Architecture (`app/src/`)

Read this file when working on any file under `app/src/`.

---

## Component Structure

Feature subdirectories under `app/src/components/`:

| Directory | Contents |
|---|---|
| `agent/` | AgentForm, EditAgentModal, NewAgentModal, TemplatesModal |
| `board/` | Column, TaskCard, BoardRepoSettings, SettingsModal |
| `settings/` | SettingsPage, ArchivedTasksModal |
| `shared/` | BoardsModal, InviteModal, MembersModal, NewTaskModal, MarkdownText, TaskComments |
| `task/` | TaskDetail |
| (root) | Sidebar.jsx, LoginPage.jsx |

Feature subdirectories are created **on demand** — only when 3+ related files exist. See the Folder Creation Rule in `CLAUDE.md`.

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
| `agents.js` | Default agent IDs |
| `tasks.js` | Priority/complexity enums |

---

## Settings Page

Single full-page view. Left nav + right panel layout.
Component: `app/src/components/settings/SettingsPage.jsx`

### Left nav sections

**Board** (per-board):
- **Instruction Files** — file list renders inline in the left panel; two subsections: System (read-only, lock icon, affects all boards) and Custom (this board only, archive/delete, auto-save 1.5s debounce). Personal boards (no `client_id`) hide `client.md` and `project.md`.
- **Connections** — board ↔ client folder/repo link. Hidden on personal boards.

**Subscription** (superadmin only):
- Clients, Team, Boards, Members, Superadmins

### Connections panel (`ConnectionsPanel`)
Links a board to a client folder.

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
