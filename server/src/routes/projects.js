const express = require('express');
const { getDb, generateProjectId, VELOUR_ID } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { scaffoldProjectInstructions } = require('../utils/instructions');

const router = express.Router();

// GET /api/projects
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const includeArchived = req.query.include_archived === 'true';
  const projects = db.prepare(`
    SELECT p.*, u.first_name || ' ' || u.last_name AS owner_name, u.picture AS owner_picture
    FROM projects p
    LEFT JOIN users u ON p.owner_id = u.id
    WHERE ${includeArchived ? '1=1' : 'p.archived_at IS NULL'}
    ORDER BY p.created_at ASC
  `).all();
  res.json(projects);
});

// GET /api/projects/:id
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const project = db.prepare(`
    SELECT p.*, u.first_name || ' ' || u.last_name AS owner_name, u.picture AS owner_picture
    FROM projects p
    LEFT JOIN users u ON p.owner_id = u.id
    WHERE p.id = ?
  `).get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

// POST /api/projects
router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const { name, description, client_name, color = '#6366f1', emoji = '📋' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

  const id = generateProjectId();
  db.prepare(`
    INSERT INTO projects (id, name, description, client_name, color, emoji, owner_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name.trim(), description || null, client_name || null, color, emoji, req.user?.id || null);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);

  // Scaffold per-project instruction files (copies system defaults + blank client.md)
  try { scaffoldProjectInstructions(id); } catch (e) { console.warn('Could not scaffold instructions:', e.message); }

  res.status(201).json(project);
});

// PATCH /api/projects/:id
router.patch('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const { name, description, client_name, color, emoji } = req.body;
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  db.prepare(`
    UPDATE projects SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      client_name = COALESCE(?, client_name),
      color = COALESCE(?, color),
      emoji = COALESCE(?, emoji),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name || null, description || null, client_name || null, color || null, emoji || null, req.params.id);

  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id));
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
