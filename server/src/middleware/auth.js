const jwt = require('jsonwebtoken');
const { getDb } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'flowagent-dev-secret-change-in-production';

/**
 * Decode a Bearer JWT if present — populates req.user and treats caller as 'human'.
 * Does NOT block if token is missing; call requireAuth to enforce auth.
 */
function attachUser(req, res, next) {
  const authHeader = req.headers['authorization'];
  // EventSource can't send headers — accept ?token= as fallback (SSE endpoint only)
  const raw = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.query.token;
  if (raw) {
    try {
      const decoded = jwt.verify(raw, JWT_SECRET);
      req.user = decoded;
      req.agent = { id: 'human', role: 'human', permissions: ['*'] };
    } catch { /* invalid token — ignore, let next layer decide */ }
  }
  next();
}

/**
 * Requires a valid JWT or a known X-Agent-Id (for AI agents).
 * Humans must have a valid Bearer token.
 */
function requireAuth(req, res, next) {
  // Already resolved via attachUser
  if (req.user) return next();

  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
      req.user = decoded;
      req.agent = { id: 'human', role: 'human', permissions: ['*'] };
      return next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  // AI agents use X-Agent-Id header (not human logins)
  const agentId = req.headers['x-agent-id'];
  if (agentId && agentId !== 'human') {
    const db = getDb();
    const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND active = 1').get(agentId);
    if (agent) {
      req.agent = { ...agent, permissions: JSON.parse(agent.permissions || '[]') };
      return next();
    }
  }

  res.status(401).json({ error: 'Authentication required' });
}

/**
 * Middleware to verify an agent has a specific permission.
 * Agents identify themselves via X-Agent-Id header.
 * Humans (via JWT) get full access.
 */
function requirePermission(permission) {
  return (req, res, next) => {
    // JWT human — full access
    if (req.user) {
      if (!req.agent) req.agent = { id: 'human', role: 'human', permissions: ['*'] };
      return next();
    }

    const agentId = req.headers['x-agent-id'];

    // Legacy X-Agent-Id: human (kept for dev convenience / agent runner)
    if (agentId === 'human') {
      req.agent = { id: 'human', role: 'human', permissions: ['*'] };
      return next();
    }

    if (!agentId) {
      return res.status(401).json({ error: 'Missing authentication' });
    }

    const db = getDb();
    const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND active = 1').get(agentId);

    if (!agent) {
      return res.status(401).json({ error: 'Unknown or inactive agent' });
    }

    const permissions = JSON.parse(agent.permissions || '[]');
    const hasPermission = permissions.includes(permission) || permissions.includes('*');

    if (!hasPermission) {
      return res.status(403).json({
        error: `Agent "${agent.name}" (${agent.role}) lacks permission: ${permission}`,
        agent: agent.role,
        required: permission,
        available: permissions
      });
    }

    req.agent = { ...agent, permissions };
    next();
  };
}

/**
 * Soft auth — attaches user/agent to req if credentials present, but doesn't block
 */
function attachAgent(req, res, next) {
  // JWT user takes priority
  if (req.user) return next();

  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(authHeader.slice(7), JWT_SECRET);
      req.agent = { id: 'human', role: 'human', permissions: ['*'] };
      return next();
    } catch { /* skip */ }
  }

  const agentId = req.headers['x-agent-id'];
  if (!agentId) return next();

  if (agentId === 'human') {
    req.agent = { id: 'human', role: 'human', permissions: ['*'] };
    return next();
  }

  const db = getDb();
  const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND active = 1').get(agentId);
  if (agent) {
    req.agent = { ...agent, permissions: JSON.parse(agent.permissions || '[]') };
  }
  next();
}

module.exports = { requirePermission, requireAuth, attachAgent, attachUser };
