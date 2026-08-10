const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { TEST_CLIENT_ID, MY_BOARD_ID, DEFAULT_SUB_ID } = require('../config/constants');
const { seedDefaults } = require('../seed');

// No migrations. Schema changes require dropping autokan.db (local dev only) —
// see this repo's development conventions, Database section.

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/autokan.db');

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
    applySchema(db);
    seedDefaults(db);
    console.log('✅ Database ready at', DB_PATH);
  }
  return db;
}

function applySchema(db) {

  db.exec(`
    -- ── Users ────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      google_id TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      first_name TEXT,
      last_name TEXT,
      picture TEXT,
      company_name TEXT,
      notifications_inapp INTEGER DEFAULT 1,
      notifications_email INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Subscriptions ────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_by TEXT REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subscription_admins (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      added_by TEXT REFERENCES users(id),
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(subscription_id, user_id)
    );

    -- ── Clients ──────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      website TEXT,
      color TEXT DEFAULT '#6366f1',
      sector TEXT DEFAULT 'software',
      subscription_id TEXT REFERENCES subscriptions(id),
      created_by TEXT REFERENCES users(id),
      archived_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Projects (boards) ────────────────────────────────────
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      client_name TEXT,
      color TEXT DEFAULT '#6366f1',
      emoji TEXT DEFAULT '📋',
      owner_id TEXT REFERENCES users(id),
      subscription_id TEXT REFERENCES subscriptions(id),
      client_id TEXT REFERENCES clients(id),
      created_by TEXT REFERENCES users(id),
      repo_url TEXT,
      client_path TEXT,
      sector TEXT DEFAULT 'software',
      hidden_capability_ids TEXT DEFAULT '[]',
      archived_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Columns (kanban) ─────────────────────────────────────
    CREATE TABLE IF NOT EXISTS columns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      position INTEGER NOT NULL,
      color TEXT DEFAULT '#6366f1',
      is_protected INTEGER DEFAULT 0,
      project_id TEXT REFERENCES projects(id),
      archived_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Roles ────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      allowed_column_ids TEXT DEFAULT '[]',
      color TEXT DEFAULT '#6b7280',
      is_system INTEGER DEFAULT 1,
      type TEXT DEFAULT 'column_access'
    );

    -- ── Agents ───────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      model TEXT DEFAULT 'claude-sonnet-4-5',
      description TEXT,
      permissions TEXT NOT NULL DEFAULT '[]',
      role_ids TEXT DEFAULT '[]',
      personality_file TEXT,
      is_template INTEGER DEFAULT 0,
      system_prompt TEXT,
      color TEXT DEFAULT '#6366f1',
      active INTEGER DEFAULT 1,
      project_id TEXT REFERENCES projects(id),
      created_from_template_id TEXT,
      archived_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Agent templates ──────────────────────────────────────
    CREATE TABLE IF NOT EXISTS agent_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      model TEXT DEFAULT 'claude-sonnet-4-5',
      color TEXT DEFAULT '#6366f1',
      suggested_role TEXT,
      template_system_prompt TEXT,
      permissions TEXT DEFAULT '[]',
      source_agent_id TEXT REFERENCES agents(id),
      archived_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Tasks ────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      column_id TEXT NOT NULL REFERENCES columns(id),
      project_id TEXT REFERENCES projects(id),
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
      pm_checklist TEXT,
      pm_client_context_draft TEXT,
      pr_url TEXT,
      auto_complete INTEGER DEFAULT 0,
      archived_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

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

    CREATE TABLE IF NOT EXISTS task_approvals (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      approver_id TEXT NOT NULL REFERENCES agents(id),
      approval_type TEXT NOT NULL CHECK(approval_type IN ('pm_review', 'human_approval')),
      status TEXT NOT NULL CHECK(status IN ('approved', 'rejected')),
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS task_comments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Invites ──────────────────────────────────────────────
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

    -- ── Teams ────────────────────────────────────────────────
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

    CREATE TABLE IF NOT EXISTS project_members (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      user_id TEXT REFERENCES users(id),
      role TEXT DEFAULT 'member',
      role_ids TEXT DEFAULT '["role_access_any"]',
      invited_by TEXT REFERENCES users(id),
      accepted_at DATETIME,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id, email)
    );

    -- ── Notifications ────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      link TEXT,
      read_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Benchmark cases (rule-compliance probes) ────────────
    CREATE TABLE IF NOT EXISTS benchmark_cases (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      layer TEXT NOT NULL CHECK(layer IN ('workspace','board')),
      rule_reference TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      rubric TEXT NOT NULL DEFAULT '{}',
      source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','ai_generated','ai_edited','cloned_task')),
      created_by TEXT REFERENCES users(id),
      archived_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Benchmark runs (one row per execution, never overwritten) ─
    CREATE TABLE IF NOT EXISTS benchmark_runs (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES benchmark_cases(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id),
      probing_task_id TEXT REFERENCES tasks(id),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','dispatched','completed','error','timeout')),
      deterministic_result TEXT,
      judge_result TEXT,
      manual_review TEXT,
      review_provenance TEXT NOT NULL DEFAULT 'unreviewed' CHECK(review_provenance IN ('unreviewed','ai','human')),
      context_version TEXT,
      error_message TEXT,
      triggered_by TEXT REFERENCES users(id),
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    );

    -- ── Triggers (updated_at) ────────────────────────────────
    CREATE TRIGGER IF NOT EXISTS tasks_updated_at
      AFTER UPDATE ON tasks
      BEGIN UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

    CREATE TRIGGER IF NOT EXISTS agents_updated_at
      AFTER UPDATE ON agents
      BEGIN UPDATE agents SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

    CREATE TRIGGER IF NOT EXISTS agent_templates_updated_at
      AFTER UPDATE ON agent_templates
      BEGIN UPDATE agent_templates SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

    CREATE TRIGGER IF NOT EXISTS benchmark_cases_updated_at
      AFTER UPDATE ON benchmark_cases
      BEGIN UPDATE benchmark_cases SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;
  `);

}

module.exports = { getDb };
