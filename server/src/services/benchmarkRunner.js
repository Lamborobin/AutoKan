const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const Anthropic = require('@anthropic-ai/sdk');
const { getDb } = require('../db');
const { GLOBAL_INSTRUCTIONS_DIR, PROJECT_ROOT } = require('../utils/instructions');
const { triggerRunner } = require('./agentRunner');

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
const PLANNING_CAPABILITY = 'perm_planning';
const PRODUCING_CAPABILITY = 'perm_producing';
const VERIFYING_CAPABILITY = 'perm_verifying';

const CAPABILITY_LABELS = {
  [PLANNING_CAPABILITY]: 'AI planning agent (clarifies requirements with the client before any work begins)',
  [PRODUCING_CAPABILITY]: 'AI document-producing agent (writes a structured document from a brief)',
  [VERIFYING_CAPABILITY]: 'AI document-verification agent (checks a produced document against a standard and reports pass/fail)',
};

// Column a fresh probing task starts in per capability — mirrors the real runner
// registry in runners.json (planning starts in Backlog, producing in In Progress,
// verifying in Testing).
const CAPABILITY_START_COLUMN = {
  [PLANNING_CAPABILITY]: 'col_backlog',
  [PRODUCING_CAPABILITY]: 'col_inprogress',
  [VERIFYING_CAPABILITY]: 'col_testing',
};

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
// Any OTHER tool the agent called — one that doesn't determine the task's outcome,
// just does something on the side (e.g. notify_all). These never touch task state, so
// firedTool() below can't see them. Every such tool logs a plain 'note' entry instead
// (the same convention runPlaceholder already used) — reading that convention back
// here means a brand-new side-effect tool needs ZERO changes in this file to become
// visible to the judge and the benchmark UI. Only add real detection logic (a rubric
// field, a pass/fail check) if the tool's behaviour needs to be enforced, not just seen.
function sideEffectsFired(logs) {
  return logs.filter(l => l.action === 'note').map(l => l.message);
}

function readProducedFile(relPath) {
  if (!relPath) return '';
  try { return fs.readFileSync(path.join(PROJECT_ROOT, relPath), 'utf8'); }
  catch { return ''; }
}

