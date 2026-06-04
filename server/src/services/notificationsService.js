const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { broadcastToUser } = require('../sse');

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

module.exports = { createNotification };
