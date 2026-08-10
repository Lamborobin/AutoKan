import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { Check, X, Loader2, Play, ChevronDown, ChevronRight, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { tasksApi } from '../../api';
import MarkdownText from '../shared/MarkdownText';
import NewBenchmarkTaskModal from './NewBenchmarkTaskModal';

const REVIEW_LEVELS = [
  { value: 'unacceptable',    label: 'Unacceptable' },
  { value: 'less_acceptable', label: 'Less Acceptable' },
  { value: 'accepted',        label: 'Accepted' },
  { value: 'very_good',       label: 'Very Good' },
  { value: 'fully_satisfied', label: 'Fully Satisfied' },
];

const SOURCE_LABEL = {
  manual: 'Manual',
  ai_generated: 'AI generated',
  ai_edited: 'AI generated, edited',
  cloned_task: 'Cloned from task',
};

const STATUS_STYLE = {
  dispatched: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  completed:  'bg-green-500/15 text-green-400 border-green-500/25',
  error:      'bg-red-500/15 text-red-400 border-red-500/25',
  timeout:    'bg-amber-500/15 text-amber-400 border-amber-500/25',
};

function StatusBadge({ status }) {
  return (
    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full border uppercase tracking-wide ${STATUS_STYLE[status] || 'bg-surface-3 text-gray-400 border-border'}`}>
      {status}
    </span>
  );
}

const TOOL_LABELS = {
  ask_question: 'asked a clarifying question',
  approve_task: 'approved the task',
  suggest_split: 'suggested splitting the task',
  suggest_abandon: 'suggested abandoning the task',
};

function toolLabel(tool) {
  return TOOL_LABELS[tool] || (tool ? `did "${tool}"` : "didn't take a recognized action");
}

// Turns backend rubric-check internals (check names + pre-formatted comparison
// strings) into a plain-language line — see dev/frontend.md's "Audience-appropriate
// UI". Falls back to the raw detail for any check shape this doesn't recognize, so
// nothing silently disappears. The two checklist-length checks (min/max) are merged
// into one line by the caller since they describe the same number.
function friendlySummary(check) {
  if (check.name === 'expected_tool') {
    const m = check.detail.match(/expected "([^"]+)", got "([^"]+)"/);
    if (!m) return check.detail;
    const [, expected, got] = m;
    return check.passed
      ? `Correctly ${toolLabel(expected)}`
      : `Expected the planner to have ${toolLabel(expected)} — instead it ${toolLabel(got)}`;
  }
  if (check.name.startsWith('required:')) {
    const field = check.name.slice('required:'.length);
    return check.passed ? `Covered "${field}"` : `Missed "${field}"`;
  }
  if (check.name.startsWith('forbidden:')) {
    const field = check.name.slice('forbidden:'.length);
    return check.passed ? `Correctly avoided saying "${field}"` : `Incorrectly said "${field}"`;
  }
  return check.detail;
}

// checklist_count_min / checklist_count_max both describe the same checklist-length
// number — shown separately by the backend, merged here into one line so it doesn't
// read as two contradicting or duplicate results.
function mergeChecklistCountChecks(checks) {
  const min = checks.find(c => c.name === 'checklist_count_min');
  const max = checks.find(c => c.name === 'checklist_count_max');
  if (!min && !max) return checks;

  const countMatch = (min || max).detail.match(/got (\d+)/);
  const count = countMatch ? countMatch[1] : '?';
  const passed = (min?.passed ?? true) && (max?.passed ?? true);
  const merged = {
    name: 'checklist_count',
    passed,
    detail: passed
      ? `Checklist had an appropriate number of items (${count})`
      : `Checklist length was off (${count} items)`,
  };

  const rest = checks.filter(c => c.name !== 'checklist_count_min' && c.name !== 'checklist_count_max');
  const insertAt = checks.findIndex(c => c.name === 'checklist_count_min' || c.name === 'checklist_count_max');
  rest.splice(insertAt, 0, merged);
  return rest;
}

// Collapsed by default — this is mechanical scaffolding (tool used, item counts,
// exact substrings), not a rule-compliance verdict. It can't know whether client.md
// was actually respected, only whether the output's shape looked roughly right, so
// it stays a secondary, opt-in detail rather than the headline result (that's
// RuleCompliance below, which is grounded in the board's real rule docs).
function DeterministicChecks({ result }) {
  const [open, setOpen] = useState(false);
  if (!result) return <p className="text-xs text-gray-600">Pending…</p>;
  const checks = mergeChecklistCountChecks(result.checks || []);
  const passedCount = checks.filter(c => c.passed).length;

  return (
    <div>
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors">
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        Technical check — {result.passed ? <span className="text-green-500">passed</span> : <span className="text-red-400">failed</span>}
        {checks.length > 0 && <span className="text-gray-600">({passedCount}/{checks.length})</span>}
      </button>
      {!open && (
        <p className="text-[10px] text-gray-600 mt-0.5 pl-[15px]">Tool used &amp; output shape only — not whether the rule itself was followed.</p>
      )}
      {open && (
        <div className="mt-1.5 space-y-1 pl-[15px]">
          {checks.map((c, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11px] text-gray-500">
              {c.passed ? <Check size={11} className="text-green-400 mt-0.5 shrink-0" /> : <X size={11} className="text-red-400 mt-0.5 shrink-0" />}
              <span>{c.name === 'checklist_count' ? c.detail : friendlySummary(c)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// The headline result — grounded in the board's real rule docs, this is the actual
// answer to "did the output respect the rule under test." Auto-populated on
// completion when the case has a judge rubric (see benchmarkRunner.js's
// pollAndScore); the "Re-check with AI" button below re-runs it on demand.
function RuleCompliance({ result }) {
  return (
    <div className={`rounded-lg border p-2.5 text-xs ${result.passed ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
      <p className="font-medium text-gray-300 flex items-center gap-1.5">
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border uppercase tracking-wide ${
          result.passed ? 'bg-green-500/15 text-green-400 border-green-500/25' : 'bg-red-500/15 text-red-400 border-red-500/25'
        }`}>
          {result.passed ? 'Passed' : 'Failed'}
        </span>
        Rule compliance
      </p>
      <MarkdownText text={result.rationale} className="text-gray-500 mt-1.5" />
    </div>
  );
}

// On-demand — fetches the probing task's actual planner output (the question it
// asked, the checklist it built, any review comment) so a manual reviewer has
// something to read, not just the derived pass/fail checks.
function PlannerOutput({ taskId }) {
  const [open, setOpen] = useState(false);
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    if (!open && !task) {
      setLoading(true);
      try { setTask(await tasksApi.get(taskId)); }
      catch { setTask({}); }
      finally { setLoading(false); }
    }
    setOpen(v => !v);
  }

  // tasksApi.get() already returns pm_checklist parsed (server/src/routes/tasks.js) — don't re-parse it.
  const checklist = task?.pm_checklist || [];
  const hasContent = task?.pm_pending_question || task?.pm_review_comment || checklist.length > 0;

  return (
    <div>
      <button onClick={handleToggle} className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-gray-300 transition-colors">
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />} What the planner said
      </button>

      {open && (
        <div className="mt-2 space-y-2.5">
          {loading && <p className="text-xs text-gray-600 flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Loading…</p>}

          {!loading && (task?.pm_pending_question || task?.pm_review_comment) && (
            <MarkdownText text={task.pm_pending_question || task.pm_review_comment} className="text-xs text-gray-400" />
          )}

          {!loading && checklist.length > 0 && (
            <ul className="space-y-1">
              {checklist.map((entry, i) => {
                const text = typeof entry === 'string' ? entry : entry?.item ?? JSON.stringify(entry);
                const resolved = typeof entry === 'string' ? true : entry?.resolved !== false;
                return (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-500">
                    {resolved ? <Check size={11} className="text-green-400 mt-0.5 shrink-0" /> : <X size={11} className="text-amber-400 mt-0.5 shrink-0" />}
                    <MarkdownText text={text} className="text-[11px] text-gray-500" />
                  </li>
                );
              })}
            </ul>
          )}

          {!loading && !hasContent && <p className="text-xs text-gray-600">Nothing recorded for this run.</p>}
        </div>
      )}
    </div>
  );
}

function RunCard({ run, caseId }) {
  const { reviewRunWithAI, submitManualReviewForRun } = useStore();
  const [reviewing, setReviewing] = useState(false);
  const [level, setLevel] = useState('accepted');
  const [notes, setNotes] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleAiReview() {
    setReviewing(true);
    try { await reviewRunWithAI(run.id, caseId); }
    catch (err) { alert(err.response?.data?.error || 'AI review failed'); }
    finally { setReviewing(false); }
  }

  function handleManualCancel() {
    setShowManual(false);
    setLevel('accepted');
    setNotes('');
  }

  async function handleManualSubmit() {
    setSubmitting(true);
    try {
      await submitManualReviewForRun(run.id, caseId, level, notes);
      setShowManual(false);
      setNotes('');
    } catch (err) { alert(err.response?.data?.error || 'Could not save review'); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-surface-2/40 border-b border-border/60">
        <span className="text-[10px] text-gray-500 font-mono">{format(new Date(run.started_at), 'yyyy-MM-dd HH:mm:ss')}</span>
        <StatusBadge status={run.status} />
      </div>

      <div className="p-3 space-y-2.5">
        {['pending', 'dispatched'].includes(run.status) && (
          <p className="text-xs text-gray-500 flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Waiting for the planner…</p>
        )}

        {run.status === 'completed' && run.judge_result && <RuleCompliance result={run.judge_result} />}

        {run.status === 'completed' && <DeterministicChecks result={run.deterministic_result} />}

        {run.manual_review && (
          <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-2.5 text-xs">
            <p className="font-medium text-gray-300">Manual review — {REVIEW_LEVELS.find(l => l.value === run.manual_review.level)?.label || run.manual_review.level}</p>
            {run.manual_review.notes && <MarkdownText text={run.manual_review.notes} className="text-gray-500 mt-1" />}
          </div>
        )}

        {run.status === 'completed' && <PlannerOutput taskId={run.probing_task_id} />}

        {run.status === 'completed' && (
          <div className="flex items-center gap-2 border-t border-border/50 mt-1 pt-2.5">
            <button onClick={handleAiReview} disabled={reviewing}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-accent/10 text-accent border border-accent/25 hover:bg-accent/20 transition-colors disabled:opacity-40">
              {reviewing ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />} {run.judge_result ? 'Re-check with AI' : 'Check rule compliance'}
            </button>
            <button onClick={() => setShowManual(v => !v)}
              className="text-[10px] px-2 py-1 rounded-md bg-surface-3 text-gray-400 border border-border hover:text-gray-200 transition-colors">
              Mark reviewed manually
            </button>
          </div>
        )}

        {showManual && (
          <div className="space-y-1.5 pt-1">
            <select value={level} onChange={e => setLevel(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded-md px-2 py-1 text-xs text-gray-200 outline-none focus:border-accent/50">
              {REVIEW_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional note…" rows={2}
              className="w-full bg-surface-2 border border-border rounded-md px-2 py-1 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50 resize-none" />
            <div className="flex items-center gap-2">
              <button onClick={handleManualSubmit} disabled={submitting}
                className="text-[10px] px-2 py-1 rounded-md bg-accent text-white hover:bg-accent/80 transition-colors disabled:opacity-40">
                {submitting ? '…' : 'Save'}
              </button>
              <button onClick={handleManualCancel} disabled={submitting}
                className="text-[10px] px-2 py-1 rounded-md text-gray-500 hover:text-gray-300 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TaskCard({ c, runs, targetProjectId, onRun, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [running, setRunning] = useState(false);

  async function handleRun() {
    setRunning(true);
    try { await onRun(c.id); }
    catch (err) { alert(err.response?.data?.error || 'Run failed to start'); }
    finally { setRunning(false); }
  }

  return (
    <div className="border border-border rounded-xl p-4 space-y-3 bg-surface-1">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-200 truncate">{c.title}</p>
          <button onClick={() => setShowDescription(v => !v)}
            className="mt-1 flex items-center gap-1 text-[11px] text-gray-600 hover:text-gray-400 transition-colors">
            {showDescription ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            {showDescription ? 'Hide description' : 'Show description'}
          </button>
          {showDescription && <MarkdownText text={c.description} className="text-xs text-gray-500 mt-1.5" />}
        </div>
        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-surface-3 text-gray-400 border border-border uppercase tracking-wide shrink-0">
          {SOURCE_LABEL[c.source] || c.source}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={handleRun} disabled={running || !targetProjectId}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-accent hover:bg-accent/80 text-white transition-colors disabled:opacity-40">
          {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Run
        </button>
        {runs?.length > 0 && (
          <button onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 transition-colors">
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {expanded ? 'Hide' : 'Show'} {runs.length} run{runs.length === 1 ? '' : 's'}
          </button>
        )}
        <button onClick={() => onDelete(c.id)} title="Delete this benchmark task"
          className="ml-auto p-1.5 rounded-lg text-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition-colors">
          <Trash2 size={13} />
        </button>
      </div>

      {expanded && runs?.length > 0 && (
        <div className="pt-3 mt-0.5 border-t border-border/60">
          <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest mb-2.5">Runs</p>
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {runs.map(run => <RunCard key={run.id} run={run} caseId={c.id} />)}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BenchmarkPanel({ scope }) {
  const {
    currentProjectId, subscription, projects,
    benchmarkCases, benchmarkRunsByCaseId, benchmarkLoading,
    loadBenchmarkCases, deleteBenchmarkCase, runBenchmarkCase,
  } = useStore();

  const [targetProjectId, setTargetProjectId] = useState(scope === 'board' ? currentProjectId : '');
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (scope === 'board') setTargetProjectId(currentProjectId || '');
  }, [scope, currentProjectId]);

  useEffect(() => {
    if (scope === 'board' && currentProjectId) {
      loadBenchmarkCases('board', { projectId: currentProjectId });
    } else if (scope === 'workspace' && subscription?.id) {
      loadBenchmarkCases('workspace', { subscriptionId: subscription.id });
    }
  }, [scope, currentProjectId, subscription?.id]);

  async function handleRun(caseId) {
    await runBenchmarkCase(caseId, targetProjectId);
  }

  async function handleDelete(caseId) {
    if (!confirm('Delete this benchmark task?')) return;
    await deleteBenchmarkCase(caseId);
  }

  const boardOptions = useMemo(() => (projects || []).filter(p => !p.archived_at), [projects]);
  const currentBoard = useMemo(
    () => (projects || []).find(p => p.id === currentProjectId),
    [projects, currentProjectId],
  );

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-200">
          Benchmark Tasks {scope === 'board'
            ? `— ${currentBoard?.name || 'this board'}${currentBoard?.client_name ? ` (${currentBoard.client_name})` : ''}`
            : '— workspace'}
        </h2>
        <button onClick={() => setModalOpen(true)} disabled={!targetProjectId}
          className="btn-primary shrink-0 disabled:opacity-40">
          <Plus size={14} /> New Benchmark Task
        </button>
      </div>

      {scope === 'workspace' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Target board:</span>
          <select value={targetProjectId} onChange={e => setTargetProjectId(e.target.value)}
            className="bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-accent/50">
            <option value="">Choose a board…</option>
            {boardOptions.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
          </select>
        </div>
      )}

      {benchmarkLoading && <p className="text-xs text-gray-600 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading…</p>}

      {!benchmarkLoading && benchmarkCases.length === 0 && (
        <div className="border border-dashed border-border rounded-xl p-5 text-center">
          <p className="text-xs text-gray-500">No benchmark tasks yet.</p>
        </div>
      )}

      {!benchmarkLoading && benchmarkCases.length > 0 && (
        <div className="space-y-2">
          {benchmarkCases.map(c => (
            <TaskCard key={c.id} c={c} runs={benchmarkRunsByCaseId[c.id]} targetProjectId={targetProjectId}
              onRun={handleRun} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {modalOpen && (
        <NewBenchmarkTaskModal
          scope={scope}
          targetProjectId={targetProjectId}
          subscriptionId={subscription?.id}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
