const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db');
const { requirePermission, attachAgent } = require('../middleware/auth');
const { broadcast } = require('../sse');

const PROJECT_ROOT = path.join(__dirname, '../../..');

// Returns true for JWT-authenticated users (Google OAuth) and legacy X-Agent-Id: human
function isHuman(req) {
  return !!(req.user || req.headers['x-agent-id'] === 'human');
}

// ── Agents ────────────────────────────────────────────────────────────────────
const agentsRouter = express.Router();

function parseAgent(a) {
  return {
    ...a,
    permissions: JSON.parse(a.permissions || '[]'),
    role_ids: JSON.parse(a.role_ids || '[]'),
    is_template: a.is_template === 1,
  };
}

// One perm_* capability per agent — the runner registry dispatches by
// (capability, column), so two perm_* roles on one agent would make the
// dispatch ambiguous. role_access_* entries can still be multiple.
function validateAgentRoles(roleIds) {
  if (!Array.isArray(roleIds)) return null;
  const perms = roleIds.filter(r => typeof r === 'string' && r.startsWith('perm_'));
  if (perms.length === 0) return 'An agent needs exactly one capability — none selected.';
  if (perms.length > 1) {
    return `An agent can have only one capability. Got ${perms.length}: ${perms.join(', ')}. Pick one and use a separate agent for the other.`;
  }
  const cols = roleIds.filter(r => typeof r === 'string' && r.startsWith('role_access_'));
  if (cols.length === 0) return 'An agent needs at least one column (or All Columns).';
  return null;
}

// Build a live map of columnId → [roleId, ...] from the roles table
function buildColumnRoleMap(db) {
  const map = {};
  const roles = db.prepare("SELECT id, allowed_column_ids FROM roles WHERE type = 'column_access'").all();
  for (const r of roles) {
    try {
      for (const colId of JSON.parse(r.allowed_column_ids || '[]')) {
        if (!map[colId]) map[colId] = [];
        map[colId].push(r.id);
      }
    } catch {}
  }
  return map;
}

function parseTemplate(t) {
  return {
    ...t,
    permissions: JSON.parse(t.permissions || '[]'),
  };
}

agentsRouter.get('/', attachAgent, (req, res) => {
  const db = getDb();
  const projectId = req.query.project_id || null;
  const agents = projectId
    ? db.prepare('SELECT * FROM agents WHERE project_id = ? ORDER BY created_at ASC').all(projectId)
    : db.prepare('SELECT * FROM agents ORDER BY created_at ASC').all();
  res.json(agents.map(parseAgent));
});

agentsRouter.get('/:id', attachAgent, (req, res) => {
  const db = getDb();
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(parseAgent(agent));
});

