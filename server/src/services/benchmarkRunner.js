const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const Anthropic = require('@anthropic-ai/sdk');
const { getDb } = require('../db');
const { GLOBAL_INSTRUCTIONS_DIR, PROJECT_ROOT } = require('../utils/instructions');

// ── Benchmark Tasks runner ──────────────────────────────────────────────────
//
// Blind testing: this file never tells the planner which layer is under test,
// and never gives it "this is a benchmark" awareness. It creates the probing
// task through the exact same POST /api/tasks route a genuine task takes
// (same validation, same triggerRunner() call), so dispatch() /
// runClarifyAndApprove() / buildContextBlock() in agentRunner.js run
// completely untouched — nothing in this file imports or forks the planner's
// tool set. Only the comparison step below (scoreDeterministic / the judge
// call) "knows" what's being probed.

const PORT = process.env.PORT || 3001;
const VALID_REVIEW_LEVELS = ['unacceptable', 'less_acceptable', 'accepted', 'very_good', 'fully_satisfied'];

let _client;
function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set in server/.env');
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// ── Context version snapshot ──────────────────────────────────────────────
// Records which version of docs/rules.md + the active workspace/board docs
// were in force when a run executed, so the run stays interpretable even if
// those files are edited later.
function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function snapshotContextVersion(subscriptionId, projectId) {
  const files = [];
  const add = (label, absPath) => {
    if (!fs.existsSync(absPath)) return;
    files.push({ path: label, hash: hashContent(fs.readFileSync(absPath, 'utf8')) });
  };

  add('docs/rules.md', path.join(PROJECT_ROOT, 'docs', 'rules.md'));

  if (subscriptionId) {
    const wsDir = path.join(GLOBAL_INSTRUCTIONS_DIR, subscriptionId);
    if (fs.existsSync(wsDir)) {
      for (const f of fs.readdirSync(wsDir).filter(n => n.endsWith('.md'))) {
        add(`instructions/${subscriptionId}/${f}`, path.join(wsDir, f));
      }
    }
  }
  if (subscriptionId && projectId) {
    const boardDir = path.join(GLOBAL_INSTRUCTIONS_DIR, subscriptionId, projectId);
    if (fs.existsSync(boardDir)) {
      for (const f of fs.readdirSync(boardDir).filter(n => n.endsWith('.md'))) {
        add(`instructions/${subscriptionId}/${projectId}/${f}`, path.join(boardDir, f));
      }
    }
  }
  return files;
}

// ── Deterministic scoring ──────────────────────────────────────────────────
// Which of the 4 real planner tools fired. suggest_split/suggest_abandon log
// the same 'pm_question' action as a plain ask_question — they're only
// distinguishable via task.metadata (split_proposal / abandon_proposal),
// mirroring agentRunner.js's own handling.
function firedTool(task, logs) {
  const metadata = JSON.parse(task.metadata || '{}');
  if (task.pm_approval_status === 'approved') return 'approve_task';
  if (metadata.split_proposal) return 'suggest_split';
  if (metadata.abandon_proposal) return 'suggest_abandon';
  if (logs.some(l => l.action === 'pm_question')) return 'ask_question';
  return null;
}

function scoreDeterministic(task, logs, rubric = {}) {
  const checks = [];
  const tool = firedTool(task, logs);

  if (rubric.expected_tool) {
    checks.push({
      name: 'expected_tool',
      passed: tool === rubric.expected_tool,
      detail: `expected "${rubric.expected_tool}", got "${tool || 'none'}"`,
    });
  }

  const checklist = task.pm_checklist ? JSON.parse(task.pm_checklist) : [];
  if (rubric.checklist_count_min != null) {
    checks.push({
      name: 'checklist_count_min',
      passed: checklist.length >= rubric.checklist_count_min,
      detail: `min ${rubric.checklist_count_min}, got ${checklist.length}`,
    });
  }
  if (rubric.checklist_count_max != null) {
    checks.push({
      name: 'checklist_count_max',
      passed: checklist.length <= rubric.checklist_count_max,
      detail: `max ${rubric.checklist_count_max}, got ${checklist.length}`,
    });
  }

  const messageText = [task.pm_pending_question, task.pm_review_comment].filter(Boolean).join('\n').toLowerCase();
  for (const field of rubric.required_fields || []) {
    checks.push({
      name: `required:${field}`,
      passed: messageText.includes(String(field).toLowerCase()),
      detail: `looked for "${field}" in the planner's output`,
    });
  }
  for (const bad of rubric.forbidden_substrings_in_message || []) {
    checks.push({
      name: `forbidden:${bad}`,
      passed: !messageText.includes(String(bad).toLowerCase()),
      detail: `checked absence of "${bad}" in the planner's output`,
    });
  }

  return { passed: checks.length > 0 && checks.every(c => c.passed), tool_fired: tool, checks };
}

