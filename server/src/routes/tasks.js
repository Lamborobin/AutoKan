const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { requirePermission, attachAgent, requireAuth } = require('../middleware/auth');
const { triggerRunner } = require('../services/agentRunner');
const { broadcast } = require('../sse');
const { sendMentionEmail } = require('../services/emailService');

const router = express.Router();

// All agent auto-triggers are capability-based, not ID-based
function getAgentCapabilities(agentId, db) {
  if (!agentId) return [];
  const agent = db.prepare('SELECT role_ids FROM agents WHERE id = ?').get(agentId);
  if (!agent) return [];
  try { return JSON.parse(agent.role_ids || '[]'); }
  catch { return []; }
}

// Dynamic role-based column access check — works for system and custom columns
function canAgentBeInColumn(agentId, columnId, db) {
  if (!agentId || agentId === 'human') return true;
  if (columnId === 'col_unassigned') return true;
  const columnRoles = db.prepare(
    "SELECT id, allowed_column_ids FROM roles WHERE type = 'column_access'"
  ).all().filter(r => {
    try { return JSON.parse(r.allowed_column_ids || '[]').includes(columnId); }
    catch { return false; }
  });
  if (columnRoles.length === 0) return true; // no role restricts this column
  const agent = db.prepare('SELECT role_ids FROM agents WHERE id = ?').get(agentId);
  if (!agent) return false;
  const agentRoleIds = JSON.parse(agent.role_ids || '[]');
  if (agentRoleIds.includes('role_access_any')) return true;
  return columnRoles.some(r => agentRoleIds.includes(r.id));
}

// Helper: task is locked when it has a PM planning process underway and not yet fully approved
function isTaskLocked(task) {
  return task.pm_approval_status != null &&
    !(task.pm_approval_status === 'approved' && task.human_approval_status === 'approved');
}

function fmt(task) {
  return {
    ...task,
    tags: JSON.parse(task.tags || '[]'),
    metadata: JSON.parse(task.metadata || '{}'),
    pm_checklist: task.pm_checklist ? JSON.parse(task.pm_checklist) : null,
    is_locked: isTaskLocked(task),
  };
}

// GET /tasks — list all tasks (optionally filter by column/project), excludes archived
router.get('/', attachAgent, (req, res) => {
  const db = getDb();
  const { column_id, assigned_agent_id, include_archived, project_id } = req.query;

  let query = 'SELECT * FROM tasks WHERE 1=1';
  const params = [];

  if (!include_archived) { query += ' AND archived_at IS NULL'; }
  if (column_id) { query += ' AND column_id = ?'; params.push(column_id); }
  if (assigned_agent_id) { query += ' AND assigned_agent_id = ?'; params.push(assigned_agent_id); }
  if (project_id) { query += ' AND project_id = ?'; params.push(project_id); }

  query += ' ORDER BY created_at DESC';
  const tasks = db.prepare(query).all(...params);

  res.json(tasks.map(t => ({
    ...t,
    tags: JSON.parse(t.tags || '[]'),
    metadata: JSON.parse(t.metadata || '{}'),
    pm_checklist: t.pm_checklist ? JSON.parse(t.pm_checklist) : null,
    is_locked: isTaskLocked(t),
  })));
});

// GET /tasks/:id
router.get('/:id', attachAgent, (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const logs = db.prepare(`
    SELECT tl.*, a.name as agent_name, a.role as agent_role
    FROM task_logs tl
    LEFT JOIN agents a ON tl.agent_id = a.id
    WHERE tl.task_id = ?
    ORDER BY tl.created_at ASC
  `).all(task.id);

  res.json({
    ...task,
    tags: JSON.parse(task.tags || '[]'),
    metadata: JSON.parse(task.metadata || '{}'),
    pm_checklist: task.pm_checklist ? JSON.parse(task.pm_checklist) : null,
    is_locked: isTaskLocked(task),
    logs
  });
});