agentsRouter.post('/', (req, res) => {
  const agentId = req.headers['x-agent-id'];
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can create agents' });

  const db = getDb();
  const {
    name, role, model = 'claude-sonnet-4-5', description,
    permissions = [], personality_file, color = '#6366f1',
    created_from_template_id, system_prompt: bodySystemPrompt,
    project_id,
  } = req.body;
  if (!name || !role) return res.status(400).json({ error: 'name and role are required' });

  const permErr = validateAgentRoles(req.body.role_ids || []);
  if (permErr) return res.status(400).json({ error: permErr });

  // Uniqueness is per-project (same role name is allowed on different boards)
  const existing = project_id
    ? db.prepare('SELECT id FROM agents WHERE role = ? AND project_id = ?').get(role, project_id)
    : db.prepare('SELECT id FROM agents WHERE role = ? AND project_id IS NULL').get(role);
  if (existing) return res.status(409).json({ error: `Agent with role "${role}" already exists` });

  // Use random hex to avoid collisions across boards with the same role name
  const id = 'agent_' + require('crypto').randomBytes(4).toString('hex');

  // is_template = 1 when the source template has a personality the agent inherits.
  // The agent's own system_prompt is whatever the user typed (or null = inherit from template at runtime).
  let is_template_flag = 0;
  if (created_from_template_id) {
    const tpl = db.prepare('SELECT template_system_prompt FROM agent_templates WHERE id = ?').get(created_from_template_id);
    if (tpl?.template_system_prompt) is_template_flag = 1;
  }

  const role_ids_val = req.body.role_ids?.length ? JSON.stringify(req.body.role_ids) : JSON.stringify(['role_any']);

  db.prepare(`
    INSERT INTO agents (id, name, role, model, description, permissions, personality_file, color, created_from_template_id, is_template, system_prompt, role_ids, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, role, model, description, JSON.stringify(permissions), personality_file, color, created_from_template_id || null, is_template_flag, bodySystemPrompt || null, role_ids_val, project_id || null);

  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
  res.status(201).json(parseAgent(agent));
  broadcast('reload');
});

agentsRouter.post('/:id/save-as-template', (req, res) => {
  const agentId = req.headers['x-agent-id'];
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can save templates' });

  const db = getDb();
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const id = 'tpl_' + uuidv4().replace(/-/g, '').slice(0, 12);

  // Snapshot the personality the new template should carry: if the agent has its
  // own system_prompt (user-customised), use that; otherwise inherit from its
  // source template (looked up live).
  let snapshotPrompt = agent.system_prompt || null;
  if (!snapshotPrompt && agent.created_from_template_id) {
    const sourceTpl = db.prepare('SELECT template_system_prompt FROM agent_templates WHERE id = ?')
      .get(agent.created_from_template_id);
    snapshotPrompt = sourceTpl?.template_system_prompt || null;
  }

  db.prepare(`
    INSERT INTO agent_templates (id, name, description, model, color, suggested_role, template_system_prompt, permissions, source_agent_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, agent.description, agent.model, agent.color, agent.role,
    snapshotPrompt,
    agent.permissions, agent.id);

  // Mark the source agent as is_template so it shows the T badge immediately
  db.prepare(`UPDATE agents SET is_template = 1 WHERE id = ?`).run(req.params.id);

  const tpl = db.prepare('SELECT * FROM agent_templates WHERE id = ?').get(id);
  const updatedAgent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
  res.status(201).json({ template: parseTemplate(tpl), agent: parseAgent(updatedAgent) });
  broadcast('reload');
});

agentsRouter.patch('/:id', (req, res) => {
  const agentId = req.headers['x-agent-id'];
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can modify agents' });

  const db = getDb();
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const { name, model, description, permissions, color, active, personality_file, system_prompt, role_ids } = req.body;

  if (role_ids !== undefined) {
    const permErr = validateAgentRoles(role_ids);
    if (permErr) return res.status(400).json({ error: permErr });
  }

  const allowed = {};
  if (name !== undefined) allowed.name = name;
  if (model !== undefined) allowed.model = model;
  if (description !== undefined) allowed.description = description;
  if (permissions !== undefined) allowed.permissions = JSON.stringify(permissions);
  if (color !== undefined) allowed.color = color;
  if (active !== undefined) allowed.active = active ? 1 : 0;
  if (personality_file !== undefined) allowed.personality_file = personality_file;
  if (Object.prototype.hasOwnProperty.call(req.body, 'system_prompt')) {
    allowed.system_prompt = system_prompt ?? null;
  }
  if (role_ids !== undefined) allowed.role_ids = JSON.stringify(role_ids);

  if (Object.keys(allowed).length === 0) return res.status(400).json({ error: 'Nothing to update' });

  const setClauses = Object.keys(allowed).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE agents SET ${setClauses} WHERE id = ?`).run(...Object.values(allowed), agent.id);

  // When role_ids changed: find tasks in now-invalid columns and move them to col_unassigned
  let displacedTasks = [];
  if (role_ids !== undefined) {
    const newRoleIds = role_ids;
    const colRoleMap = buildColumnRoleMap(db);
    const assignedTasks = db.prepare(
      "SELECT * FROM tasks WHERE assigned_agent_id = ? AND archived_at IS NULL AND column_id != 'col_unassigned'"
    ).all(agent.id);
    for (const task of assignedTasks) {
      const coveringRoles = colRoleMap[task.column_id] || [];
      if (coveringRoles.length === 0) continue; // no restriction on this column
      const hasAccess = newRoleIds.includes('role_access_any') || coveringRoles.some(r => newRoleIds.includes(r));
      if (!hasAccess) {
        db.prepare('UPDATE tasks SET column_id = ? WHERE id = ?').run('col_unassigned', task.id);
        db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, from_column, to_column, message) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(uuidv4(), task.id, null, 'moved', task.column_id, 'col_unassigned',
            'Moved to Unassigned — assigned agent lost column access for this column');
        const displaced = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
        displacedTasks.push({
          ...displaced,
          tags: JSON.parse(displaced.tags || '[]'),
          metadata: JSON.parse(displaced.metadata || '{}'),
        });
      }
    }
  }

  const updated = db.prepare('SELECT * FROM agents WHERE id = ?').get(agent.id);
  res.json({ agent: parseAgent(updated), displaced_tasks: displacedTasks });
  broadcast('reload');
});

agentsRouter.post('/:id/archive', (req, res) => {
  const agentId = req.headers['x-agent-id'];
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can archive agents' });

  const db = getDb();
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  db.prepare('UPDATE agents SET active = 0, archived_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
  broadcast('reload');
});

agentsRouter.post('/:id/unarchive', (req, res) => {
  const agentId = req.headers['x-agent-id'];
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can unarchive agents' });

  const db = getDb();
  db.prepare('UPDATE agents SET active = 1, archived_at = NULL WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
  broadcast('reload');
});

agentsRouter.delete('/:id', (req, res) => {
  const agentId = req.headers['x-agent-id'];
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can delete agents' });

  const db = getDb();
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const taskCount = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE assigned_agent_id = ?').get(req.params.id);
  if (taskCount.c > 0) {
    return res.status(409).json({
      error: `Agent has ${taskCount.c} assigned task(s) — archive it instead to preserve history.`,
      has_dependencies: true,
      task_count: taskCount.c,
    });
  }

  db.prepare('DELETE FROM agents WHERE id = ?').run(req.params.id);
  res.json({ ok: true, deleted: true });
  broadcast('reload');
});

// ── Columns ───────────────────────────────────────────────────────────────────
const columnsRouter = express.Router();

columnsRouter.get('/', attachAgent, (req, res) => {
  const db = getDb();
  const includeArchived = req.query.include_archived === 'true';
  const projectId = req.query.project_id || null;

  // Always return global pipeline columns (project_id IS NULL) +
  // any custom columns scoped to the requested project
  const archivedFilter = includeArchived ? '' : 'AND archived_at IS NULL';
  const columns = projectId
    ? db.prepare(`
        SELECT * FROM columns
        WHERE (project_id IS NULL OR project_id = ?)
        ${archivedFilter}
        ORDER BY position ASC
      `).all(projectId)
    : db.prepare(`
        SELECT * FROM columns
        WHERE project_id IS NULL
        ${archivedFilter}
        ORDER BY position ASC
      `).all();

  // Attach task counts (scoped to project if provided)
  const counts = projectId
    ? db.prepare('SELECT column_id, COUNT(*) as count FROM tasks WHERE project_id = ? GROUP BY column_id').all(projectId)
    : db.prepare('SELECT column_id, COUNT(*) as count FROM tasks GROUP BY column_id').all();
  const countMap = Object.fromEntries(counts.map(c => [c.column_id, c.count]));

  res.json(columns.map(c => ({ ...c, task_count: countMap[c.id] || 0 })));
});

columnsRouter.post('/', (req, res) => {
  const agentId = req.headers['x-agent-id'];
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can create columns' });

  const db = getDb();
  const { name, color = '#6366f1', project_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!project_id) return res.status(400).json({ error: 'project_id is required' });

  // Position is scoped to the project: after the last custom column for this project
  const maxPos = db.prepare(
    'SELECT MAX(position) as m FROM columns WHERE project_id = ? OR project_id IS NULL'
  ).get(project_id);
  const position = (maxPos.m || 0) + 1;
  const id = 'col_' + name.toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + Date.now();

  db.prepare('INSERT INTO columns (id, name, position, color, project_id) VALUES (?, ?, ?, ?, ?)').run(id, name, position, color, project_id);

  // Create a non-system column_access role for this column
  const roleId = 'role_' + id.replace(/^col_/, '');
  db.prepare(
    `INSERT OR IGNORE INTO roles (id, name, description, allowed_column_ids, color, is_system, type) VALUES (?, ?, ?, ?, '#6b7280', 0, 'column_access')`
  ).run(roleId, name, `Can be assigned to ${name} tasks`, JSON.stringify([id]));

  res.status(201).json(db.prepare('SELECT * FROM columns WHERE id = ?').get(id));
  broadcast('reload');
});

columnsRouter.patch('/:id', (req, res) => {
  const agentId = req.headers['x-agent-id'];
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can modify columns' });

  const db = getDb();
  const { name, color, position } = req.body;
  const allowed = {};
  if (name) allowed.name = name;
  if (color) allowed.color = color;
  if (position !== undefined) allowed.position = position;

  if (Object.keys(allowed).length === 0) return res.status(400).json({ error: 'Nothing to update' });
  const setClauses = Object.keys(allowed).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE columns SET ${setClauses} WHERE id = ?`).run(...Object.values(allowed), req.params.id);
  res.json(db.prepare('SELECT * FROM columns WHERE id = ?').get(req.params.id));
  broadcast('reload');
});