// ── Run creation & dispatch ─────────────────────────────────────────────────
// Creates the probing task through the real POST /api/tasks route (the exact
// path a genuine PM-assigned task takes) so the real dispatch/runClarifyAndApprove
// flow executes untouched, then polls for the planner's real output.
async function createRunAndDispatch(caseRow, { projectId, userId } = {}) {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) throw new Error('Unknown project');

  const candidateAgents = db.prepare('SELECT * FROM agents WHERE project_id = ? AND active = 1').all(projectId);
  const agent = candidateAgents.find(a => {
    try { return JSON.parse(a.role_ids || '[]').includes('perm_planning'); }
    catch { return false; }
  });
  if (!agent) throw new Error('This board has no active planning-capable agent to run the case against.');

  const res = await fetch(`http://localhost:${PORT}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-agent-id': 'human' },
    body: JSON.stringify({
      title: caseRow.title,
      description: caseRow.description,
      column_id: 'col_backlog',
      assigned_agent_id: agent.id,
      project_id: projectId,
      // Probing tasks go through the real creation/dispatch pipeline (that's what
      // makes the blind test trustworthy) but must never show up as real board work —
      // tasks.js's list route and other.js's column-count query both exclude this flag.
      metadata: { is_benchmark_probe: true },
    }),
  });
  if (!res.ok) throw new Error(`Probing task creation failed (${res.status})`);
  const task = await res.json();

  const runId = 'bmr_' + uuidv4().replace(/-/g, '').slice(0, 12);
  const contextVersion = snapshotContextVersion(project.subscription_id, projectId);
  db.prepare(`
    INSERT INTO benchmark_runs (id, case_id, project_id, probing_task_id, status, context_version, triggered_by)
    VALUES (?, ?, ?, ?, 'dispatched', ?, ?)
  `).run(runId, caseRow.id, projectId, task.id, JSON.stringify(contextVersion), userId || null);

  pollAndScore(runId).catch(err => console.error('[benchmarkRunner] poll error:', err.message));

  return db.prepare('SELECT * FROM benchmark_runs WHERE id = ?').get(runId);
}

// Shared by the automatic post-run judging below and the manual re-review action —
// this is the ONLY check that actually reads the board's real rule docs and judges
// whether the planner's output respects them in substance. The deterministic check
// (scoreDeterministic, above) is intentionally mechanical — tool used, item counts,
// exact substrings — it cannot tell you whether a rule was actually followed, only
// whether the shape of the output looked roughly right. This is why judging runs
// automatically on completion instead of staying a manual "maybe later" action.
async function callJudge(task, logs, judgeRubric) {
  const outputSummary = [
    `Tool fired: ${firedTool(task, logs) || '(none)'}`,
    `Question/message: ${task.pm_pending_question || '(none)'}`,
    `Review comment: ${task.pm_review_comment || '(none)'}`,
    `Checklist: ${task.pm_checklist || '(none)'}`,
  ].join('\n');

  const response = await getClient().messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 512,
    system: 'You are grading whether an AI planning agent\'s real output respected a specific rule under test. Respond only by calling the verdict tool.',
    tools: [{
      name: 'verdict',
      description: 'Report the review verdict for this run.',
      input_schema: {
        type: 'object',
        properties: {
          passed: { type: 'boolean' },
          rationale: { type: 'string' },
        },
        required: ['passed', 'rationale'],
      },
    }],
    tool_choice: { type: 'tool', name: 'verdict' },
    messages: [{
      role: 'user',
      content: `Rule being probed: ${judgeRubric.instructions || '(no instructions provided)'}\nPass criteria: ${judgeRubric.pass_criteria || '(none provided)'}\n\nActual planner output:\n${outputSummary}`,
    }],
  });

  const block = response.content.find(b => b.type === 'tool_use');
  return block ? block.input : { passed: false, rationale: 'Judge model did not return a verdict.' };
}

async function pollAndScore(runId, { timeoutMs = 90000, intervalMs = 2000 } = {}) {
  const db = getDb();
  const run = db.prepare('SELECT * FROM benchmark_runs WHERE id = ?').get(runId);
  if (!run) return;

  const deadline = Date.now() + timeoutMs;
  let task, logs, settled = false;
  while (Date.now() < deadline) {
    task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(run.probing_task_id);
    logs = db.prepare('SELECT * FROM task_logs WHERE task_id = ? ORDER BY created_at ASC').all(run.probing_task_id);
    settled = logs.some(l => ['pm_question', 'pm_reviewed'].includes(l.action));
    if (settled) break;
    await sleep(intervalMs);
  }

  if (!settled) {
    db.prepare(`UPDATE benchmark_runs SET status = 'timeout', completed_at = CURRENT_TIMESTAMP WHERE id = ?`).run(runId);
    return;
  }

  const caseRow = db.prepare('SELECT * FROM benchmark_cases WHERE id = ?').get(run.case_id);
  const rubric = JSON.parse(caseRow.rubric || '{}');
  const deterministic = scoreDeterministic(task, logs, rubric.deterministic || {});

  // Judge automatically whenever the case has a judge rubric to grade against —
  // a run isn't meaningfully "done" until the substance has been checked, not just
  // the shape. If the model call itself fails, leave judge_result null rather than
  // failing the whole run — the deterministic result and raw output are still there.
  let judgeResult = null;
  const judgeRubric = rubric.judge || {};
  if (judgeRubric.instructions || judgeRubric.pass_criteria) {
    try { judgeResult = await callJudge(task, logs, judgeRubric); }
    catch (err) { console.error('[benchmarkRunner] auto-judge failed:', err.message); }
  }

  db.prepare(`
    UPDATE benchmark_runs SET status = 'completed', deterministic_result = ?, judge_result = ?,
      review_provenance = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(JSON.stringify(deterministic), judgeResult ? JSON.stringify(judgeResult) : null,
    judgeResult ? 'ai' : 'unreviewed', runId);
}