// One row per capability being benchmarked — everything pollAndScore/scoreDeterministic/
// callJudge need that varies by WHICH capability is under test, so those functions stay
// generic and a new capability is a new row here, not new branching inside them.
//
//  - settledActions: task_logs action names that mean "this run is done, go score it"
//  - outcomeSignals: which OUTCOME tool fired — the one that decides how the task was
//    left. Same shape as the old Planning-only OUTCOME_TOOL_SIGNALS — see dev/agents.md's
//    "Adding a New Agent Tool" checklist for when a new tool needs a row here.
//  - toolsWithoutChecklist: outcome tools that never populate pm_checklist — Planning-only,
//    other capabilities just leave this empty since they have no checklist concept.
//  - checkText: plain text used by the deterministic required_fields/forbidden_substrings
//    checks. MUST match exactly what a rubric author would expect to grep — kept narrow
//    and literal, unlike judgeSummaryLines below.
//  - judgeSummaryLines: richer, labelled lines fed to the AI judge — the judge reads
//    prose, so this can (and should) include more context than checkText needs.
const CAPABILITY_PROBES = {
  [PLANNING_CAPABILITY]: {
    settledActions: ['pm_question', 'pm_reviewed'],
    outcomeSignals: [
      { tool: 'approve_task', test: (task) => task.pm_approval_status === 'approved' },
      { tool: 'suggest_split', test: (task, metadata) => !!metadata.split_proposal },
      { tool: 'suggest_abandon', test: (task, metadata) => !!metadata.abandon_proposal },
      { tool: 'ask_question', test: (task, metadata, logs) => logs.some(l => l.action === 'pm_question') },
    ],
    toolsWithoutChecklist: ['suggest_split', 'suggest_abandon'],
    checkText: (task) => [task.pm_pending_question, task.pm_review_comment].filter(Boolean).join('\n'),
    judgeSummaryLines: (task, logs, tool) => [
      `Tool fired: ${tool || '(none)'}`,
      `Question/message: ${task.pm_pending_question || '(none)'}`,
      `Review comment: ${task.pm_review_comment || '(none)'}`,
      `Checklist: ${task.pm_checklist || '(none)'}`,
    ],
  },
  [PRODUCING_CAPABILITY]: {
    settledActions: ['document_produced', 'human_action_requested'],
    outcomeSignals: [
      { tool: 'task_complete', test: (task, metadata, logs) => logs.some(l => l.action === 'document_produced') },
      { tool: 'request_human', test: (task, metadata, logs) => logs.some(l => l.action === 'human_action_requested') },
    ],
    toolsWithoutChecklist: [],
    checkText: (task, logs) => {
      const log = logs.find(l => l.action === 'document_produced');
      const docPath = JSON.parse(task.metadata || '{}').produced_document_path;
      return [log?.message, readProducedFile(docPath)].filter(Boolean).join('\n\n');
    },
    judgeSummaryLines: (task, logs, tool) => {
      const log = logs.find(l => l.action === 'document_produced');
      const docPath = JSON.parse(task.metadata || '{}').produced_document_path;
      return [
        `Tool fired: ${tool || '(none)'}`,
        `Produced document path: ${docPath || '(none)'}`,
        `Summary given by the agent: ${log?.message || '(none)'}`,
        `Actual document content:\n${docPath ? (readProducedFile(docPath) || '(could not read the file at that path)') : '(no path recorded)'}`,
      ];
    },
  },
  [VERIFYING_CAPABILITY]: {
    settledActions: ['verification_passed', 'verification_failed', 'human_action_requested'],
    outcomeSignals: [
      { tool: 'task_complete_pass', test: (task, metadata, logs) => logs.some(l => l.action === 'verification_passed') },
      { tool: 'task_complete_fail', test: (task, metadata, logs) => logs.some(l => l.action === 'verification_failed') },
      { tool: 'request_human', test: (task, metadata, logs) => logs.some(l => l.action === 'human_action_requested') },
    ],
    toolsWithoutChecklist: [],
    checkText: (task, logs) => {
      const log = logs.find(l => ['verification_passed', 'verification_failed'].includes(l.action));
      return log?.message || '';
    },
    judgeSummaryLines: (task, logs, tool) => {
      const log = logs.find(l => ['verification_passed', 'verification_failed'].includes(l.action));
      const verifiedPath = JSON.parse(task.metadata || '{}').verified_document_path;
      return [
        `Tool fired: ${tool || '(none)'}`,
        `Document it checked: ${verifiedPath || '(none)'}`,
        `Verifier's verdict and summary: ${log?.message || '(none)'}`,
      ];
    },
  },
};

function probeFor(capability) {
  return CAPABILITY_PROBES[capability] || CAPABILITY_PROBES[PLANNING_CAPABILITY];
}

function firedTool(task, logs, capability = PLANNING_CAPABILITY) {
  const metadata = JSON.parse(task.metadata || '{}');
  const signal = probeFor(capability).outcomeSignals.find(s => s.test(task, metadata, logs));
  return signal ? signal.tool : null;
}

