// ── Effects boundary ─────────────────────────────────────────────────────────
//
// Every OUTWARD effect routes through here — anything that leaves the system
// toward a human, an external service, or production. This is the one place
// that decides whether an effect is actually performed or merely recorded,
// so a new runner/handler inherits the decision for free instead of having to
// remember an `if (benchmark)` of its own.
//
// The rule this encodes has a precise boundary, and it is narrower than "the
// agent never knows it's a benchmark":
//
//   - Effects the agent TRIGGERS but never acts on (a notification, an action
//     hook) are suppressed invisibly. The agent gets an ordinary success, its
//     next move is unaffected, and nothing downstream breaks.
//   - Anything the agent OPERATES ON — a branch name, a file path, a tool
//     result it reasons from — must stay true. Lying there doesn't protect the
//     blind test, it breaks the run. This is why branch pushes are NOT gated or
//     renamed here: the runner prompt hands the agent its branch and push
//     command, so a benchmark-only branch name would just make the push fail.
//     Probe branches are cleaned up from benchmark_runs.probing_task_id, which
//     already records exactly which tasks were probes.
const { v4: uuidv4 } = require('uuid');
const notifications = require('./notificationsService');

// ── Run modes ────────────────────────────────────────────────────────────────
// 'live'      — a real task doing real work for a real board.
// 'benchmark' — a synthetic probing task created by benchmarkRunner.js.
//
// A future 'test' mode (the planned perm_test_* capabilities) slots in as one
// more POLICY row: its orchestration notices are legitimately real — a human IS
// waiting to hear that tests passed — while effects of the code under test are
// not. That asymmetry is exactly why `kind` exists rather than this being a
// single boolean.
const LIVE = 'live';
const BENCHMARK = 'benchmark';

// ── Effect kinds ─────────────────────────────────────────────────────────────
// 'orchestration' — AutoKan telling a human about pipeline state ("PR ready for
//                   review"). Emitted by the server at column transitions.
// 'external'      — anything reaching outside AutoKan, or produced by the
//                   behavior under test. Everything an AGENT chooses to invoke
//                   is external, including in-app notifications.
const ORCHESTRATION = 'orchestration';
const EXTERNAL = 'external';

const POLICY = {
  [LIVE]:      { [ORCHESTRATION]: 'perform', [EXTERNAL]: 'perform' },
  [BENCHMARK]: { [ORCHESTRATION]: 'record',  [EXTERNAL]: 'record'  },
};

// ── Effect ids ───────────────────────────────────────────────────────────────
// Stable names so a benchmark case can opt a specific effect back in (see
// allowed_effects below). Action hooks use their own registry key as their id,
// so `notify_all` is both the hook name and the effect name — no second list to
// keep in sync. These are the ids for effects the SERVER emits directly.
const NOTIFY_HUMAN_ACTION = 'notify_human_action';
const PR_CREATE = 'pr_create';
const PR_MERGE = 'pr_merge';
const BUILTIN_EFFECT_IDS = [NOTIFY_HUMAN_ACTION, PR_CREATE, PR_MERGE];

function rowOf(db, taskOrId) {
  return typeof taskOrId === 'string'
    ? db.prepare('SELECT metadata, allowed_effects FROM tasks WHERE id = ?').get(taskOrId)
    : taskOrId;
}

function metaOf(db, taskOrId) {
  const task = rowOf(db, taskOrId);
  if (!task) return {};
  try { return JSON.parse(task.metadata || '{}'); } catch { return {}; }
}

