const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { generateProjectId } = require('../utils/ids');
const { scaffoldProjectInstructions } = require('../utils/instructions');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET || 'AutoKan-dev-secret-change-in-production';
const JWT_EXPIRES = '30d';

let oauthClient;
function getOauthClient() {
  if (!oauthClient) oauthClient = new OAuth2Client(GOOGLE_CLIENT_ID);
  return oauthClient;
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, picture: user.picture },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

// POST /api/auth/google
// Body: { credential, inviteToken? } — the Google ID token from the frontend
router.post('/google', async (req, res) => {
  const { credential, inviteToken } = req.body;
  if (!credential) return res.status(400).json({ error: 'Missing credential' });
  if (!GOOGLE_CLIENT_ID) return res.status(500).json({ error: 'GOOGLE_CLIENT_ID not configured' });

  try {
    const ticket = await getOauthClient().verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();

    const { sub: googleId, email, given_name: firstName, family_name: lastName, picture } = payload;

    const db = getDb();

    // Find or create user
    let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);

    if (!user) {
      // ── Invite gate ─────────────────────────────────────────────────────────
      // Only enforced once at least one invite has ever been created (bootstrap
      // exemption: the very first user has no one to invite them).
      const inviteCount = db.prepare('SELECT COUNT(*) AS c FROM invites').get().c;
      if (inviteCount > 0) {
        const validInvite = inviteToken
          ? db.prepare(`
              SELECT * FROM invites WHERE token = ? AND email = ? AND used_at IS NULL
                AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
            `).get(inviteToken, email)
          : null;

        if (!validInvite) {
          return res.status(403).json({
            error: 'Access requires an invitation. Ask an existing member to invite your email address.',
            code: 'invite_required',
          });
        }
      }
      // ────────────────────────────────────────────────────────────────────────

      const id = 'user_' + uuidv4().replace(/-/g, '').slice(0, 12);
      db.prepare(`
        INSERT INTO users (id, google_id, email, first_name, last_name, picture)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, googleId, email, firstName || '', lastName || '', picture || '');

      user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);

      // Mark the invite as used
      if (inviteToken) {
        db.prepare('UPDATE invites SET used_at = CURRENT_TIMESTAMP, used_by = ? WHERE token = ?')
          .run(id, inviteToken);
      }

      // Link new user to any existing project_members/team_members by email
      db.prepare('UPDATE project_members SET user_id = ? WHERE email = ? AND user_id IS NULL').run(id, email);
      db.prepare('UPDATE team_members SET user_id = ? WHERE email = ? AND user_id IS NULL').run(id, email);

      // First user to register becomes superadmin (bootstrap — no hardcoded email needed)
      const adminCount = db.prepare('SELECT COUNT(*) AS c FROM subscription_admins').get().c;
      if (adminCount === 0) {
        const subscriptionId = db.prepare(`SELECT id FROM subscriptions ORDER BY created_at ASC LIMIT 1`).get()?.id;
        if (subscriptionId) {
          const saId = 'sa_' + require('crypto').randomBytes(6).toString('hex');
          db.prepare(`INSERT OR IGNORE INTO subscription_admins (id, subscription_id, user_id) VALUES (?, ?, ?)`)
            .run(saId, subscriptionId, id);
          console.log(`✅ Promoted ${email} to superadmin (first user)`);
        }
      }

      // Personal board = no client attached. Claim an unowned one if it exists
      // (the seeded board on a fresh DB), otherwise create a fresh one for this user.
      const subscriptionId = db.prepare(
        `SELECT id FROM subscriptions ORDER BY created_at ASC LIMIT 1`
      ).get()?.id;

      const orphanPersonalBoard = db.prepare(`
        SELECT id FROM projects
        WHERE client_id IS NULL AND owner_id IS NULL AND archived_at IS NULL
        ORDER BY created_at ASC LIMIT 1
      `).get();

      const crypto = require('crypto');
      const pmRowId = () => 'pm_' + crypto.randomBytes(6).toString('hex');

      // Claim any seeded client projects that have no owner yet — makes them
      // visible to the first user without needing to know specific project IDs.
      const orphanClientProjects = db.prepare(`
        SELECT id FROM projects
        WHERE client_id IS NOT NULL AND owner_id IS NULL AND archived_at IS NULL
      `).all();
      for (const proj of orphanClientProjects) {
        db.prepare('UPDATE projects SET owner_id = ?, created_by = ? WHERE id = ?')
          .run(id, id, proj.id);
        db.prepare(`INSERT OR IGNORE INTO project_members (id, project_id, email, user_id, role, accepted_at)
                    VALUES (?, ?, ?, ?, 'owner', CURRENT_TIMESTAMP)`)
          .run(pmRowId(), proj.id, email, id);
        console.log(`✅ Assigned client project ${proj.id} to ${email}`);
      }

      if (orphanPersonalBoard) {
        db.prepare('UPDATE projects SET owner_id = ?, created_by = ? WHERE id = ?')
          .run(id, id, orphanPersonalBoard.id);
        db.prepare(`INSERT OR IGNORE INTO project_members (id, project_id, email, user_id, role, accepted_at)
                    VALUES (?, ?, ?, ?, 'owner', CURRENT_TIMESTAMP)`)
          .run(pmRowId(), orphanPersonalBoard.id, email, id);
        console.log(`✅ Assigned personal board ${orphanPersonalBoard.id} to ${email}`);
      } else {
        const personalProjectId = generateProjectId();
        const displayName = firstName ? `${firstName}'s Board` : 'My Board';
        db.prepare(`INSERT INTO projects (id, name, description, color, emoji, owner_id, subscription_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(personalProjectId, displayName, 'Personal workspace', '#10b981', '🧑', id, subscriptionId);
        db.prepare(`INSERT OR IGNORE INTO project_members (id, project_id, email, user_id, role, accepted_at)
                    VALUES (?, ?, ?, ?, 'owner', CURRENT_TIMESTAMP)`)
          .run(pmRowId(), personalProjectId, email, id);
        try { scaffoldProjectInstructions(personalProjectId, subscriptionId, null, null, true); }
        catch (e) { console.warn('Could not scaffold personal board:', e.message); }
        console.log(`✅ Created personal board for ${email}`);
      }
    }

    const token = signToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        picture: user.picture,
        company_name: user.company_name,
      },
    });
  } catch (err) {
    console.error('Google auth error:', err.message);
    res.status(401).json({ error: 'Invalid Google credential' });
  }
});

// GET /api/auth/me — returns current user from JWT
router.get('/me', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = getDb();
    const user = db.prepare('SELECT id, email, first_name, last_name, picture, company_name, notifications_inapp, notifications_email FROM users WHERE id = ?').get(decoded.sub);
    if (!user) return res.status(401).json({ error: 'User not found' });
    // Check superadmin status
    const isAdmin = db.prepare('SELECT 1 FROM subscription_admins WHERE user_id = ? LIMIT 1').get(user.id);
    res.json({ user: { ...user, isSuperAdmin: !!isAdmin } });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// PATCH /api/auth/profile — update profile fields
router.patch('/profile', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = getDb();

    const { first_name, last_name, company_name, notifications_inapp, notifications_email } = req.body;
    db.prepare(`
      UPDATE users SET
        first_name = COALESCE(?, first_name),
        last_name = COALESCE(?, last_name),
        company_name = COALESCE(?, company_name),
        notifications_inapp = CASE WHEN ? IS NOT NULL THEN ? ELSE notifications_inapp END,
        notifications_email = CASE WHEN ? IS NOT NULL THEN ? ELSE notifications_email END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      first_name ?? null, last_name ?? null, company_name ?? null,
      notifications_inapp ?? null, notifications_inapp ?? null,
      notifications_email ?? null, notifications_email ?? null,
      decoded.sub
    );

    const user = db.prepare('SELECT id, email, first_name, last_name, picture, company_name, notifications_inapp, notifications_email FROM users WHERE id = ?').get(decoded.sub);
    res.json({ user });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// GET /api/auth/users — list all users (for @mention autocomplete)
router.get('/users', requireAuth, (req, res) => {
  const db = getDb();
  const users = db.prepare(
    'SELECT id, first_name, last_name, email, picture FROM users ORDER BY first_name, last_name'
  ).all();
  res.json(users);
});

module.exports = router;
module.exports.JWT_SECRET = JWT_SECRET;