function scoreDeterministic(task, logs, rubric = {}, capability = PLANNING_CAPABILITY) {
  const checks = [];
  const probe = probeFor(capability);
  const tool = firedTool(task, logs, capability);

  // expected_tool may be a single tool name or an array of equally-acceptable tools
  // (e.g. a task that's ambiguous enough to justify either a clarifying question or a
  // split proposal) — either shape is scored the same way, against a set of options.
  if (rubric.expected_tool) {
    const expected = Array.isArray(rubric.expected_tool) ? rubric.expected_tool : [rubric.expected_tool];
    checks.push({
      name: 'expected_tool',
      passed: expected.includes(tool),
      detail: `expected "${expected.join('" or "')}", got "${tool || 'none'}"`,
    });
  }

  // Checklist checks only mean anything for Planning (pm_checklist is a Planner-only field).
  if (capability === PLANNING_CAPABILITY) {
    const checklist = task.pm_checklist ? JSON.parse(task.pm_checklist) : [];
    if (!probe.toolsWithoutChecklist.includes(tool)) {
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
    }
  }

  const messageText = probe.checkText(task, logs).toLowerCase();
  for (const field of rubric.required_fields || []) {
    checks.push({
      name: `required:${field}`,
      passed: messageText.includes(String(field).toLowerCase()),
      detail: `looked for "${field}" in the agent's output`,
    });
  }
  for (const bad of rubric.forbidden_substrings_in_message || []) {
    checks.push({
      name: `forbidden:${bad}`,
      passed: !messageText.includes(String(bad).toLowerCase()),
      detail: `checked absence of "${bad}" in the agent's output`,
    });
  }

  return {
    // null (not false) when there's nothing to check — a case with an empty rubric
    // (e.g. the background auto-draft hadn't finished, or genuinely has no deterministic
    // checks) shouldn't render as a red "failed" badge for having nothing to fail.
    passed: checks.length === 0 ? null : checks.every(c => c.passed),
    tool_fired: tool,
    checks,
    side_effects: sideEffectsFired(logs),
  };
}

// ── Run creation & dispatch ─────────────────────────────────────────────────
// Creates the probing task through the real POST /api/tasks route (the exact
// path a genuine assignment takes) so the real dispatch/handler flow executes
// untouched, then polls for the agent's real output.

function findCapableAgent(projectId, capability) {
  const db = getDb();
  const candidates = db.prepare('SELECT * FROM agents WHERE project_id = ? AND active = 1').all(projectId);
  return candidates.find(a => {
    try { return JSON.parse(a.role_ids || '[]').includes(capability); }
    catch { return false; }
  }) || null;
}

