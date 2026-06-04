const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications — list for current user, newest first
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const notifications = db.prepare(`
    SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
  `).all(req.user.sub);
  res.json(notifications);
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare(`
    UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND read_at IS NULL
  `).run(req.params.id, req.user.sub);
  res.json({ ok: true });
});

// POST /api/notifications/read-all
router.post('/read-all', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare(`
    UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL
  `).run(req.user.sub);
  res.json({ ok: true });
});

module.exports = router;
