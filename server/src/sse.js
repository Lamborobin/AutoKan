const clients = new Set();
const clientsByUser = new Map(); // userId -> Set<res>

function addClient(res, userId) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(': connected\n\n');
  clients.add(res);

  if (userId) {
    if (!clientsByUser.has(userId)) clientsByUser.set(userId, new Set());
    clientsByUser.get(userId).add(res);
  }

  res.on('close', () => {
    clients.delete(res);
    if (userId && clientsByUser.has(userId)) {
      clientsByUser.get(userId).delete(res);
      if (clientsByUser.get(userId).size === 0) clientsByUser.delete(userId);
    }
  });
}

function broadcast(event, data = {}) {
  if (clients.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { clients.delete(res); }
  }
}

// Returns true if at least one message was sent to the user.
function broadcastToUser(userId, event, data = {}) {
  const userClients = clientsByUser.get(userId);
  if (!userClients || userClients.size === 0) return false;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  let sent = false;
  for (const res of userClients) {
    try { res.write(payload); sent = true; } catch { userClients.delete(res); }
  }
  return sent;
}

function isUserConnected(userId) {
  const set = clientsByUser.get(userId);
  return !!(set && set.size > 0);
}

module.exports = { addClient, broadcast, broadcastToUser, isUserConnected };
