const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const { scaffoldProjectInstructions, scaffoldSubscriptionInstructions } = require('../utils/instructions');
const { TEST_CLIENT_ID, TEST_CLIENT_NAME, MY_BOARD_ID, DEFAULT_SUB_ID, STEEL_CLIENT_ID, STEEL_CLIENT_NAME, HEALTH_CLIENT_ID, HEALTH_CLIENT_NAME, FINANCE_CLIENT_ID, FINANCE_CLIENT_NAME, NORDVIK_CLIENT_ID, NORDVIK_CLIENT_NAME, BENCH_SANDBOX_ID, BENCH_SANDBOX_NAME } = require('../config/constants');
const INSTRUCTIONS_ROOT = path.join(__dirname, '../../../instructions');
const agentTemplates = require('./agent-templates.json');
const runnersRegistry = require('./runners.json');
const sectorsRegistry = require('./sectors.json');

// Hidden-capability list for a sector = the capability registry minus the
// sector's allow-list. A null allow-list means expose everything (hidden = []).
// Deriving from the registry means a capability added later is hidden by default
// on restricted sectors rather than leaking in.
function hiddenCapsForSector(sectorId) {
  const sector = sectorsRegistry.sectors.find(s => s.id === sectorId);
  if (!sector || !sector.capabilities) return [];
  return runnersRegistry.capabilities
    .map(c => c.id)
    .filter(id => !sector.capabilities.includes(id));
}

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
  seedVelourAgents(db);
  seedSteelFactory(db);
  seedHealthcare(db);
  seedFinance(db);
  seedNordvik(db);
  seedBenchmarkSandbox(db);
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
    INSERT OR IGNORE INTO projects (id, name, description, client_name, client_path, color, emoji, subscription_id, sector, hidden_capability_ids)
    VALUES (?, 'Public Website', ?, ?, ?, '#6366f1', '⚡', ?, 'software', ?)
  `).run(TEST_CLIENT_ID, `Development of the public website of ${TEST_CLIENT_NAME}`, TEST_CLIENT_NAME, `client/${TEST_CLIENT_NAME}`, DEFAULT_SUB_ID, JSON.stringify(hiddenCapsForSector('software')));

  // Default personal board (claimed by first user who logs in)
  db.prepare(`
    INSERT OR IGNORE INTO projects (id, name, description, color, emoji, subscription_id, sector, hidden_capability_ids)
    VALUES (?, 'My Board', 'Personal workspace', '#6366f1', '🗂️', ?, 'personal', ?)
  `).run(MY_BOARD_ID, DEFAULT_SUB_ID, JSON.stringify(hiddenCapsForSector('personal')));

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

// The personal board (My Board) is seeded with NO agents — it starts empty so the
// owner builds their own. Agent templates are still seeded into the template library
// (seedAgentTemplates) for instantiation; they're just not auto-placed on any board.

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

// ── Steel factory demo board ──────────────────────────────────────────────────

function seedSteelFactory(db) {
  // Client record
  let client = db.prepare('SELECT id FROM clients WHERE name = ? AND subscription_id = ?')
    .get(STEEL_CLIENT_NAME, DEFAULT_SUB_ID);
  if (!client) {
    const clientId = 'client_steel_' + crypto.randomBytes(4).toString('hex');
    db.prepare('INSERT INTO clients (id, name, sector, subscription_id) VALUES (?, ?, ?, ?)')
      .run(clientId, STEEL_CLIENT_NAME, 'manufacturing', DEFAULT_SUB_ID);
    client = { id: clientId };
  }

  db.prepare(`
    INSERT OR IGNORE INTO projects
      (id, name, description, client_name, color, emoji, subscription_id, client_id, sector, hidden_capability_ids)
    VALUES (?, 'Production Operations', ?, ?, '#f59e0b', '🏭', ?, ?, 'manufacturing', ?)
  `).run(
    STEEL_CLIENT_ID,
    `Quality and compliance management for ${STEEL_CLIENT_NAME}`,
    STEEL_CLIENT_NAME,
    DEFAULT_SUB_ID,
    client.id,
    JSON.stringify(hiddenCapsForSector('manufacturing')),
  );

  db.prepare('UPDATE projects SET client_id = ? WHERE id = ? AND client_id IS NULL')
    .run(client.id, STEEL_CLIENT_ID);

  // Agents
  const insert = db.prepare(`
    INSERT OR IGNORE INTO agents
      (id, name, role, model, description, permissions, personality_file,
       is_template, system_prompt, color, created_from_template_id, project_id, role_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const a of agentTemplates.steel_agents) {
    const tpl = agentTemplates.templates.find(t => t.id === a.template_id);
    if (!tpl) continue;
    insert.run(
      a.id, a.name, a.role, a.model || tpl.model, a.description,
      JSON.stringify(tpl.permissions),
      tpl.personality_file || null,
      tpl.template_system_prompt ? 1 : 0,
      null,
      a.color, a.template_id, STEEL_CLIENT_ID,
      JSON.stringify(a.role_ids),
    );
  }
}

