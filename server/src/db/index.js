const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { scaffoldProjectInstructions, scaffoldSubscriptionInstructions } = require('../utils/instructions');

// Stable IDs — never change these after first migration
const VELOUR_ID     = 'prj_a1b2c3d4';
const TGH_ID        = 'prj_e5f6a7b8';
const DEFAULT_SUB_ID = 'sub_default';

// Generates a new project ID: prj_ + 8 random hex chars
function generateProjectId() {
  return 'prj_' + crypto.randomBytes(4).toString('hex');
}

// Deterministically maps a legacy proj_* ID to a new prj_* ID
function legacyIdToNew(oldId) {
  if (oldId === 'proj_velour') return VELOUR_ID;
  if (oldId === 'proj_tgh')    return TGH_ID;
  return 'prj_' + crypto.createHash('sha256').update(oldId).digest('hex').slice(0, 8);
}

module.exports.VELOUR_ID = VELOUR_ID;
module.exports.TGH_ID    = TGH_ID;

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/autokan.db');

const PM_TEMPLATE_SYSTEM_PROMPT = `You are a Project Manager agent — the quality gate between client requirements and the development team. No developer writes a single line of code until you have approved the task. You communicate like a senior PM: clear, direct, and always focused on what the client actually needs, not on technical implementation details.`;

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDb() {
  const db = getDb();

  db.exec(`
    -- Columns (kanban columns, customizable)
    CREATE TABLE IF NOT EXISTS columns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      position INTEGER NOT NULL,
      color TEXT DEFAULT '#6366f1',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Agent roles
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      model TEXT DEFAULT 'claude-opus-4-5',
      description TEXT,
      permissions TEXT NOT NULL DEFAULT '[]',
      role_ids TEXT DEFAULT '[]',
      prompt_file TEXT,
      instruction_files TEXT DEFAULT '[]',
      is_template INTEGER DEFAULT 0,
      template_system_prompt TEXT,
      system_prompt_override TEXT,
      color TEXT DEFAULT '#6366f1',
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Tasks
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      column_id TEXT NOT NULL REFERENCES columns(id),
      assigned_agent_id TEXT REFERENCES agents(id),
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
      complexity TEXT DEFAULT 'medium' CHECK(complexity IN ('low','medium','high')),
      recommended_model TEXT,
      tags TEXT DEFAULT '[]',
      progress INTEGER DEFAULT 0 CHECK(progress >= 0 AND progress <= 100),
      requires_human_action INTEGER DEFAULT 0,
      human_action_reason TEXT,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 1,
      metadata TEXT DEFAULT '{}',
      acceptance_criteria TEXT,
      pm_approval_status TEXT CHECK(pm_approval_status IN ('pending','questioning','approved','rejected')),
      human_approval_status TEXT CHECK(human_approval_status IN ('pending','approved','rejected')),
      pm_pending_question TEXT,
      pm_review_comment TEXT,
      human_review_comment TEXT,
      pm_review_date DATETIME,
      human_review_date DATETIME,
      archived_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Task activity log
    CREATE TABLE IF NOT EXISTS task_logs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      agent_id TEXT REFERENCES agents(id),
      action TEXT NOT NULL,
      from_column TEXT,
      to_column TEXT,
      message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Task approvals audit trail
    CREATE TABLE IF NOT EXISTS task_approvals (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      approver_id TEXT NOT NULL REFERENCES agents(id),
      approval_type TEXT NOT NULL CHECK(approval_type IN ('pm_review', 'human_approval')),
      status TEXT NOT NULL CHECK(status IN ('approved', 'rejected')),
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Secrets (keys/env vars that need human approval)
    CREATE TABLE IF NOT EXISTS secrets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      task_id TEXT REFERENCES tasks(id),
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','provided','rejected')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Trigger: update tasks.updated_at
    CREATE TRIGGER IF NOT EXISTS tasks_updated_at
      AFTER UPDATE ON tasks
      BEGIN
        UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;

    -- Agent templates (prefill library for creating new agents)
    CREATE TABLE IF NOT EXISTS agent_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      model TEXT DEFAULT 'claude-sonnet-4-5',
      color TEXT DEFAULT '#6366f1',
      suggested_role TEXT,
      system_prompt_content TEXT,
      template_system_prompt TEXT,
      instruction_files TEXT DEFAULT '[]',
      permissions TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      source_agent_id TEXT REFERENCES agents(id),
      archived_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Trigger: update agents.updated_at
    CREATE TRIGGER IF NOT EXISTS agents_updated_at
      AFTER UPDATE ON agents
      BEGIN
        UPDATE agents SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;

    -- Trigger: update agent_templates.updated_at
    CREATE TRIGGER IF NOT EXISTS agent_templates_updated_at
      AFTER UPDATE ON agent_templates
      BEGIN
        UPDATE agent_templates SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
  `);

  // ── Projects table — must exist before any migration that references it ──
  // Note: owner_id FK to users omitted here; users table created later.
  // The full schema (with FK) is in the later CREATE TABLE IF NOT EXISTS (no-op for new DBs).
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      client_name TEXT,
      color TEXT DEFAULT '#6366f1',
      emoji TEXT DEFAULT '📋',
      owner_id TEXT,
      archived_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed default projects early — agents and columns reference them via FK
  db.prepare(`INSERT OR IGNORE INTO projects (id, name, description, client_name, color, emoji)
    VALUES (?, 'Public Website', 'Internal development of the AutoKan platform', 'Velour', '#6366f1', '⚡')`
  ).run(VELOUR_ID);
  db.prepare(`INSERT OR IGNORE INTO projects (id, name, description, client_name, color, emoji)
    VALUES (?, 'Steel Platform', 'Industrial quoting and order management platform', 'TGH Iron & Steel', '#dc2626', '🏗️')`
  ).run(TGH_ID);

  // Migration: tasks table new columns
  const taskCols = db.prepare('PRAGMA table_info(tasks)').all().map(c => c.name);
  if (!taskCols.includes('pr_url')) {
    db.exec('ALTER TABLE tasks ADD COLUMN pr_url TEXT');
    console.log('✅ Migrated: added pr_url to tasks');
  }
  if (!taskCols.includes('auto_complete')) {
    db.exec('ALTER TABLE tasks ADD COLUMN auto_complete INTEGER DEFAULT 0');
    console.log('✅ Migrated: added auto_complete to tasks');
  }
  if (!taskCols.includes('acceptance_criteria')) {
    db.exec('ALTER TABLE tasks ADD COLUMN acceptance_criteria TEXT');
    console.log('✅ Migrated: added acceptance_criteria to tasks');
  }
  if (!taskCols.includes('archived_at')) {
    db.exec('ALTER TABLE tasks ADD COLUMN archived_at DATETIME');
    console.log('✅ Migrated: added archived_at to tasks');
  }
  if (!taskCols.includes('pm_checklist')) {
    db.exec('ALTER TABLE tasks ADD COLUMN pm_checklist TEXT');
    console.log('✅ Migrated: added pm_checklist to tasks');
  }

  // Migration: add archived_at, is_protected, project_id to columns table
  const colTableCols = db.prepare('PRAGMA table_info(columns)').all().map(c => c.name);
  if (!colTableCols.includes('archived_at')) {
    db.exec('ALTER TABLE columns ADD COLUMN archived_at DATETIME');
    console.log('✅ Migrated: added archived_at to columns');
  }
  if (!colTableCols.includes('is_protected')) {
    db.exec('ALTER TABLE columns ADD COLUMN is_protected INTEGER DEFAULT 0');
    console.log('✅ Migrated: added is_protected to columns');
  }
  if (!colTableCols.includes('project_id')) {
    db.exec('ALTER TABLE columns ADD COLUMN project_id TEXT REFERENCES projects(id)');
    // Existing non-protected custom columns belong to the first/default project
    db.prepare(`UPDATE columns SET project_id = '${VELOUR_ID}' WHERE is_protected = 0 AND project_id IS NULL`).run();
    console.log('✅ Migrated: added project_id to columns, assigned existing custom columns to Velour');
  }

  // Mark the 5 core columns as protected
  db.prepare(
    `UPDATE columns SET is_protected = 1 WHERE id IN ('col_backlog','col_inprogress','col_testing','col_humanaction','col_done')`
  ).run();

  // Archive Human Review — it overlaps with Human Action
  db.prepare(
    `UPDATE columns SET archived_at = CURRENT_TIMESTAMP WHERE id = 'col_humanreview' AND archived_at IS NULL`
  ).run();

  // Migration: add columns if missing (existing DBs)
  const agentCols = db.prepare('PRAGMA table_info(agents)').all();
  const agentColNames = agentCols.map(c => c.name);
  if (!agentColNames.includes('instruction_files')) {
    db.exec("ALTER TABLE agents ADD COLUMN instruction_files TEXT DEFAULT '[]'");
    console.log('✅ Migrated: added instruction_files column to agents');
  }
  if (!agentColNames.includes('is_template')) {
    db.exec('ALTER TABLE agents ADD COLUMN is_template INTEGER DEFAULT 0');
    console.log('✅ Migrated: added is_template column to agents');
  }
  if (!agentColNames.includes('template_system_prompt')) {
    db.exec('ALTER TABLE agents ADD COLUMN template_system_prompt TEXT');
    console.log('✅ Migrated: added template_system_prompt column to agents');
  }
  if (!agentColNames.includes('system_prompt_override')) {
    db.exec('ALTER TABLE agents ADD COLUMN system_prompt_override TEXT');
    console.log('✅ Migrated: added system_prompt_override column to agents');
  }

  // Migration: mark PM as template on first run only (template_system_prompt is now editable via UI)
  db.prepare(`UPDATE agents SET is_template = 1 WHERE id = 'agent_pm' AND is_template = 0`).run();
  // Seed PM template_system_prompt only if it has never been set — never overwrite user customisations
  db.prepare(`UPDATE agents SET template_system_prompt = ? WHERE id = 'agent_pm' AND template_system_prompt IS NULL`)
    .run(PM_TEMPLATE_SYSTEM_PROMPT);

  // Migration: add created_from_template_id to agents if missing
  if (!agentColNames.includes('created_from_template_id')) {
    db.exec('ALTER TABLE agents ADD COLUMN created_from_template_id TEXT');
    console.log('✅ Migrated: added created_from_template_id to agents');
  }
  if (!agentColNames.includes('archived_at')) {
    db.exec('ALTER TABLE agents ADD COLUMN archived_at DATETIME');
    console.log('✅ Migrated: added archived_at to agents');
  }

  // Migration: add project_id to agents
  if (!agentColNames.includes('project_id')) {
    db.exec('ALTER TABLE agents ADD COLUMN project_id TEXT REFERENCES projects(id)');
    db.prepare('UPDATE agents SET project_id = ? WHERE project_id IS NULL').run(VELOUR_ID);
    console.log('✅ Migrated: added project_id to agents, assigned existing to Velour');
  }

  // Migration: drop global UNIQUE constraint on agents.role (now unique per-project only)
  // SQLite can't drop constraints directly — requires table recreation
  const agentRoleUniqueExists = db.prepare("PRAGMA index_list(agents)").all()
    .some(idx => idx.unique && idx.origin === 'u');
  if (agentRoleUniqueExists) {
    // Get current column list for dynamic recreation
    const currentAgentCols = db.prepare('PRAGMA table_info(agents)').all();
    const colDefs = currentAgentCols.map(c => {
      let def = `${c.name} ${c.type}`;
      if (c.pk) def += ' PRIMARY KEY';
      if (c.notnull && !c.pk) def += ' NOT NULL';
      if (c.dflt_value !== null) def += ` DEFAULT ${c.dflt_value}`;
      return def;
    }).join(',\n      ');
    const colNames = currentAgentCols.map(c => c.name).join(', ');

    // Temporarily disable FK checks so we can drop and recreate the agents table
    db.pragma('foreign_keys = OFF');
    try {
      db.exec(`
        BEGIN;
        CREATE TABLE agents_new (
          ${colDefs}
        );
        INSERT INTO agents_new SELECT ${colNames} FROM agents;
        DROP TABLE agents;
        ALTER TABLE agents_new RENAME TO agents;
        COMMIT;
      `);
      console.log('✅ Migrated: dropped global UNIQUE constraint on agents.role (now per-project)');
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }

  // Migration: add template_system_prompt to agent_templates if missing
  const tplCols = db.prepare('PRAGMA table_info(agent_templates)').all().map(c => c.name);
  if (!tplCols.includes('template_system_prompt')) {
    db.exec('ALTER TABLE agent_templates ADD COLUMN template_system_prompt TEXT');
    console.log('✅ Migrated: added template_system_prompt to agent_templates');
  }

  // Migration: link default agents to their seeded templates
  const agentTemplateLinks = [
    ['agent_pm',   'tpl_pm'],
    ['agent_dev',  'tpl_dev'],
    ['agent_test', 'tpl_test'],
  ];
  for (const [agentId, tplId] of agentTemplateLinks) {
    db.prepare('UPDATE agents SET created_from_template_id = ? WHERE id = ? AND created_from_template_id IS NULL')
      .run(tplId, agentId);
  }

  // Migration: update prompt_file paths to instructions/ folder for existing agents
  const agentPaths = [
    ['agent_pm',   'agents/pm.md',        'instructions/pm.md'],
    ['agent_dev',  'agents/developer.md', 'instructions/developer.md'],
    ['agent_test', 'agents/tester.md',    'instructions/tester.md'],
  ];
  for (const [id, oldPath, newPath] of agentPaths) {
    db.prepare("UPDATE agents SET prompt_file = ? WHERE id = ? AND prompt_file = ?").run(newPath, id, oldPath);
  }

  // Migration: rename pm.md → project-manager.md in prompt_file (any agent referencing it)
  db.prepare("UPDATE agents SET prompt_file = 'instructions/project-manager.md' WHERE prompt_file = 'instructions/pm.md'").run();

  // Migration: rewrite per-project instruction paths from "instructions-{id}/..." to "instructions/{id}/..."
  // (legacy folder rename from before subscription-scoped structure)
  {
    const agents = db.prepare('SELECT id, prompt_file, instruction_files FROM agents').all();
    const rewritePath = p => p ? p.replace(/^instructions-([^/]+)\//, 'instructions/$1/') : p;
    for (const agent of agents) {
      const newPromptFile = rewritePath(agent.prompt_file);
      let newInstructionFiles = agent.instruction_files;
      try {
        const arr = JSON.parse(agent.instruction_files || '[]');
        const rewritten = arr.map(rewritePath);
        if (JSON.stringify(arr) !== JSON.stringify(rewritten)) {
          newInstructionFiles = JSON.stringify(rewritten);
        }
      } catch { /* leave as-is if malformed */ }
      if (newPromptFile !== agent.prompt_file || newInstructionFiles !== agent.instruction_files) {
        db.prepare('UPDATE agents SET prompt_file = ?, instruction_files = ? WHERE id = ?')
          .run(newPromptFile, newInstructionFiles, agent.id);
      }
    }
  }

  // Migration: rewrite direct project-scoped paths to include subscription prefix
  // instructions/{projId}/X.md → instructions/{subId}/{projId}/X.md
  {
    const agents = db.prepare('SELECT id, prompt_file, instruction_files FROM agents').all();
    const rewritePath = p => {
      if (!p) return p;
      // Only rewrite paths that have a project ID directly after "instructions/" (no sub prefix yet)
      return p.replace(/^instructions\/(prj_[^/]+)\//, `instructions/${DEFAULT_SUB_ID}/$1/`);
    };
    for (const agent of agents) {
      const newPromptFile = rewritePath(agent.prompt_file);
      let newInstructionFiles = agent.instruction_files;
      try {
        const arr = JSON.parse(agent.instruction_files || '[]');
        const rewritten = arr.map(rewritePath);
        if (JSON.stringify(arr) !== JSON.stringify(rewritten)) {
          newInstructionFiles = JSON.stringify(rewritten);
        }
      } catch { /* leave as-is if malformed */ }
      if (newPromptFile !== agent.prompt_file || newInstructionFiles !== agent.instruction_files) {
        db.prepare('UPDATE agents SET prompt_file = ?, instruction_files = ? WHERE id = ?')
          .run(newPromptFile, newInstructionFiles, agent.id);
      }
    }
  }

  // Ensure roles table exists before any migration that queries it
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      allowed_column_ids TEXT DEFAULT '[]',
      color TEXT DEFAULT '#6b7280',
      is_system INTEGER DEFAULT 1
    );
  `);

  // Migration: rename perm_pm_planning → perm_planning in roles table + all agents' role_ids
  const oldPlanningRole = db.prepare("SELECT id FROM roles WHERE id = 'perm_pm_planning'").get();
  if (oldPlanningRole) {
    const newAlreadyExists = db.prepare("SELECT id FROM roles WHERE id = 'perm_planning'").get();
    if (newAlreadyExists) {
      // New role was already seeded — just remove the stale old row
      db.prepare("DELETE FROM roles WHERE id = 'perm_pm_planning'").run();
    } else {
      db.prepare("UPDATE roles SET id = 'perm_planning', name = 'Planning' WHERE id = 'perm_pm_planning'").run();
    }
    // Either way, update all agents' role_ids arrays
    const allAgents = db.prepare('SELECT id, role_ids FROM agents').all();
    for (const a of allAgents) {
      const ids = JSON.parse(a.role_ids || '[]');
      if (ids.includes('perm_pm_planning')) {
        const updated = ids.map(r => r === 'perm_pm_planning' ? 'perm_planning' : r);
        db.prepare('UPDATE agents SET role_ids = ? WHERE id = ?').run(JSON.stringify(updated), a.id);
      }
    }
    console.log('✅ Migrated: perm_pm_planning → perm_planning');
  }

  // Migration: enforce correct instruction_files per role (always apply — roles are fixed)
  // PM: client context only. No codebase files — PM knows the client, not the code.
  // Developer/Tester: project + client context. Codebase files (CLAUDE.md etc.) are
  // injected by agentRunner based on role, so instruction_files = shared context only.
  const pmInstructions = JSON.stringify(['instructions/client.md']);
  const devInstructions = JSON.stringify(['instructions/project.md', 'instructions/client.md']);
  db.prepare("UPDATE agents SET instruction_files = ? WHERE id = 'agent_pm'").run(pmInstructions);
  db.prepare("UPDATE agents SET instruction_files = ? WHERE id = 'agent_dev'").run(devInstructions);
  db.prepare("UPDATE agents SET instruction_files = ? WHERE id = 'agent_test'").run(devInstructions);

  // Roles table (system roles — non-deletable)
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      allowed_column_ids TEXT DEFAULT '[]',
      color TEXT DEFAULT '#6b7280',
      is_system INTEGER DEFAULT 1
    );
  `);

  // Migration: add type column to roles if missing
  const roleCols = db.prepare('PRAGMA table_info(roles)').all().map(c => c.name);
  if (!roleCols.includes('type')) {
    db.exec("ALTER TABLE roles ADD COLUMN type TEXT DEFAULT 'column_access'");
    console.log('✅ Migrated: added type to roles');
  }

  // Remove old role system (4 generic roles) and replace with column-per-role + permission roles
  db.prepare("DELETE FROM roles WHERE id IN ('role_pm','role_developer','role_tester','role_any')").run();

  // Column access roles — one per workable column
  const insertRoleIfMissing = db.prepare(
    `INSERT OR IGNORE INTO roles (id, name, description, allowed_column_ids, color, is_system, type) VALUES (?, ?, ?, ?, ?, 1, ?)`
  );
  [
    ['role_access_backlog',     'Backlog',      'Can be assigned to Backlog tasks',       JSON.stringify(['col_backlog']),     '#64748b', 'column_access'],
    ['role_access_inprogress',  'In Progress',  'Can be assigned to In Progress tasks',   JSON.stringify(['col_inprogress']),  '#3b82f6', 'column_access'],
    ['role_access_testing',     'Testing',      'Can be assigned to Testing tasks',        JSON.stringify(['col_testing']),     '#8b5cf6', 'column_access'],
    ['role_access_humanaction', 'Human Action', 'Can be assigned to Human Action tasks',  JSON.stringify(['col_humanaction']), '#f59e0b', 'column_access'],
    ['role_access_done',        'Done',         'Can be assigned to Done tasks',           JSON.stringify(['col_done']),        '#10b981', 'column_access'],
    ['role_access_any',         'All Columns',  'Can be assigned to any column',           JSON.stringify([]),                  '#6b7280', 'column_access'],
  ].forEach(r => insertRoleIfMissing.run(...r));

  // Permission roles — what kind of work the agent can perform
  [
    ['perm_coding',          'Coding',           'Creates and modifies code',                                                            '#ec4899', 'permission'],
    ['perm_coding_tester',   'Coding Tester',    'Tests code — debugging, unit tests, integration tests',                               '#8b5cf6', 'permission'],
    ['perm_code_reader',     'Code Reader',      'Reads and understands code but cannot modify it',                                     '#64748b', 'permission'],
    ['perm_architect',       'Architect',        'Designs system foundations and high-level structure',                                 '#6366f1', 'permission'],
    ['perm_migrate',         'Migration',        'Handles data migrations — only affected areas, no wider code changes',                '#f59e0b', 'permission'],
    ['perm_frontend',        'Frontend',         'Frontend code changes only',                                                          '#06b6d4', 'permission'],
    ['perm_backend',         'Backend',          'Backend code changes only',                                                           '#3b82f6', 'permission'],
    ['perm_ux',              'UX',               'Frontend UX-specialised tasks only',                                                  '#ec4899', 'permission'],
    ['perm_network',         'Network',          'Network testing and external commands, locally or outside the project',               '#10b981', 'permission'],
    ['perm_cloud',           'Cloud',            'Cloud environment access — checks app health, operates cloud safely',                 '#0ea5e9', 'permission'],
    ['perm_security_control','Security Control', 'Security analysis, vulnerability scanning, .env usage review, no modifications',      '#ef4444', 'permission'],
    ['perm_log_reader',      'Log Reader',       'Reads logs in the file system and cloud (when cloud is enabled)',                     '#f97316', 'permission'],
    ['perm_data_analytic',   'Data Analytics',   'Extracts and analyses data from appropriate areas of the app',                       '#84cc16', 'permission'],
    ['perm_planning',        'Planning',         'Triggers the planning phase when assigned to a Backlog task',                         '#a855f7', 'permission'],
  ].forEach(([id, name, description, color, type]) =>
    insertRoleIfMissing.run(id, name, description, '[]', color, type)
  );

  // Migration: add role_ids to agents (safe no-op for new DBs that already have the column)
  if (!agentColNames.includes('role_ids')) {
    db.exec("ALTER TABLE agents ADD COLUMN role_ids TEXT DEFAULT '[]'");
    console.log('✅ Migrated: added role_ids to agents');
  }

  // Always ensure default agents have the correct capabilities (runs after role_ids exists)
  const pmRoleIds = JSON.parse(db.prepare("SELECT role_ids FROM agents WHERE id = 'agent_pm'").get()?.role_ids || '[]');
  if (!pmRoleIds.includes('perm_planning')) {
    db.prepare("UPDATE agents SET role_ids = ? WHERE id = 'agent_pm'")
      .run(JSON.stringify([...pmRoleIds, 'perm_planning']));
  }

  const devRoleIds = JSON.parse(db.prepare("SELECT role_ids FROM agents WHERE id = 'agent_dev'").get()?.role_ids || '[]');
  if (!devRoleIds.includes('perm_coding')) {
    db.prepare("UPDATE agents SET role_ids = ? WHERE id = 'agent_dev'")
      .run(JSON.stringify([...devRoleIds, 'perm_coding']));
  }

  const testRoleIds = JSON.parse(db.prepare("SELECT role_ids FROM agents WHERE id = 'agent_test'").get()?.role_ids || '[]');
  if (!testRoleIds.includes('perm_coding_tester')) {
    db.prepare("UPDATE agents SET role_ids = ? WHERE id = 'agent_test'")
      .run(JSON.stringify([...testRoleIds, 'perm_coding_tester']));
  }

  // Migration: map old role IDs to new column access role IDs (idempotent)
  const OLD_TO_NEW = {
    'role_pm':        'role_access_backlog',
    'role_developer': 'role_access_inprogress',
    'role_tester':    'role_access_testing',
    'role_any':       'role_access_any',
  };
  const migrateRoleIds = db.prepare('UPDATE agents SET role_ids = ? WHERE id = ?');
  const allAgentsForRoles = db.prepare('SELECT id, role_ids FROM agents').all();
  for (const a of allAgentsForRoles) {
    const current = JSON.parse(a.role_ids || '[]');
    const migrated = [...new Set(current.map(r => OLD_TO_NEW[r] || r))];
    // Set defaults for agents with empty role_ids
    const final = migrated.length > 0 ? migrated
      : a.id === 'agent_pm'   ? ['role_access_backlog']
      : a.id === 'agent_dev'  ? ['role_access_inprogress']
      : a.id === 'agent_test' ? ['role_access_testing']
      : ['role_access_any'];
    if (JSON.stringify(current) !== JSON.stringify(final)) {
      migrateRoleIds.run(JSON.stringify(final), a.id);
    }
  }

  // Migration: create column_access roles for any existing custom columns
  const systemColIds = ['col_backlog','col_inprogress','col_testing','col_humanaction','col_done','col_unassigned'];
  const customCols = db.prepare(
    `SELECT id, name FROM columns WHERE id NOT IN (${systemColIds.map(() => '?').join(',')}) AND archived_at IS NULL`
  ).all(...systemColIds);
  const ensureColRole = db.prepare(
    `INSERT OR IGNORE INTO roles (id, name, description, allowed_column_ids, color, is_system, type) VALUES (?, ?, ?, ?, '#6b7280', 0, 'column_access')`
  );
  for (const col of customCols) {
    const roleId = 'role_' + col.id.replace(/^col_/, '');
    ensureColRole.run(roleId, col.name, `Can be assigned to ${col.name} tasks`, JSON.stringify([col.id]));
  }

  // Seed col_unassigned (idempotent — only added when missing)
  db.prepare(
    `INSERT OR IGNORE INTO columns (id, name, position, color, is_protected) VALUES ('col_unassigned', 'Unassigned', -1, '#f59e0b', 1)`
  ).run();

  // Seed default columns if empty
  const colCount = db.prepare("SELECT COUNT(*) as c FROM columns WHERE id != 'col_unassigned'").get();
  if (colCount.c === 0) {
    const insertCol = db.prepare('INSERT INTO columns (id, name, position, color, is_protected) VALUES (?, ?, ?, ?, ?)');
    const cols = [
      ['col_backlog',     'Backlog',      0, '#64748b', 1],
      ['col_inprogress',  'In Progress',  1, '#3b82f6', 1],
      ['col_testing',     'Testing',      2, '#8b5cf6', 1],
      ['col_humanaction', 'Human Action', 3, '#f59e0b', 1],
      ['col_done',        'Done',         4, '#10b981', 1],
    ];
    cols.forEach(c => insertCol.run(...c));
    console.log('✅ Default columns seeded');
  }

  // Seed default agents if empty
  const agentCount = db.prepare('SELECT COUNT(*) as c FROM agents').get();
  if (agentCount.c === 0) {
    const insertAgent = db.prepare(`
      INSERT INTO agents (id, name, role, model, description, permissions, prompt_file, instruction_files, is_template, template_system_prompt, color, created_from_template_id, project_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const defaultAgents = [
      [
        'agent_pm', 'Project Manager', 'pm',
        'claude-opus-4-5',
        'Plans and manages tasks. Has a real planning conversation to ensure every task is clear before development starts.',
        JSON.stringify(['task:create','task:read','task:update','task:delete','task:move','task:assign']),
        'instructions/project-manager.md',
        JSON.stringify(['instructions/client.md']),   // Planner: client context only, no codebase
        1, PM_TEMPLATE_SYSTEM_PROMPT,
        '#6366f1', 'tpl_pm', VELOUR_ID
      ],
      [
        'agent_dev', 'Developer', 'developer',
        'claude-sonnet-4-5',
        'Implements features and fixes bugs. Creates feature branches, commits, and pushes work for testing.',
        JSON.stringify(['task:read','task:move','task:update:status','task:update:progress','task:log']),
        'instructions/developer.md',
        JSON.stringify(['instructions/project.md', 'instructions/client.md']), // dev: full context
        0, null,
        '#3b82f6', 'tpl_dev', VELOUR_ID
      ],
      [
        'agent_test', 'Tester', 'tester',
        'claude-sonnet-4-5',
        'Validates implementations and runs tests. Passes work to human review or sends back for fixes.',
        JSON.stringify(['task:read','task:move','task:update:status','task:update:progress','task:log','task:request_human']),
        'instructions/tester.md',
        JSON.stringify(['instructions/project.md', 'instructions/client.md']), // tester: full context
        0, null,
        '#8b5cf6', 'tpl_test', VELOUR_ID
      ],
    ];
    defaultAgents.forEach(a => insertAgent.run(...a));
    console.log('✅ Default agents seeded');
  }

  // Seed default agent templates by ID (idempotent — skips if already exists)
  function readInstructionFile(filename) {
    // Try subscription-scoped path first, then legacy global path
    const subPath  = path.join(__dirname, '../../../instructions', DEFAULT_SUB_ID, filename);
    const rootPath = path.join(__dirname, '../../../instructions', filename);
    try { return fs.readFileSync(subPath, 'utf8'); } catch { /* fall through */ }
    try { return fs.readFileSync(rootPath, 'utf8'); } catch { return ''; }
  }
  const insertTplIfMissing = db.prepare(`
    INSERT OR IGNORE INTO agent_templates (id, name, description, model, color, suggested_role, system_prompt_content, template_system_prompt, instruction_files, permissions, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const defaultTemplates = [
    [
      'tpl_pm', 'Project Manager',
      'Plans and manages tasks. Has a real planning conversation to ensure every task is clear before development starts.',
      'claude-opus-4-5', '#6366f1', 'pm',
      readInstructionFile('project-manager.md'),
      PM_TEMPLATE_SYSTEM_PROMPT,
      JSON.stringify(['instructions/client.md', 'instructions/project.md']),
      JSON.stringify(['task:create','task:read','task:update','task:delete','task:move','task:assign']),
      JSON.stringify(['Planning', 'Management']),
    ],
    [
      'tpl_dev', 'Developer',
      'Implements features and fixes bugs. Creates feature branches, commits, and pushes work for testing.',
      'claude-sonnet-4-5', '#3b82f6', 'developer',
      readInstructionFile('developer.md'),
      null,
      JSON.stringify(['instructions/project.md']),
      JSON.stringify(['task:read','task:move','task:update:status','task:update:progress','task:log']),
      JSON.stringify(['Development', 'Implementation']),
    ],
    [
      'tpl_test', 'Tester',
      'Validates implementations and runs tests. Passes work to human review or sends back for fixes.',
      'claude-sonnet-4-5', '#8b5cf6', 'tester',
      readInstructionFile('tester.md'),
      null,
      JSON.stringify(['instructions/project.md']),
      JSON.stringify(['task:read','task:move','task:update:status','task:update:progress','task:log','task:request_human']),
      JSON.stringify(['Testing', 'QA']),
    ],
  ];
  let seededCount = 0;
  defaultTemplates.forEach(t => { const r = insertTplIfMissing.run(...t); seededCount += r.changes; });
  if (seededCount > 0) console.log(`✅ Seeded ${seededCount} default agent template(s)`);

  // ── Users table ────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      google_id TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      first_name TEXT,
      last_name TEXT,
      picture TEXT,
      company_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: add company_name if missing (existing DBs)
  const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!userCols.includes('company_name')) {
    db.exec('ALTER TABLE users ADD COLUMN company_name TEXT');
    console.log('✅ Migrated: added company_name to users');
  }

  // ── Projects table ──────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      client_name TEXT,
      color TEXT DEFAULT '#6366f1',
      emoji TEXT DEFAULT '📋',
      owner_id TEXT REFERENCES users(id),
      archived_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: add project_id to tasks
  const taskColNames = db.prepare('PRAGMA table_info(tasks)').all().map(c => c.name);
  if (!taskColNames.includes('project_id')) {
    db.exec("ALTER TABLE tasks ADD COLUMN project_id TEXT REFERENCES projects(id)");
    console.log('✅ Migrated: added project_id to tasks');
  }

  // ── Migration: rename legacy proj_* IDs → prj_* format ──────────────────
  // Deterministic so it can safely re-run on every restart without side-effects
  const PROJECT_ROOT_PATH = path.join(__dirname, '../../..');
  const legacyProjects = db.prepare("SELECT * FROM projects WHERE id LIKE 'proj_%'").all();
  for (const project of legacyProjects) {
    const newId = legacyIdToNew(project.id);
    const newExists = db.prepare('SELECT id FROM projects WHERE id = ?').get(newId);
    if (newExists) {
      // Already migrated — clean up the stale legacy row
      db.prepare('DELETE FROM projects WHERE id = ?').run(project.id);
      continue;
    }
    db.prepare(`
      INSERT INTO projects (id, name, description, client_name, color, emoji, owner_id, archived_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(newId, project.name, project.description, project.client_name, project.color,
           project.emoji, project.owner_id, project.archived_at, project.created_at, project.updated_at);
    db.prepare('UPDATE tasks SET project_id = ? WHERE project_id = ?').run(newId, project.id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(project.id);
    // Rename instruction folder (subscription-scoped path)
    const projSubId = project.subscription_id || DEFAULT_SUB_ID;
    const oldDir = path.join(PROJECT_ROOT_PATH, 'instructions', projSubId, project.id);
    const newDir = path.join(PROJECT_ROOT_PATH, 'instructions', projSubId, newId);
    if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
      try { fs.renameSync(oldDir, newDir); } catch (e) { console.warn(`Could not rename folder for ${project.id}:`, e.message); }
    }
    console.log(`✅ Migrated project ID ${project.id} → ${newId}`);
  }

  // Migration: rename legacy project name 'AutoKan' → 'Public Website'
  db.prepare(`UPDATE projects SET name = 'Public Website' WHERE id = ? AND name = 'AutoKan'`).run(VELOUR_ID);

  // Seed default "Velour" project (idempotent)
  const velourExists = db.prepare('SELECT id FROM projects WHERE id = ?').get(VELOUR_ID);
  if (!velourExists) {
    db.prepare(`
      INSERT INTO projects (id, name, description, client_name, color, emoji)
      VALUES (?, 'Public Website', 'Internal development of the AutoKan platform', 'Velour', '#6366f1', '⚡')
    `).run(VELOUR_ID);
    db.prepare('UPDATE tasks SET project_id = ? WHERE project_id IS NULL').run(VELOUR_ID);
    console.log('✅ Seeded Velour project and migrated existing tasks');
  }

  // Seed TGH Iron & Steel project (idempotent)
  const tghExists = db.prepare('SELECT id FROM projects WHERE id = ?').get(TGH_ID);
  if (!tghExists) {
    db.prepare(`
      INSERT INTO projects (id, name, description, client_name, color, emoji)
      VALUES (?, 'Steel Platform', 'Industrial quoting and order management platform', 'TGH Iron & Steel', '#dc2626', '🏗️')
    `).run(TGH_ID);
    console.log('✅ Seeded TGH Iron & Steel project');
  }

  // Scaffold per-project instruction folders for all known projects (idempotent — never overwrites)
  const tghClientMd = `# Client Context — TGH Iron & Steel

This file describes the client, their business, and what they care about. Agents should use this when planning tasks to ensure work aligns with business goals and operational requirements.

## About the Client

**TGH Iron & Steel** is a mid-sized industrial manufacturer and distributor specialising in structural steel, iron castings, and custom metal fabrication for the construction and engineering sectors.

The business provides:
- **Structural steel**: beams, columns, channels, and plates for commercial and residential construction
- **Iron castings**: custom and standard components for heavy machinery and infrastructure
- **Metal fabrication**: cut-to-size, welding, drilling, and surface treatment services
- **Distribution**: wholesale supply to contractors, engineers, and regional distributors

The business is B2B-focused with two production facilities and a national distribution network.

## Platform Goal

TGH is replacing a legacy quoting and order management system with a modern web platform. The new platform will:
1. Let customers request and track quotes online with full specification detail
2. Allow the internal team to process orders, manage production stages, and coordinate delivery
3. Give sales reps a CRM-adjacent view of client accounts and quote history
4. Integrate with their inventory system for near-real-time stock of raw materials and finished goods

## Client Priorities (in order)

1. **Quote accuracy** — incorrect quotes cause margin erosion and customer trust failures
2. **Order visibility** — customers and internal teams must always know where an order stands
3. **Integration reliability** — inventory sync must be near-real-time; stale stock causes broken promises
4. **Audit trail** — all quote changes and order modifications must be logged (ISO 9001 requirement)
5. **Simplicity for field users** — sales reps and plant operators are not technical; the UI must be obvious

## Target Users

**External (Customers):**
- Procurement managers at construction firms
- Project engineers ordering to spec
- Distributor buyers placing high-volume repeat orders

**Internal:**
- Sales reps processing quotes and following up on opportunities
- Operations staff tracking production progress and logistics
- Finance team handling invoicing and credit limits

## Communication Style

- Formal and precise — this is a B2B industrial context; avoid casual language
- Technical detail is welcome; this is an engineering audience
- Compliance and audit context always matters ("this must be logged because ISO 9001")
- Prefer concrete examples over abstract principles

## What the Client Considers Done

A feature is "done" when:
- It handles edge cases typical in industrial ordering (partial shipments, spec changes mid-order, credit holds)
- It has an audit log entry for every state change
- Internal and external views are correctly separated (customers cannot see cost prices or margin data)
- It works reliably on desktop (back-office tool; mobile is secondary)

## Things to Avoid

- Rounding cost or margin data — precision matters in industrial pricing
- Removing audit log fields — even if they look unnecessary, they may be compliance-required
- Exposing internal pricing or margin data in customer-facing views
- Skipping validation on numeric inputs — incorrect weights or dimensions cost real money
- Over-building before validation — ship small, iterate based on ops team feedback
`;

  // Scaffold subscription-level folder (idempotent — only creates dir, not files)
  try { scaffoldSubscriptionInstructions(DEFAULT_SUB_ID); } catch (e) { console.warn('Could not scaffold subscription instructions:', e.message); }

  // Scaffold per-project instruction folders — only client.md + project.md per board (idempotent)
  try { scaffoldProjectInstructions(VELOUR_ID, DEFAULT_SUB_ID); } catch (e) { console.warn('Could not scaffold Velour instructions:', e.message); }
  try { scaffoldProjectInstructions(TGH_ID, DEFAULT_SUB_ID, tghClientMd, '# TGH Iron & Steel — Project Context\n\nAdd project-specific context here.\n'); } catch (e) { console.warn('Could not scaffold TGH instructions:', e.message); }

  // Migration: remove system files from per-project folders (both old and new paths)
  const SYSTEM_ONLY_FILES = ['pm.md', 'project-manager.md', 'developer.md', 'tester.md'];
  try {
    for (const { id, subscription_id } of db.prepare('SELECT id, subscription_id FROM projects').all()) {
      const subId = subscription_id || DEFAULT_SUB_ID;
      const projectDir = path.join(__dirname, '../../../instructions', subId, id);
      for (const file of SYSTEM_ONLY_FILES) {
        const fp = path.join(projectDir, file);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      }
    }
  } catch (e) { console.warn('Could not clean system files from project folders:', e.message); }

  // ── Clients table ────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      website TEXT,
      color TEXT DEFAULT '#6366f1',
      subscription_id TEXT REFERENCES subscriptions(id),
      created_by TEXT REFERENCES users(id),
      archived_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ── Subscriptions table ───────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_by TEXT REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ── Subscription admins (superadmins) ─────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscription_admins (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      added_by TEXT REFERENCES users(id),
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(subscription_id, user_id)
    );
  `);

  // Migration: add subscription_id, client_id, and created_by to projects
  {
    const projCols = db.prepare('PRAGMA table_info(projects)').all().map(c => c.name);
    if (!projCols.includes('subscription_id')) {
      db.exec('ALTER TABLE projects ADD COLUMN subscription_id TEXT REFERENCES subscriptions(id)');
      console.log('✅ Migrated: added subscription_id to projects');
    }
    if (!projCols.includes('client_id')) {
      db.exec('ALTER TABLE projects ADD COLUMN client_id TEXT REFERENCES clients(id)');
      console.log('✅ Migrated: added client_id to projects');
    }
    if (!projCols.includes('created_by')) {
      db.exec('ALTER TABLE projects ADD COLUMN created_by TEXT REFERENCES users(id)');
      console.log('✅ Migrated: added created_by to projects');
    }
  }

  // ── Invites table ──────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      invited_by TEXT REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      used_at DATETIME,
      used_by TEXT REFERENCES users(id)
    );
  `);

  // ── Task comments table ─────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_comments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ── Teams table ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT DEFAULT '#6366f1',
      created_by TEXT REFERENCES users(id),
      archived_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ── Team members table ───────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      user_id TEXT REFERENCES users(id),
      role TEXT DEFAULT 'member',
      invited_by TEXT REFERENCES users(id),
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(team_id, email)
    );
  `);

  // ── Project members table ────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_members (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      user_id TEXT REFERENCES users(id),
      role TEXT DEFAULT 'member',
      invited_by TEXT REFERENCES users(id),
      accepted_at DATETIME,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id, email)
    );
  `);
  // Migration: add accepted_at if missing
  {
    const pmCols = db.prepare('PRAGMA table_info(project_members)').all().map(c => c.name);
    if (!pmCols.includes('accepted_at')) {
      db.exec('ALTER TABLE project_members ADD COLUMN accepted_at DATETIME');
      // Auto-seeded (no invited_by) rows are implicitly accepted
      db.exec('UPDATE project_members SET accepted_at = added_at WHERE invited_by IS NULL');
      console.log('✅ Migrated: added accepted_at to project_members');
    }
  }

  // ── Seed default team ────────────────────────────────────────
  db.prepare(`INSERT OR IGNORE INTO teams (id, name, color) VALUES ('team_mycompany', 'My Company Team', '#6366f1')`).run();
  db.prepare(`INSERT OR IGNORE INTO team_members (id, team_id, email) VALUES ('tm_robin1', 'team_mycompany', 'lamborobin97@gmail.com')`).run();
  db.prepare(`INSERT OR IGNORE INTO team_members (id, team_id, email) VALUES ('tm_robin2', 'team_mycompany', 'robin.larsson@softronic.se')`).run();
  // Link existing users to team_members by email
  db.prepare(`UPDATE team_members SET user_id = (SELECT id FROM users WHERE email = team_members.email) WHERE user_id IS NULL`).run();

  // ── Seed default subscription ──────────────────────────────────────────────
  db.prepare(`INSERT OR IGNORE INTO subscriptions (id, name) VALUES (?, 'My Workspace')`).run(DEFAULT_SUB_ID);

  // Assign all existing boards to this subscription
  db.prepare(`UPDATE projects SET subscription_id = ? WHERE subscription_id IS NULL`).run(DEFAULT_SUB_ID);

  // Seed clients from existing client_name values on projects (idempotent)
  {
    const superAdmin = db.prepare("SELECT id FROM users WHERE email = 'lamborobin97@gmail.com'").get();
    const superAdminId = superAdmin?.id || null;

    // Set created_by on all projects that don't have it yet
    if (superAdminId) {
      db.prepare('UPDATE projects SET created_by = ? WHERE created_by IS NULL').run(superAdminId);
    }

    // Create client entities from unique client_name values and link back (idempotent)
    const projectsWithClient = db.prepare("SELECT DISTINCT client_name FROM projects WHERE client_name IS NOT NULL AND client_id IS NULL").all();
    for (const row of projectsWithClient) {
      let client = db.prepare('SELECT id FROM clients WHERE name = ? AND subscription_id = ?').get(row.client_name, DEFAULT_SUB_ID);
      if (!client) {
        const clientId = 'client_' + crypto.randomBytes(6).toString('hex');
        db.prepare('INSERT INTO clients (id, name, subscription_id, created_by) VALUES (?, ?, ?, ?)').run(clientId, row.client_name, DEFAULT_SUB_ID, superAdminId);
        client = { id: clientId };
        console.log('✅ Seeded client:', row.client_name);
      }
      db.prepare('UPDATE projects SET client_id = ? WHERE client_name = ? AND client_id IS NULL').run(client.id, row.client_name);
    }
  }

  // Seed lamborobin97@gmail.com as superadmin (idempotent)
  {
    const superAdminUser = db.prepare("SELECT id FROM users WHERE email = 'lamborobin97@gmail.com'").get();
    if (superAdminUser) {
      const saId = 'sa_' + require('crypto').randomBytes(6).toString('hex');
      db.prepare(`INSERT OR IGNORE INTO subscription_admins (id, subscription_id, user_id) VALUES (?, ?, ?)`)
        .run(saId, DEFAULT_SUB_ID, superAdminUser.id);
      console.log('✅ Seeded lamborobin97@gmail.com as superadmin');
    }
  }

  // Remove lamborobin97@gmail.com from My Company Team (superadmins don't need team membership)
  db.prepare(`DELETE FROM team_members WHERE team_id = 'team_mycompany' AND email = 'lamborobin97@gmail.com'`).run();

  // ── Seed project_members: only board owners (idempotent) ──
  // Access is explicit: owner on creation, then invite-only.
  // Note: bulk-cleanup was done as a one-time operation (fix-members.js, 2026-05-20).
  // This block only seeds owner rows for boards missing them — safe to run every restart.
  {
    const crypto = require('crypto');
    const projectsWithOwners = db.prepare("SELECT id, owner_id FROM projects WHERE owner_id IS NOT NULL AND archived_at IS NULL").all();
    for (const p of projectsWithOwners) {
      const ownerRow = db.prepare("SELECT email FROM users WHERE id = ?").get(p.owner_id);
      if (ownerRow) {
        const pmId = 'pm_' + crypto.randomBytes(6).toString('hex');
        db.prepare(`INSERT OR IGNORE INTO project_members (id, project_id, email, user_id, role, accepted_at) VALUES (?, ?, ?, ?, 'owner', CURRENT_TIMESTAMP)`).run(pmId, p.id, ownerRow.email, p.owner_id);
      }
    }
  }

  // Migration: add repo_url and client_path to projects
  {
    const projCols = db.prepare('PRAGMA table_info(projects)').all().map(c => c.name);
    if (!projCols.includes('repo_url')) {
      db.exec('ALTER TABLE projects ADD COLUMN repo_url TEXT');
      console.log('✅ Migrated: added repo_url to projects');
    }
    if (!projCols.includes('client_path')) {
      db.exec('ALTER TABLE projects ADD COLUMN client_path TEXT');
      console.log('✅ Migrated: added client_path to projects');
    }
  }

  console.log('✅ Database initialized at', DB_PATH);
  return db;
}

module.exports = { getDb, initDb, VELOUR_ID, TGH_ID, generateProjectId };
