import { useState, useEffect, useRef } from 'react';
import { X, Trash2, ArrowRight, Clock, Tag, Activity, Lock, Unlock, Archive, Plus, CheckCircle2, Circle, Pencil, Check, RotateCcw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useStore } from '../../store';
import { tasksApi } from '../../api';
import MarkdownText from '../shared/MarkdownText';
import TaskComments from './TaskComments';
import { PRIORITIES, COMPLEXITIES, PRIORITY_COLORS, PM_STATUS, HUMAN_STATUS, LOG_ACTION } from '../../constants/tasks';
import { COLUMN } from '../../constants/columns';

export default function TaskDetail() {
  const { selectedTask, setSelectedTask, setShowNewTask, columns, agents, roles, moveTask, deleteTask, updateTask, archiveTask, bypassPm, setEditingAgent } = useStore();
  const [task, setTask] = useState(null);
  const [logs, setLogs] = useState([]);

  // Editing state
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [editingCriteria, setEditingCriteria] = useState(false);
  const [criteriaDraft, setCriteriaDraft] = useState('');

  // Planning history accordion (collapsed by default after approval)
  const [showPlanningHistory, setShowPlanningHistory] = useState(false);

  // Interaction state
  const [approvingHuman, setApprovingHuman] = useState(false);
  const [approvalComment, setApprovalComment] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [agentThinking, setAgentThinking] = useState(false);
  const [confirmBypass, setConfirmBypass] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [approvingPr, setApprovingPr] = useState(false);
  const [checkingPr, setCheckingPr] = useState(false);
  const [syncingGithub, setSyncingGithub] = useState(false);
  const [githubSyncedAt, setGithubSyncedAt] = useState(null);
  const [pendingEditAgent, setPendingEditAgent] = useState(null);
  const [savingClientContext, setSavingClientContext] = useState(false);
  const [clientContextEdit, setClientContextEdit] = useState(null);
  const [clientContextSkipped, setClientContextSkipped] = useState(false);

  const titleRef = useRef(null);
  const descRef = useRef(null);

  useEffect(() => {
    if (!selectedTask) return;
    // Reset task to null so the panel can't render stale data before the fresh
    // load arrives — this guarantees checkingPr=true is set before first render
    setTask(null);
    setCheckingPr(false);
    setAgentThinking(false);
    setConfirmBypass(false);
    setConfirmArchive(false);
    setConfirmDelete(false);
    setAnswerText('');
    setEditingTitle(false);
    setEditingDescription(false);
    setEditingCriteria(false);
    let cancelled = false;
    (async () => {
      const t = await tasksApi.get(selectedTask.id);
      if (cancelled) return;

      const alreadyApproved = (t.logs || []).some(l => l.action === LOG_ACTION.PR_APPROVED);
      const needsPrCheck = t.column_id === COLUMN.HUMAN_ACTION && !!t.pr_url && !alreadyApproved;

      // Set task + checkingPr together so PR panel always first renders with spinner
      setTask(t);
      setLogs(t.logs || []);
      setTitleDraft(t.title || '');
      setDescriptionDraft(t.description || '');
      setCriteriaDraft(t.acceptance_criteria || '');
      setCheckingPr(needsPrCheck);

      const pmIsProcessing =
        (t.pm_approval_status === PM_STATUS.PENDING && !t.pm_pending_question) ||
        (t.pm_approval_status === PM_STATUS.QUESTIONING && !t.pm_pending_question);
      if (pmIsProcessing) setAgentThinking(true);

      if (needsPrCheck) {
        try {
          const result = await tasksApi.checkPr(t.id);
          if (cancelled) return;
          if (result.merged && result.task) setTask(result.task);
        } catch { /* GitHub unreachable — let user click manually */ }
        finally { if (!cancelled) setCheckingPr(false); }
      }

      // Initialise sync timestamp from metadata
      const lastSync = t.metadata?.github_synced_at || null;
      setGithubSyncedAt(lastSync);

      // Auto-sync once per day — only if pr_url exists and last sync > 24 h ago (or never)
      const oneDayMs = 86400 * 1000;
      const needsAutoSync = t.pr_url && (!lastSync || Date.now() - new Date(lastSync).getTime() > oneDayMs);
      if (needsAutoSync) {
        tasksApi.syncGithub(t.id, false).then(result => {
          if (cancelled) return;
          if (result.added > 0) setLogs(result.logs);
          if (result.synced_at) setGithubSyncedAt(result.synced_at);
          if (result.merged && result.task) setTask(result.task);
        }).catch(() => {});
      }
    })();
    return () => { cancelled = true; };
  }, [selectedTask?.id]);

  // Focus input when editing starts
  useEffect(() => { if (editingTitle && titleRef.current) titleRef.current.focus(); }, [editingTitle]);
  useEffect(() => { if (editingDescription && descRef.current) descRef.current.focus(); }, [editingDescription]);

  // Dismiss confirmation chips on any keypress
  useEffect(() => {
    if (!confirmDelete && !confirmArchive) return;
    function dismiss() { setConfirmDelete(false); setConfirmArchive(false); }
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [confirmDelete, confirmArchive]);

  // Poll while agent is thinking — stop when PM posts a question or approves
  useEffect(() => {
    if (!agentThinking || !selectedTask) return;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const fresh = await tasksApi.get(selectedTask.id);
        if (cancelled) return;
        // PM is done processing when it has asked a question or approved the task
        const pmFinished = !!fresh.pm_pending_question || fresh.pm_approval_status === PM_STATUS.APPROVED;
        if (pmFinished) {
          setTask(fresh);
          setLogs(fresh.logs || []);
          setAgentThinking(false);
        } else {
          setTimeout(poll, 2000);
        }
      } catch {
        if (!cancelled) setTimeout(poll, 3000);
      }
    };
    setTimeout(poll, 2000);
    return () => { cancelled = true; };
  }, [agentThinking, selectedTask?.id]);

  if (!selectedTask) return null;
  if (!task) return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" data-modal-backdrop="static">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const tags = Array.isArray(task.tags) ? task.tags : [];
  const isLocked = task.is_locked;
  const checklist = Array.isArray(task.pm_checklist) ? task.pm_checklist : [];
  const isPmPlanning = !!task.pm_approval_status;
  const hasPendingQuestion = !!task.pm_pending_question;

  // Build conversation thread — exclude the latest pm_question when it's pending
  // (it's already shown as the active prompt in the answer input section below)
  const rawConversationLogs = logs.filter(l => [LOG_ACTION.PM_QUESTION, LOG_ACTION.HUMAN_ANSWER, LOG_ACTION.PM_REVIEWED].includes(l.action));
  const conversationLogs = hasPendingQuestion
    ? rawConversationLogs.slice(0, -1)
    : rawConversationLogs;
  const pmDone = task.pm_approval_status === PM_STATUS.APPROVED;
  const fullyReady = pmDone && task.human_approval_status === HUMAN_STATUS.APPROVED;
  const splitProposal = task.metadata?.split_proposal || null;
  const abandonProposal = task.metadata?.abandon_proposal || null;

  const resolvedCount = checklist.filter(i => i.resolved).length;
  const allItemsChecked = checklist.length > 0 && resolvedCount === checklist.length;
  const checklistProgress = checklist.length > 0 ? (resolvedCount / checklist.length) * 100 : 0;

  // Bypass: show when all items are checked but PM is still not satisfied
  const showBypass = isPmPlanning && !fullyReady && allItemsChecked && !pmDone;

  // ── Field save handlers ──────────────────────────────────────────────────

  async function saveTitle() {
    const v = titleDraft.trim();
    if (!v || v === task.title) { setEditingTitle(false); return; }
    const updated = await tasksApi.update(task.id, { title: v });
    setTask(t => ({ ...t, title: updated.title }));
    setEditingTitle(false);
  }

  async function saveDescription() {
    const v = descriptionDraft.trim();
    if (v === (task.description || '')) { setEditingDescription(false); return; }
    await tasksApi.update(task.id, { description: v || null });
    setTask(t => ({ ...t, description: v || null }));
    setEditingDescription(false);
  }

  async function saveCriteria() {
    const v = criteriaDraft.trim();
    if (v === (task.acceptance_criteria || '')) { setEditingCriteria(false); return; }
    await tasksApi.update(task.id, { acceptance_criteria: v || null });
    setTask(t => ({ ...t, acceptance_criteria: v || null }));
    setEditingCriteria(false);
  }

  async function handlePriorityChange(value) {
    await tasksApi.update(task.id, { priority: value });
    setTask(t => ({ ...t, priority: value }));
  }

  async function handleComplexityChange(value) {
    await tasksApi.update(task.id, { complexity: value });
    setTask(t => ({ ...t, complexity: value }));
  }

  async function handleChecklistToggle(index) {
    // Optimistic update
    const nextChecklist = checklist.map((item, i) =>
      i === index ? { ...item, resolved: !item.resolved } : item
    );
    setTask(t => ({ ...t, pm_checklist: nextChecklist }));

    const updated = await tasksApi.toggleChecklistItem(task.id, index);
    setTask(t => ({ ...t, pm_checklist: updated.pm_checklist || nextChecklist }));

    // PM will re-evaluate — start polling
    if (task.pm_approval_status && task.pm_approval_status !== PM_STATUS.APPROVED && !hasPendingQuestion) {
      setAgentThinking(true);
    }
  }

  // ── Other handlers ───────────────────────────────────────────────────────

  async function handleMove(columnId) {
    try {
      await moveTask(task.id, columnId);
      setTask(t => ({ ...t, column_id: columnId, is_locked: false }));
    } catch (err) {
      alert(err.response?.data?.error || 'Cannot move task');
    }
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    try {
      await deleteTask(task.id);
    } catch (err) {
      setConfirmDelete(false);
      if (err.response?.data?.has_dependencies) {
        setConfirmArchive(true);
        alert(err.response.data.error);
      }
    }
  }

  async function handleArchive() {
    if (!confirmArchive) { setConfirmArchive(true); return; }
    await archiveTask(task.id);
    setSelectedTask(null);
  }

  async function handleSaveClientContext() {
    const text = (clientContextEdit ?? task.pm_client_context_draft ?? '').trim();
    if (!text || text.length > 2000) return;
    setSavingClientContext(true);
    try {
      const updated = await tasksApi.saveClientContext(task.id, text);
      setTask(updated);
      setClientContextEdit(null);
    } finally {
      setSavingClientContext(false);
    }
  }

  function handleSkipClientContext() {
    setClientContextSkipped(true);
  }

  async function handleBypass() {
    if (!confirmBypass) { setConfirmBypass(true); return; }
    const updated = await bypassPm(task.id);
    setTask(updated);
    setConfirmBypass(false);
  }

  async function handleAnswer() {
    if (!answerText.trim()) return;
    const text = answerText.trim();
    setAnswerText('');
    await tasksApi.answer(task.id, { answer: text });
    const tempLog = {
      id: `temp-${Date.now()}`, action: LOG_ACTION.HUMAN_ANSWER, message: text,
      created_at: new Date().toISOString().replace('T', ' ').replace('Z', ''), agent_name: 'You'
    };
    setLogs(prev => [...prev, tempLog]);
    setTask(t => ({ ...t, pm_pending_question: null, pm_approval_status: PM_STATUS.QUESTIONING }));
    setAgentThinking(true);
  }

  async function handleSplit(accept) {
    setTask(t => ({ ...t, pm_pending_question: null, metadata: { ...(t.metadata || {}), split_proposal: undefined } }));
    setAgentThinking(true);
    const res = await tasksApi.split(task.id, { accept });
    if (res?.task) setTask(t => ({ ...t, ...res.task }));
    // Add the renamed original + any new draft tasks to the board immediately,
    // rather than waiting on the SSE echo (which the acting client may miss).
    const ingest = [res?.task, ...(res?.created || [])].filter(Boolean);
    if (ingest.length) useStore.getState().upsertTasks(ingest);
  }

  async function handleAbandon(accept) {
    if (accept) {
      // Archive the task and remove it from the board immediately, then close the panel.
      await tasksApi.abandon(task.id, { accept: true });
      useStore.getState().markArchivedLocal(task.id);
      return;
    }
    // Keep — clear the prompt and let the planner continue planning.
    setTask(t => ({ ...t, pm_pending_question: null, metadata: { ...(t.metadata || {}), abandon_proposal: undefined } }));
    setAgentThinking(true);
    const res = await tasksApi.abandon(task.id, { accept: false });
    if (res?.task) setTask(t => ({ ...t, ...res.task }));
  }

  async function handleApprove() {
    const updated = await tasksApi.approve(task.id, { comment: approvalComment || null });
    setTask({ ...updated, is_locked: false });
    setApprovalComment('');
    setApprovingHuman(false);
  }

  async function handleReject() {
    if (!approvalComment.trim()) { alert('Please provide a reason for rejection'); return; }
    const updated = await tasksApi.reject(task.id, { comment: approvalComment });
    setTask(updated);
    setApprovalComment('');
    setApprovingHuman(false);
  }

  async function handleApprovePr() {
    setApprovingPr(true);
    try {
      const updated = await tasksApi.approvePr(task.id);
      setTask(updated);
    } finally {
      setApprovingPr(false);
    }
  }

  async function handleSyncGithub() {
    if (syncingGithub || !task) return;
    setSyncingGithub(true);
    try {
      const result = await tasksApi.syncGithub(task.id, true);
      setLogs(result.logs);
      if (result.synced_at) setGithubSyncedAt(result.synced_at);
      if (result.merged && result.task) setTask(result.task);
    } catch {} finally {
      setSyncingGithub(false);
    }
  }

  async function handleAgentChange(agentId) {
    await updateTask(task.id, { assigned_agent_id: agentId || null });
    setTask(t => ({ ...t, assigned_agent_id: agentId || null }));
  }

  function hasUnsavedChanges() {
    return (
      (editingTitle && titleDraft.trim() !== (task.title || '')) ||
      (editingDescription && descriptionDraft.trim() !== (task.description || '')) ||
      (editingCriteria && criteriaDraft.trim() !== (task.acceptance_criteria || ''))
    );
  }

  function handleOpenEditAgent() {
    const assignedAgent = agents.find(a => a.id === task.assigned_agent_id);
    if (!assignedAgent) return;
    if (hasUnsavedChanges()) {
      setPendingEditAgent(assignedAgent);
    } else {
      setSelectedTask(null);
      setEditingAgent(assignedAgent);
    }
  }

  async function handleEditAgentSaveFirst() {
    const agent = pendingEditAgent;
    setPendingEditAgent(null);
    if (editingTitle && titleDraft.trim() !== (task.title || '')) await saveTitle();
    if (editingDescription && descriptionDraft.trim() !== (task.description || '')) await saveDescription();
    if (editingCriteria && criteriaDraft.trim() !== (task.acceptance_criteria || '')) await saveCriteria();
    setSelectedTask(null);
    setEditingAgent(agent);
  }

  function handleEditAgentDiscard() {
    const agent = pendingEditAgent;
    setPendingEditAgent(null);
    setEditingTitle(false);
    setEditingDescription(false);
    setEditingCriteria(false);
    setSelectedTask(null);
    setEditingAgent(agent);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" data-modal-backdrop="static">
      <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-slide-in overflow-hidden">

        {/* Header — editable title */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0 gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {isLocked && <Lock size={13} className="text-amber-400 shrink-0" />}
            {editingTitle ? (
              <input
                ref={titleRef}
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
                className="flex-1 text-sm font-semibold bg-surface-3 border border-accent rounded px-2 py-0.5 text-gray-200 focus:outline-none"
              />
            ) : (
              <button
                onClick={() => { setTitleDraft(task.title || ''); setEditingTitle(true); }}
                className="text-sm font-semibold text-gray-200 text-left truncate hover:text-white group flex items-center gap-1.5 min-w-0"
                title="Click to edit title"
              >
                <span className="truncate">{task.title}</span>
                <Pencil size={11} className="shrink-0 opacity-0 group-hover:opacity-40 transition-opacity" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {task.pr_url && (
              <button
                onClick={handleSyncGithub}
                disabled={syncingGithub}
                title={githubSyncedAt ? `Sync GitHub — last synced ${formatDistanceToNow(new Date(githubSyncedAt), { addSuffix: true })}` : 'Sync GitHub activity'}
                className="btn-ghost p-1.5 rounded-lg text-gray-500 hover:text-blue-400 disabled:opacity-40 transition-colors"
              >
                <RotateCcw size={14} className={syncingGithub ? 'animate-spin' : ''} />
              </button>
            )}
            <div className="relative">
              <button
                onClick={handleArchive}
                title="Archive task"
                className={`p-1.5 rounded-lg transition-colors ${confirmArchive ? 'bg-amber-500/20 text-amber-300' : 'btn-ghost text-gray-600 hover:text-amber-400'}`}
              >
                <Archive size={13} />
              </button>
              {confirmArchive && (
                <div className="absolute top-full right-0 mt-1 z-20 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] rounded-lg px-2.5 py-1.5 whitespace-nowrap flex items-center gap-2 shadow-lg">
                  <span>Are you sure you want to archive this task?</span>
                  <button onClick={e => { e.stopPropagation(); setConfirmArchive(false); }} className="text-amber-400 hover:text-amber-200 leading-none">✕</button>
                </div>
              )}
            </div>
            <div className="relative">
              <button
                onClick={handleDelete}
                title="Delete task"
                className={`p-1.5 rounded-lg transition-colors ${confirmDelete ? 'bg-red-500/20 text-red-300' : 'btn-ghost text-red-400 hover:text-red-300 hover:bg-red-500/10'}`}
              >
                <Trash2 size={13} />
              </button>
              {confirmDelete && (
                <div className="absolute top-full right-0 mt-1 z-20 bg-red-500/20 border border-red-500/40 text-red-300 text-[10px] rounded-lg px-2.5 py-1.5 whitespace-nowrap flex items-center gap-2 shadow-lg">
                  <span>Are you sure you want to delete this task?</span>
                  <button onClick={e => { e.stopPropagation(); setConfirmDelete(false); }} className="text-red-400 hover:text-red-200 leading-none">✕</button>
                </div>
              )}
            </div>
            <button onClick={() => setSelectedTask(null)} className="btn-ghost p-1.5 rounded-lg ml-1">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-5">

            {/* Lock banner */}
            {isLocked && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/25 rounded-xl">
                <Lock size={12} className="text-amber-400 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-amber-300">Planning in progress</p>
                  <p className="text-[10px] text-amber-500/70 mt-0.5">You can still edit fields and check items — dragging is locked until both the planning agent and you approve</p>
                </div>
              </div>
            )}

            {/* PR Review panel — only when PR hasn't been approved yet */}
            {task.pr_url && task.column_id === COLUMN.HUMAN_ACTION && !logs.some(l => l.action === LOG_ACTION.PR_APPROVED) && (
              <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-blue-500/15">
                  <div className={`w-1.5 h-1.5 rounded-full ${checkingPr ? 'bg-blue-400/50 animate-pulse' : 'bg-blue-400'}`} />
                  <span className="text-xs font-medium text-blue-300">PR Ready for Review</span>
                </div>
                <div className="px-4 py-3 space-y-3">
                  <a
                    href={task.pr_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2 break-all transition-colors"
                  >
                    {task.pr_url}
                  </a>
                  {checkingPr ? (
                    <div className="w-full py-2.5 flex items-center justify-center gap-2.5 rounded-lg bg-blue-500/8 border border-blue-500/15">
                      <svg className="w-3.5 h-3.5 text-blue-400/60 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      <span className="text-xs text-blue-400/70">Checking if already merged…</span>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-gray-500">Review the PR, then click below to move this task to Testing.</p>
                      <button
                        onClick={handleApprovePr}
                        disabled={approvingPr}
                        className="w-full py-2 text-xs font-medium bg-blue-600/20 text-blue-300 rounded-lg hover:bg-blue-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {approvingPr ? 'Moving…' : 'PR Reviewed — Send to Testing'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Merged PR notice — shown when PR was already approved and task is back in Human Action */}
            {task.pr_url && task.column_id === COLUMN.HUMAN_ACTION && logs.some(l => l.action === LOG_ACTION.PR_APPROVED) && (
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-gray-500/5 border border-gray-500/15">
                <svg className="w-3.5 h-3.5 text-gray-500 shrink-0" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M5 3.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm0 2.122a2.25 2.25 0 10-1.5 0v.878A2.25 2.25 0 005.75 8.5h1.5v2.128a2.251 2.251 0 101.5 0V8.5h1.5a2.25 2.25 0 002.25-2.25v-.878a2.25 2.25 0 10-1.5 0v.878a.75.75 0 01-.75.75h-4.5A.75.75 0 015 6.25v-.878zm3.75 7.378a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm3-8.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"/>
                </svg>
                <span className="text-xs text-gray-500">PR already merged —</span>
                <a href={task.pr_url} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:text-gray-300 underline underline-offset-2 truncate transition-colors">
                  {task.pr_url.replace('https://github.com/', '')}
                </a>
              </div>
            )}

            {/* Human action notice (non-PR blocks) */}
            {task.requires_human_action === 1 && !task.pr_url && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                <p className="text-xs font-medium text-amber-400 mb-1">Human Action Required</p>
                <p className="text-xs text-amber-300/70">{task.human_action_reason}</p>
              </div>
            )}

            {/* ── Requirements (shown after both approvals) ─────────────────── */}
            {fullyReady && task.pm_review_comment && (
              <div className="rounded-xl border border-green-500/20 bg-green-500/5 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-green-500/15">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-green-400" />
                    <span className="text-xs font-medium text-green-300">Requirements</span>
                  </div>
                  <button
                    onClick={() => setShowPlanningHistory(v => !v)}
                    className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
                  >
                    {showPlanningHistory ? 'Hide planning history' : 'Show planning history'}
                  </button>
                </div>
                <div className="px-4 py-3">
                  <MarkdownText text={task.pm_review_comment} className="text-xs text-gray-300 leading-relaxed" />
                </div>
                {/* Planning history accordion */}
                {showPlanningHistory && (
                  <div className="border-t border-green-500/15">
                    {/* Checklist summary */}
                    {checklist.length > 0 && (
                      <div className="px-4 py-3 border-b border-surface-3">
                        <p className="text-[10px] text-gray-600 font-medium uppercase tracking-wide mb-2">Planning Checklist</p>
                        <div className="space-y-1">
                          {checklist.map((item, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <CheckCircle2 size={11} className="text-green-400/60 shrink-0 mt-0.5" />
                              <span className="text-xs text-gray-600 line-through leading-tight">{item.item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Conversation history */}
                    {rawConversationLogs.length > 0 && (
                      <div className="px-4 py-3">
                        <p className="text-[10px] text-gray-600 font-medium uppercase tracking-wide mb-2">Planning conversation</p>
                        <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                        {rawConversationLogs.map(log => {
                          const isPM = log.action === LOG_ACTION.PM_QUESTION;
                          const isDone = log.action === LOG_ACTION.PM_REVIEWED;
                          return (
                            <div key={log.id} className={`flex gap-2 ${isPM || isDone ? '' : 'flex-row-reverse'}`}>
                              <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0 mt-0.5 ${isPM || isDone ? 'bg-purple-600/60 text-white' : 'bg-blue-600/60 text-white'}`}>
                                {isPM || isDone ? 'PM' : 'Me'}
                              </div>
                              <div className={`flex-1 rounded-lg px-2 py-1.5 text-xs leading-relaxed opacity-70 ${
                                isPM ? 'bg-purple-500/8 text-purple-300' :
                                isDone ? 'bg-green-500/8 text-green-400' :
                                'bg-surface-3 text-gray-400'
                              }`}>
                                {(isPM || isDone)
                                  ? <MarkdownText text={log.message} />
                                  : <p className="whitespace-pre-wrap">{log.message}</p>
                                }
                              </div>
                            </div>
                          );
                        })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Planning Session (active — not yet fully approved) ──────── */}
            {isPmPlanning && !fullyReady && (
              <div className="rounded-xl border border-surface-3 overflow-hidden">

                {/* Session header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-surface-2 border-b border-surface-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      pmDone ? 'bg-green-400 animate-pulse' :
                      hasPendingQuestion ? 'bg-yellow-400 animate-pulse' :
                      'bg-blue-400 animate-pulse'
                    }`} />
                    <span className="text-xs font-medium text-gray-300">Planning</span>
                  </div>
                  <span className="text-[10px] text-gray-500">
                    {pmDone ? 'Awaiting your sign-off' :
                     agentThinking ? 'Agent thinking…' :
                     hasPendingQuestion ? 'Awaiting your reply' :
                     'Agent reviewing…'}
                  </span>
                </div>

                {/* Checklist — interactive */}
                {checklist.length > 0 && (
                  <div className="px-4 py-3 border-b border-surface-3 bg-surface-2/40">
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="text-[10px] text-gray-600 font-medium uppercase tracking-wide">Planning Checklist</p>
                      <span className="text-[10px] text-gray-600">{resolvedCount}/{checklist.length} resolved</span>
                    </div>
                    <div className="space-y-1.5 mb-2.5">
                      {checklist.map((item, i) => (
                        <button
                          key={i}
                          onClick={() => !pmDone && handleChecklistToggle(i)}
                          disabled={pmDone}
                          className={`w-full flex items-start gap-2 text-left rounded-lg px-2 py-1.5 transition-colors group ${
                            pmDone ? 'cursor-default' :
                            item.resolved ? 'hover:bg-green-500/5 cursor-pointer' : 'hover:bg-surface-3 cursor-pointer'
                          }`}
                          title={pmDone ? '' : item.resolved ? 'Click to uncheck' : 'Click to mark resolved'}
                        >
                          {item.resolved ? (
                            <CheckCircle2 size={13} className={`shrink-0 mt-0.5 ${item.manuallyResolved ? 'text-blue-400' : 'text-green-400'}`} />
                          ) : (
                            <Circle size={13} className="text-gray-600 shrink-0 mt-0.5 group-hover:text-gray-400 transition-colors" />
                          )}
                          <span className={`text-xs leading-tight ${item.resolved ? 'text-gray-500 line-through' : 'text-gray-300'}`}>
                            {item.item}
                            {item.manuallyResolved && (
                              <span className="ml-1.5 text-[10px] text-blue-400/60">(you)</span>
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="h-1 bg-surface-4 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{
                        width: `${checklistProgress}%`,
                        background: checklistProgress === 100
                          ? 'linear-gradient(90deg,#10b981,#34d399)'
                          : 'linear-gradient(90deg,#7c6af7,#a78bfa)'
                      }} />
                    </div>
                    {!pmDone && (
                      <p className="text-[10px] text-gray-700 mt-2">
                        Click any item to check / uncheck it — the planning agent re-evaluates after each toggle.
                        {allItemsChecked && ' All checked — planning agent doing final review…'}
                      </p>
                    )}
                  </div>
                )}

                {/* Conversation thread */}
                {conversationLogs.length === 0 && !hasPendingQuestion && !agentThinking && (
                  <div className="px-4 py-6 text-center">
                    <p className="text-xs text-gray-600">Planning agent is analysing the task…</p>
                  </div>
                )}
                {(conversationLogs.length > 0 || agentThinking) && (
                  <div className="px-4 py-3 space-y-2.5 max-h-52 overflow-y-auto">
                    {conversationLogs.map(log => {
                      const isPM = log.action === LOG_ACTION.PM_QUESTION;
                      const isDone = log.action === LOG_ACTION.PM_REVIEWED;
                      return (
                        <div key={log.id} className={`flex gap-2 ${isPM || isDone ? '' : 'flex-row-reverse'}`}>
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5 ${isPM || isDone ? 'bg-purple-600 text-white' : 'bg-blue-600 text-white'}`}>
                            {isPM || isDone ? 'PM' : 'Me'}
                          </div>
                          <div className={`flex-1 rounded-lg px-2.5 py-2 text-xs leading-relaxed ${
                            isPM ? 'bg-purple-500/10 text-purple-200 border border-purple-500/20' :
                            isDone ? 'bg-green-500/10 text-green-300 border border-green-500/20' :
                            'bg-surface-3 text-gray-300'
                          }`}>
                            {(isPM || isDone)
                              ? <MarkdownText text={log.message} />
                              : <p className="whitespace-pre-wrap">{log.message}</p>
                            }
                          </div>
                        </div>
                      );
                    })}
                    {agentThinking && (
                      <div className="flex gap-2">
                        <div className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center text-[9px] font-bold text-white shrink-0 mt-0.5">PM</div>
                        <div className="flex items-center gap-1.5 bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-2.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Answer input */}
                {hasPendingQuestion && !agentThinking && (
                  <div className="border-t border-surface-3 p-4 space-y-2.5">
                    {/* Current PM question — shown here since it's sliced from the thread above */}
                    <div className="flex gap-2">
                      <div className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center text-[9px] font-bold text-white shrink-0 mt-0.5">PM</div>
                      <div className="flex-1 text-xs text-purple-200 bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-2 leading-relaxed">
                        <MarkdownText text={task.pm_pending_question} />
                      </div>
                    </div>
                    {splitProposal ? (
                      <div className="pl-7 space-y-2.5">
                        <p className="text-[11px] font-medium text-gray-300">Would you like to split into smaller tasks?</p>
                        <ul className="space-y-1">
                          {splitProposal.parts.map((p, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                              <span className={`shrink-0 mt-px text-[10px] px-1.5 py-0.5 rounded ${i === 0 ? 'bg-purple-500/15 text-purple-300' : 'bg-amber-500/10 text-amber-400'}`}>
                                {i === 0 ? 'This task' : 'New'}
                              </span>
                              <span className="leading-tight">{p.title}</span>
                            </li>
                          ))}
                        </ul>
                        <p className="text-[10px] text-gray-600">
                          Yes keeps the first as this task and creates the rest as drafts that need a description. No keeps everything as one task.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSplit(true)}
                            className="px-3 py-1.5 text-xs font-medium bg-amber-500/90 text-white rounded-lg hover:bg-amber-500 transition-colors"
                          >
                            Yes, split into {splitProposal.parts.length}
                          </button>
                          <button
                            onClick={() => handleSplit(false)}
                            className="px-3 py-1.5 text-xs font-medium bg-surface-3 text-gray-300 border border-surface-4 rounded-lg hover:bg-surface-4 transition-colors"
                          >
                            No, keep as one
                          </button>
                        </div>
                      </div>
                    ) : abandonProposal ? (
                      <div className="pl-7 space-y-2.5">
                        {abandonProposal.reason && (
                          <p className="text-[11px] text-gray-400">
                            Reason: <span className="text-gray-300">{abandonProposal.reason}</span>
                          </p>
                        )}
                        <p className="text-[10px] text-gray-600">
                          Abandon archives this task (you can restore it later from the archive). Keep means it does belong here and planning continues.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAbandon(true)}
                            className="px-3 py-1.5 text-xs font-medium bg-red-500/90 text-white rounded-lg hover:bg-red-500 transition-colors"
                          >
                            Abandon task
                          </button>
                          <button
                            onClick={() => handleAbandon(false)}
                            className="px-3 py-1.5 text-xs font-medium bg-surface-3 text-gray-300 border border-surface-4 rounded-lg hover:bg-surface-4 transition-colors"
                          >
                            Keep & continue
                          </button>
                        </div>
                      </div>
                    ) : (
                    <div className="flex gap-2 pl-7">
                      <textarea
                        value={answerText}
                        onChange={e => setAnswerText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAnswer(); } }}
                        placeholder="Reply… (Enter to send, Shift+Enter for new line)"
                        className="flex-1 text-xs p-2.5 bg-surface-3 border border-surface-4 rounded-lg text-gray-300 placeholder-gray-600 resize-none focus:outline-none focus:border-accent transition-colors"
                        rows="3"
                      />
                      <button
                        onClick={handleAnswer}
                        disabled={!answerText.trim()}
                        className="self-end px-3 py-2 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Send
                      </button>
                    </div>
                    )}
                  </div>
                )}

                {/* ── Board knowledge suggestion ─────────────────────────── */}
                {pmDone && task.pm_client_context_draft && (
                  <div className={`border-t border-surface-3 p-4 space-y-2.5 transition-opacity ${clientContextSkipped ? 'opacity-50' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                        <p className="text-xs font-medium text-purple-300">
                          {clientContextSkipped ? 'Knowledge notes — skipped (still available to save)' : 'Agent noted something worth remembering'}
                        </p>
                      </div>
                      {clientContextSkipped && (
                        <button onClick={() => setClientContextSkipped(false)} className="text-[10px] text-purple-400 hover:text-purple-300 transition-colors">
                          Review
                        </button>
                      )}
                    </div>
                    {!clientContextSkipped && (() => {
                      const value = clientContextEdit ?? task.pm_client_context_draft ?? '';
                      const overLimit = value.length > 2000;
                      return (
                        <div className="space-y-1.5">
                          <textarea
                            value={value}
                            onChange={e => setClientContextEdit(e.target.value)}
                            rows={5}
                            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-gray-300 leading-relaxed resize-none outline-none focus:border-purple-500/50 placeholder-gray-600"
                            placeholder="Edit what should be remembered about this client…"
                          />
                          <div className="flex justify-between items-center">
                            <p className="text-[10px] text-gray-600">Edit before saving</p>
                            <span className={`text-[10px] tabular-nums ${overLimit ? 'text-red-400' : 'text-gray-600'}`}>{value.length} / 2000</span>
                          </div>
                          <div className="flex gap-2 pt-0.5">
                            <button
                              onClick={handleSaveClientContext}
                              disabled={savingClientContext || value.length > 2000}
                              className="flex-1 py-1.5 text-xs font-medium text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-40 rounded-lg transition-colors"
                            >
                              {savingClientContext ? 'Saving…' : 'Save knowledge'}
                            </button>
                            <button
                              onClick={handleSkipClientContext}
                              disabled={savingClientContext}
                              className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 border border-border rounded-lg transition-colors"
                            >
                              Skip for now
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* PM satisfied — human sign-off */}
                {pmDone && task.human_approval_status !== HUMAN_STATUS.APPROVED && (
                  <div className="border-t border-surface-3 p-4 space-y-2.5">
                    <p className="text-xs text-green-400 font-medium">Planning agent satisfied — review the requirements and approve</p>
                    {task.pm_review_comment && (
                      <div className="bg-surface-2 rounded-lg p-3">
                        <p className="text-[10px] text-gray-600 font-medium uppercase tracking-wide mb-1.5">Requirements</p>
                        <MarkdownText text={task.pm_review_comment} className="text-xs text-gray-300 leading-relaxed" />
                      </div>
                    )}
                    {!approvingHuman ? (
                      <button
                        onClick={() => setApprovingHuman(true)}
                        disabled={!!(task.pm_client_context_draft && !clientContextSkipped)}
                        title={task.pm_client_context_draft && !clientContextSkipped ? 'Save or skip the knowledge notes above first' : undefined}
                        className="w-full py-2 text-xs font-medium bg-green-600/20 text-green-300 rounded-lg hover:bg-green-600/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Approve &amp; unlock In Progress
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <textarea
                          value={approvalComment}
                          onChange={e => setApprovalComment(e.target.value)}
                          placeholder="Optional comment…"
                          className="w-full text-xs p-2.5 bg-surface-3 border border-surface-4 rounded-lg text-gray-300 placeholder-gray-600 resize-none focus:outline-none focus:border-accent"
                          rows="2"
                        />
                        <div className="flex gap-2">
                          <button onClick={handleApprove} className="flex-1 py-2 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">Approve</button>
                          <button onClick={() => { setApprovingHuman(false); setApprovalComment(''); }} className="px-3 py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors">Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Bypass — all items checked but PM hasn't approved */}
                {showBypass && (
                  <div className="border-t border-surface-3 px-4 py-3 space-y-2">
                    <p className="text-[10px] text-gray-500">All items are checked but the planning agent hasn't approved. You can bypass if you're satisfied.</p>
                    <div className="flex gap-2">
                      <button onClick={handleBypass} className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-lg transition-colors ${confirmBypass ? 'bg-orange-500/25 text-orange-300 border border-orange-500/30' : 'bg-surface-3 text-gray-500 hover:text-orange-300 hover:bg-orange-500/10'}`}>
                        <Unlock size={11} />
                        {confirmBypass ? 'Confirm bypass?' : 'Bypass planning checks'}
                      </button>
                      <button onClick={() => { setShowNewTask(true); setSelectedTask(null); }} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-lg bg-surface-3 text-gray-500 hover:text-accent hover:bg-accent/10 transition-colors">
                        <Plus size={11} />
                        New task instead
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Description — editable */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-gray-600 font-medium">Description</p>
                {!editingDescription && (
                  <button
                    onClick={() => { setDescriptionDraft(task.description || ''); setEditingDescription(true); }}
                    className="text-[10px] text-gray-700 hover:text-gray-400 flex items-center gap-1 transition-colors"
                  >
                    <Pencil size={10} /> Edit
                  </button>
                )}
              </div>
              {editingDescription ? (
                <div className="space-y-1.5">
                  <textarea
                    ref={descRef}
                    value={descriptionDraft}
                    onChange={e => setDescriptionDraft(e.target.value)}
                    className="w-full text-sm p-2.5 bg-surface-2 border border-accent/60 rounded-lg text-gray-300 placeholder-gray-600 resize-none focus:outline-none focus:border-accent transition-colors"
                    rows="4"
                    placeholder="Describe what needs to be done…"
                  />
                  <div className="flex gap-2">
                    <button onClick={saveDescription} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/80 transition-colors">
                      <Check size={11} /> Save
                    </button>
                    <button onClick={() => setEditingDescription(false)} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p
                  onClick={() => { setDescriptionDraft(task.description || ''); setEditingDescription(true); }}
                  className="text-sm text-gray-400 leading-relaxed cursor-text hover:text-gray-300 transition-colors"
                >
                  {task.description || <span className="text-gray-700 italic">No description — click to add</span>}
                </p>
              )}
            </div>

            {/* Progress */}
            {task.progress > 0 && (
              <div className="bg-surface-2 rounded-lg p-2.5">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-xs text-gray-600 font-medium">Progress</p>
                  <span className="text-xs font-mono text-gray-400">{task.progress}%</span>
                </div>
                <div className="h-1.5 bg-surface-4 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${task.progress}%`,
                      background: task.progress === 100
                        ? 'linear-gradient(90deg, #10b981, #34d399)'
                        : 'linear-gradient(90deg, #7c6af7, #a78bfa)'
                    }}
                  />
                </div>
              </div>
            )}

            {/* Acceptance criteria — editable */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-gray-600 font-medium">Acceptance Criteria</p>
                {!editingCriteria && (
                  <button
                    onClick={() => { setCriteriaDraft(task.acceptance_criteria || ''); setEditingCriteria(true); }}
                    className="text-[10px] text-gray-700 hover:text-gray-400 flex items-center gap-1 transition-colors"
                  >
                    <Pencil size={10} /> Edit
                  </button>
                )}
              </div>
              {editingCriteria ? (
                <div className="space-y-1.5">
                  <textarea
                    value={criteriaDraft}
                    onChange={e => setCriteriaDraft(e.target.value)}
                    onFocus={e => e.target.focus()}
                    className="w-full text-xs p-2.5 bg-surface-2 border border-accent/60 rounded-lg text-gray-300 placeholder-gray-600 resize-none focus:outline-none focus:border-accent transition-colors"
                    rows="3"
                    placeholder="Define what done looks like…"
                  />
                  <div className="flex gap-2">
                    <button onClick={saveCriteria} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/80 transition-colors">
                      <Check size={11} /> Save
                    </button>
                    <button onClick={() => setEditingCriteria(false)} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => { setCriteriaDraft(task.acceptance_criteria || ''); setEditingCriteria(true); }}
                  className="bg-surface-2 rounded-lg p-3 cursor-text hover:bg-surface-3/50 transition-colors"
                >
                  {task.acceptance_criteria
                    ? <p className="text-xs text-gray-400 leading-relaxed whitespace-pre-wrap">{task.acceptance_criteria}</p>
                    : <p className="text-xs text-gray-700 italic">None — click to add</p>
                  }
                </div>
              )}
            </div>

            {/* Priority */}
            <div className="bg-surface-2 rounded-lg p-2.5">
              <p className="text-xs text-gray-600 mb-1.5">Priority</p>
              <select
                value={task.priority}
                onChange={e => handlePriorityChange(e.target.value)}
                className="w-full bg-transparent text-xs font-medium focus:outline-none cursor-pointer"
                style={{ color: PRIORITY_COLORS[task.priority] }}
              >
                {PRIORITIES.map(p => (
                  <option key={p} value={p} style={{ color: PRIORITY_COLORS[p], background: '#1a1a2e' }}>{p}</option>
                ))}
              </select>
            </div>

            {/* Team section — controls visible/restricted for client role */}
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="px-3 py-1.5 bg-surface-3/50 border-b border-border">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">Team</p>
              </div>
              <div className="p-3 space-y-3">
                {/* TODO: complexity is visible to client but read-only when client login is implemented */}
                <div className="bg-surface-2 rounded-lg p-2.5">
                  <p className="text-xs text-gray-600 mb-1.5">Complexity</p>
                  <select
                    value={task.complexity}
                    onChange={e => handleComplexityChange(e.target.value)}
                    className="w-full bg-transparent text-xs font-medium text-gray-300 focus:outline-none cursor-pointer"
                  >
                    {COMPLEXITIES.map(c => (
                      <option key={c} value={c} style={{ background: '#1a1a2e' }}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* TODO: hide auto_complete toggle for client role when login is implemented */}
                <div
                  className="flex items-center justify-between bg-surface-2 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-surface-3/60 transition-colors"
                  onClick={() => {
                    const next = task.auto_complete ? 0 : 1;
                    updateTask(task.id, { auto_complete: next });
                    setTask(t => ({ ...t, auto_complete: next }));
                  }}
                >
                  <div>
                    <p className="text-xs font-medium text-gray-300">Auto-complete</p>
                    <p className="text-[10px] text-gray-600 mt-0.5">
                      {task.auto_complete ? 'PR will be merged automatically → Testing' : 'PR sent to Human Action for your review'}
                    </p>
                  </div>
                  <div className={`w-8 h-4.5 rounded-full transition-colors relative shrink-0 ml-3 ${task.auto_complete ? 'bg-accent' : 'bg-surface-4'}`}
                       style={{ height: '18px', width: '32px' }}>
                    <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${task.auto_complete ? 'translate-x-[14px]' : 'translate-x-0.5'}`} />
                  </div>
                </div>

                {/* TODO: hide Move To buttons for client role when login is implemented */}
                {!isLocked && (
                  <div>
                    <p className="text-xs text-gray-600 mb-2 flex items-center gap-1"><ArrowRight size={10} />Move to</p>
                    <div className="flex flex-wrap gap-1.5">
                      {columns.filter(c => c.id !== task.column_id && !c.archived_at).map(col => (
                        <button key={col.id} onClick={() => handleMove(col.id)}
                          className="tag bg-surface-3 text-gray-400 hover:text-white hover:bg-surface-4 cursor-pointer transition-colors"
                          style={{ borderLeft: `2px solid ${col.color}` }}>
                          {col.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Assigned agent */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-500">Assigned Agent</label>
                {task.assigned_agent_id && (
                  <button
                    onClick={handleOpenEditAgent}
                    className="flex items-center gap-1 text-[10px] text-gray-600 hover:text-accent transition-colors"
                    title="Edit this agent"
                  >
                    <Pencil size={10} />
                    Edit agent
                  </button>
                )}
              </div>
              <select
                value={task.assigned_agent_id || ''}
                onChange={e => handleAgentChange(e.target.value)}
                disabled={isLocked}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <option value="">Unassigned</option>
                {agents.filter(a => {
                  if (!a.active) return false;
                  const coveringRoles = roles.filter(r => r.type === 'column_access' && (r.allowed_column_ids || []).includes(task.column_id));
                  if (coveringRoles.length === 0) return true;
                  const roleIds = a.role_ids || [];
                  return roleIds.includes('role_access_any') || coveringRoles.some(r => roleIds.includes(r.id));
                }).map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            {/* Unsaved changes prompt — shown when user tries to open agent editor */}
            {pendingEditAgent && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4" data-modal-backdrop="static">
                <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-200">Unsaved changes</h3>
                    <p className="text-xs text-gray-500 mt-1">You have unsaved changes in this task. Would you like to save them before opening the agent editor?</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPendingEditAgent(null)}
                      className="flex-1 py-2 text-sm text-gray-500 hover:text-gray-300 rounded-lg border border-border hover:bg-surface-3 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleEditAgentDiscard}
                      className="flex-1 py-2 text-sm text-gray-400 hover:text-gray-200 rounded-lg border border-border hover:bg-surface-3 transition-colors"
                    >
                      Discard
                    </button>
                    <button
                      onClick={handleEditAgentSaveFirst}
                      className="flex-1 py-2 text-sm font-medium text-white bg-accent hover:bg-accent/80 rounded-lg transition-colors"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tags */}
            {tags.length > 0 && (
              <div>
                <p className="text-xs text-gray-600 mb-2 flex items-center gap-1"><Tag size={10} />Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map(tag => (
                    <span key={tag} className="tag bg-surface-3 text-gray-400">{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div className="flex items-center gap-3 text-xs text-gray-700">
              <span className="flex items-center gap-1">
                <Clock size={10} />
                Created {formatDistanceToNow(new Date(task.created_at.replace(' ', 'T') + 'Z'), { addSuffix: true })}
              </span>
              {task.updated_at && task.updated_at !== task.created_at && (
                <span className="flex items-center gap-1 text-gray-600">
                  · Modified {formatDistanceToNow(new Date(task.updated_at.replace(' ', 'T') + 'Z'), { addSuffix: true })}
                </span>
              )}
            </div>
          </div>

          {/* Comments */}
          <div className="border-t border-border px-5 pb-2">
            <TaskComments taskId={task.id} />
          </div>

          {/* Activity log */}
          {logs.length > 0 && (
            <div className="border-t border-border p-5">
              <p className="text-xs text-gray-600 mb-3 flex items-center gap-1"><Activity size={10} />Activity</p>
              <div className="max-h-64 overflow-y-auto pr-1 space-y-2.5">
                {logs.map(log => {
                  const label = (() => {
                    switch (log.action) {
                      case LOG_ACTION.CREATED:                return 'Task created';
                      case LOG_ACTION.PM_QUESTION:            return 'Planning agent asked a clarifying question';
                      case LOG_ACTION.HUMAN_ANSWER:           return 'You replied';
                      case LOG_ACTION.PM_REVIEWED:            return 'Planning agent approved the task';
                      case LOG_ACTION.PM_REVIEW_REQUESTED:    return 'Planning review requested';
                      case LOG_ACTION.HUMAN_APPROVED:         return `Human approved${log.message && log.message.replace(/^Human approved\s*[-–]?\s*/, '') ? ' — ' + log.message.replace(/^Human approved\s*[-–]?\s*/, '') : ''}`;
                      case LOG_ACTION.HUMAN_REJECTED:         return 'Human rejected';
                      case LOG_ACTION.MOVED:                  return log.message || 'Moved';
                      case LOG_ACTION.UPDATED:                return 'Task updated';
                      case LOG_ACTION.DEVELOPER_ASSIGNED:     return 'Developer assigned';
                      case LOG_ACTION.BRANCH_CREATED:         return log.message || 'Branch created';
                      case 'pr_created':                      return 'PR created — awaiting review';
                      case LOG_ACTION.PR_APPROVED:            return 'PR approved, moved to Testing';
                      case LOG_ACTION.HUMAN_ACTION_REQUESTED: return 'Human action required';
                      case LOG_ACTION.GITHUB_COMMENT:         return log.message || 'GitHub: new comment on the PR';
                      case LOG_ACTION.GITHUB_CI:              return log.message || 'GitHub CI result';
                      default: {
                        const msg = log.message || log.action;
                        return msg.length > 80 ? msg.slice(0, 80) + '…' : msg;
                      }
                    }
                  })();
                  return (
                    <div key={log.id} className="flex gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-surface-4 mt-1.5 shrink-0" />
                      <div>
                        <p className="text-xs text-gray-400">{label}</p>
                        <p className="text-[10px] text-gray-700 mt-0.5">
                          {log.agent_name || 'System'} · {formatDistanceToNow(new Date(log.created_at.replace(' ', 'T') + 'Z'), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