// ── On-demand review actions ────────────────────────────────────────────────
// Manual re-review — the run is already auto-judged on completion (see pollAndScore
// above); this re-runs the same judge call for when the reviewer wants a fresh pass
// (e.g. after tightening the case's judge rubric) or the auto-judge failed.

async function reviewWithAI(runId) {
  const db = getDb();
  const run = db.prepare('SELECT * FROM benchmark_runs WHERE id = ?').get(runId);
  if (!run) throw new Error('Run not found');
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(run.probing_task_id);
  const logs = db.prepare('SELECT * FROM task_logs WHERE task_id = ? ORDER BY created_at ASC').all(run.probing_task_id);
  const caseRow = db.prepare('SELECT * FROM benchmark_cases WHERE id = ?').get(run.case_id);
  const judgeRubric = (JSON.parse(caseRow.rubric || '{}')).judge || {};

  const verdict = await callJudge(task, logs, judgeRubric);

  db.prepare(`UPDATE benchmark_runs SET judge_result = ?, review_provenance = 'ai' WHERE id = ?`)
    .run(JSON.stringify(verdict), runId);

  return db.prepare('SELECT * FROM benchmark_runs WHERE id = ?').get(runId);
}

function submitManualReview(runId, { level, notes, reviewerId } = {}) {
  if (!VALID_REVIEW_LEVELS.includes(level)) {
    throw new Error(`Invalid review level. Must be one of: ${VALID_REVIEW_LEVELS.join(', ')}`);
  }
  const db = getDb();
  const run = db.prepare('SELECT * FROM benchmark_runs WHERE id = ?').get(runId);
  if (!run) throw new Error('Run not found');

  const manualReview = {
    level,
    notes: notes || null,
    reviewer: reviewerId || null,
    reviewed_at: new Date().toISOString(),
  };
  db.prepare(`UPDATE benchmark_runs SET manual_review = ?, review_provenance = 'human' WHERE id = ?`)
    .run(JSON.stringify(manualReview), runId);

  return db.prepare('SELECT * FROM benchmark_runs WHERE id = ?').get(runId);
}

// ── AI-drafted case ──────────────────────────────────────────────────────────
// Proposes ONE case derived from a board's real, already-existing rule docs —
// never fabricated sector content. Returns a draft only — nothing is persisted
// here; the user reviews/edits the draft in the UI and it's saved via the normal
// case-creation path (POST /cases), same as a fully manual case.