async function dispatchProbingTask({ title, description, columnId, agentId, projectId, capability }) {
  const res = await fetch(`http://localhost:${PORT}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-agent-id': 'human' },
    body: JSON.stringify({
      title,
      description,
      column_id: columnId,
      assigned_agent_id: agentId,
      project_id: projectId,
      // Probing tasks go through the real creation/dispatch pipeline (that's what
      // makes the blind test trustworthy) but must never show up as real board work —
      // tasks.js's list route and other.js's column-count query both exclude this flag.
      metadata: { is_benchmark_probe: true },
    }),
  });
  if (!res.ok) throw new Error(`Probing task creation failed (${res.status})`);
  const task = await res.json();

  // POST /tasks only auto-triggers a runner as a Planning-specific special case (a
  // planning-capable agent assigned in col_backlog) — a task created pre-assigned into
  // any other column/capability (exactly what Producing/Verifying probing tasks are)
  // never gets dispatched by that route at all. Trigger it explicitly here for anything
  // that isn't Planning, so the run doesn't just sit until pollAndScore times out.
  if (capability !== PLANNING_CAPABILITY) triggerRunner(task.id);

  return task;
}

// Polls task_logs until one of the given settled-action names shows up (or times out),
// then returns the task row + full log history as of that moment. Shared by pollAndScore
// (waiting on the task that actually gets scored) and the Verify two-stage dispatch below
// (waiting on the upstream Producing stage before Verify can even start).
// Default timeout (270s) stays above produce_document's own 4-minute wall-clock cap
// in agentRunner.js (verify_document's is still 3 min), so a handler that hits its
// own limit has time to write its Human Action escalation before this poll gives up.
async function waitForSettlement(taskId, settledActions, { timeoutMs = 270000, intervalMs = 2000 } = {}) {
  const db = getDb();
  const deadline = Date.now() + timeoutMs;
  let task, logs, settled = false;
  while (Date.now() < deadline) {
    task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    logs = db.prepare('SELECT * FROM task_logs WHERE task_id = ? ORDER BY created_at ASC').all(taskId);
    settled = logs.some(l => settledActions.includes(l.action));
    if (settled) break;
    await sleep(intervalMs);
  }
  return { task, logs, settled };
}

async function createRunAndDispatch(caseRow, { projectId, userId } = {}) {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) throw new Error('Unknown project');

  const capability = caseRow.capability || PLANNING_CAPABILITY;
  const agent = findCapableAgent(projectId, capability);
  if (!agent) throw new Error(`This board has no active ${CAPABILITY_LABELS[capability] || capability} to run the case against.`);

  // Verify has nothing to check until a real document exists — dispatch a Producing
  // run on the same brief first and wait for it to settle, so Verify is checking a
  // genuine document rather than a fixture. Recorded as source_task_id so it's
  // traceable; probing_task_id (below) stays the task that's actually scored.
  let sourceTaskId = null;
  if (capability === VERIFYING_CAPABILITY) {
    const producingAgent = findCapableAgent(projectId, PRODUCING_CAPABILITY);
    if (!producingAgent) throw new Error('This board has no active producing-capable agent — a Verify case needs one to generate the document to check.');

    const produceTask = await dispatchProbingTask({
      title: caseRow.title,
      description: caseRow.description,
      columnId: CAPABILITY_START_COLUMN[PRODUCING_CAPABILITY],
      agentId: producingAgent.id,
      projectId,
      capability: PRODUCING_CAPABILITY,
    });

    const { settled } = await waitForSettlement(produceTask.id, probeFor(PRODUCING_CAPABILITY).settledActions);
    if (!settled) throw new Error('The producing stage for this Verify case timed out before a document was written — nothing for Verify to check.');

    sourceTaskId = produceTask.id;
  }

  const task = await dispatchProbingTask({
    title: caseRow.title,
    description: caseRow.description,
    columnId: CAPABILITY_START_COLUMN[capability],
    agentId: agent.id,
    projectId,
    capability,
  });

  const runId = 'bmr_' + uuidv4().replace(/-/g, '').slice(0, 12);
  const contextVersion = snapshotContextVersion(project.subscription_id, projectId);
  db.prepare(`
    INSERT INTO benchmark_runs (id, case_id, project_id, probing_task_id, source_task_id, status, context_version, triggered_by)
    VALUES (?, ?, ?, ?, ?, 'dispatched', ?, ?)
  `).run(runId, caseRow.id, projectId, task.id, sourceTaskId, JSON.stringify(contextVersion), userId || null);

  pollAndScore(runId).catch(err => console.error('[benchmarkRunner] poll error:', err.message));

  return db.prepare('SELECT * FROM benchmark_runs WHERE id = ?').get(runId);
}

// Shared by the automatic post-run judging below and the manual re-review action —
// this is the ONLY check that actually reads the board's real rule docs and judges
// whether the agent's output respects them in substance. The deterministic check
// (scoreDeterministic, above) is intentionally mechanical — tool used, item counts,
// exact substrings — it cannot tell you whether a rule was actually followed, only
// whether the shape of the output looked roughly right. This is why judging runs
// automatically on completion instead of staying a manual "maybe later" action.
async function callJudge(task, logs, judgeRubric, capability = PLANNING_CAPABILITY) {
  const sideEffects = sideEffectsFired(logs);
  const tool = firedTool(task, logs, capability);
  const outputSummary = [
    ...probeFor(capability).judgeSummaryLines(task, logs, tool),
    `Other actions taken: ${sideEffects.length ? sideEffects.join('; ') : '(none)'}`,
  ].join('\n');

  const response = await getClient().messages.create({
    model: 'claude-opus-5',
    max_tokens: 512,
    system: `You are grading whether a real ${CAPABILITY_LABELS[capability] || 'AI agent'}'s output respected a specific rule under test. Respond only by calling the verdict tool.`,
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
      content: `Rule being probed: ${judgeRubric.instructions || '(no instructions provided)'}\nPass criteria: ${judgeRubric.pass_criteria || '(none provided)'}\n\nActual agent output:\n${outputSummary}`,
    }],
  });

  const block = response.content.find(b => b.type === 'tool_use');
  return block ? block.input : { passed: false, rationale: 'Judge model did not return a verdict.' };
}

