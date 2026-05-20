const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { isEmailConfigured, sendInviteEmail } = require('../services/emailService');

const router = express.Router();

const INVITE_EXPIRY_DAYS = 7;

// GET /api/invites/verify?token=TOKEN — public, no auth required
router.get('/verify', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ valid: false, reason: 'missing_token' });

  const db = getDb();
  const invite = db.prepare('SELECT * FROM invites WHERE token = ?').get(token);

  if (!invite) return res.json({ valid: false, reason: 'not_found' });
  if (invite.used_at) return res.json({ valid: false, reason: 'already_used' });
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return res.json({ valid: false, reason: 'expired' });
  }

  res.json({ valid: true, email: invite.email });
});

// GET /api/invites — list all invites (requires auth)
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const invites = db.prepare(`
    SELECT i.*, u.first_name || ' ' || u.last_name AS invited_by_name
    FROM invites i
    LEFT JOIN users u ON i.invited_by = u.id
    ORDER BY i.created_at DESC
  `).all();

  const now = new Date();
  const result = invites.map(inv => ({
    ...inv,
    is_expired: inv.expires_at ? new Date(inv.expires_at) < now : false,
  }));

  res.json(result);
});

// POST /api/invites — create and send invite (requires auth)
router.post('/', requireAuth, async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  const db = getDb();

  // Prevent inviting an existing user
  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existingUser) {
    return res.status(409).json({ error: 'A user with this email already exists' });
  }

  // Deduplicate: return existing unexpired+unused invite if one exists
  const existing = db.prepare(`
    SELECT * FROM invites WHERE email = ? AND used_at IS NULL
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
  `).get(email);

  let invite = existing;

  if (!invite) {
    const id = 'invite_' + uuidv4().replace(/-/g, '').slice(0, 12);
    const token = uuidv4().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO invites (id, email, token, invited_by, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, email, token, req.user.sub, expiresAt);

    invite = db.prepare('SELECT * FROM invites WHERE id = ?').get(id);
  }

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const inviteUrl = `${frontendUrl}?invite=${invite.token}`;

  const inviterName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || req.user.email;

  if (isEmailConfigured()) {
    sendInviteEmail(email, invite.token, inviterName).catch(() => {});
    res.json({ invite, sent: true });
  } else {
    res.json({
      invite,
      sent: false,
      warning: 'Email not configured — share this link manually',
      inviteUrl,
    });
  }
});

// DELETE /api/invites/:id — revoke invite (requires auth)
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const invite = db.prepare('SELECT * FROM invites WHERE id = ?').get(req.params.id);
  if (!invite) return res.status(404).json({ error: 'Invite not found' });

  db.prepare('DELETE FROM invites WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