// POST /tasks — create task (PM or human only)
router.post('/', requirePermission('task:create'), (req, res) => {
  const db = getDb();
  const {
    title, description, acceptance_criteria, column_id = 'col_backlog',
    assigned_agent_id, priority = 'medium', complexity = 'medium',
    auto_complete = 0, project_id,
    tags = [], metadata = {}
  } = req.body;

  if (!title) return res.status(400).json({ error: 'title is required' });

  // Verify column exists
  const col = db.prepare('SELECT id FROM columns WHERE id = ?').get(column_id);
  if (!col) return res.status(400).json({ error: 'Invalid column_id' });

  // Use provided project_id (required from frontend; agents pass theirs explicitly)
  const resolvedProject = project_id || null;

  const id = 'task_' + uuidv4().replace(/-/g, '').slice(0, 12);

  // If a planning-capable agent is assigned at creation time in Backlog, auto-request planning review
  let pmReviewStatus = null;
  const createCapabilities = getAgentCapabilities(assigned_agent_id, db);
  if (column_id === 'col_backlog' && assigned_agent_id && createCapabilities.includes('perm_planning')) {
    pmReviewStatus = 'pending';
  }

  db.prepare(`
    INSERT INTO tasks (id, title, description, acceptance_criteria, column_id, assigned_agent_id, priority, complexity, auto_complete, tags, metadata, pm_approval_status, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, description, acceptance_criteria || null, column_id, assigned_agent_id || null, priority, complexity,
    auto_complete ? 1 : 0, JSON.stringify(tags), JSON.stringify(metadata), pmReviewStatus, resolvedProject);

  // Log it
  const agentId = req.agent && db.prepare('SELECT id FROM agents WHERE id = ?').get(req.agent.id) ? req.agent.id : null;
  db.prepare(`
    INSERT INTO task_logs (id, task_id, agent_id, action, to_column, message)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), id, agentId, 'created', column_id, `Task created by ${req.agent?.name || req.agent?.role || 'unknown'}`);

  // Log PM review request if auto-triggered
  if (pmReviewStatus === 'pending') {
    db.prepare(`
      INSERT INTO task_logs (id, task_id, agent_id, action, message)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), id, agentId, 'pm_review_requested', 'PM review automatically requested on task creation');
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  const fmtTask = fmt(task);
  res.status(201).json(fmtTask);
  broadcast('task_updated', { task: fmtTask });

  // Trigger registered runner asynchronously after response is sent
  if (pmReviewStatus === 'pending') triggerRunner(id);
});

// PATCH /tasks/:id — update task fields
router.patch('/:id', requirePermission('task:update'), (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  // Validate assignment restrictions via role-based rules
  if (req.body.assigned_agent_id !== undefined) {
    if (!canAgentBeInColumn(req.body.assigned_agent_id, task.column_id, db)) {
      return res.status(403).json({
        error: `Agent ${req.body.assigned_agent_id} does not have the required role for column ${task.column_id}`,
      });
    }
  }

  const agent = req.agent;
  const permissions = agent.permissions;
  const hasFullUpdate = permissions.includes('task:update') || permissions.includes('*');
  const hasStatusUpdate = permissions.includes('task:update:status') || permissions.includes('*');
  const hasProgressUpdate = permissions.includes('task:update:progress') || permissions.includes('task:update') || permissions.includes('*');

  // Content fields are locked while task is in PM planning phase
  const locked = isTaskLocked(task);
  const CONTENT_FIELDS = ['title', 'description', 'acceptance_criteria', 'priority', 'complexity', 'tags', 'metadata', 'assigned_agent_id', 'recommended_model'];
  const tryingContentEdit = CONTENT_FIELDS.some(f => req.body[f] !== undefined);
  if (locked && tryingContentEdit && !permissions.includes('*')) {
    return res.status(409).json({
      error: 'Task is locked in planning phase. Content cannot be edited until PM and human have approved.',
      is_locked: true,
    });
  }

  const allowed = {};

  // PM/human can update everything (when not locked, or when human overrides)
  if (hasFullUpdate) {
    const { title, description, acceptance_criteria, priority, complexity, auto_complete, tags, metadata, assigned_agent_id, recommended_model } = req.body;
    if (title !== undefined) allowed.title = title;
    if (description !== undefined) allowed.description = description;
    if (acceptance_criteria !== undefined) allowed.acceptance_criteria = acceptance_criteria;
    if (priority !== undefined) allowed.priority = priority;
    if (complexity !== undefined) allowed.complexity = complexity;
    if (auto_complete !== undefined) allowed.auto_complete = auto_complete ? 1 : 0;
    if (tags !== undefined) allowed.tags = JSON.stringify(tags);
    if (metadata !== undefined) allowed.metadata = JSON.stringify(metadata);
    if (assigned_agent_id !== undefined) allowed.assigned_agent_id = assigned_agent_id;
    if (recommended_model !== undefined) allowed.recommended_model = recommended_model;
  }

  // All agents with update:status or progress
  const { progress } = req.body;
  if (progress !== undefined && hasProgressUpdate) {
    allowed.progress = Math.min(100, Math.max(0, parseInt(progress)));
  }

  if (Object.keys(allowed).length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided' });
  }

  const setClauses = Object.keys(allowed).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE tasks SET ${setClauses} WHERE id = ?`).run(...Object.values(allowed), task.id);

  const agentId = agent && db.prepare('SELECT id FROM agents WHERE id = ?').get(agent.id) ? agent.id : null;
  db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
    .run(uuidv4(), task.id, agentId, 'updated', `Fields updated: ${Object.keys(allowed).join(', ')}`);

  // Trigger registered runner if assignment changed and task is in a column
  // where the agent's capability has a registered runner. PM-specific bookkeeping
  // (pm_approval_status = pending) still happens here because it's a precondition
  // the planning runner reads.
  let shouldTrigger = false;
  if (req.body.assigned_agent_id !== undefined) {
    const newAgentId = req.body.assigned_agent_id;
    const capabilities = getAgentCapabilities(newAgentId, db);
    if (task.column_id === 'col_backlog' && capabilities.includes('perm_planning') && !task.pm_approval_status) {
      db.prepare(`UPDATE tasks SET pm_approval_status = 'pending' WHERE id = ?`).run(task.id);
      db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
        .run(uuidv4(), task.id, agentId, 'pm_review_requested', 'PM review automatically requested on assignment');
      shouldTrigger = true;
    } else if (task.column_id === 'col_inprogress' && capabilities.includes('perm_coding')) {
      db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
        .run(uuidv4(), task.id, agentId, 'developer_assigned', 'Developer assigned — starting implementation');
      shouldTrigger = true;
    } else if (task.column_id === 'col_testing' && capabilities.includes('perm_coding_tester')) {
      db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
        .run(uuidv4(), task.id, agentId, 'tester_assigned', 'Tester assigned — starting test run');
      shouldTrigger = true;
    }
  }

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
  const fmtUpdated = fmt(updated);
  res.json(fmtUpdated);
  broadcast('task_updated', { task: fmtUpdated });

  if (shouldTrigger) triggerRunner(task.id);
});

