const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { isEmailConfigured } = require('../services/emailService');

const router = express.Router({ mergeParams: true }); // needs mergeParams for :projectId

// GET /api/projects/:projectId/members
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { projectId } = req.params;

  // Access check: only members (or superadmins) can list members
  // (AI agents without a user JWT bypass this)
  if (req.user?.sub && !req.isSuperAdmin) {
    const isMember = db.prepare(
      'SELECT id, accepted_at FROM project_members WHERE project_id = ? AND user_id = ?'
    ).get(projectId, req.user.sub);
    if (!isMember) return res.status(403).json({ error: 'You are not a member of this board' });
    if (!isMember.accepted_at) {
      db.prepare('UPDATE project_members SET accepted_at = CURRENT_TIMESTAMP WHERE id = ?').run(isMember.id);
    }
  }

  const members = db.prepare(`
    SELECT pm.*,
      u.first_name, u.last_name, u.picture, u.email as user_email,
      inviter.first_name as inviter_first, inviter.last_name as inviter_last
    FROM project_members pm
    LEFT JOIN users u ON pm.user_id = u.id
    LEFT JOIN users inviter ON pm.invited_by = inviter.id
    WHERE pm.project_id = ?
    ORDER BY pm.added_at ASC
  `).all(projectId);

  res.json(members);
});

// POST /api/projects/:projectId/members — add member by email
router.post('/', requireAuth, async (req, res) => {
  const { email } = req.body;
  const { projectId } = req.params;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  const db = getDb();

  // Check if already a member
  const existing = db.prepare('SELECT id FROM project_members WHERE project_id = ? AND email = ?').get(projectId, email);
  if (existing) return res.status(409).json({ error: 'This person is already a member of this board' });

  // Get project name for email
  const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  // Check if user exists already
  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

  const id = 'pm_' + uuidv4().replace(/-/g, '').slice(0, 12);
  db.prepare(`
    INSERT INTO project_members (id, project_id, email, user_id, invited_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, projectId, email, existingUser?.id || null, req.user.sub);

  const inviterName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || req.user.email;

  let inviteUrl = null;
  let sent = false;

  if (!existingUser) {
    const INVITE_EXPIRY_DAYS = 7;
    let invite = db.prepare(`
      SELECT * FROM invites WHERE email = ? AND used_at IS NULL
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `).get(email);

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
      const { sendBoardInviteEmail } = require('../services/emailService');
      sendBoardInviteEmail(email, project.name, inviterName, invite.token).catch(() => {});
      sent = true;
    }
  } else {
    if (isEmailConfigured()) {
      const { sendBoardAddedEmail } = require('../services/emailService');
      sendBoardAddedEmail(email, project.name, inviterName).catch(() => {});
      sent = true;
    }
  }

  const member = db.prepare(`
    SELECT pm.*, u.first_name, u.last_name, u.picture
    FROM project_members pm
    LEFT JOIN users u ON pm.user_id = u.id
    WHERE pm.id = ?
  `).get(id);

  res.json({ member, sent, inviteUrl: inviteUrl || null });
});

// POST /api/projects/:projectId/members/add-team — add all team members to board
router.post('/add-team', requireAuth, async (req, res) => {
  const { teamId } = req.body;
  const { projectId } = req.params;

  if (!teamId) return res.status(400).json({ error: 'teamId is required' });

  const db = getDb();

  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const teamMembers = db.prepare('SELECT * FROM team_members WHERE team_id = ?').all(teamId);

  const inviterName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || req.user.email;
  const added = [];
  const skipped = [];

  for (const tm of teamMembers) {
    const existing = db.prepare('SELECT id FROM project_members WHERE project_id = ? AND email = ?').get(projectId, tm.email);
    if (existing) { skipped.push(tm.email); continue; }

    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(tm.email);
    const id = 'pm_' + uuidv4().replace(/-/g, '').slice(0, 12);
    db.prepare(`INSERT INTO project_members (id, project_id, email, user_id, invited_by) VALUES (?, ?, ?, ?, ?)`).run(id, projectId, tm.email, existingUser?.id || null, req.user.sub);
    added.push(tm.email);

    if (isEmailConfigured()) {
      if (!existingUser) {
        let invite = db.prepare(`SELECT * FROM invites WHERE email = ? AND used_at IS NULL AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`).get(tm.email);
        if (!invite) {
          const INVITE_EXPIRY_DAYS = 7;
          const invId = 'invite_' + uuidv4().replace(/-/g, '').slice(0, 12);
          const token = uuidv4().replace(/-/g, '');
          const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
          db.prepare(`INSERT INTO invites (id, email, token, invited_by, expires_at) VALUES (?, ?, ?, ?, ?)`).run(invId, tm.email, token, req.user.sub, expiresAt);
          invite = db.prepare('SELECT * FROM invites WHERE id = ?').get(invId);
        }
        const { sendBoardInviteEmail } = require('../services/emailService');
        sendBoardInviteEmail(tm.email, project.name, inviterName, invite.token).catch(() => {});
      } else {
        const { sendBoardAddedEmail } = require('../services/emailService');
        sendBoardAddedEmail(tm.email, project.name, inviterName).catch(() => {});
      }
    }
  }

  res.json({ added, skipped, teamName: team.name });
});

// DELETE /api/projects/:projectId/members/:memberId — remove member
router.delete('/:memberId', requireAuth, (req, res) => {
  const { projectId, memberId } = req.params;
  const db = getDb();

  const member = db.prepare('SELECT * FROM project_members WHERE id = ? AND project_id = ?').get(memberId, projectId);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  // Cannot remove yourself
  if (req.user && member.email === req.user.email) {
    return res.status(403).json({ error: 'You cannot remove yourself from a board' });
  }
  if (req.user && member.user_id === req.user.sub) {
    return res.status(403).json({ error: 'You cannot remove yourself from a board' });
  }

  db.prepare('DELETE FROM project_members WHERE id = ?').run(memberId);
  res.json({ ok: true });
});

module.exports = router;
