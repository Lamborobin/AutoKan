const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { getDb, generateProjectId, VELOUR_ID } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { scaffoldProjectInstructions } = require('../utils/instructions');

const router = express.Router();

const PROJECT_ROOT = path.join(__dirname, '../../..');
const CLIENT_DIR = path.join(PROJECT_ROOT, 'client');

// Ensure client/ folder exists
if (!fs.existsSync(CLIENT_DIR)) fs.mkdirSync(CLIENT_DIR, { recursive: true });

// Enrich a project row with path_exists status
function enrichProject(p) {
  if (!p) return p;
  const pathExists = p.client_path
    ? fs.existsSync(path.join(PROJECT_ROOT, p.client_path))
    : null;
  return { ...p, path_exists: pathExists };
}

const PROJECT_SELECT = `
  SELECT p.*,
    u.first_name || ' ' || u.last_name AS owner_name, u.picture AS owner_picture,
    COALESCE(c.name, p.client_name) AS client_name, c.color AS client_color, c.id AS client_id,
    cb.first_name || ' ' || cb.last_name AS created_by_name, cb.picture AS created_by_picture, cb.email AS created_by_email
  FROM projects p
  LEFT JOIN users u ON p.owner_id = u.id
  LEFT JOIN clients c ON p.client_id = c.id
  LEFT JOIN users cb ON p.created_by = cb.id
`;

// GET /api/projects/client-repos — list subfolders in client/
router.get('/client-repos', requireAuth, (req, res) => {
  try {
    if (!fs.existsSync(CLIENT_DIR)) return res.json({ basePath: CLIENT_DIR, folders: [] });
    const entries = fs.readdirSync(CLIENT_DIR, { withFileTypes: true });
    const folders = entries
      .filter(e => e.isDirectory())
      .map(e => ({
        name: e.name,
        client_path: `client/${e.name}`,
        abs_path: path.join(CLIENT_DIR, e.name),
        is_git: fs.existsSync(path.join(CLIENT_DIR, e.name, '.git')),
      }));
    res.json({ basePath: CLIENT_DIR, folders });
  } catch (e) {
    res.json({ basePath: CLIENT_DIR, folders: [] });
  }
});

// GET /api/projects — only boards the user is a member of
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const includeArchived = req.query.include_archived === 'true';
  const userId = req.user?.sub;

  // AI agents (no JWT user) can see all projects
  if (!userId) {
    const projects = db.prepare(`
      ${PROJECT_SELECT}
      WHERE ${includeArchived ? '1=1' : 'p.archived_at IS NULL'}
      ORDER BY p.created_at ASC
    `).all();
    return res.json(projects.map(enrichProject));
  }

  const archivedFilter = includeArchived ? '1=1' : 'p.archived_at IS NULL';

  // Superadmins see ALL projects in their subscription, no member filter needed
  if (req.isSuperAdmin) {
    const projects = db.prepare(`
      ${PROJECT_SELECT}
      WHERE ${archivedFilter}
      ORDER BY p.created_at ASC
    `).all();
    return res.json(projects.map(enrichProject));
  }

  const projects = db.prepare(`
    ${PROJECT_SELECT}
    WHERE ${archivedFilter}
      AND EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = p.id AND pm.user_id = ?
      )
    ORDER BY p.created_at ASC
  `).all(userId);
  res.json(projects.map(enrichProject));
});

// GET /api/projects/:id
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const project = db.prepare(`
    ${PROJECT_SELECT}
    WHERE p.id = ?
  `).get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(enrichProject(project));
});