// POST /tasks/:id/move — move task to a different column
router.post('/:id/move', requirePermission('task:move'), (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { column_id, message } = req.body;
  if (!column_id) return res.status(400).json({ error: 'column_id is required' });

  const col = db.prepare('SELECT id FROM columns WHERE id = ?').get(column_id);
  if (!col) return res.status(400).json({ error: 'Invalid column_id' });

  // Locked tasks cannot move until PM + human both approve — humans can always override
  const agentIdHeader = req.headers['x-agent-id'];
  if (isTaskLocked(task) && agentIdHeader !== 'human') {
    return res.status(409).json({
      error: 'Task is locked in planning phase. Complete PM review and human sign-off before moving.',
      is_locked: true,
      pm_approved: task.pm_approval_status === 'approved',
      human_approved: task.human_approval_status === 'approved',
    });
  }

  // Block move if the task's assigned agent doesn't have column access
  if (task.assigned_agent_id && task.assigned_agent_id !== 'human') {
    if (!canAgentBeInColumn(task.assigned_agent_id, column_id, db)) {
      const agent = db.prepare('SELECT name FROM agents WHERE id = ?').get(task.assigned_agent_id);
      return res.status(403).json({
        error: `${agent?.name || task.assigned_agent_id} does not have access to that column. Re-assign the task first or grant the agent column access.`,
        agent_column_mismatch: true,
      });
    }
  }

  const fromColumn = task.column_id;
  db.prepare('UPDATE tasks SET column_id = ? WHERE id = ?').run(column_id, task.id);

  const agentId = req.agent && db.prepare('SELECT id FROM agents WHERE id = ?').get(req.agent.id) ? req.agent.id : null;
  db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, from_column, to_column, message) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(uuidv4(), task.id, agentId, 'moved', fromColumn, column_id, message || `Moved by ${req.agent?.name || req.agent?.role || 'unknown'}`);

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);

  // Column moves do NOT trigger runners. Runner dispatch is the responsibility of
  // assignment events only (PATCH /tasks/:id with assigned_agent_id, or task creation
  // with an agent already assigned). A move just relocates the task — to (re)start
  // a runner on it, re-assign the agent from the dropdown.

  const fmtUpdated = fmt(updated);
  res.json(fmtUpdated);
  broadcast('task_updated', { task: fmtUpdated });
});

