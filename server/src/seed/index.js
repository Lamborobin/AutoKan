const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const { scaffoldProjectInstructions, scaffoldSubscriptionInstructions } = require('../utils/instructions');
const { TEST_CLIENT_ID, TEST_CLIENT_NAME, MY_BOARD_ID, DEFAULT_SUB_ID } = require('../config/constants');
const agentTemplates = require('./agent-templates.json');
const runnersRegistry = require('./runners.json');

/**
 * Seed all default data into a fresh database.
 *
 * RULES FOR EDITING THIS FILE:
 * 1. Every insert uses INSERT OR IGNORE — `seedDefaults` runs on every
 *    server start (via getDb's first-call init) and must stay idempotent.
 * 2. NEVER use unconditional UPDATE on rows the user can edit through the UI
 *    (template_system_prompt, system_prompt, etc.). Use
 *    `WHERE ... IS NULL` guards so customisations survive restarts.
 * 3. Schema changes belong in `server/src/db/index.js`, not here — and they
 *    require a user-initiated `npm run db:reset` (see docs/rules.md → DB).
 */
function seedDefaults(db) {
  seedSubscription(db);
  seedRoles(db);
  seedColumns(db);
  seedProjects(db);
  seedAgentTemplates(db);
  seedAgents(db);
  seedVelourAgents(db);
  scaffoldInstructionFolders();
}

// ── Subscription ─────────────────────────────────────────────────────────────

function seedSubscription(db) {
  db.prepare(`INSERT OR IGNORE INTO subscriptions (id, name) VALUES (?, 'My Workspace')`)
    .run(DEFAULT_SUB_ID);
}

// ── Roles ─────────────────────────────────────────────────────────────────────

function seedRoles(db) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO roles (id, name, description, allowed_column_ids, color, is_system, type) VALUES (?, ?, ?, ?, ?, 1, ?)`
  );

  // Column-access roles — one per workable column
  [
    ['role_access_backlog',     'Backlog',      'Can be assigned to Backlog tasks',      JSON.stringify(['col_backlog']),     '#64748b', 'column_access'],
    ['role_access_inprogress',  'In Progress',  'Can be assigned to In Progress tasks',  JSON.stringify(['col_inprogress']),  '#3b82f6', 'column_access'],
    ['role_access_testing',     'Testing',      'Can be assigned to Testing tasks',      JSON.stringify(['col_testing']),     '#8b5cf6', 'column_access'],
    ['role_access_humanaction', 'Human Action', 'Can be assigned to Human Action tasks', JSON.stringify(['col_humanaction']), '#f59e0b', 'column_access'],
    ['role_access_done',        'Done',         'Can be assigned to Done tasks',         JSON.stringify(['col_done']),        '#10b981', 'column_access'],
    ['role_access_any',         'All Columns',  'Can be assigned to any column',         JSON.stringify([]),                  '#6b7280', 'column_access'],
  ].forEach(r => insert.run(...r));

  // Permission roles — capabilities, sourced from runners.json registry
  for (const cap of runnersRegistry.capabilities) {
    insert.run(cap.id, cap.label, cap.description, '[]', cap.color, 'permission');
  }
}

// ── Columns ───────────────────────────────────────────────────────────────────

function seedColumns(db) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO columns (id, name, position, color, is_protected) VALUES (?, ?, ?, ?, ?)`
  );
  [
    ['col_unassigned',  'Unassigned',   -1, '#f59e0b', 1],
    ['col_backlog',     'Backlog',       0, '#64748b', 1],
    ['col_inprogress',  'In Progress',   1, '#3b82f6', 1],
    ['col_testing',     'Testing',       2, '#8b5cf6', 1],
    ['col_humanaction', 'Human Action',  3, '#f59e0b', 1],
    ['col_done',        'Done',          4, '#10b981', 1],
  ].forEach(c => insert.run(...c));
}

// ── Projects & test client ────────────────────────────────────────────────────

