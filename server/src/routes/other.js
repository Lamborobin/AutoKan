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
    instruction_files: JSON.parse(a.instruction_files || '[]'),
    role_ids: JSON.parse(a.role_ids || '[]'),
    is_template: a.is_template === 1,
  };
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
    instruction_files: JSON.parse(t.instruction_files || '[]'),
    permissions: JSON.parse(t.permissions || '[]'),
    tags: JSON.parse(t.tags || '[]'),
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
    permissions = [], prompt_file, instruction_files = [], color = '#6366f1',
    created_from_template_id, template_system_prompt: bodyTemplatePrompt,
    project_id,
  } = req.body;
  if (!name || !role) return res.status(400).json({ error: 'name and role are required' });

  // Uniqueness is per-project (same role name is allowed on different boards)
  const existing = project_id
    ? db.prepare('SELECT id FROM agents WHERE role = ? AND project_id = ?').get(role, project_id)
    : db.prepare('SELECT id FROM agents WHERE role = ? AND project_id IS NULL').get(role);
  if (existing) return res.status(409).json({ error: `Agent with role "${role}" already exists` });

  // Use random hex to avoid collisions across boards with the same role name
  const id = 'agent_' + require('crypto').randomBytes(4).toString('hex');

  // is_template = 1 only when the source template has a behaviour prompt (not just because the user typed one manually)
  let is_template_flag = 0;
  let template_system_prompt_val = bodyTemplatePrompt || null;
  if (created_from_template_id) {
    const tpl = db.prepare('SELECT * FROM agent_templates WHERE id = ?').get(created_from_template_id);
    if (tpl?.template_system_prompt) {
      is_template_flag = 1;
      if (!template_system_prompt_val) template_system_prompt_val = tpl.template_system_prompt;
    }
  }

  const role_ids_val = req.body.role_ids?.length ? JSON.stringify(req.body.role_ids) : JSON.stringify(['role_any']);

  db.prepare(`
    INSERT INTO agents (id, name, role, model, description, permissions, prompt_file, instruction_files, color, created_from_template_id, is_template, template_system_prompt, role_ids, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, role, model, description, JSON.stringify(permissions), prompt_file, JSON.stringify(instruction_files), color, created_from_template_id || null, is_template_flag, template_system_prompt_val, role_ids_val, project_id || null);

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

  const { name, system_prompt_content = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const id = 'tpl_' + uuidv4().replace(/-/g, '').slice(0, 12);
  db.prepare(`
    INSERT INTO agent_templates (id, name, description, model, color, suggested_role, system_prompt_content, template_system_prompt, instruction_files, permissions, tags, source_agent_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?)
  `).run(id, name, agent.description, agent.model, agent.color, agent.role,
    system_prompt_content, agent.template_system_prompt || null,
    agent.instruction_files, agent.permissions, agent.id);

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

  const { name, model, description, permissions, color, active, prompt_file, instruction_files, template_system_prompt, role_ids } = req.body;
  const allowed = {};
  if (name !== undefined) allowed.name = name;
  if (model !== undefined) allowed.model = model;
  if (description !== undefined) allowed.description = description;
  if (permissions !== undefined) allowed.permissions = JSON.stringify(permissions);
  if (color !== undefined) allowed.color = color;
  if (active !== undefined) allowed.active = active ? 1 : 0;
  if (prompt_file !== undefined) allowed.prompt_file = prompt_file;
  if (instruction_files !== undefined) allowed.instruction_files = JSON.stringify(instruction_files);
  if (Object.prototype.hasOwnProperty.call(req.body, 'template_system_prompt')) {
    allowed.template_system_prompt = template_system_prompt ?? null;
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
  const where = includeArchived ? '' : 'WHERE archived_at IS NULL';
  const columns = db.prepare(`SELECT * FROM columns ${where} ORDER BY position ASC`).all();

  // Attach task counts
  const counts = db.prepare('SELECT column_id, COUNT(*) as count FROM tasks GROUP BY column_id').all();
  const countMap = Object.fromEntries(counts.map(c => [c.column_id, c.count]));

  res.json(columns.map(c => ({ ...c, task_count: countMap[c.id] || 0 })));
});

columnsRouter.post('/', (req, res) => {
  const agentId = req.headers['x-agent-id'];
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can create columns' });

  const db = getDb();
  const { name, color = '#6366f1' } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const maxPos = db.prepare('SELECT MAX(position) as m FROM columns').get();
  const position = (maxPos.m || 0) + 1;
  const id = 'col_' + name.toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + Date.now();

  db.prepare('INSERT INTO columns (id, name, position, color) VALUES (?, ?, ?, ?)').run(id, name, position, color);

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

// ── Secrets ───────────────────────────────────────────────────────────────────
const secretsRouter = express.Router();

secretsRouter.get('/', (req, res) => {
  const agentId = req.headers['x-agent-id'];
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can view secrets' });

  const db = getDb();
  res.json(db.prepare('SELECT * FROM secrets ORDER BY created_at DESC').all());
});

secretsRouter.post('/', attachAgent, (req, res) => {
  const db = getDb();
  const { name, description, task_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const id = 'secret_' + uuidv4().slice(0, 8);
  db.prepare('INSERT OR IGNORE INTO secrets (id, name, description, task_id) VALUES (?, ?, ?, ?)').run(id, name, description, task_id);

  // Move task to Human Action if provided
  if (task_id) {
    db.prepare(`UPDATE tasks SET column_id = 'col_humanaction', requires_human_action = 1, human_action_reason = ? WHERE id = ?`)
      .run(`Secret required: ${name}`, task_id);
  }

  res.status(201).json(db.prepare('SELECT * FROM secrets WHERE id = ?').get(id));
});

secretsRouter.patch('/:id/resolve', (req, res) => {
  const agentId = req.headers['x-agent-id'];
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can resolve secrets' });

  const db = getDb();
  const { status } = req.body; // 'provided' or 'rejected'
  if (!['provided', 'rejected'].includes(status)) return res.status(400).json({ error: 'status must be provided or rejected' });

  db.prepare('UPDATE secrets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
});

// ── Instructions ──────────────────────────────────────────────────────────────
const instructionsRouter = express.Router();

// All global (system) files are protected — they live in instructions/ and affect all boards
const GLOBAL_INSTRUCTIONS_DIR = path.join(PROJECT_ROOT, 'instructions');

function getInstructionsDirs(projectId) {
  if (!projectId) {
    return { dir: GLOBAL_INSTRUCTIONS_DIR, archivedDir: path.join(GLOBAL_INSTRUCTIONS_DIR, 'archived'), projectId: null };
  }
  const dir = path.join(PROJECT_ROOT, `instructions-${projectId}`);
  return { dir, archivedDir: path.join(dir, 'archived'), projectId };
}

function folderPrefix(projectId) {
  return projectId ? `instructions-${projectId}` : 'instructions';
}

function listInstructionFiles(includeArchived, projectId) {
  const { dir, archivedDir } = getInstructionsDirs(projectId);
  const prefix = folderPrefix(projectId);
  const isGlobal = !projectId;

  const active = fs.existsSync(dir)
    ? fs.readdirSync(dir)
        .filter(f => f.endsWith('.md'))
        .map(f => ({
          path: `${prefix}/${f}`,
          name: f.replace('.md', ''),
          label: f.replace('.md', '').replace(/_/g, ' '),
          is_default: isGlobal,
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
          is_default: false,
          archived: true,
        }))
    : [];

  return [...active, ...archived];
}

function getAgentReferences(db, filename, projectId) {
  const prefix = folderPrefix(projectId);
  const filePath = `${prefix}/${filename}`;
  // Also check global path for backward compat
  const globalPath = `instructions/${filename}`;
  const agents = db.prepare(
    'SELECT id FROM agents WHERE prompt_file IN (?,?) OR instruction_files LIKE ? OR instruction_files LIKE ?'
  ).all(filePath, globalPath, `%${filePath}%`, `%${globalPath}%`);
  return agents.map(a => a.id);
}

// GET /api/instructions?project_id=xxx — list files (project-scoped or global)
instructionsRouter.get('/', attachAgent, (req, res) => {
  const includeArchived = req.query.include_archived === 'true';
  const projectId = req.query.project_id || null;
  res.json(listInstructionFiles(includeArchived, projectId));
});

// GET /api/instructions/:filename?project_id=xxx — read file content
instructionsRouter.get('/:filename', attachAgent, (req, res) => {
  const { filename } = req.params;
  if (!filename.endsWith('.md') || filename.includes('/') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const projectId = req.query.project_id || null;
  const { dir, archivedDir } = getInstructionsDirs(projectId);

  if (fs.existsSync(path.join(dir, filename))) {
    return res.json({ content: fs.readFileSync(path.join(dir, filename), 'utf8'), archived: false });
  }
  if (fs.existsSync(path.join(archivedDir, filename))) {
    return res.json({ content: fs.readFileSync(path.join(archivedDir, filename), 'utf8'), archived: true });
  }
  // Fallback: try global file for project-scoped requests (covers legacy agents)
  if (projectId && fs.existsSync(path.join(GLOBAL_INSTRUCTIONS_DIR, filename))) {
    return res.json({ content: fs.readFileSync(path.join(GLOBAL_INSTRUCTIONS_DIR, filename), 'utf8'), archived: false });
  }
  res.status(404).json({ error: 'File not found' });
});

// PATCH /api/instructions/:filename?project_id=xxx — update file content
instructionsRouter.patch('/:filename', (req, res) => {
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can edit instruction files' });

  const { filename } = req.params;
  if (!filename.endsWith('.md') || filename.includes('/') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const { content } = req.body;
  if (content === undefined) return res.status(400).json({ error: 'content is required' });

  const projectId = req.query.project_id || null;
  const { dir, archivedDir } = getInstructionsDirs(projectId);

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

// POST /api/instructions?project_id=xxx — create a new .md file
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

  const projectId = req.query.project_id || req.body.project_id || null;
  const { dir } = getInstructionsDirs(projectId);
  const prefix = folderPrefix(projectId);

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filename = `${safeName}.md`;
  const filePath = path.join(dir, filename);

  if (fs.existsSync(filePath)) {
    return res.status(409).json({ error: `File "${filename}" already exists` });
  }

  fs.writeFileSync(filePath, content, 'utf8');
  res.status(201).json({ path: `${prefix}/${filename}`, name: safeName, is_default: false, archived: false });
});

// POST /api/instructions/:filename/archive?project_id=xxx
instructionsRouter.post('/:filename/archive', (req, res) => {
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can archive instruction files' });

  const { filename } = req.params;
  if (!filename.endsWith('.md') || filename.includes('/') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const projectId = req.query.project_id || null;
  if (!projectId) return res.status(403).json({ error: 'System files cannot be archived' });

  const { dir, archivedDir } = getInstructionsDirs(projectId);
  const src = path.join(dir, filename);
  if (!fs.existsSync(src)) return res.status(404).json({ error: 'File not found' });

  if (!fs.existsSync(archivedDir)) fs.mkdirSync(archivedDir, { recursive: true });
  fs.renameSync(src, path.join(archivedDir, filename));
  res.json({ ok: true, archived: true });
});

// POST /api/instructions/:filename/unarchive?project_id=xxx
instructionsRouter.post('/:filename/unarchive', (req, res) => {
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can restore instruction files' });

  const { filename } = req.params;
  if (!filename.endsWith('.md') || filename.includes('/') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const projectId = req.query.project_id || null;
  const { dir, archivedDir } = getInstructionsDirs(projectId);

  const src = path.join(archivedDir, filename);
  if (!fs.existsSync(src)) return res.status(404).json({ error: 'Archived file not found' });

  const dest = path.join(dir, filename);
  if (fs.existsSync(dest)) return res.status(409).json({ error: `A file named "${filename}" already exists` });

  fs.renameSync(src, dest);
  res.json({ ok: true, archived: false });
});

// DELETE /api/instructions/:filename?project_id=xxx
instructionsRouter.delete('/:filename', (req, res) => {
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can delete instruction files' });

  const { filename } = req.params;
  if (!filename.endsWith('.md') || filename.includes('/') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const projectId = req.query.project_id || null;
  if (!projectId) return res.status(403).json({ error: 'System files cannot be deleted' });

  const db = getDb();
  const refs = getAgentReferences(db, filename, projectId);
  if (refs.length > 0) {
    return res.status(409).json({ error: 'File is referenced by agents — archive it instead', has_dependencies: true, agents: refs });
  }

  const { dir, archivedDir } = getInstructionsDirs(projectId);
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
    suggested_role, system_prompt_content = '', template_system_prompt,
    instruction_files = [], permissions = [], tags = [],
  } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const id = 'tpl_' + uuidv4().replace(/-/g, '').slice(0, 12);
  db.prepare(`
    INSERT INTO agent_templates (id, name, description, model, color, suggested_role, system_prompt_content, template_system_prompt, instruction_files, permissions, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, description, model, color, suggested_role, system_prompt_content,
    template_system_prompt || null,
    JSON.stringify(instruction_files), JSON.stringify(permissions), JSON.stringify(tags));

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

  const { name, description, model, color, suggested_role, system_prompt_content, template_system_prompt, instruction_files, permissions, tags } = req.body;
  const allowed = {};
  if (name !== undefined) allowed.name = name;
  if (description !== undefined) allowed.description = description;
  if (model !== undefined) allowed.model = model;
  if (color !== undefined) allowed.color = color;
  if (suggested_role !== undefined) allowed.suggested_role = suggested_role;
  if (system_prompt_content !== undefined) allowed.system_prompt_content = system_prompt_content;
  if (Object.prototype.hasOwnProperty.call(req.body, 'template_system_prompt')) {
    allowed.template_system_prompt = template_system_prompt ?? null;
  }
  if (instruction_files !== undefined) allowed.instruction_files = JSON.stringify(instruction_files);
  if (permissions !== undefined) allowed.permissions = JSON.stringify(permissions);
  if (tags !== undefined) allowed.tags = JSON.stringify(tags);

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

module.exports = { agentsRouter, columnsRouter, secretsRouter, instructionsRouter, agentTemplatesRouter, rolesRouter };