// POST /tasks/:id/toggle_checklist_item — human manually checks/unchecks a checklist item
router.post('/:id/toggle_checklist_item', requirePermission('task:update'), (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const checklist = JSON.parse(task.pm_checklist || '[]');
  const { index } = req.body;

  if (typeof index !== 'number' || index < 0 || index >= checklist.length) {
    return res.status(400).json({ error: 'Invalid checklist index' });
  }

  const nowResolved = !checklist[index].resolved;
  checklist[index] = { ...checklist[index], resolved: nowResolved, manuallyResolved: nowResolved || undefined };
  db.prepare('UPDATE tasks SET pm_checklist = ? WHERE id = ?').run(JSON.stringify(checklist), task.id);

  const agentId = req.agent?.id || null;
  const item = checklist[index];
  db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
    .run(uuidv4(), task.id, agentId, 'updated',
      `Checklist: "${item.item}" manually ${item.resolved ? 'checked' : 'unchecked'}`);

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
  const fmtUpdated = { ...fmt(updated), pm_checklist: checklist };
  res.json(fmtUpdated);
  broadcast('task_updated', { task: fmtUpdated });

  // Trigger PM to re-evaluate, but only if PM is actively reviewing and not waiting for human to answer
  if (task.pm_approval_status && task.pm_approval_status !== 'approved' && !updated.pm_pending_question) {
    triggerRunner(task.id);
  }
});

// POST /tasks/:id/log — add a log entry
router.post('/:id/log', requirePermission('task:log'), (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { action = 'note', message } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  const agentId = req.agent && db.prepare('SELECT id FROM agents WHERE id = ?').get(req.agent.id) ? req.agent.id : null;
  db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
    .run(uuidv4(), task.id, agentId, action, message);

  res.json({ ok: true });
});

// POST /tasks/:id/request_human — flag task for human action
router.post('/:id/request_human', requirePermission('task:request_human'), (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { reason } = req.body;
  const fromColumn = task.column_id;

  db.prepare(`UPDATE tasks SET column_id = 'col_humanaction', requires_human_action = 1, human_action_reason = ? WHERE id = ?`)
    .run(reason || 'Human action required', task.id);

  const agentId = req.agent && db.prepare('SELECT id FROM agents WHERE id = ?').get(req.agent.id) ? req.agent.id : null;
  db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, from_column, to_column, message) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(uuidv4(), task.id, agentId, 'human_action_requested', fromColumn, 'col_humanaction', reason || 'Human action required');

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
  res.json({ ok: true, message: 'Task flagged for human action' });
  broadcast('task_updated', { task: fmt(updated) });
});

// POST /tasks/:id/approve_pr — human approves the PR, moves task to Testing
router.post('/:id/approve_pr', requirePermission('task:approve'), (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.column_id !== 'col_humanaction') return res.status(400).json({ error: 'Task is not in Human Action' });
  if (!task.pr_url) return res.status(400).json({ error: 'No PR URL on this task' });

  db.prepare(`UPDATE tasks SET column_id = 'col_testing', requires_human_action = 0, human_action_reason = NULL WHERE id = ?`)
    .run(task.id);

  db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, from_column, to_column, message) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(uuidv4(), task.id, 'human', 'pr_approved', 'col_humanaction', 'col_testing', `PR approved, moved to Testing`);

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
  const fmtUpdated = fmt(updated);
  res.json(fmtUpdated);
  broadcast('task_updated', { task: fmtUpdated });
});

