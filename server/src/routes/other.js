const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db');
const { requirePermission, attachAgent } = require('../middleware/auth');
const { broadcast } = require('../sse');
const { loadModels } = require('../services/modelRegistry');

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
    name, role, model, description,
    permissions = [], personality_file, color = '#6366f1',
    created_from_template_id, system_prompt: bodySystemPrompt,
    project_id,
  } = req.body;
  const resolvedModel = model || loadModels().defaultModel;
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
  `).run(id, name, role, resolvedModel, description, JSON.stringify(permissions), personality_file, color, created_from_template_id || null, is_template_flag, bodySystemPrompt || null, role_ids_val, project_id || null);

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

  // Attach task counts (scoped to project if provided) — excludes benchmark
  // probing tasks, which are fictional and must never show up as real board work.
  const probeFilter = `(metadata IS NULL OR metadata NOT LIKE '%"is_benchmark_probe":true%')`;
  const counts = projectId
    ? db.prepare(`SELECT column_id, COUNT(*) as count FROM tasks WHERE project_id = ? AND ${probeFilter} GROUP BY column_id`).all(projectId)
    : db.prepare(`SELECT column_id, COUNT(*) as count FROM tasks WHERE ${probeFilter} GROUP BY column_id`).all();
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
const runnersRegistry = require('../seed/runners.json');

// Runner personality file basenames — these are protected from deletion
const RUNNER_PERSONALITY_FILES = new Set(
  runnersRegistry.runners
    .map(r => r.personality_file)
    .filter(Boolean)
    .map(p => path.basename(p))
);

// Legacy reader only — old files may still carry a `capabilities:` front-matter block
// from before visibility moved to the DB (instruction_file_visibility below). Used
// exclusively as a one-time fallback when no DB row exists yet for a file, so nothing
// that was already scoped silently becomes visible to everyone. Never used for writes.
function splitFrontMatter(content) {
  // Normalize CRLF first — see agentRunner.js's parseFrontMatter for the full story:
  // a CRLF-saved file silently fails the '---\n' check and the raw block leaks into
  // the returned body instead of being stripped.
  content = content.replace(/\r\n/g, '\n');
  if (!content.startsWith('---\n')) return { capabilities: [], body: content };
  const end = content.indexOf('\n---', 4);
  if (end === -1) return { capabilities: [], body: content };
  let caps = [];
  for (const line of content.slice(4, end).split('\n')) {
    const colon = line.indexOf(':');
    if (colon > 0 && line.slice(0, colon).trim() === 'capabilities') {
      caps = line.slice(colon + 1).trim().split(',').map(c => c.trim()).filter(Boolean);
    }
  }
  return { capabilities: caps, body: content.slice(end + 5).replace(/^\n+/, '') };
}

// Visibility ("which capabilities can see this file") lives in instruction_file_visibility,
// never in the file's own text — so toggling it in Settings can never touch, duplicate,
// or corrupt the file's content, and editing content can never touch visibility. project_id
// is stored as '' (not NULL) for subscription-level files — see the table's own comment.
function getFileCapabilities(db, subscriptionId, projectId, filename, filePath) {
  const row = db.prepare(
    'SELECT capabilities FROM instruction_file_visibility WHERE subscription_id = ? AND project_id = ? AND filename = ?'
  ).get(subscriptionId || '', projectId || '', filename);
  if (row) {
    try { return JSON.parse(row.capabilities); } catch { return []; }
  }
  // No DB row yet — this file predates the move to DB-backed visibility. Fall back to
  // whatever its front matter says (legacy read only) so existing scoping isn't lost;
  // the next explicit visibility save persists it to the DB and the front matter is
  // dropped from the file for good.
  if (!filePath) return [];
  try { return splitFrontMatter(fs.readFileSync(filePath, 'utf8')).capabilities; }
  catch { return []; }
}

function setFileCapabilities(db, subscriptionId, projectId, filename, capabilities) {
  const id = 'ifv_' + uuidv4().replace(/-/g, '').slice(0, 12);
  db.prepare(`
    INSERT INTO instruction_file_visibility (id, subscription_id, project_id, filename, capabilities, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(subscription_id, project_id, filename)
    DO UPDATE SET capabilities = excluded.capabilities, updated_at = CURRENT_TIMESTAMP
  `).run(id, subscriptionId || '', projectId || '', filename, JSON.stringify(capabilities || []));
}

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

// ── Version history ─────────────────────────────────────────────────────────
// Same archive-on-write scheme as /api/docs (server/src/routes/docs.js): each PATCH
// snapshots the pre-write content into a per-scope, per-file .versions/ folder before
// overwriting, keeping the most recent MAX_INSTRUCTION_VERSIONS. Nesting under the
// scope's own resolved dir (rather than a single global versions dir) keeps board,
// subscription, and legacy-global files from colliding on the same filename.
const MAX_INSTRUCTION_VERSIONS = 10;

function instructionVersionDir(subscriptionId, projectId, filename) {
  const { dir } = getInstructionsDirs(subscriptionId, projectId);
  return path.join(dir, '.versions', filename);
}

function archiveInstructionVersion(subscriptionId, projectId, filename, currentContent) {
  const dir = instructionVersionDir(subscriptionId, projectId, filename);
  fs.mkdirSync(dir, { recursive: true });

  const ts = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
  fs.writeFileSync(path.join(dir, `${ts}.md`), currentContent, 'utf8');

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
  if (files.length > MAX_INSTRUCTION_VERSIONS) {
    files.slice(0, files.length - MAX_INSTRUCTION_VERSIONS).forEach(f =>
      fs.unlinkSync(path.join(dir, f))
    );
  }
}

function listInstructionVersionFiles(subscriptionId, projectId, filename) {
  try {
    return fs.readdirSync(instructionVersionDir(subscriptionId, projectId, filename))
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse();
  } catch { return []; }
}

// Which of the three UI-facing buckets a file belongs to — distinct from `protected`,
// which is just "can this be deleted." Board-scope files are always board_rules; at
// subscription scope, capability behavior files are the fixed set matched against the
// runner registry, everything else is a genuine workspace rule.
function fileKind(filename, projectId) {
  if (projectId) return 'board_rules';
  return RUNNER_PERSONALITY_FILES.has(filename) ? 'capability_behavior' : 'workspace_rules';
}

function listInstructionFiles(includeArchived, subscriptionId, projectId) {
  const db = getDb();
  const { dir, archivedDir } = getInstructionsDirs(subscriptionId, projectId);
  const prefix = folderPrefix(subscriptionId, projectId);

  const active = fs.existsSync(dir)
    ? fs.readdirSync(dir)
        .filter(f => f.endsWith('.md'))
        .map(f => {
          const caps = getFileCapabilities(db, subscriptionId, projectId, f, path.join(dir, f));
          return {
            path: `${prefix}/${f}`,
            name: f.replace('.md', ''),
            label: f.replace('.md', '').replace(/_/g, ' '),
            archived: false,
            capabilities: caps || [],
            protected: RUNNER_PERSONALITY_FILES.has(f),
            kind: fileKind(f, projectId),
          };
        })
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
          capabilities: getFileCapabilities(db, subscriptionId, projectId, f, path.join(archivedDir, f)),
          protected: RUNNER_PERSONALITY_FILES.has(f),
          kind: fileKind(f, projectId),
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
  const db = getDb();
  const { dir, archivedDir } = getInstructionsDirs(subscriptionId, projectId);

  // Returns { content (body, no front matter), capabilities, protected, archived }.
  // Visibility comes from the DB (getFileCapabilities), never from the file — but a
  // legacy file may still physically carry a front-matter block from before that move,
  // so it's still stripped here for display. Since PATCH below no longer re-adds front
  // matter, the first save of a legacy file naturally rewrites it as plain content.
  const respond = (filePath, archived) => {
    const { body } = splitFrontMatter(fs.readFileSync(filePath, 'utf8'));
    const capabilities = getFileCapabilities(db, subscriptionId, projectId, filename, filePath);
    return res.json({ content: body, capabilities, protected: RUNNER_PERSONALITY_FILES.has(filename), kind: fileKind(filename, projectId), archived });
  };

  if (fs.existsSync(path.join(dir, filename))) return respond(path.join(dir, filename), false);
  if (fs.existsSync(path.join(archivedDir, filename))) return respond(path.join(archivedDir, filename), true);
  // Fallback: try subscription-level file when reading a board file
  if (subscriptionId && projectId) {
    const subPath = path.join(GLOBAL_INSTRUCTIONS_DIR, subscriptionId, filename);
    if (fs.existsSync(subPath)) return respond(subPath, false);
  }
  res.status(404).json({ error: 'File not found' });
});

// GET /api/instructions/:filename/versions?subscription_id=xxx&project_id=yyy — list saved versions
instructionsRouter.get('/:filename/versions', (req, res) => {
  const { filename } = req.params;
  if (!filename.endsWith('.md') || filename.includes('/') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const subscriptionId = req.query.subscription_id || null;
  const projectId = req.query.project_id || null;

  const dir = instructionVersionDir(subscriptionId, projectId, filename);
  const versions = listInstructionVersionFiles(subscriptionId, projectId, filename).map(f => ({
    filename: f,
    saved_at: fs.statSync(path.join(dir, f)).mtime.toISOString(),
  }));
  res.json(versions);
});

// GET /api/instructions/:filename/versions/:versionFile?subscription_id=xxx&project_id=yyy — content of a specific version
instructionsRouter.get('/:filename/versions/:versionFile', (req, res) => {
  const { filename } = req.params;
  if (!filename.endsWith('.md') || filename.includes('/') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const versionFile = path.basename(req.params.versionFile);
  if (!versionFile.endsWith('.md')) return res.status(400).json({ error: 'Invalid filename' });

  const subscriptionId = req.query.subscription_id || null;
  const projectId = req.query.project_id || null;
  const filePath = path.join(instructionVersionDir(subscriptionId, projectId, filename), versionFile);
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const saved_at = fs.statSync(filePath).mtime.toISOString();
    res.json({ filename: versionFile, content, saved_at });
  } catch {
    res.status(404).json({ error: 'Version not found' });
  }
});

// PATCH /api/instructions/:filename?subscription_id=xxx&project_id=yyy — update file content
instructionsRouter.patch('/:filename', (req, res) => {
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can edit instruction files' });

  const { filename } = req.params;
  if (!filename.endsWith('.md') || filename.includes('/') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const { content, capabilities } = req.body;
  if (content === undefined) return res.status(400).json({ error: 'content is required' });

  const subscriptionId = req.query.subscription_id || null;
  const projectId = req.query.project_id || null;
  const db = getDb();
  const { dir, archivedDir } = getInstructionsDirs(subscriptionId, projectId);

  const target = fs.existsSync(path.join(dir, filename))
    ? path.join(dir, filename)
    : fs.existsSync(path.join(archivedDir, filename))
      ? path.join(archivedDir, filename)
      : null;
  if (!target) return res.status(404).json({ error: 'File not found' });

  // Content and visibility are two independent writes now — editing the text never
  // touches capabilities, and changing "Visible to" never touches the file. The file
  // itself is always written as plain content, no front matter, regardless of which
  // one changed (a legacy file that still has an embedded block gets it dropped the
  // first time either one is saved, since `content` here is already the stripped body
  // the editor showed).
  //
  // Only archive+write when content actually changed — a capabilities-only save
  // (handleCapabilitiesChange) calls this same PATCH with unchanged content, and
  // archiving on every one of those would flood the version history with identical
  // snapshots.
  let currentContent = '';
  try { currentContent = fs.readFileSync(target, 'utf8'); } catch { /* new/empty file */ }
  if (currentContent !== content) {
    archiveInstructionVersion(subscriptionId, projectId, filename, currentContent);
    fs.writeFileSync(target, content, 'utf8');
  }

  let caps = getFileCapabilities(db, subscriptionId, projectId, filename, target);
  if (Array.isArray(capabilities)) {
    caps = capabilities.filter(c => typeof c === 'string' && c.startsWith('perm_'));
    setFileCapabilities(db, subscriptionId, projectId, filename, caps);
  }
  res.json({ ok: true, capabilities: caps });
});

// POST /api/instructions?subscription_id=xxx&project_id=yyy — create a new .md file
instructionsRouter.post('/', (req, res) => {
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can create instruction files' });

  const { name, content = '', capabilities } = req.body;
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

  const caps = Array.isArray(capabilities) ? capabilities.filter(c => typeof c === 'string' && c.startsWith('perm_')) : [];
  fs.writeFileSync(filePath, content, 'utf8');
  if (caps.length) setFileCapabilities(getDb(), subscriptionId, projectId, filename, caps);
  res.status(201).json({ path: `${prefix}/${filename}`, name: safeName, archived: false, capabilities: caps, protected: false, kind: fileKind(filename, projectId) });
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

  // Protect workspace personality files — they are part of the fixed agent configuration
  if (!projectId && RUNNER_PERSONALITY_FILES.has(filename)) {
    return res.status(403).json({ error: 'This workspace file is protected — it defines agent behaviour and cannot be deleted. You can edit its content instead.', protected: true });
  }

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
    name, description, model, color = '#6366f1',
    suggested_role, template_system_prompt, permissions = [],
  } = req.body;
  const resolvedModel = model || loadModels().defaultModel;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const id = 'tpl_' + uuidv4().replace(/-/g, '').slice(0, 12);
  db.prepare(`
    INSERT INTO agent_templates (id, name, description, model, color, suggested_role, template_system_prompt, permissions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, description, resolvedModel, color, suggested_role,
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
