import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { useStore } from '../store';

const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const COMPLEXITIES = ['low', 'medium', 'high'];

export default function NewTaskModal() {
  const { agents, createTask, setShowNewTask } = useStore();
  const defaultPmAgent = agents.find(a => a.active !== 0 && Array.isArray(a.role_ids) && a.role_ids.includes('perm_pm_planning'));
  const [form, setForm] = useState({
    title: '', description: '', priority: 'medium', complexity: 'medium',
    assigned_agent_id: defaultPmAgent?.id || '', tags: '', acceptance_criteria: '', auto_complete: false,
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await createTask({
        ...form,
        acceptance_criteria: form.acceptance_criteria.trim() || undefined,
        auto_complete: form.auto_complete ? 1 : 0,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        assigned_agent_id: form.assigned_agent_id || undefined,
        column_id: 'col_backlog',
      });
      setShowNewTask(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
         onClick={e => e.target === e.currentTarget && setShowNewTask(false)}>
      <div className="bg-surface-2 border border-border rounded-2xl w-full max-w-lg animate-slide-in">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-base font-semibold text-gray-100">New Task</h2>
          <button onClick={() => setShowNewTask(false)} className="btn-ghost p-1.5 rounded-lg">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Title *</label>
            <input
              autoFocus
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="What needs to be done?"
              className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-100
                         placeholder-gray-600 focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Add more context for the agent..."
              rows={3}
              className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-100
                         placeholder-gray-600 focus:outline-none focus:border-accent transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Acceptance Criteria <span className="text-gray-600">(optional)</span></label>
            <textarea
              value={form.acceptance_criteria}
              onChange={e => set('acceptance_criteria', e.target.value)}
              placeholder="What does done look like? List concrete, testable conditions..."
              rows={3}
              className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-100
                         placeholder-gray-600 focus:outline-none focus:border-accent transition-colors resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Priority</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)}
                className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-accent">
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Complexity</label>
              <select value={form.complexity} onChange={e => set('complexity', e.target.value)}
                className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-accent">
                {COMPLEXITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Assign Agent</label>
            <select value={form.assigned_agent_id} onChange={e => set('assigned_agent_id', e.target.value)}
              className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-accent">
              <option value="">Unassigned</option>
              {agents.filter(a => a.active).map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.role})</option>
              ))}
            </select>
          </div>

          <div
            className="flex items-center justify-between bg-surface-3 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-surface-3/80 transition-colors"
            onClick={() => set('auto_complete', !form.auto_complete)}
          >
            <div>
              <p className="text-xs font-medium text-gray-300">Auto-complete</p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                {form.auto_complete ? 'PR merged automatically → Testing' : 'PR sent to Human Action for review'}
              </p>
            </div>
            <div className={`rounded-full transition-colors shrink-0 ml-3 relative ${form.auto_complete ? 'bg-accent' : 'bg-surface-4'}`}
                 style={{ width: '32px', height: '18px' }}>
              <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${form.auto_complete ? 'translate-x-[14px]' : 'translate-x-0.5'}`} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Tags <span className="text-gray-600">(comma separated)</span></label>
            <input
              value={form.tags}
              onChange={e => set('tags', e.target.value)}
              placeholder="frontend, auth, bug"
              className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-100
                         placeholder-gray-600 focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowNewTask(false)} className="btn-ghost flex-1 justify-center py-2">
              Cancel
            </button>
            <button type="submit" disabled={saving || !form.title.trim()} className="btn-primary flex-1 justify-center py-2 disabled:opacity-40">
              <Plus size={14} />
              {saving ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