// GET /tasks/:id/check_pr — check GitHub; if merged, auto-advance to Testing
router.get('/:id/check_pr', requirePermission('task:approve'), async (req, res, next) => {
  try {
    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!task.pr_url) return res.json({ merged: false });

    const prMatch = task.pr_url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!prMatch) return res.json({ merged: false });

    const [, owner, repo, prNumber] = prMatch;
    const headers = { 'User-Agent': 'AutoKan', 'Accept': 'application/vnd.github.v3+json' };
    if (process.env.GITHUB_TOKEN) headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;

    let prData = null;
    try {
      const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, { headers });
      if (resp.ok) prData = await resp.json();
    } catch { /* network error — treat as not merged */ }

    if (!prData || !prData.merged_at) return res.json({ merged: false });

    // Always record the pr_approved event so the UI knows not to re-check on future opens
    const alreadyLogged = db.prepare(`SELECT id FROM task_logs WHERE task_id = ? AND action = 'pr_approved'`).get(task.id);
    if (!alreadyLogged) {
      db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, from_column, to_column, message) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(uuidv4(), task.id, null, 'pr_approved', task.column_id, 'col_testing', 'PR merged on GitHub');
    }

    if (task.column_id === 'col_humanaction') {
      db.prepare(`UPDATE tasks SET column_id = 'col_testing', requires_human_action = 0, human_action_reason = NULL WHERE id = ?`)
        .run(task.id);
    }

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
    const fmtUpdated = fmt(updated);
    res.json({ merged: true, task: fmtUpdated });
    broadcast('task_updated', { task: fmtUpdated });
  } catch (err) {
    next(err);
  }
});

// POST /tasks/:id/pm_question — PM posts a clarifying question
router.post('/:id/pm_question', requirePermission('task:update'), (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'question is required' });

  db.prepare(`UPDATE tasks SET pm_approval_status = 'questioning', pm_pending_question = ? WHERE id = ?`)
    .run(question, task.id);

  const agentId = req.agent && db.prepare('SELECT id FROM agents WHERE id = ?').get(req.agent.id) ? req.agent.id : null;
  db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
    .run(uuidv4(), task.id, agentId, 'pm_question', question);

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
  const fmtUpdated = fmt(updated);
  res.json(fmtUpdated);
  broadcast('task_updated', { task: fmtUpdated });
});

// POST /tasks/:id/answer — human answers PM's pending question
router.post('/:id/answer', requirePermission('task:update'), (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (!task.pm_pending_question) {
    return res.status(400).json({ error: 'No pending question from PM' });
  }

  const { answer } = req.body;
  if (!answer) return res.status(400).json({ error: 'answer is required' });

  // Clear pending question, keep status as 'questioning' (PM will read and decide next)
  db.prepare(`UPDATE tasks SET pm_pending_question = NULL WHERE id = ?`).run(task.id);

  const agentId = req.agent && db.prepare('SELECT id FROM agents WHERE id = ?').get(req.agent.id) ? req.agent.id : null;
  db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
    .run(uuidv4(), task.id, agentId, 'human_answer', answer);

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
  const fmtUpdated = fmt(updated);
  res.json(fmtUpdated);
  broadcast('task_updated', { task: fmtUpdated });

  // Re-trigger PM agent to continue conversation
  triggerRunner(task.id);
});

// POST /tasks/:id/request_pm_review — request PM review (human initiates)
router.post('/:id/request_pm_review', requirePermission('task:update'), (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (task.column_id !== 'col_backlog') {
    return res.status(400).json({ error: 'PM review can only be requested in Backlog' });
  }

  db.prepare(`UPDATE tasks SET pm_approval_status = 'pending' WHERE id = ?`).run(task.id);

  const agentId = req.agent && db.prepare('SELECT id FROM agents WHERE id = ?').get(req.agent.id) ? req.agent.id : null;
  db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
    .run(uuidv4(), task.id, agentId, 'pm_review_requested', 'PM review requested');

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
  const fmtUpdated = fmt(updated);
  res.json(fmtUpdated);
  broadcast('task_updated', { task: fmtUpdated });
});

// POST /tasks/:id/pm_review — PM submits review
router.post('/:id/pm_review', requirePermission('task:update'), (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { comment, approved } = req.body;
  if (approved === undefined) return res.status(400).json({ error: 'approved field is required' });

  const status = approved ? 'approved' : 'rejected';
  db.prepare(`UPDATE tasks SET pm_approval_status = ?, pm_review_comment = ?, pm_review_date = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(status, comment || null, task.id);

  const agentId = req.agent && db.prepare('SELECT id FROM agents WHERE id = ?').get(req.agent.id) ? req.agent.id : null;
  db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
    .run(uuidv4(), task.id, agentId, 'pm_reviewed', `PM review: ${approved ? 'approved' : 'rejected'} - ${comment || ''}`);

  if (agentId) {
    db.prepare(`INSERT INTO task_approvals (id, task_id, approver_id, approval_type, status, comment) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(uuidv4(), task.id, agentId, 'pm_review', status, comment || null);
  }

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
  const fmtUpdated = fmt(updated);
  res.json(fmtUpdated);
  broadcast('task_updated', { task: fmtUpdated });
});