// The configured enabled-set for a task, or null when it was never configured.
// null and [] mean different things and must stay distinguishable: null is
// "nobody has chosen yet, use the run-mode default", [] is the deliberate
// choice to perform nothing.
function enabledList(task) {
  if (!task || task.allowed_effects === null || task.allowed_effects === undefined) return null;
  try {
    const parsed = JSON.parse(task.allowed_effects);
    return Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

// Every capability can invoke every registered action hook (invoke_action_hook is
// in each tool set) and every handler can escalate to a human, so those are
// implicit — only capability-specific effects are declared in runners.json. That
// way registering a new hook makes it available everywhere with no registry edit.
// ACTION_HOOKS is required lazily: actionHooks.js imports EXTERNAL from this file,
// so a top-level require here would be a load-order cycle.
function capabilityActions(capabilityId) {
  const registry = require('../seed/runners.json');
  const { ACTION_HOOKS } = require('./actionHooks');
  const cap = registry.capabilities.find(c => c.id === capabilityId);
  return [NOTIFY_HUMAN_ACTION, ...Object.keys(ACTION_HOOKS), ...((cap && cap.actions) || [])];
}

// The ONLY place `is_benchmark_probe` is read as a run mode. Keeping that
// coupling in one function is what makes introducing a real `run_mode` field
// later (and migrating the two board-hiding queries that also read the flag,
// in routes/tasks.js and routes/other.js) a localized change rather than a hunt.
function runModeOfRow(task) {
  if (!task) return LIVE;
  let meta = {};
  try { meta = JSON.parse(task.metadata || '{}'); } catch { /* malformed → live */ }
  return meta.is_benchmark_probe ? BENCHMARK : LIVE;
}

function runModeOf(db, taskOrId) {
  return runModeOfRow(rowOf(db, taskOrId));
}

// The set a task should start with when it is configured for the first time:
// everything its capability can do on a live run, nothing on a benchmark probe
// (which opts effects back in explicitly, per case). pr_merge is the exception —
// it only pre-fills when the task's auto-merge box is ticked, so "merge to master"
// is never enabled by simply accepting the defaults.
function defaultEnabledFor(capabilityId, runMode, { autoComplete = false } = {}) {
  if (runMode === BENCHMARK) return [];
  return capabilityActions(capabilityId).filter(a => a !== PR_MERGE || autoComplete);
}

// Fails closed in both directions: an unrecognised run mode falls back to the
// most restrictive policy, and an undeclared effect kind is recorded rather
// than performed. A hook author who mislabels an effect gets a suppressed
// notification; one who forgets to label it gets the same. Neither leaks.
function decide(runMode, kind) {
  const row = POLICY[runMode] || POLICY[BENCHMARK];
  return row[kind] || 'record';
}

// Per-run opt-in. A benchmark case can name specific effect ids that should
// really fire — that's how a smoke-test case proves an action hook works
// end-to-end instead of only proving the agent tried to call it. Deliberately
// matched by effect ID, not by kind, so allowing `notify_all` on one case can't
// also unlock PR creation. The list rides on the probing task's metadata, put
// there by dispatchProbingTask the same way model_override already is.
// One rule covers live and benchmark alike: a configured task says exactly what
// it may perform, and an unconfigured one falls back to its run mode's default.
// That fallback is what keeps every task predating this column — and any task
// created straight through the API without a Start step — behaving as it did.
function shouldPerform(db, taskOrId, effectId, kind) {
  const task = rowOf(db, taskOrId);
  const list = enabledList(task);
  if (list) return list.includes(effectId);
  return decide(runModeOfRow(task), kind) === 'perform';
}

// Recorded effects are written as plain 'note' task_logs on purpose: that is
// already the convention benchmark scoring reads (sideEffectsFired() in
// benchmarkRunner.js surfaces every note to the AI judge, and the Benchmark UI
// lists them under "Also fired"). So a suppressed effect becomes scoreable with
// zero extra wiring — and the same list is the assertion surface a future test
// capability needs ("assert an email to the customer was queued").
//
// Only suppressed effects are recorded, not performed ones. A performed
// notification already leaves its own audit trail via createNotification()'s
// notifications row; logging it twice would just add noise to real task logs.
function recordEffect(db, taskId, agentId, effectId, description) {
  db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
    .run(uuidv4(), taskId, agentId || null, 'note',
      `Effect not performed (${BENCHMARK} run) — ${effectId}: ${description}`);
}

// ── Gated effects ────────────────────────────────────────────────────────────
// Same name and signature as the notificationsService function it wraps, so
// agentRunner.js's 16 call sites are unchanged — only its import line moves.
async function notifyHumanActionMembers(db, taskId, reason) {
  if (shouldPerform(db, taskId, NOTIFY_HUMAN_ACTION, ORCHESTRATION)) {
    return notifications.notifyHumanActionMembers(db, taskId, reason);
  }
  recordEffect(db, taskId, null, NOTIFY_HUMAN_ACTION, `notify project members — "${reason}"`);
}

module.exports = {
  LIVE, BENCHMARK,
  capabilityActions, defaultEnabledFor, enabledList,
  ORCHESTRATION, EXTERNAL,
  NOTIFY_HUMAN_ACTION, PR_CREATE, PR_MERGE, BUILTIN_EFFECT_IDS,
  runModeOf,
  shouldPerform,
  recordEffect,
  notifyHumanActionMembers,
};
