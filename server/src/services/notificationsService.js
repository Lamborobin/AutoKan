const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { broadcastToUser } = require('../sse');
const { sendHumanActionEmail } = require('./emailService');

/**
 * Persist a notification for a user and push it live if they're connected.
 * Returns { notification, delivered } — delivered=true means SSE push succeeded.
 * Respects the user's notifications_inapp preference; returns early if disabled.
 * Deduplicates: skips if the same (user, type, link) was notified within 5 minutes.
 */
function createNotification(userId, type, title, body = null, link = null) {
  const db = getDb();
  const user = db.prepare('SELECT notifications_inapp FROM users WHERE id = ?').get(userId);
  if (!user || !user.notifications_inapp) return { notification: null, delivered: false };

  // Dedup window — set NOTIFICATION_DEDUP_SECONDS in .env (default: 30s dev, 300s prod)
  const dedupSeconds = process.env.NOTIFICATION_DEDUP_SECONDS !== undefined
    ? parseInt(process.env.NOTIFICATION_DEDUP_SECONDS, 10)
    : process.env.NODE_ENV === 'production' ? 300 : 30;
  const recent = db.prepare(`
    SELECT id FROM notifications
    WHERE user_id = ? AND type = ? AND link = ?
    AND created_at > datetime('now', '-' || ? || ' seconds')
    LIMIT 1
  `).get(userId, type, link, dedupSeconds);
  if (recent) return { notification: null, delivered: false, deduplicated: true };

  const id = 'ntf_' + uuidv4().replace(/-/g, '').slice(0, 12);
  db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, type, title, body, link);

  const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
  const delivered = broadcastToUser(userId, 'notification', notification);
  return { notification, delivered };
}

/**
 * Notify all accepted human members of a project when a task moves to Human Action.
 * Sends an in-app notification (respecting notifications_inapp preference) and an
 * email fallback (respecting notifications_email preference).
 */
async function notifyHumanActionMembers(db, taskId, reason) {
  const task = db.prepare('SELECT id, title, project_id FROM tasks WHERE id = ?').get(taskId);
  if (!task || !task.project_id) return;

  const members = db.prepare(`
    SELECT u.id AS user_id, u.email, u.notifications_email
    FROM project_members pm
    JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = ? AND pm.user_id IS NOT NULL AND pm.accepted_at IS NOT NULL
  `).all(task.project_id);

  const link = `?task=${taskId}`;
  const title = 'Action required';
  const body = `"${task.title}" — ${reason}`;

  for (const member of members) {
    const { deduplicated } = createNotification(member.user_id, 'human_action', title, body, link);
    if (member.notifications_email && !deduplicated) {
      await sendHumanActionEmail(member.email, task.title, reason, taskId);
    }
  }
}

module.exports = { createNotification, notifyHumanActionMembers };