// POST /tasks/:id/approve — human approves task
router.post('/:id/approve', requirePermission('task:update'), (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (!task.pm_approval_status) {
    return res.status(400).json({ error: 'PM review must be requested before human approval' });
  }

  if (task.pm_approval_status !== 'approved') {
    return res.status(400).json({ error: 'PM must approve before human approval' });
  }

  const { comment } = req.body;
  db.prepare(`UPDATE tasks SET human_approval_status = 'approved', human_review_comment = ?, human_review_date = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(comment || null, task.id);

  const agentId = req.agent && db.prepare('SELECT id FROM agents WHERE id = ?').get(req.agent.id) ? req.agent.id : null;
  db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
    .run(uuidv4(), task.id, agentId, 'human_approved', `Human approval granted - ${comment || ''}`);

  // Only insert to task_approvals if there's a valid agent_id
  if (agentId) {
    db.prepare(`INSERT INTO task_approvals (id, task_id, approver_id, approval_type, status, comment) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(uuidv4(), task.id, agentId, 'human_approval', 'approved', comment || null);
  }

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
  const fmtUpdated = fmt(updated);
  res.json(fmtUpdated);
  broadcast('task_updated', { task: fmtUpdated });
});

// POST /tasks/:id/reject — human rejects task
router.post('/:id/reject', requirePermission('task:update'), (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { comment } = req.body;
  if (!comment) return res.status(400).json({ error: 'comment is required for rejection' });

  db.prepare(`UPDATE tasks SET human_approval_status = 'rejected', human_review_comment = ?, human_review_date = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(comment, task.id);

  const agentId = req.agent && db.prepare('SELECT id FROM agents WHERE id = ?').get(req.agent.id) ? req.agent.id : null;
  db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
    .run(uuidv4(), task.id, agentId, 'human_rejected', `Human rejection: ${comment}`);

  if (agentId) {
    db.prepare(`INSERT INTO task_approvals (id, task_id, approver_id, approval_type, status, comment) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(uuidv4(), task.id, agentId, 'human_approval', 'rejected', comment);
  }

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
  const fmtUpdated = fmt(updated);
  res.json(fmtUpdated);
  broadcast('task_updated', { task: fmtUpdated });
});

// POST /tasks/:id/archive — archive a task (human only)
router.post('/:id/archive', attachAgent, (req, res) => {
  if (req.agent?.id !== 'human') return res.status(403).json({ error: 'Only humans can archive tasks' });
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  db.prepare('UPDATE tasks SET archived_at = CURRENT_TIMESTAMP WHERE id = ?').run(task.id);
  db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
    .run(uuidv4(), task.id, null, 'archived', 'Task archived by human');

  res.json({ ok: true });
  broadcast('task_archived', { id: task.id });
});

// POST /tasks/:id/unarchive — restore an archived task (human only)
router.post('/:id/unarchive', attachAgent, (req, res) => {
  if (req.agent?.id !== 'human') return res.status(403).json({ error: 'Only humans can unarchive tasks' });
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  db.prepare('UPDATE tasks SET archived_at = NULL WHERE id = ?').run(task.id);
  db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
    .run(uuidv4(), task.id, null, 'updated', 'Task restored from archive by human');

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
  const fmtUpdated = fmt(updated);
  res.json(fmtUpdated);
  broadcast('task_updated', { task: fmtUpdated });
});

// POST /tasks/:id/bypass_pm — human overrides PM lock and unlocks the task
router.post('/:id/bypass_pm', attachAgent, (req, res) => {
  if (req.agent?.id !== 'human') return res.status(403).json({ error: 'Only humans can bypass PM checks' });
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  db.prepare(`
    UPDATE tasks
    SET pm_approval_status = 'approved', human_approval_status = 'approved',
        pm_review_comment = 'Bypassed by human override',
        pm_review_date = CURRENT_TIMESTAMP, human_review_date = CURRENT_TIMESTAMP,
        pm_pending_question = NULL
    WHERE id = ?
  `).run(task.id);

  db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
    .run(uuidv4(), task.id, null, 'pm_bypassed', 'PM planning checks bypassed by human override');

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
  const fmtUpdated = { ...fmt(updated), is_locked: false };
  res.json(fmtUpdated);
  broadcast('task_updated', { task: fmtUpdated });
});

