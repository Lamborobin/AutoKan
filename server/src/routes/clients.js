const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { DEFAULT_SUB_ID } = require('../config/constants');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/clients
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const includeArchived = req.query.include_archived === 'true';
  const clients = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id AND p.archived_at IS NULL) as board_count
    FROM clients c
    WHERE c.subscription_id = ? ${includeArchived ? '' : 'AND c.archived_at IS NULL'}
    ORDER BY c.name ASC
  `).all(DEFAULT_SUB_ID);
  res.json(clients);
});

// POST /api/clients
router.post('/', requireAuth, (req, res) => {
  const { name, description, website, color = '#6366f1', sector = 'software' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  const db = getDb();
  const existing = db.prepare('SELECT id FROM clients WHERE name = ? AND subscription_id = ? AND archived_at IS NULL').get(name.trim(), DEFAULT_SUB_ID);
  if (existing) return res.status(409).json({ error: 'A client with this name already exists' });
  const id = 'client_' + uuidv4().replace(/-/g, '').slice(0, 12);
  db.prepare('INSERT INTO clients (id, name, description, website, color, sector, subscription_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, name.trim(), description || null, website || null, color, sector, DEFAULT_SUB_ID, req.user?.sub || null);
  res.status(201).json(db.prepare('SELECT * FROM clients WHERE id = ?').get(id));
});

// PATCH /api/clients/:id
router.patch('/:id', requireAuth, (req, res) => {
  const { name, description, website, color, sector } = req.body;
  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  db.prepare(`
    UPDATE clients SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      website = COALESCE(?, website),
      color = COALESCE(?, color),
      sector = COALESCE(?, sector),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name || null, description || null, website || null, color || null, sector || null, req.params.id);
  // Also update client_name on linked projects for backward compat
  if (name) db.prepare('UPDATE projects SET client_name = ? WHERE client_id = ?').run(name, req.params.id);
  res.json(db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id));
});

// POST /api/clients/:id/archive
router.post('/:id/archive', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE clients SET archived_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/clients/:id/unarchive
router.post('/:id/unarchive', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE clients SET archived_at = NULL WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// DELETE /api/clients/:id
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const boardCount = db.prepare('SELECT COUNT(*) as c FROM projects WHERE client_id = ? AND archived_at IS NULL').get(req.params.id);
  if (boardCount.c > 0) return res.status(409).json({ error: `Client has ${boardCount.c} board(s). Archive the client instead.`, has_dependencies: true });
  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