// POST /api/projects
router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const { name, description, client_name, client_id, color = '#6366f1', emoji = '📋' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

  const userId = req.user?.sub || null;
  const userEmail = req.user?.email || null;

  // Resolve client_name from client_id if provided
  let resolvedClientName = client_name || null;
  let resolvedClientId = client_id || null;
  if (client_id) {
    const clientRow = db.prepare('SELECT name FROM clients WHERE id = ?').get(client_id);
    if (clientRow) resolvedClientName = clientRow.name;
  }

  const id = generateProjectId();
  db.prepare(`
    INSERT INTO projects (id, name, description, client_name, client_id, color, emoji, owner_id, created_by, subscription_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name.trim(), description || null, resolvedClientName, resolvedClientId, color, emoji, userId, userId, 'sub_default');

  // Add creator as the sole member (owner role, immediately accepted)
  if (userId && userEmail) {
    const pmId = 'pm_' + uuidv4().replace(/-/g, '').slice(0, 12);
    db.prepare(`
      INSERT OR IGNORE INTO project_members (id, project_id, email, user_id, role, accepted_at)
      VALUES (?, ?, ?, ?, 'owner', CURRENT_TIMESTAMP)
    `).run(pmId, id, userEmail, userId);
  }

  const project = db.prepare(`${PROJECT_SELECT} WHERE p.id = ?`).get(id);

  // Scaffold per-project instruction files (copies system defaults + blank client.md)
  try { scaffoldProjectInstructions(id); } catch (e) { console.warn('Could not scaffold instructions:', e.message); }

  res.status(201).json(project);
});

// PATCH /api/projects/:id
router.patch('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const { name, description, client_name, client_id, color, emoji, repo_url, client_path } = req.body;
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  // Resolve client info when client_id is provided
  let resolvedClientName = client_name !== undefined ? (client_name || null) : undefined;
  let resolvedClientId = client_id !== undefined ? (client_id || null) : undefined;
  if (client_id) {
    const clientRow = db.prepare('SELECT name FROM clients WHERE id = ?').get(client_id);
    if (clientRow) resolvedClientName = clientRow.name;
  }

  // Validate client_path stays within client/ if provided
  if (client_path !== undefined && client_path !== null) {
    // Normalize and convert backslashes (Windows) to forward slashes before checking
    const normalized = path.normalize(client_path).replace(/\\/g, '/');
    if (!normalized.startsWith('client/') && normalized !== 'client') {
      return res.status(400).json({ error: 'client_path must be under client/' });
    }
  }

  db.prepare(`
    UPDATE projects SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      client_name = COALESCE(?, client_name),
      client_id = COALESCE(?, client_id),
      color = COALESCE(?, color),
      emoji = COALESCE(?, emoji),
      repo_url = ?,
      client_path = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    name || null,
    description || null,
    resolvedClientName || null,
    resolvedClientId || null,
    color || null,
    emoji || null,
    repo_url !== undefined ? (repo_url || null) : project.repo_url,
    client_path !== undefined ? (client_path || null) : project.client_path,
    req.params.id
  );

  res.json(enrichProject(db.prepare(`${PROJECT_SELECT} WHERE p.id = ?`).get(req.params.id)));
});

// POST /api/projects/:id/clone — clone repo_url into client/<folder>
router.post('/:id/clone', requireAuth, (req, res) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const repoUrl = req.body.repo_url || project.repo_url;
  if (!repoUrl) return res.status(400).json({ error: 'repo_url is required' });

  // Derive folder name from URL (last segment, strip .git)
  const folderName = (req.body.folder_name || repoUrl.split('/').pop().replace(/\.git$/, '')).replace(/[^a-zA-Z0-9_-]/g, '-');
  const clientPath = `client/${folderName}`;
  const absPath = path.join(PROJECT_ROOT, clientPath);

  if (fs.existsSync(absPath)) {
    // Already exists — just connect
    db.prepare('UPDATE projects SET repo_url = ?, client_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(repoUrl, clientPath, project.id);
    return res.json({ ok: true, client_path: clientPath, already_existed: true,
      project: enrichProject(db.prepare(`${PROJECT_SELECT} WHERE p.id = ?`).get(project.id)) });
  }

  try {
    execSync(`git clone "${repoUrl}" "${absPath}"`, { stdio: 'pipe', timeout: 60000 });
    db.prepare('UPDATE projects SET repo_url = ?, client_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(repoUrl, clientPath, project.id);
    res.json({ ok: true, client_path: clientPath,
      project: enrichProject(db.prepare(`${PROJECT_SELECT} WHERE p.id = ?`).get(project.id)) });
  } catch (e) {
    const msg = e.stderr?.toString() || e.message || 'Clone failed';
    res.status(500).json({ error: msg });
  }
});

// POST /api/projects/:id/archive
router.post('/:id/archive', requireAuth, (req, res) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (project.id === VELOUR_ID) return res.status(400).json({ error: 'Cannot archive the default project' });

  db.prepare('UPDATE projects SET archived_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/projects/:id/unarchive
router.post('/:id/unarchive', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE projects SET archived_at = NULL WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// DELETE /api/projects/:id
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  if (req.params.id === VELOUR_ID) return res.status(400).json({ error: 'Cannot delete the default project' });

  const taskCount = db.prepare('SELECT COUNT(*) AS c FROM tasks WHERE project_id = ?').get(req.params.id);
  if (taskCount.c > 0) {
    return res.status(409).json({ error: `Project has ${taskCount.c} task(s). Archive it instead.`, has_dependencies: true });
  }

  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
