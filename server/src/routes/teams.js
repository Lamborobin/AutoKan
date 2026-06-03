const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { isEmailConfigured } = require('../services/emailService');

const router = express.Router();

// GET /api/teams
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const teams = db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count
    FROM teams t
    WHERE t.archived_at IS NULL
    ORDER BY t.created_at ASC
  `).all();
  res.json(teams);
});

// POST /api/teams
router.post('/', requireAuth, (req, res) => {
  const { name, description, color } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Team name is required' });

  const db = getDb();
  const id = 'team_' + uuidv4().replace(/-/g, '').slice(0, 10);
  db.prepare(`INSERT INTO teams (id, name, description, color, created_by) VALUES (?, ?, ?, ?, ?)`).run(id, name.trim(), description || null, color || '#6366f1', req.user.sub);

  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(id);
  res.json(team);
});

// PATCH /api/teams/:id
router.patch('/:id', requireAuth, (req, res) => {
  const { name, description, color } = req.body;
  const db = getDb();
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  db.prepare(`UPDATE teams SET name = ?, description = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(name ?? team.name, description ?? team.description, color ?? team.color, req.params.id);
  res.json(db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id));
});

// DELETE /api/teams/:id — archive if it has members (preserve), hard-delete if empty
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const team = db.prepare('SELECT id FROM teams WHERE id = ?').get(req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const memberCount = db.prepare('SELECT COUNT(*) AS c FROM team_members WHERE team_id = ?').get(req.params.id).c;
  if (memberCount > 0) {
    db.prepare('UPDATE teams SET archived_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    return res.json({ archived: true });
  }
  db.prepare('DELETE FROM teams WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

// GET /api/teams/:id/members
router.get('/:id/members', requireAuth, (req, res) => {
  const db = getDb();
  const members = db.prepare(`
    SELECT tm.*, u.first_name, u.last_name, u.picture
    FROM team_members tm
    LEFT JOIN users u ON tm.user_id = u.id
    WHERE tm.team_id = ?
    ORDER BY tm.added_at ASC
  `).all(req.params.id);
  res.json(members);
});

// POST /api/teams/:id/members
router.post('/:id/members', requireAuth, async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  const db = getDb();
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const existing = db.prepare('SELECT id FROM team_members WHERE team_id = ? AND email = ?').get(req.params.id, email);
  if (existing) return res.status(409).json({ error: 'This person is already in the team' });

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  const id = 'tm_' + uuidv4().replace(/-/g, '').slice(0, 12);
  db.prepare(`INSERT INTO team_members (id, team_id, email, user_id, invited_by) VALUES (?, ?, ?, ?, ?)`).run(id, req.params.id, email, existingUser?.id || null, req.user.sub);

  const inviterName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || req.user.email;
  let inviteUrl = null;
  let sent = false;

  if (!existingUser) {
    const INVITE_EXPIRY_DAYS = 7;
    let invite = db.prepare(`SELECT * FROM invites WHERE email = ? AND used_at IS NULL AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`).get(email);
    if (!invite) {
      const invId = 'invite_' + uuidv4().replace(/-/g, '').slice(0, 12);
      const token = uuidv4().replace(/-/g, '');
      const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
      db.prepare(`INSERT INTO invites (id, email, token, invited_by, expires_at) VALUES (?, ?, ?, ?, ?)`).run(invId, email, token, req.user.sub, expiresAt);
      invite = db.prepare('SELECT * FROM invites WHERE id = ?').get(invId);
    }
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    inviteUrl = `${frontendUrl}?invite=${invite.token}`;
    if (isEmailConfigured()) {
      const { sendTeamInviteEmail } = require('../services/emailService');
      sendTeamInviteEmail(email, team.name, inviterName, invite.token).catch(() => {});
      sent = true;
    }
  } else {
    if (isEmailConfigured()) {
      const { sendTeamAddedEmail } = require('../services/emailService');
      sendTeamAddedEmail(email, team.name, inviterName).catch(() => {});
      sent = true;
    }
  }

  const member = db.prepare(`
    SELECT tm.*, u.first_name, u.last_name, u.picture
    FROM team_members tm
    LEFT JOIN users u ON tm.user_id = u.id
    WHERE tm.id = ?
  `).get(id);

  res.json({ member, sent, inviteUrl });
});

// DELETE /api/teams/:id/members/:email
router.delete('/:id/members/:email', requireAuth, (req, res) => {
  const db = getDb();
  const decodedEmail = decodeURIComponent(req.params.email);

  // Non-superadmins cannot remove themselves
  if (req.user && decodedEmail === req.user.email && !req.isSuperAdmin) {
    return res.status(403).json({ error: 'You cannot remove yourself from a team' });
  }

  db.prepare('DELETE FROM team_members WHERE team_id = ? AND email = ?').run(req.params.id, decodedEmail);
  res.json({ ok: true });
});

module.exports = router;
