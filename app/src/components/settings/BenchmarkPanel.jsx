import { useState, useEffect, useMemo } from 'react';
import { Check, X, Loader2, Play, RotateCcw, Trash2, ChevronDown, ChevronRight, Plus, Sparkles } from 'lucide-react';
import { useStore } from '../../store';
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

function DeterministicChecks({ result }) {
  if (!result) return <p className="text-xs text-gray-600">Pending…</p>;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-gray-300">
        Automated check: {result.passed ? <span className="text-green-400">passed</span> : <span className="text-red-400">failed</span>}
      </p>
      {result.checks?.map((c, i) => (
        <div key={i} className="flex items-start gap-1.5 text-[11px] text-gray-500 pl-1">
          {c.passed ? <Check size={11} className="text-green-400 mt-0.5 shrink-0" /> : <X size={11} className="text-red-400 mt-0.5 shrink-0" />}
          <span>{c.detail}</span>
        </div>
      ))}
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

  async function handleManualSubmit() {
    setSubmitting(true);
    try {
      await submitManualReviewForRun(run.id, caseId, level, notes);
      setShowManual(false);
      setNotes('');
    } catch (err) { alert(err.response?.data?.error || 'Manual review failed'); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="border border-border rounded-lg p-3 space-y-2 bg-surface-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-500">{new Date(run.started_at).toLocaleString()}</span>
        <StatusBadge status={run.status} />
      </div>

      {['pending', 'dispatched'].includes(run.status) && (
        <p className="text-xs text-gray-500 flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Waiting for the planner…</p>
      )}

      {run.status === 'completed' && <DeterministicChecks result={run.deterministic_result} />}

      {run.judge_result && (
        <div className="text-xs border-l-2 border-accent/30 ml-1 pl-2">
          <p className="font-medium text-gray-300">AI review: {run.judge_result.passed ? <span className="text-green-400">passed</span> : <span className="text-red-400">failed</span>}</p>
          <p className="text-gray-500">{run.judge_result.rationale}</p>
        </div>
      )}

      {run.manual_review && (
        <div className="text-xs border-l-2 border-purple-500/30 ml-1 pl-2">
          <p className="font-medium text-gray-300">Manual review: {REVIEW_LEVELS.find(l => l.value === run.manual_review.level)?.label || run.manual_review.level}</p>
          {run.manual_review.notes && <p className="text-gray-500">{run.manual_review.notes}</p>}
        </div>
      )}

      {run.review_provenance !== 'unreviewed' && (
        <p className="text-[9px] text-gray-600 uppercase tracking-wide">Reviewed via: {run.review_provenance}</p>
      )}

      {run.status === 'completed' && (
        <div className="flex items-center gap-2 pt-1">
          <button onClick={handleAiReview} disabled={reviewing}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-accent/10 text-accent border border-accent/25 hover:bg-accent/20 transition-colors disabled:opacity-40">
            {reviewing ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />} Review with AI
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
          <button onClick={handleManualSubmit} disabled={submitting}
            className="text-[10px] px-2 py-1 rounded-md bg-accent text-white hover:bg-accent/80 transition-colors disabled:opacity-40">
            {submitting ? '…' : 'Submit review'}
          </button>
        </div>
      )}
    </div>
  );
}

function TaskCard({ c, runs, targetProjectId, onRun, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(false);

  async function handleRun() {
    setRunning(true);
    try { await onRun(c.id); }
    catch (err) { alert(err.response?.data?.error || 'Run failed to start'); }
    finally { setRunning(false); }
  }

  return (
    <div className="border border-border rounded-xl p-4 space-y-2.5 bg-surface-1">
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => setExpanded(v => !v)} className="flex items-start gap-1.5 text-left min-w-0 flex-1">
          {expanded ? <ChevronDown size={13} className="mt-0.5 shrink-0 text-gray-500" /> : <ChevronRight size={13} className="mt-0.5 shrink-0 text-gray-500" />}
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-200 truncate">{c.title}</p>
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{c.description}</p>
          </div>
        </button>
        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-surface-3 text-gray-400 border border-border uppercase tracking-wide shrink-0">
          {SOURCE_LABEL[c.source] || c.source}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={handleRun} disabled={running || !targetProjectId}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-accent hover:bg-accent/80 text-white transition-colors disabled:opacity-40">
          {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Run
        </button>
        <button onClick={() => onDelete(c.id)}
          className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
          <Trash2 size={12} />
        </button>
        {runs?.length > 0 && (
          <span className="text-[10px] text-gray-600 flex items-center gap-1 ml-auto"><RotateCcw size={10} /> {runs.length} run{runs.length === 1 ? '' : 's'}</span>
        )}
      </div>

      {expanded && runs?.length > 0 && (
        <div className="space-y-2 pt-1">
          {runs.map(run => <RunCard key={run.id} run={run} caseId={c.id} />)}
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

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-200">Rule Benchmark {scope === 'board' ? '— this board' : '— workspace'}</h2>
          <p className="text-xs text-gray-500 mt-1">
            Creates a real task and sends it through the real planning flow, then checks whether the result held up.
          </p>
        </div>
        <button onClick={() => setModalOpen(true)} disabled={!targetProjectId}
          className="btn-primary shrink-0 disabled:opacity-40">
          <Plus size={14} /> New Task
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
