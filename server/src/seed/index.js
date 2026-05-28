const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const { scaffoldProjectInstructions, scaffoldSubscriptionInstructions } = require('../utils/instructions');
const { TEST_CLIENT_ID, TEST_CLIENT_NAME, MY_BOARD_ID, DEFAULT_SUB_ID } = require('../config/constants');
const agentTemplates = require('./agent-templates.json');

/**
 * Seed all default data into a fresh database.
 * Every statement uses INSERT OR IGNORE — safe to call on every server start.
 */
function seedDefaults(db) {
  seedSubscription(db);
  seedRoles(db);
  seedColumns(db);
  seedProjects(db);
  seedAgentTemplates(db);
  seedAgents(db);
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

  // Permission roles — what kind of work the agent performs
  [
    ['perm_coding',           'Coding',           'Creates and modifies code',                                                       '#ec4899'],
    ['perm_coding_tester',    'Coding Tester',    'Tests code — debugging, unit tests, integration tests',                          '#8b5cf6'],
    ['perm_code_reader',      'Code Reader',      'Reads and understands code but cannot modify it',                                '#64748b'],
    ['perm_architect',        'Architect',        'Designs system foundations and high-level structure',                            '#6366f1'],
    ['perm_migrate',          'Migration',        'Handles data migrations — only affected areas, no wider code changes',           '#f59e0b'],
    ['perm_frontend',         'Frontend',         'Frontend code changes only',                                                     '#06b6d4'],
    ['perm_backend',          'Backend',          'Backend code changes only',                                                      '#3b82f6'],
    ['perm_ux',               'UX',               'Frontend UX-specialised tasks only',                                             '#ec4899'],
    ['perm_network',          'Network',          'Network testing and external commands, locally or outside the project',         '#10b981'],
    ['perm_cloud',            'Cloud',            'Cloud environment access — checks app health, operates cloud safely',            '#0ea5e9'],
    ['perm_security_control', 'Security Control', 'Security analysis, vulnerability scanning, .env usage review, no modifications', '#ef4444'],
    ['perm_log_reader',       'Log Reader',       'Reads logs in the file system and cloud (when cloud is enabled)',                '#f97316'],
    ['perm_data_analytic',    'Data Analytics',   'Extracts and analyses data from appropriate areas of the app',                   '#84cc16'],
    ['perm_planning',         'Planning',         'Triggers the planning phase when assigned to a Backlog task',                    '#a855f7'],
  ].forEach(([id, name, description, color]) =>
    insert.run(id, name, description, '[]', color, 'permission')
  );
}

// ── Columns ───────────────────────────────────────────────────────────────────

function seedColumns(db) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO columns (id, name, position, color, is_protected) VALUES (?, ?, ?, ?, ?)`
  );
  [
    ['col_unassigned',   'Unassigned',    -1, '#f59e0b', 1],
    ['col_backlog',      'Backlog',        0, '#64748b', 1],
    ['col_inprogress',   'In Progress',    1, '#3b82f6', 1],
    ['col_testing',      'Testing',        2, '#8b5cf6', 1],
    ['col_humanaction',  'Human Action',   3, '#f59e0b', 1],
    ['col_humanreview',  'Human Review',   4, '#a855f7', 1],
    ['col_done',         'Done',           5, '#10b981', 1],
  ].forEach(c => insert.run(...c));
}

// ── Projects & test client ────────────────────────────────────────────────────

function seedProjects(db) {
  // Demo client project
  db.prepare(`
    INSERT OR IGNORE INTO projects (id, name, description, client_name, color, emoji, subscription_id)
    VALUES (?, 'Public Website', ?, ?, '#6366f1', '⚡', ?)
  `).run(TEST_CLIENT_ID, `Development of the public website of ${TEST_CLIENT_NAME}`, TEST_CLIENT_NAME, DEFAULT_SUB_ID);

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
      (id, name, description, model, color, suggested_role, system_prompt_content,
       template_system_prompt, instruction_files, permissions, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const t of agentTemplates.templates) {
    insert.run(
      t.id, t.name, t.description, t.model, t.color, t.role,
      readInstructionFile(path.basename(t.prompt_file)),
      t.template_system_prompt,
      JSON.stringify(t.instruction_files),
      JSON.stringify(t.permissions),
      JSON.stringify(t.tags || []),
    );
  }
}

// ── Default agents ────────────────────────────────────────────────────────────

function seedAgents(db) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO agents
      (id, name, role, model, description, permissions, prompt_file, instruction_files,
       is_template, template_system_prompt, color, created_from_template_id, project_id, role_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const t of agentTemplates.templates) {
    insert.run(
      t.agent_id, t.name, t.role, t.model, t.description,
      JSON.stringify(t.permissions),
      t.prompt_file,
      JSON.stringify(t.instruction_files),
      t.role === 'pm' ? 1 : 0,
      t.role === 'pm' ? t.template_system_prompt : null,
      t.color, t.id, MY_BOARD_ID,
      JSON.stringify(t.role_ids),
    );
  }
}

// ── Instruction folder scaffolding ────────────────────────────────────────────

function scaffoldInstructionFolders() {
  try { scaffoldSubscriptionInstructions(DEFAULT_SUB_ID); }
  catch (e) { console.warn('Could not scaffold subscription instructions:', e.message); }

  try { scaffoldProjectInstructions(TEST_CLIENT_ID, DEFAULT_SUB_ID); }
  catch (e) { console.warn(`Could not scaffold instructions for ${TEST_CLIENT_ID}:`, e.message); }

  try { scaffoldProjectInstructions(MY_BOARD_ID, DEFAULT_SUB_ID, null, null, true); }
  catch (e) { console.warn('Could not scaffold My Board instructions:', e.message); }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function readInstructionFile(filename) {
  const subPath  = path.join(__dirname, '../../../../instructions', DEFAULT_SUB_ID, filename);
  const rootPath = path.join(__dirname, '../../../../instructions', filename);
  try { return fs.readFileSync(subPath, 'utf8'); } catch { /* fall through */ }
  try { return fs.readFileSync(rootPath, 'utf8'); } catch { return ''; }
}

module.exports = { seedDefaults };