async function pollAndScore(runId, { timeoutMs = 270000, intervalMs = 2000 } = {}) {
  const db = getDb();
  const run = db.prepare('SELECT * FROM benchmark_runs WHERE id = ?').get(runId);
  if (!run) return;

  const caseRow = db.prepare('SELECT * FROM benchmark_cases WHERE id = ?').get(run.case_id);
  const capability = caseRow?.capability || PLANNING_CAPABILITY;

  const { task, logs, settled } = await waitForSettlement(run.probing_task_id, probeFor(capability).settledActions, { timeoutMs, intervalMs });

  if (!settled) {
    db.prepare(`UPDATE benchmark_runs SET status = 'timeout', completed_at = CURRENT_TIMESTAMP WHERE id = ?`).run(runId);
    return;
  }

  const rubric = JSON.parse(caseRow.rubric || '{}');
  const deterministic = scoreDeterministic(task, logs, rubric.deterministic || {}, capability);

  // Judge automatically whenever the case has a judge rubric to grade against —
  // a run isn't meaningfully "done" until the substance has been checked, not just
  // the shape. If the model call itself fails, leave judge_result null rather than
  // failing the whole run — the deterministic result and raw output are still there.
  let judgeResult = null;
  const judgeRubric = rubric.judge || {};
  if (judgeRubric.instructions || judgeRubric.pass_criteria) {
    try { judgeResult = await callJudge(task, logs, judgeRubric, capability); }
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

  const verdict = await callJudge(task, logs, judgeRubric, caseRow.capability || PLANNING_CAPABILITY);

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

function parseFrontMatter(content) {
  // Normalize CRLF first — see agentRunner.js's copy of this function for why: a
  // CRLF-saved file silently fails the '---\n' check and the raw front matter leaks
  // into the returned body. Traced to a real bug here specifically: doc-guide.md's
  // (CRLF) front matter was leaking into the AI rubric-draft prompt as literal board
  // content, and the model was responding with a completely empty tool call rather
  // than a malformed one — no error, just silently useless output.
  content = content.replace(/\r\n/g, '\n');
  if (!content.startsWith('---\n')) return { meta: {}, body: content };
  const end = content.indexOf('\n---', 4);
  if (end === -1) return { meta: {}, body: content };
  const block = content.slice(4, end);
  const meta = {};
  for (const line of block.split('\n')) {
    const colon = line.indexOf(':');
    if (colon > 0) meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return { meta, body: content.slice(end + 5).trimStart() };
}

function isVisibleToCapability(meta, capability) {
  if (!meta.capabilities) return true;
  return meta.capabilities.split(',').map(c => c.trim()).filter(Boolean).includes(capability);
}

function listBoardDocs(subscriptionId, projectId, capability) {
  const dir = path.join(GLOBAL_INSTRUCTIONS_DIR, subscriptionId, projectId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      const { meta, body } = parseFrontMatter(raw);
      return { name: f, meta, content: body };
    })
    .filter(d => isVisibleToCapability(d.meta, capability));
}

// Which outcome-tool names are valid for expected_tool, per capability — must stay in
// sync with each capability's row in CAPABILITY_PROBES.outcomeSignals above.
const OUTCOME_TOOLS_BY_CAPABILITY = {
  [PLANNING_CAPABILITY]: ['ask_question', 'approve_task', 'suggest_split', 'suggest_abandon'],
  [PRODUCING_CAPABILITY]: ['task_complete', 'request_human'],
  [VERIFYING_CAPABILITY]: ['task_complete_pass', 'task_complete_fail', 'request_human'],
};

// Shape shared by both the whole-task draft and the rubric-only draft below —
// this is internal scoring machinery. It is never surfaced to the user; the UI
// only ever collects a title and description. Capability-dependent because the
// valid tool names differ, and the checklist fields only mean anything for Planning.
function rubricSchemaFor(capability) {
  const tools = OUTCOME_TOOLS_BY_CAPABILITY[capability] || OUTCOME_TOOLS_BY_CAPABILITY[PLANNING_CAPABILITY];
  const deterministicProps = {
    expected_tool: {
      description: 'The tool (or tools) that count as a correct response. Use a plain string for a single correct tool. Use an array of strings when more than one tool is a genuinely correct handling of this scenario. Only include multiple tools when they are truly equally correct, not as a hedge.',
      oneOf: [
        { type: 'string', enum: tools },
        { type: 'array', items: { type: 'string', enum: tools } },
      ],
    },
    required_fields: {
      type: 'array',
      items: { type: 'string' },
      description: 'Exact substrings checked case-insensitively against the agent\'s raw output text. Never use a generic word describing the MESSAGE TYPE itself (e.g. "question", "summary", "note", "concern") — correct handling can occur without ever typing that word. Only add an entry for a specific, concrete term from the task or rule doc that correct handling would plausibly quote verbatim (a named field, a number, a specific policy term, a required section heading).',
    },
    forbidden_substrings_in_message: { type: 'array', items: { type: 'string' } },
  };

  if (capability === PLANNING_CAPABILITY) {
    deterministicProps.checklist_count_min = {
      type: 'integer',
      description: 'Only checked when the tool that actually fired is ask_question or approve_task — suggest_split and suggest_abandon never populate a checklist, so this is skipped automatically for those. Do not set this if suggest_split/suggest_abandon is among the accepted expected_tool values and is the more likely correct outcome.',
    };
    deterministicProps.checklist_count_max = {
      type: 'integer',
      description: 'Upper bound on checklist length. Leave generous headroom above checklist_count_min — a thorough planner reasonably adds items for already-confirmed facts alongside open questions, not just the bare-minimum questions. Prefer min + 4 or more, or omit this field entirely if unsure.',
    };
  }

  return {
    type: 'object',
    properties: {
      deterministic: {
        type: 'object',
        description: 'Mechanical substring/count checks — no judgment involved, so keep every check something you are certain correct handling produces. When in doubt, leave a field out and rely on the judge rubric below instead of guessing.',
        properties: deterministicProps,
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
}

async function draftCaseFromBoard(projectId, subscriptionId, capability = PLANNING_CAPABILITY) {
  const docs = listBoardDocs(subscriptionId, projectId, capability);
  if (docs.length === 0) throw new Error('This board has no context docs visible to the tested capability yet.');

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
    model: 'claude-opus-5',
    max_tokens: 1200,
    temperature: 1,
    system: `You design rule-compliance benchmark cases for a ${CAPABILITY_LABELS[capability] || 'AI agent'}. Given a board's real rule documents, propose ONE synthetic probing task whose correct handling would reveal whether the agent violates one of these rules. The probing task itself must be original/synthetic (not copied from anywhere), but it must probe a rule that genuinely exists in the documents given. Respond only via the propose_case tool.`,
    tools: [{
      name: 'propose_case',
      description: 'Propose one rule-compliance benchmark case.',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string', description: 'The full probing task description, sent verbatim to the agent as the task brief.' },
          rule_reference: { type: 'string', description: 'Which document/rule this case probes.' },
          rubric: rubricSchemaFor(capability),
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
async function draftRubricForTask(title, description, projectId, subscriptionId, capability = PLANNING_CAPABILITY) {
  const docs = listBoardDocs(subscriptionId, projectId, capability);
  const docsBlock = docs.length
    ? docs.map(d => `### ${d.name}\n${d.content}`).join('\n\n---\n\n')
    : '(This board has no board-level rule documents yet — judge against general System Behavior rules only.)';

  const response = await getClient().messages.create({
    model: 'claude-opus-5',
    max_tokens: 800,
    system: `You design rule-compliance benchmark scoring for a ${CAPABILITY_LABELS[capability] || 'AI agent'}. The probing task's title and description are already fixed — propose a rubric to evaluate whether the agent handles THIS EXACT task correctly, grounded in the board's real rule documents when given. Respond only via the propose_rubric tool.`,
    tools: [{
      name: 'propose_rubric',
      description: 'Propose a rubric for the given probing task.',
      input_schema: { type: 'object', properties: { rubric: rubricSchemaFor(capability) }, required: ['rubric'] },
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
  VALID_CAPABILITIES: [PLANNING_CAPABILITY, PRODUCING_CAPABILITY, VERIFYING_CAPABILITY],
  PLANNING_CAPABILITY,
};