// ── Healthcare demo board ─────────────────────────────────────────────────────

function seedHealthcare(db) {
  // Client record
  let client = db.prepare('SELECT id FROM clients WHERE name = ? AND subscription_id = ?')
    .get(HEALTH_CLIENT_NAME, DEFAULT_SUB_ID);
  if (!client) {
    const clientId = 'client_health_' + crypto.randomBytes(4).toString('hex');
    db.prepare('INSERT INTO clients (id, name, sector, subscription_id) VALUES (?, ?, ?, ?)')
      .run(clientId, HEALTH_CLIENT_NAME, 'healthcare', DEFAULT_SUB_ID);
    client = { id: clientId };
  }

  db.prepare(`
    INSERT OR IGNORE INTO projects
      (id, name, description, client_name, color, emoji, subscription_id, client_id, sector, hidden_capability_ids)
    VALUES (?, 'Clinical Documentation & Safety', ?, ?, '#14b8a6', '🩺', ?, ?, 'healthcare', ?)
  `).run(
    HEALTH_CLIENT_ID,
    `Clinical documentation and patient-safety management for ${HEALTH_CLIENT_NAME}`,
    HEALTH_CLIENT_NAME,
    DEFAULT_SUB_ID,
    client.id,
    JSON.stringify(hiddenCapsForSector('healthcare')),
  );

  db.prepare('UPDATE projects SET client_id = ? WHERE id = ? AND client_id IS NULL')
    .run(client.id, HEALTH_CLIENT_ID);

  // Agents
  const insert = db.prepare(`
    INSERT OR IGNORE INTO agents
      (id, name, role, model, description, permissions, personality_file,
       is_template, system_prompt, color, created_from_template_id, project_id, role_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const a of agentTemplates.health_agents) {
    const tpl = agentTemplates.templates.find(t => t.id === a.template_id);
    if (!tpl) continue;
    insert.run(
      a.id, a.name, a.role, a.model || tpl.model, a.description,
      JSON.stringify(tpl.permissions),
      tpl.personality_file || null,
      tpl.template_system_prompt ? 1 : 0,
      null,
      a.color, a.template_id, HEALTH_CLIENT_ID,
      JSON.stringify(a.role_ids),
    );
  }
}

// ── Finance demo board ────────────────────────────────────────────────────────

function seedFinance(db) {
  // Client record
  let client = db.prepare('SELECT id FROM clients WHERE name = ? AND subscription_id = ?')
    .get(FINANCE_CLIENT_NAME, DEFAULT_SUB_ID);
  if (!client) {
    const clientId = 'client_finance_' + crypto.randomBytes(4).toString('hex');
    db.prepare('INSERT INTO clients (id, name, sector, subscription_id) VALUES (?, ?, ?, ?)')
      .run(clientId, FINANCE_CLIENT_NAME, 'finance', DEFAULT_SUB_ID);
    client = { id: clientId };
  }

  db.prepare(`
    INSERT OR IGNORE INTO projects
      (id, name, description, client_name, color, emoji, subscription_id, client_id, sector, hidden_capability_ids)
    VALUES (?, 'Risk, Credit & Compliance', ?, ?, '#22c55e', '🏦', ?, ?, 'finance', ?)
  `).run(
    FINANCE_CLIENT_ID,
    `Risk, credit, and compliance documentation for ${FINANCE_CLIENT_NAME}`,
    FINANCE_CLIENT_NAME,
    DEFAULT_SUB_ID,
    client.id,
    JSON.stringify(hiddenCapsForSector('finance')),
  );

  db.prepare('UPDATE projects SET client_id = ? WHERE id = ? AND client_id IS NULL')
    .run(client.id, FINANCE_CLIENT_ID);

  // Agents
  const insert = db.prepare(`
    INSERT OR IGNORE INTO agents
      (id, name, role, model, description, permissions, personality_file,
       is_template, system_prompt, color, created_from_template_id, project_id, role_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const a of agentTemplates.finance_agents) {
    const tpl = agentTemplates.templates.find(t => t.id === a.template_id);
    if (!tpl) continue;
    insert.run(
      a.id, a.name, a.role, a.model || tpl.model, a.description,
      JSON.stringify(tpl.permissions),
      tpl.personality_file || null,
      tpl.template_system_prompt ? 1 : 0,
      null,
      a.color, a.template_id, FINANCE_CLIENT_ID,
      JSON.stringify(a.role_ids),
    );
  }
}

// ── Nordvik Kredit demo board (Swedish-language finance board) ─────────────────

// A second finance-sector demo client whose board context is written entirely in
// Swedish — used to check that agents mirror the board/prompt language and handle
// Swedish regulatory terminology rather than defaulting to English.
function seedNordvik(db) {
  // Client record
  let client = db.prepare('SELECT id FROM clients WHERE name = ? AND subscription_id = ?')
    .get(NORDVIK_CLIENT_NAME, DEFAULT_SUB_ID);
  if (!client) {
    const clientId = 'client_nordvik_' + crypto.randomBytes(4).toString('hex');
    db.prepare('INSERT INTO clients (id, name, sector, subscription_id) VALUES (?, ?, ?, ?)')
      .run(clientId, NORDVIK_CLIENT_NAME, 'finance', DEFAULT_SUB_ID);
    client = { id: clientId };
  }

  db.prepare(`
    INSERT OR IGNORE INTO projects
      (id, name, description, client_name, color, emoji, subscription_id, client_id, sector, hidden_capability_ids)
    VALUES (?, 'Risk, Kredit & Regelefterlevnad', ?, ?, '#0ea5e9', '🏦', ?, ?, 'finance', ?)
  `).run(
    NORDVIK_CLIENT_ID,
    `Risk-, kredit- och regelefterlevnadsdokumentation för ${NORDVIK_CLIENT_NAME}`,
    NORDVIK_CLIENT_NAME,
    DEFAULT_SUB_ID,
    client.id,
    JSON.stringify(hiddenCapsForSector('finance')),
  );

  db.prepare('UPDATE projects SET client_id = ? WHERE id = ? AND client_id IS NULL')
    .run(client.id, NORDVIK_CLIENT_ID);

  // Agents
  const insert = db.prepare(`
    INSERT OR IGNORE INTO agents
      (id, name, role, model, description, permissions, personality_file,
       is_template, system_prompt, color, created_from_template_id, project_id, role_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const a of agentTemplates.nordvik_agents) {
    const tpl = agentTemplates.templates.find(t => t.id === a.template_id);
    if (!tpl) continue;
    insert.run(
      a.id, a.name, a.role, a.model || tpl.model, a.description,
      JSON.stringify(tpl.permissions),
      tpl.personality_file || null,
      tpl.template_system_prompt ? 1 : 0,
      null,
      a.color, a.template_id, NORDVIK_CLIENT_ID,
      JSON.stringify(a.role_ids),
    );
  }
}

// ── Rule-compliance benchmark sandbox board ───────────────────────────────────

// Neutral substrate for the benchmark's global-baseline and workspace-layer cases:
// a real board with a real planning agent, but zero board-level docs (client.md/
// project.md are never scaffolded here — see scaffoldInstructionFolders below) so
// the only thing in force is docs/rules.md plus whatever workspace-level docs exist
// under instructions/{DEFAULT_SUB_ID}/. Sector 'personal' keeps every capability
// visible; only a planner is seeded since that's the only capability under test.
function seedBenchmarkSandbox(db) {
  db.prepare(`
    INSERT OR IGNORE INTO projects
      (id, name, description, color, emoji, subscription_id, sector, hidden_capability_ids)
    VALUES (?, ?, 'Neutral board for the rule-compliance benchmark — no board-level docs, used to test the System Rules and workspace layers in isolation.', '#71717a', '🧪', ?, 'personal', ?)
  `).run(BENCH_SANDBOX_ID, BENCH_SANDBOX_NAME, DEFAULT_SUB_ID, JSON.stringify(hiddenCapsForSector('personal')));

  const insert = db.prepare(`
    INSERT OR IGNORE INTO agents
      (id, name, role, model, description, permissions, personality_file,
       is_template, system_prompt, color, created_from_template_id, project_id, role_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tpl = agentTemplates.templates.find(t => t.id === 'tpl_pm');
  insert.run(
    'agent_pm_bench', 'Project Manager', 'pm', tpl.model,
    'Plans and manages probing tasks for the rule-compliance benchmark sandbox.',
    JSON.stringify(tpl.permissions),
    tpl.personality_file || null,
    tpl.template_system_prompt ? 1 : 0,
    null,
    tpl.color, tpl.id, BENCH_SANDBOX_ID,
    JSON.stringify(['perm_planning', 'role_access_backlog']),
  );
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

  try { scaffoldProjectInstructions(BENCH_SANDBOX_ID, DEFAULT_SUB_ID, null, null, true); }
  catch (e) { console.warn('Could not scaffold Benchmark Sandbox instructions:', e.message); }

  try { scaffoldSteelInstructions(); }
  catch (e) { console.warn('Could not scaffold Nordstahl instructions:', e.message); }

  try { scaffoldHealthInstructions(); }
  catch (e) { console.warn('Could not scaffold Norvik Health instructions:', e.message); }

  try { scaffoldFinanceInstructions(); }
  catch (e) { console.warn('Could not scaffold Meridian Capital instructions:', e.message); }

  try { scaffoldNordvikInstructions(); }
  catch (e) { console.warn('Could not scaffold Nordvik Kredit instructions:', e.message); }
}

function scaffoldSteelInstructions() {
  const projectDir = path.join(INSTRUCTIONS_ROOT, DEFAULT_SUB_ID, STEEL_CLIENT_ID);
  if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

  // Files written without CODER_CAPS front-matter — all agents on this board can read them
  const files = [
    ['client.md',   readSeedDoc('demo-steel-client.md')   || `# Client: ${STEEL_CLIENT_NAME}\n`],
    ['project.md',  readSeedDoc('demo-steel-project.md')  || '# Project Context\n'],
    ['sop-guide.md', readSeedDoc('demo-steel-sop-guide.md') || '# SOP Writer Guide\n'],
  ];

  for (const [filename, content] of files) {
    const filePath = path.join(projectDir, filename);
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, content, 'utf8');
  }
}

function scaffoldHealthInstructions() {
  const projectDir = path.join(INSTRUCTIONS_ROOT, DEFAULT_SUB_ID, HEALTH_CLIENT_ID);
  if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

  // client.md / project.md have no capability front-matter — every agent on the
  // board reads them. doc-guide.md carries `capabilities: perm_producing` in its
  // own front-matter so it only loads for the Clinical Writer, not the planner.
  const files = [
    ['client.md',    readSeedDoc('demo-health-client.md')    || `# Client: ${HEALTH_CLIENT_NAME}\n`],
    ['project.md',   readSeedDoc('demo-health-project.md')   || '# Project Context\n'],
    ['doc-guide.md', readSeedDoc('demo-health-doc-guide.md') || '# Clinical Document Writer Guide\n'],
  ];

  for (const [filename, content] of files) {
    const filePath = path.join(projectDir, filename);
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, content, 'utf8');
  }
}

function scaffoldFinanceInstructions() {
  const projectDir = path.join(INSTRUCTIONS_ROOT, DEFAULT_SUB_ID, FINANCE_CLIENT_ID);
  if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

  // doc-guide.md carries `capabilities: perm_producing` so it only loads for the
  // Policy Writer; client.md / project.md stay front-matter-free for all agents.
  const files = [
    ['client.md',    readSeedDoc('demo-finance-client.md')    || `# Client: ${FINANCE_CLIENT_NAME}\n`],
    ['project.md',   readSeedDoc('demo-finance-project.md')   || '# Project Context\n'],
    ['doc-guide.md', readSeedDoc('demo-finance-doc-guide.md') || '# Policy & Documentation Writer Guide\n'],
  ];

  for (const [filename, content] of files) {
    const filePath = path.join(projectDir, filename);
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, content, 'utf8');
  }
}

function scaffoldNordvikInstructions() {
  const projectDir = path.join(INSTRUCTIONS_ROOT, DEFAULT_SUB_ID, NORDVIK_CLIENT_ID);
  if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

  // Swedish-language board context. doc-guide.md carries `capabilities: perm_producing`
  // so it only loads for the Policyförfattare; client.md / project.md stay
  // front-matter-free for all agents on the board.
  const files = [
    ['client.md',    readSeedDoc('demo-nordvik-client.md')    || `# Klient: ${NORDVIK_CLIENT_NAME}\n`],
    ['project.md',   readSeedDoc('demo-nordvik-project.md')   || '# Projektkontext\n'],
    ['doc-guide.md', readSeedDoc('demo-nordvik-doc-guide.md') || '# Guide för policy- och dokumentförfattare\n'],
  ];

  for (const [filename, content] of files) {
    const filePath = path.join(projectDir, filename);
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, content, 'utf8');
  }
}

module.exports = { seedDefaults };
