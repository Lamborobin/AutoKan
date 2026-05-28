const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { DEFAULT_SUB_ID } = require('../config/constants');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/subscriptions/me — get subscription info + admins
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(DEFAULT_SUB_ID);
  if (!sub) return res.status(404).json({ error: 'No subscription found' });

  const admins = db.prepare(`
    SELECT sa.id, sa.user_id, sa.added_at,
      u.email, u.first_name, u.last_name, u.picture
    FROM subscription_admins sa
    JOIN users u ON sa.user_id = u.id
    WHERE sa.subscription_id = ?
    ORDER BY sa.added_at ASC
  `).all(DEFAULT_SUB_ID);

  res.json({ ...sub, admins, isSuperAdmin: req.isSuperAdmin || false });
});

// PATCH /api/subscriptions/me — update subscription name
router.patch('/me', requireAuth, (req, res) => {
  if (!req.isSuperAdmin) return res.status(403).json({ error: 'Only superadmins can update workspace settings' });
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  const db = getDb();
  db.prepare('UPDATE subscriptions SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name.trim(), DEFAULT_SUB_ID);
  res.json(db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(DEFAULT_SUB_ID));
});

// POST /api/subscriptions/admins — add superadmin by email (must be existing user)
router.post('/admins', requireAuth, (req, res) => {
  if (!req.isSuperAdmin) return res.status(403).json({ error: 'Only superadmins can add other superadmins' });
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'No user with that email exists. They must sign in first.' });

  const existing = db.prepare('SELECT id FROM subscription_admins WHERE subscription_id = ? AND user_id = ?').get(DEFAULT_SUB_ID, user.id);
  if (existing) return res.status(409).json({ error: 'This user is already a superadmin' });

  const id = 'sa_' + uuidv4().replace(/-/g, '').slice(0, 12);
  db.prepare('INSERT INTO subscription_admins (id, subscription_id, user_id, added_by) VALUES (?, ?, ?, ?)').run(id, DEFAULT_SUB_ID, user.id, req.user.sub);

  const admin = db.prepare(`
    SELECT sa.id, sa.user_id, sa.added_at, u.email, u.first_name, u.last_name, u.picture
    FROM subscription_admins sa JOIN users u ON sa.user_id = u.id WHERE sa.id = ?
  `).get(id);
  res.json(admin);
});

// DELETE /api/subscriptions/admins/:userId — remove superadmin
router.delete('/admins/:userId', requireAuth, (req, res) => {
  if (!req.isSuperAdmin) return res.status(403).json({ error: 'Only superadmins can remove superadmins' });

  const db = getDb();

  // Cannot remove yourself if you're the only admin
  const adminCount = db.prepare('SELECT COUNT(*) as c FROM subscription_admins WHERE subscription_id = ?').get(DEFAULT_SUB_ID);
  if (adminCount.c <= 1 && req.params.userId === req.user.sub) {
    return res.status(400).json({ error: 'Cannot remove the last superadmin' });
  }

  db.prepare('DELETE FROM subscription_admins WHERE subscription_id = ? AND user_id = ?').run(DEFAULT_SUB_ID, req.params.userId);
  res.json({ ok: true });
});

module.exports = router;
