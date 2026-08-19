import { useState, useEffect, useRef } from 'react';
import { X, Plus, Sparkles, Search, Loader2 } from 'lucide-react';
import { useStore } from '../../store';
import { tasksApi } from '../../api';

// Mirrors NewTaskModal.jsx's exact layout/classes — same modal chrome, same field
// styling, same button treatment. Trimmed to just the fields a probing task needs
// (no priority/complexity/assignee/tags/auto-complete). Scoring (which tool should
// fire, what the judge checks) is decided entirely server-side — the user only
// picks which capability is under test, never the scoring mechanics themselves.
const CAPABILITY_OPTIONS = [
  { value: 'perm_planning', label: 'Planning', placeholder: 'What should the planner review?', brief: 'The brief the planner will actually see…' },
  { value: 'perm_producing', label: 'Producing', placeholder: 'What document should be produced?', brief: 'The brief the document producer will actually see…' },
  { value: 'perm_verifying', label: 'Verifying', placeholder: 'What should verification check for?', brief: 'The same brief is first sent to Producing to generate a real document, then Verifying checks that document against this brief…' },
];

export default function NewBenchmarkTaskModal({ scope, targetProjectId, subscriptionId, onClose, onCreated }) {
  const { saveBenchmarkCase, draftBenchmarkCase } = useStore();
  const [capability, setCapability] = useState('perm_planning');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('');
  const [source, setSource] = useState('manual');
  const [rubric, setRubric] = useState(null); // carried silently from an AI draft, never shown
  const [ruleReference, setRuleReference] = useState(null);
  const capabilityInfo = CAPABILITY_OPTIONS.find(c => c.value === capability) || CAPABILITY_OPTIONS[0];

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.trim().length < 3) { setResults([]); setShowResults(false); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const all = await tasksApi.list({ project_id: targetProjectId, include_archived: true });
        const q = query.trim().toLowerCase();
        setResults(all.filter(t => t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)).slice(0, 8));
        setShowResults(true);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, targetProjectId]);

  function markEdited() {
    setSource(s => (s === 'ai_generated' ? 'ai_edited' : s));
  }

  function pickTask(task) {
    setTitle(task.title);
    setDescription(task.description || '');
    setAcceptanceCriteria(task.acceptance_criteria || '');
    setSource('cloned_task');
    setRubric(null);
    setRuleReference(null);
    setQuery('');
    setShowResults(false);
  }

  function handleCapabilityChange(value) {
    setCapability(value);
    // A drafted rubric/rule_reference is scored against the previously-selected
    // capability's outcome tools — carrying it over to a different capability
    // would silently score against the wrong shape, so clear it on switch.
    setRubric(null);
    setRuleReference(null);
    setSource('manual');
  }

  async function handleGenerate() {
    setError(''); setGenerating(true);
    try {
      const draft = await draftBenchmarkCase(targetProjectId, subscriptionId, capability);
      setTitle(draft.title);
      setDescription(draft.description);
      setRubric(draft.rubric || null);
      setRuleReference(draft.rule_reference || null);
      setSource('ai_generated');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not generate a task from this board');
    } finally { setGenerating(false); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setError(''); setSaving(true);
    try {
      const created = await saveBenchmarkCase({
        subscription_id: subscriptionId,
        project_id: scope === 'board' ? targetProjectId : null,
        layer: scope,
        capability,
        title: title.trim(),
        description: description.trim(),
        acceptance_criteria: acceptanceCriteria.trim() || undefined,
        rule_reference: ruleReference,
        rubric: rubric || undefined,
        source,
      });
      onCreated?.(created);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create task');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" data-modal-backdrop="static">
      <div className="bg-surface-2 border border-border rounded-xl w-full max-w-lg animate-slide-in">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-base font-semibold text-gray-100">New Benchmark Task</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Capability being tested</label>
            <select value={capability} onChange={e => handleCapabilityChange(e.target.value)}
              className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-100 outline-none focus:border-accent transition-colors">
              {CAPABILITY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Start from an existing task <span className="text-gray-600">(optional)</span></label>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onFocus={() => results.length > 0 && setShowResults(true)}
                placeholder="Type at least 3 characters to search…"
                className="w-full bg-surface-3 border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-gray-100
                           placeholder-gray-600 focus:outline-none focus:border-accent transition-colors"
              />
              {searching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 animate-spin" />}
            </div>
            {showResults && (
              <div className="absolute z-10 mt-1 w-full bg-surface-3 border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {results.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-gray-500">No matching tasks</p>
                ) : results.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pickTask(t)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-surface-4 transition-colors border-b border-border/50 last:border-b-0"
                  >
                    <span className="truncate block">{t.title}</span>
                    {t.archived_at && <span className="text-xs text-gray-500">historic</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="btn-ghost w-full justify-center py-2 disabled:opacity-40"
          >
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {generating ? 'Generating…' : 'Generate from this board'}
          </button>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Title *</label>
            <input
              autoFocus
              value={title}
              onChange={e => { setTitle(e.target.value); markEdited(); }}
              placeholder={capabilityInfo.placeholder}
              className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-100
                         placeholder-gray-600 focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={e => { setDescription(e.target.value); markEdited(); }}
              placeholder={capabilityInfo.brief}
              rows={5}
              className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-100
                         placeholder-gray-600 focus:outline-none focus:border-accent transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">
              Acceptance Criteria <span className="text-gray-600">(optional)</span>
            </label>
            <textarea
              value={acceptanceCriteria}
              onChange={e => { setAcceptanceCriteria(e.target.value); markEdited(); }}
              placeholder="Same field a real task gets once Planning approves it — e.g. which document to check, or concrete pass/fail conditions."
              rows={3}
              className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-100
                         placeholder-gray-600 focus:outline-none focus:border-accent transition-colors resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1 justify-center py-2">
              Cancel
            </button>
            <button type="submit" disabled={saving || !title.trim()} className="btn-primary flex-1 justify-center py-2 disabled:opacity-40">
              <Plus size={14} />
              {saving ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