function seedProjects(db) {
  // Demo client project — pre-connected to the seeded client/Velour folder
  db.prepare(`
    INSERT OR IGNORE INTO projects (id, name, description, client_name, client_path, color, emoji, subscription_id)
    VALUES (?, 'Public Website', ?, ?, ?, '#6366f1', '⚡', ?)
  `).run(TEST_CLIENT_ID, `Development of the public website of ${TEST_CLIENT_NAME}`, TEST_CLIENT_NAME, `client/${TEST_CLIENT_NAME}`, DEFAULT_SUB_ID);

  // Default personal board (claimed by first user who logs in)
  db.prepare(`
    INSERT OR IGNORE INTO projects (id, name, description, color, emoji, subscription_id)
    VALUES (?, 'My Board', 'Personal workspace', '#6366f1', '🗂️', ?)
  `).run(MY_BOARD_ID, DEFAULT_SUB_ID);

  // Seed the client entity and link it to the demo project
  let client = db.prepare('SELECT id FROM clients WHERE name = ? AND subscription_id = ?')
    .get(TEST_CLIENT_NAME, DEFAULT_SUB_ID);
  if (!client) {
    const clientId = 'client_' + crypto.randomBytes(6).toString('hex');
    db.prepare('INSERT INTO clients (id, name, subscription_id) VALUES (?, ?, ?)')
      .run(clientId, TEST_CLIENT_NAME, DEFAULT_SUB_ID);
    client = { id: clientId };
  }
  db.prepare('UPDATE projects SET client_id = ? WHERE id = ? AND client_id IS NULL')
    .run(client.id, TEST_CLIENT_ID);
}

// ── Agent templates ───────────────────────────────────────────────────────────

function seedAgentTemplates(db) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO agent_templates
      (id, name, description, model, color, suggested_role,
       template_system_prompt, permissions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const t of agentTemplates.templates) {
    insert.run(
      t.id, t.name, t.description, t.model, t.color, t.role,
      t.template_system_prompt,
      JSON.stringify(t.permissions),
    );
  }
}

// ── Default agents ────────────────────────────────────────────────────────────

function seedAgents(db) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO agents
      (id, name, role, model, description, permissions, personality_file,
       is_template, system_prompt, color, created_from_template_id, project_id, role_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const t of agentTemplates.templates) {
    // is_template = 1 whenever the template defines a personality (it also drives
    // the template "T" badge in the UI). system_prompt left null — the agent has
    // no per-instance override until a user edits it via the UI.
    const inheritsFromTemplate = !!t.template_system_prompt;
    insert.run(
      t.agent_id, t.name, t.role, t.model, t.description,
      JSON.stringify(t.permissions),
      t.personality_file || null,
      inheritsFromTemplate ? 1 : 0,
      null,
      t.color, t.id, MY_BOARD_ID,
      JSON.stringify(t.role_ids),
    );
  }
}

// ── Velour board agents ───────────────────────────────────────────────────────

function seedVelourAgents(db) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO agents
      (id, name, role, model, description, permissions, personality_file,
       is_template, system_prompt, color, created_from_template_id, project_id, role_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const a of agentTemplates.velour_agents) {
    const tpl = agentTemplates.templates.find(t => t.id === a.template_id);
    if (!tpl) continue;
    insert.run(
      a.id, a.name, a.role, a.model, a.description,
      JSON.stringify(tpl.permissions),
      tpl.personality_file || null,
      tpl.template_system_prompt ? 1 : 0,
      null,
      a.color, a.template_id, TEST_CLIENT_ID,
      JSON.stringify(a.role_ids),
    );
  }
}

// ── Instruction folder scaffolding ────────────────────────────────────────────

// Demo content for the seeded board's context files — kept as editable markdown
// in this folder (demo-client.md / demo-project.md) and read at seed time. New
// boards scaffold blank placeholders instead; this richer text is demo-only.
function readSeedDoc(filename) {
  try { return fs.readFileSync(path.join(__dirname, filename), 'utf8'); }
  catch { return null; }
}

function scaffoldInstructionFolders() {
  try { scaffoldSubscriptionInstructions(DEFAULT_SUB_ID); }
  catch (e) { console.warn('Could not scaffold subscription instructions:', e.message); }

  try { scaffoldProjectInstructions(TEST_CLIENT_ID, DEFAULT_SUB_ID, readSeedDoc('demo-client.md'), readSeedDoc('demo-project.md')); }
  catch (e) { console.warn(`Could not scaffold instructions for ${TEST_CLIENT_ID}:`, e.message); }

  try { scaffoldProjectInstructions(MY_BOARD_ID, DEFAULT_SUB_ID, null, null, true); }
  catch (e) { console.warn('Could not scaffold My Board instructions:', e.message); }
}

module.exports = { seedDefaults };