function listBoardDocs(subscriptionId, projectId) {
  const dir = path.join(GLOBAL_INSTRUCTIONS_DIR, subscriptionId, projectId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => ({ name: f, content: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

// Shape shared by both the whole-task draft and the rubric-only draft below —
// this is internal scoring machinery. It is never surfaced to the user; the UI
// only ever collects a title and description.
const RUBRIC_SCHEMA = {
  type: 'object',
  properties: {
    deterministic: {
      type: 'object',
      description: 'Mechanical substring/count checks — no judgment involved, so keep every check something you are certain correct handling produces. When in doubt, leave a field out and rely on the judge rubric below instead of guessing.',
      properties: {
        expected_tool: { type: 'string', enum: ['ask_question', 'approve_task', 'suggest_split', 'suggest_abandon'] },
        checklist_count_min: { type: 'integer' },
        checklist_count_max: {
          type: 'integer',
          description: 'Upper bound on checklist length. Leave generous headroom above checklist_count_min — a thorough planner reasonably adds items for already-confirmed facts alongside open questions, not just the bare-minimum questions. Prefer min + 4 or more, or omit this field entirely if unsure.',
        },
        required_fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Exact substrings checked case-insensitively against the planner\'s raw message text. Never use a generic word describing the MESSAGE TYPE itself (e.g. "question", "message", "note", "concern") — a planner can correctly ask a question without ever typing the word "question". Only add an entry for a specific, concrete term from the task or rule doc that correct handling would plausibly quote verbatim (a named field, a number, a specific policy term).',
        },
        forbidden_substrings_in_message: { type: 'array', items: { type: 'string' } },
      },
    },
    judge: {
      type: 'object',
      description: 'The AI-judge rubric — this is where nuanced, substance-based pass/fail judgment belongs. Prefer putting anything uncertain here rather than forcing it into a brittle deterministic check.',
      properties: {
        instructions: { type: 'string' },
        pass_criteria: { type: 'string' },
      },
    },
  },
};

async function draftCaseFromBoard(projectId, subscriptionId) {
  const docs = listBoardDocs(subscriptionId, projectId);
  if (docs.length === 0) throw new Error('This board has no board-level context docs to probe yet.');

  const docsBlock = docs.map(d => `### ${d.name}\n${d.content}`).join('\n\n---\n\n');

  // Boards whose docs only clearly support one obvious scenario otherwise converge on
  // the same canonical case almost every click — feed back what's already been drafted
  // for this board so the model is explicitly nudged toward a different rule/angle.
  const db = getDb();
  const previousTitles = db.prepare(
    `SELECT title FROM benchmark_cases WHERE project_id = ? AND source IN ('ai_generated','ai_edited') AND archived_at IS NULL ORDER BY created_at DESC LIMIT 10`
  ).all(projectId).map(r => r.title);
  const avoidBlock = previousTitles.length
    ? `\n\nAlready-drafted cases for this board — propose something meaningfully different (a different rule, scenario, or angle), do not restate these:\n${previousTitles.map(t => `- ${t}`).join('\n')}`
    : '';

  const response = await getClient().messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1200,
    temperature: 1,
    system: 'You design rule-compliance benchmark cases for an AI planning agent. Given a board\'s real rule documents, propose ONE synthetic probing task whose correct handling would reveal whether the planner violates one of these rules. The probing task itself must be original/synthetic (not copied from anywhere), but it must probe a rule that genuinely exists in the documents given. Respond only via the propose_case tool.',
    tools: [{
      name: 'propose_case',
      description: 'Propose one rule-compliance benchmark case.',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string', description: 'The full probing task description, sent verbatim to the planner as the task brief.' },
          rule_reference: { type: 'string', description: 'Which document/rule this case probes.' },
          rubric: RUBRIC_SCHEMA,
        },
        required: ['title', 'description', 'rubric'],
      },
    }],
    tool_choice: { type: 'tool', name: 'propose_case' },
    messages: [{ role: 'user', content: `Board's real rule documents:\n\n${docsBlock}${avoidBlock}` }],
  });

  const block = response.content.find(b => b.type === 'tool_use');
  if (!block) throw new Error('Model did not propose a case.');
  const { title, description, rule_reference, rubric } = block.input;

  return { title, description, rule_reference: rule_reference || null, rubric: rubric || {} };
}

// Auto-generates a rubric for a title+description the user already decided on
// (manual entry or cloned from a real task) — the user never sees or picks tool
// names; the backend infers what "correct handling" should look like on its own,
// grounded in the board's real docs when there are any.
async function draftRubricForTask(title, description, projectId, subscriptionId) {
  const docs = listBoardDocs(subscriptionId, projectId);
  const docsBlock = docs.length
    ? docs.map(d => `### ${d.name}\n${d.content}`).join('\n\n---\n\n')
    : '(This board has no board-level rule documents yet — judge against general System Rules only.)';

  const response = await getClient().messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 800,
    system: 'You design rule-compliance benchmark scoring for an AI planning agent. The probing task\'s title and description are already fixed — propose a rubric to evaluate whether the planner handles THIS EXACT task correctly, grounded in the board\'s real rule documents when given. Respond only via the propose_rubric tool.',
    tools: [{
      name: 'propose_rubric',
      description: 'Propose a rubric for the given probing task.',
      input_schema: { type: 'object', properties: { rubric: RUBRIC_SCHEMA }, required: ['rubric'] },
    }],
    tool_choice: { type: 'tool', name: 'propose_rubric' },
    messages: [{
      role: 'user',
      content: `Probing task:\nTitle: ${title}\nDescription: ${description}\n\nBoard's real rule documents:\n\n${docsBlock}`,
    }],
  });

  const block = response.content.find(b => b.type === 'tool_use');
  return block ? (block.input.rubric || {}) : {};
}

module.exports = {
  createRunAndDispatch,
  reviewWithAI,
  submitManualReview,
  draftCaseFromBoard,
  draftRubricForTask,
  snapshotContextVersion,
  scoreDeterministic,
  VALID_REVIEW_LEVELS,
};