columnsRouter.post('/:id/archive', (req, res) => {
  const agentId = req.headers['x-agent-id'];
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can archive columns' });

  const db = getDb();
  const col = db.prepare('SELECT * FROM columns WHERE id = ?').get(req.params.id);
  if (!col) return res.status(404).json({ error: 'Column not found' });
  if (col.is_protected) return res.status(403).json({ error: 'Core columns cannot be archived.' });

  db.prepare('UPDATE columns SET archived_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
  broadcast('reload');
});

columnsRouter.post('/:id/unarchive', (req, res) => {
  const agentId = req.headers['x-agent-id'];
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can unarchive columns' });

  const db = getDb();
  db.prepare('UPDATE columns SET archived_at = NULL WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
  broadcast('reload');
});

columnsRouter.delete('/:id', (req, res) => {
  const agentId = req.headers['x-agent-id'];
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can delete columns' });

  const db = getDb();
  const col = db.prepare('SELECT * FROM columns WHERE id = ?').get(req.params.id);
  if (!col) return res.status(404).json({ error: 'Column not found' });
  if (col.is_protected) return res.status(403).json({ error: 'Core columns cannot be deleted.' });

  const taskCount = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE column_id = ?').get(req.params.id);
  if (taskCount.c > 0) {
    return res.status(409).json({
      error: `Column has ${taskCount.c} task(s) — archive it instead to preserve the tasks.`,
      has_dependencies: true,
      task_count: taskCount.c,
    });
  }

  db.prepare('DELETE FROM columns WHERE id = ?').run(req.params.id);

  // Remove the column's access role (non-system roles only)
  const deletedRoleId = 'role_' + req.params.id.replace(/^col_/, '');
  db.prepare("DELETE FROM roles WHERE id = ? AND is_system = 0").run(deletedRoleId);

  res.json({ ok: true, deleted: true });
  broadcast('reload');
});

// ── Instructions ──────────────────────────────────────────────────────────────
const instructionsRouter = express.Router();
const { GLOBAL_INSTRUCTIONS_DIR } = require('../utils/instructions');

/**
 * Resolve the file-system directory for a given scope.
 * - subscription_id + project_id → per-board folder
 * - subscription_id only          → subscription-level folder
 * - neither                       → root instructions/ (legacy fallback)
 */
function getInstructionsDirs(subscriptionId, projectId) {
  if (subscriptionId && projectId) {
    const dir = path.join(GLOBAL_INSTRUCTIONS_DIR, subscriptionId, projectId);
    return { dir, archivedDir: path.join(dir, 'archived') };
  }
  if (subscriptionId) {
    const dir = path.join(GLOBAL_INSTRUCTIONS_DIR, subscriptionId);
    return { dir, archivedDir: path.join(dir, 'archived') };
  }
  return { dir: GLOBAL_INSTRUCTIONS_DIR, archivedDir: path.join(GLOBAL_INSTRUCTIONS_DIR, 'archived') };
}

function folderPrefix(subscriptionId, projectId) {
  if (subscriptionId && projectId) return `instructions/${subscriptionId}/${projectId}`;
  if (subscriptionId)              return `instructions/${subscriptionId}`;
  return 'instructions';
}

function listInstructionFiles(includeArchived, subscriptionId, projectId) {
  const { dir, archivedDir } = getInstructionsDirs(subscriptionId, projectId);
  const prefix = folderPrefix(subscriptionId, projectId);

  const active = fs.existsSync(dir)
    ? fs.readdirSync(dir)
        .filter(f => f.endsWith('.md'))
        .map(f => ({
          path: `${prefix}/${f}`,
          name: f.replace('.md', ''),
          label: f.replace('.md', '').replace(/_/g, ' '),
          archived: false,
        }))
    : [];

  if (!includeArchived) return active;

  const archived = fs.existsSync(archivedDir)
    ? fs.readdirSync(archivedDir)
        .filter(f => f.endsWith('.md'))
        .map(f => ({
          path: `${prefix}/archived/${f}`,
          name: f.replace('.md', ''),
          label: f.replace('.md', '').replace(/_/g, ' '),
          archived: true,
        }))
    : [];

  return [...active, ...archived];
}

function getAgentReferences(db, filename, subscriptionId, projectId) {
  const prefix = folderPrefix(subscriptionId, projectId);
  const filePath = `${prefix}/${filename}`;
  // Also check logical path (instructions/X.md) used by default agents
  const logicalPath = `instructions/${filename}`;
  const agents = db.prepare(
    'SELECT id FROM agents WHERE personality_file IN (?,?)'
  ).all(filePath, logicalPath);
  return agents.map(a => a.id);
}

// GET /api/instructions?subscription_id=xxx&project_id=yyy — list files
instructionsRouter.get('/', attachAgent, (req, res) => {
  const includeArchived = req.query.include_archived === 'true';
  const subscriptionId = req.query.subscription_id || null;
  const projectId = req.query.project_id || null;
  res.json(listInstructionFiles(includeArchived, subscriptionId, projectId));
});

// GET /api/instructions/:filename?subscription_id=xxx&project_id=yyy — read file content
instructionsRouter.get('/:filename', attachAgent, (req, res) => {
  const { filename } = req.params;
  if (!filename.endsWith('.md') || filename.includes('/') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const subscriptionId = req.query.subscription_id || null;
  const projectId = req.query.project_id || null;
  const { dir, archivedDir } = getInstructionsDirs(subscriptionId, projectId);

  if (fs.existsSync(path.join(dir, filename))) {
    return res.json({ content: fs.readFileSync(path.join(dir, filename), 'utf8'), archived: false });
  }
  if (fs.existsSync(path.join(archivedDir, filename))) {
    return res.json({ content: fs.readFileSync(path.join(archivedDir, filename), 'utf8'), archived: true });
  }
  // Fallback: try subscription-level file when reading a board file
  if (subscriptionId && projectId) {
    const subDir = path.join(GLOBAL_INSTRUCTIONS_DIR, subscriptionId);
    if (fs.existsSync(path.join(subDir, filename))) {
      return res.json({ content: fs.readFileSync(path.join(subDir, filename), 'utf8'), archived: false });
    }
  }
  res.status(404).json({ error: 'File not found' });
});

// PATCH /api/instructions/:filename?subscription_id=xxx&project_id=yyy — update file content
instructionsRouter.patch('/:filename', (req, res) => {
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can edit instruction files' });

  const { filename } = req.params;
  if (!filename.endsWith('.md') || filename.includes('/') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const { content } = req.body;
  if (content === undefined) return res.status(400).json({ error: 'content is required' });

  const subscriptionId = req.query.subscription_id || null;
  const projectId = req.query.project_id || null;
  const { dir, archivedDir } = getInstructionsDirs(subscriptionId, projectId);

  if (fs.existsSync(path.join(dir, filename))) {
    fs.writeFileSync(path.join(dir, filename), content, 'utf8');
    return res.json({ ok: true });
  }
  if (fs.existsSync(path.join(archivedDir, filename))) {
    fs.writeFileSync(path.join(archivedDir, filename), content, 'utf8');
    return res.json({ ok: true });
  }
  res.status(404).json({ error: 'File not found' });
});

// POST /api/instructions?subscription_id=xxx&project_id=yyy — create a new .md file
instructionsRouter.post('/', (req, res) => {
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can create instruction files' });

  const { name, content = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const safeName = name.trim().toLowerCase()
    .replace(/\.md$/i, '')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);

  if (!safeName) return res.status(400).json({ error: 'Invalid file name' });

  const subscriptionId = req.query.subscription_id || req.body.subscription_id || null;
  const projectId = req.query.project_id || req.body.project_id || null;
  if (!subscriptionId) return res.status(400).json({ error: 'subscription_id is required' });

  const { dir } = getInstructionsDirs(subscriptionId, projectId);
  const prefix = folderPrefix(subscriptionId, projectId);

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filename = `${safeName}.md`;
  const filePath = path.join(dir, filename);

  if (fs.existsSync(filePath)) {
    return res.status(409).json({ error: `File "${filename}" already exists` });
  }

  fs.writeFileSync(filePath, content, 'utf8');
  res.status(201).json({ path: `${prefix}/${filename}`, name: safeName, archived: false });
});

// POST /api/instructions/:filename/archive?subscription_id=xxx&project_id=yyy
instructionsRouter.post('/:filename/archive', (req, res) => {
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can archive instruction files' });

  const { filename } = req.params;
  if (!filename.endsWith('.md') || filename.includes('/') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const subscriptionId = req.query.subscription_id || null;
  const projectId = req.query.project_id || null;
  if (!subscriptionId) return res.status(400).json({ error: 'subscription_id is required' });

  const { dir, archivedDir } = getInstructionsDirs(subscriptionId, projectId);
  const src = path.join(dir, filename);
  if (!fs.existsSync(src)) return res.status(404).json({ error: 'File not found' });

  if (!fs.existsSync(archivedDir)) fs.mkdirSync(archivedDir, { recursive: true });
  fs.renameSync(src, path.join(archivedDir, filename));
  res.json({ ok: true, archived: true });
});

// POST /api/instructions/:filename/unarchive?subscription_id=xxx&project_id=yyy
instructionsRouter.post('/:filename/unarchive', (req, res) => {
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can restore instruction files' });

  const { filename } = req.params;
  if (!filename.endsWith('.md') || filename.includes('/') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const subscriptionId = req.query.subscription_id || null;
  const projectId = req.query.project_id || null;
  const { dir, archivedDir } = getInstructionsDirs(subscriptionId, projectId);

  const src = path.join(archivedDir, filename);
  if (!fs.existsSync(src)) return res.status(404).json({ error: 'Archived file not found' });

  const dest = path.join(dir, filename);
  if (fs.existsSync(dest)) return res.status(409).json({ error: `A file named "${filename}" already exists` });

  fs.renameSync(src, dest);
  res.json({ ok: true, archived: false });
});

// DELETE /api/instructions/:filename?subscription_id=xxx&project_id=yyy
instructionsRouter.delete('/:filename', (req, res) => {
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can delete instruction files' });

  const { filename } = req.params;
  if (!filename.endsWith('.md') || filename.includes('/') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const subscriptionId = req.query.subscription_id || null;
  const projectId = req.query.project_id || null;
  if (!subscriptionId) return res.status(400).json({ error: 'subscription_id is required' });

  const db = getDb();
  const refs = getAgentReferences(db, filename, subscriptionId, projectId);
  if (refs.length > 0) {
    return res.status(409).json({ error: 'File is referenced by agents — archive it instead', has_dependencies: true, agents: refs });
  }

  const { dir, archivedDir } = getInstructionsDirs(subscriptionId, projectId);
  if (fs.existsSync(path.join(dir, filename))) {
    fs.unlinkSync(path.join(dir, filename));
    return res.json({ ok: true, deleted: true });
  }
  if (fs.existsSync(path.join(archivedDir, filename))) {
    fs.unlinkSync(path.join(archivedDir, filename));
    return res.json({ ok: true, deleted: true });
  }
  res.status(404).json({ error: 'File not found' });
});

// ── Agent Templates ───────────────────────────────────────────────────────────
const agentTemplatesRouter = express.Router();

agentTemplatesRouter.get('/', attachAgent, (req, res) => {
  const db = getDb();
  const includeArchived = req.query.include_archived === 'true';
  const where = includeArchived ? '' : 'WHERE archived_at IS NULL';
  const templates = db.prepare(`SELECT * FROM agent_templates ${where} ORDER BY created_at DESC`).all();
  res.json(templates.map(parseTemplate));
});

agentTemplatesRouter.post('/', (req, res) => {
  const agentId = req.headers['x-agent-id'];
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can create templates' });

  const db = getDb();
  const {
    name, description, model = 'claude-sonnet-4-5', color = '#6366f1',
    suggested_role, template_system_prompt, permissions = [],
  } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const id = 'tpl_' + uuidv4().replace(/-/g, '').slice(0, 12);
  db.prepare(`
    INSERT INTO agent_templates (id, name, description, model, color, suggested_role, template_system_prompt, permissions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, description, model, color, suggested_role,
    template_system_prompt || null,
    JSON.stringify(permissions));

  const tpl = db.prepare('SELECT * FROM agent_templates WHERE id = ?').get(id);
  res.status(201).json(parseTemplate(tpl));
  broadcast('reload');
});

agentTemplatesRouter.patch('/:id', (req, res) => {
  const agentId = req.headers['x-agent-id'];
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can modify templates' });

  const db = getDb();
  const tpl = db.prepare('SELECT * FROM agent_templates WHERE id = ?').get(req.params.id);
  if (!tpl) return res.status(404).json({ error: 'Template not found' });

  const { name, description, model, color, suggested_role, template_system_prompt, permissions } = req.body;
  const allowed = {};
  if (name !== undefined) allowed.name = name;
  if (description !== undefined) allowed.description = description;
  if (model !== undefined) allowed.model = model;
  if (color !== undefined) allowed.color = color;
  if (suggested_role !== undefined) allowed.suggested_role = suggested_role;
  if (Object.prototype.hasOwnProperty.call(req.body, 'template_system_prompt')) {
    allowed.template_system_prompt = template_system_prompt ?? null;
  }
  if (permissions !== undefined) allowed.permissions = JSON.stringify(permissions);

  if (Object.keys(allowed).length === 0) return res.status(400).json({ error: 'Nothing to update' });

  const setClauses = Object.keys(allowed).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE agent_templates SET ${setClauses} WHERE id = ?`).run(...Object.values(allowed), tpl.id);

  const updated = db.prepare('SELECT * FROM agent_templates WHERE id = ?').get(tpl.id);
  res.json(parseTemplate(updated));
  broadcast('reload');
});

agentTemplatesRouter.post('/:id/archive', (req, res) => {
  const agentId = req.headers['x-agent-id'];
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can archive templates' });

  const db = getDb();
  db.prepare('UPDATE agent_templates SET archived_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
  broadcast('reload');
});

agentTemplatesRouter.post('/:id/unarchive', (req, res) => {
  const agentId = req.headers['x-agent-id'];
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can unarchive templates' });

  const db = getDb();
  db.prepare('UPDATE agent_templates SET archived_at = NULL WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
  broadcast('reload');
});

agentTemplatesRouter.delete('/:id', (req, res) => {
  const agentId = req.headers['x-agent-id'];
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can delete templates' });

  const db = getDb();
  const tpl = db.prepare('SELECT * FROM agent_templates WHERE id = ?').get(req.params.id);
  if (!tpl) return res.status(404).json({ error: 'Template not found' });

  const agentCount = db.prepare('SELECT COUNT(*) as c FROM agents WHERE created_from_template_id = ?').get(req.params.id);
  if (agentCount.c > 0) {
    return res.status(409).json({
      error: `Template was used to create ${agentCount.c} agent(s) — archive it instead to preserve the link.`,
      has_dependencies: true,
      agent_count: agentCount.c,
    });
  }

  db.prepare('DELETE FROM agent_templates WHERE id = ?').run(req.params.id);
  res.json({ ok: true, deleted: true });
  broadcast('reload');
});

// ── Roles ─────────────────────────────────────────────────────────────────────
const rolesRouter = express.Router();

function parseRole(r) {
  return { ...r, allowed_column_ids: JSON.parse(r.allowed_column_ids || '[]') };
}

// Order: column_access first (by name), then permissions (by name)
rolesRouter.get('/', (req, res) => {
  const db = getDb();
  const roles = db.prepare(
    "SELECT * FROM roles ORDER BY CASE type WHEN 'column_access' THEN 0 ELSE 1 END, name ASC"
  ).all();
  res.json(roles.map(parseRole));
});

module.exports = { agentsRouter, columnsRouter, instructionsRouter, agentTemplatesRouter, rolesRouter };