// DELETE /tasks/:id
router.delete('/:id', requirePermission('task:delete'), (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (task.human_approval_status === 'approved') {
    return res.status(409).json({
      error: 'Task has been through the approval pipeline — archive it instead to preserve history.',
      has_dependencies: true,
    });
  }

  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ ok: true, deleted: true });
  broadcast('task_deleted', { id: req.params.id });
});

// ── Task Comments ────────────────────────────────────────────────────────────

// GET /api/tasks/:id/comments
router.get('/:id/comments', attachAgent, (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const comments = db.prepare(`
    SELECT tc.id, tc.task_id, tc.user_id, tc.content, tc.created_at, tc.updated_at,
           u.first_name, u.last_name, u.picture, u.email
    FROM task_comments tc
    JOIN users u ON tc.user_id = u.id
    WHERE tc.task_id = ?
    ORDER BY tc.created_at ASC
  `).all(req.params.id);

  res.json(comments);
});

// POST /api/tasks/:id/comments
router.post('/:id/comments', requireAuth, (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Comment content is required' });
  }

  const db = getDb();
  const task = db.prepare('SELECT id, title FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const id = 'cmt_' + uuidv4().replace(/-/g, '').slice(0, 12);
  db.prepare(`
    INSERT INTO task_comments (id, task_id, user_id, content) VALUES (?, ?, ?, ?)
  `).run(id, req.params.id, req.user.sub, content.trim());

  const comment = db.prepare(`
    SELECT tc.id, tc.task_id, tc.user_id, tc.content, tc.created_at, tc.updated_at,
           u.first_name, u.last_name, u.picture, u.email
    FROM task_comments tc
    JOIN users u ON tc.user_id = u.id
    WHERE tc.id = ?
  `).get(id);

  // Parse @[Name](user_id) mentions and send email notifications (fire-and-forget)
  const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
  const mentionedUserIds = new Set();
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    const userId = match[2];
    mentionedUserIds.add(userId);
  }

  if (mentionedUserIds.size > 0) {
    const commenterName = `${comment.first_name || ''} ${comment.last_name || ''}`.trim() || comment.email;
    const excerpt = content.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1').slice(0, 200);
    for (const userId of mentionedUserIds) {
      const mentionedUser = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
      if (mentionedUser?.email) {
        console.log(`[mention] Sending email to ${mentionedUser.email} for mention in "${task.title}"`);
        sendMentionEmail(mentionedUser.email, commenterName, task.title, excerpt, task.id)
          .then(() => console.log(`[mention] Email sent OK to ${mentionedUser.email}`))
          .catch(err => console.error(`[mention] Email FAILED to ${mentionedUser.email}:`, err.message));
      }
    }
  }

  res.status(201).json(comment);
});

// PATCH /api/tasks/:id/comments/:commentId
router.patch('/:id/comments/:commentId', requireAuth, (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Comment content is required' });
  }

  const db = getDb();
  const comment = db.prepare('SELECT * FROM task_comments WHERE id = ? AND task_id = ?')
    .get(req.params.commentId, req.params.id);

  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.user_id !== req.user.sub) {
    return res.status(403).json({ error: 'You can only edit your own comments' });
  }

  db.prepare('UPDATE task_comments SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(content.trim(), req.params.commentId);

  const updated = db.prepare(`
    SELECT tc.id, tc.task_id, tc.user_id, tc.content, tc.created_at, tc.updated_at,
           u.first_name, u.last_name, u.picture, u.email
    FROM task_comments tc
    JOIN users u ON tc.user_id = u.id
    WHERE tc.id = ?
  `).get(req.params.commentId);

  res.json(updated);
});

// DELETE /api/tasks/:id/comments/:commentId
router.delete('/:id/comments/:commentId', requireAuth, (req, res) => {
  const db = getDb();
  const comment = db.prepare('SELECT * FROM task_comments WHERE id = ? AND task_id = ?')
    .get(req.params.commentId, req.params.id);

  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.user_id !== req.user.sub) {
    return res.status(403).json({ error: 'You can only delete your own comments' });
  }

  db.prepare('DELETE FROM task_comments WHERE id = ?').run(req.params.commentId);
  res.json({ ok: true });
});

module.exports = router;
