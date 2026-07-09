import { useState, useEffect } from 'react';
import { X, Plus, Archive, RotateCcw, Pencil, Trash2, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { useStore } from '../../store';
import { MODELS, COLORS } from '../../constants/agents';

const EMPTY_FORM = {
  name: '', description: '', model: 'claude-sonnet-4-5', color: '#6366f1',
  template_system_prompt: '',
};

function TemplateForm({ initial = EMPTY_FORM, onSave, onCancel }) {
  const [form, setForm] = useState({
    ...EMPTY_FORM,
    ...initial,
    template_system_prompt: initial.template_system_prompt || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        model: form.model,
        color: form.color,
        template_system_prompt: form.template_system_prompt.trim() || null,
      });
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to save');
      setSaving(false);
    }
  }

  return (
    <div className="bg-surface-3 border border-border rounded-xl p-4 space-y-3">
      {/* Name */}
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">Template Name *</label>
        <input
          autoFocus
          value={form.name}
          onChange={e => set('name', e.target.value)}
          placeholder="Project Manager"
          className="w-full bg-surface-1 border border-border rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent transition-colors"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">Description</label>
        <textarea
          value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Brief description of this agent role..."
          rows={2}
          className="w-full bg-surface-1 border border-border rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent transition-colors resize-none"
        />
      </div>

      {/* Model + Color row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Model</label>
          <select value={form.model} onChange={e => set('model', e.target.value)}
            className="w-full bg-surface-1 border border-border rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-accent">
            {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-2">Color</label>
          <div className="flex gap-2 flex-wrap">
            {COLORS.map(c => (
              <button key={c} type="button" onClick={() => set('color', c)}
                className="w-5 h-5 rounded-full transition-transform hover:scale-110 shrink-0"
                style={{ background: c, outline: form.color === c ? '2px solid white' : 'none', outlineOffset: '2px' }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Template Behaviour Prompt — optional, always editable */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-400">Behaviour Prompt</label>
          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/25 uppercase tracking-wide">
            optional
          </span>
        </div>
        <p className="text-[10px] text-gray-600">The persona and working style injected into every agent created from this template — independent of the board's domain. Leave empty to skip.</p>
        <textarea
          value={form.template_system_prompt}
          onChange={e => set('template_system_prompt', e.target.value)}
          placeholder={`You are a ${form.name || 'specialist'}...\n\n**How you work:**\n- ...`}
          rows={8}
          className="w-full bg-surface-1 border border-border rounded-xl px-3 py-2.5 text-[11px] font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent transition-colors resize-y"
        />
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="btn-ghost flex-1 justify-center py-1.5 text-sm">
          Cancel
        </button>
        <button type="button" onClick={handleSave} disabled={saving || !form.name.trim()}
          className="btn-primary flex-1 justify-center py-1.5 text-sm disabled:opacity-40">
          <Check size={13} />
          {saving ? 'Saving...' : 'Save Template'}
        </button>
      </div>
    </div>
  );
}

function TemplateCard({ tpl, onEdit, onArchive, onUnarchive, onDelete }) {
  const isArchived = !!tpl.archived_at;
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Dismiss confirmation chip on any keypress
  useEffect(() => {
    if (!confirmDelete) return;
    function dismiss() { setConfirmDelete(false); }
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [confirmDelete]);

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setConfirmDelete(false);
    try {
      await onDelete();
    } catch (err) {
      if (err.response?.data?.has_dependencies) {
        alert(err.response.data.error);
      }
    }
  }

  return (
    <div className={`bg-surface-3 border rounded-xl p-3.5 space-y-2.5 ${isArchived ? 'border-border opacity-60' : 'border-border hover:border-accent/30 transition-colors'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
               style={{ background: tpl.color }}>
            {tpl.name[0]}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-200 truncate">{tpl.name}</p>
            {tpl.source_agent_id && (
              <p className="text-[9px] text-gray-600 font-mono">saved from agent</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isArchived ? (
            <>
              <button onClick={onUnarchive} title="Restore"
                className="p-1.5 rounded-lg text-gray-600 hover:text-accent hover:bg-surface-1 transition-colors">
                <RotateCcw size={12} />
              </button>
              <div className="relative">
                <button onClick={handleDelete} title="Delete permanently"
                  className={`p-1.5 rounded-lg transition-colors ${confirmDelete ? 'text-red-400 bg-red-500/10' : 'text-gray-600 hover:text-red-400 hover:bg-surface-1'}`}>
                  <Trash2 size={12} />
                </button>
                {confirmDelete && (
                  <div className="absolute top-full right-0 mt-1 z-20 bg-red-500/20 border border-red-500/40 text-red-300 text-[10px] rounded-lg px-2.5 py-1.5 whitespace-nowrap flex items-center gap-2 shadow-lg">
                    <span>Are you sure you want to delete this template?</span>
                    <button onClick={e => { e.stopPropagation(); setConfirmDelete(false); }} className="text-red-400 hover:text-red-200 leading-none">✕</button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <button onClick={onEdit} title="Edit"
                className="p-1.5 rounded-lg text-gray-600 hover:text-accent hover:bg-surface-1 transition-colors">
                <Pencil size={12} />
              </button>
              <button onClick={onArchive} title="Archive"
                className="p-1.5 rounded-lg text-gray-600 hover:text-amber-400 hover:bg-surface-1 transition-colors">
                <Archive size={12} />
              </button>
              <div className="relative">
                <button onClick={handleDelete} title="Delete permanently"
                  className={`p-1.5 rounded-lg transition-colors ${confirmDelete ? 'text-red-400 bg-red-500/10' : 'text-gray-600 hover:text-red-400 hover:bg-surface-1'}`}>
                  <Trash2 size={12} />
                </button>
                {confirmDelete && (
                  <div className="absolute top-full right-0 mt-1 z-20 bg-red-500/20 border border-red-500/40 text-red-300 text-[10px] rounded-lg px-2.5 py-1.5 whitespace-nowrap flex items-center gap-2 shadow-lg">
                    <span>Are you sure you want to delete this template?</span>
                    <button onClick={e => { e.stopPropagation(); setConfirmDelete(false); }} className="text-red-400 hover:text-red-200 leading-none">✕</button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {tpl.description && (
        <p className="text-xs text-gray-500 leading-relaxed">{tpl.description}</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-mono text-gray-600 bg-surface-1 border border-border px-2 py-0.5 rounded-md">
          {MODELS.find(m => m.value === tpl.model)?.shortLabel || tpl.model}
        </span>
        {isArchived && (
          <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">archived</span>
        )}
      </div>
    </div>
  );
}

export default function TemplatesModal() {
  const { agentTemplates, createTemplate, updateTemplate, archiveTemplate, unarchiveTemplate, deleteTemplate, setShowTemplates } = useStore();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  const active = agentTemplates.filter(t => !t.archived_at);
  const archived = agentTemplates.filter(t => !!t.archived_at);

  async function handleCreate(data) {
    await createTemplate(data);
    setCreating(false);
  }

  async function handleEdit(data) {
    await updateTemplate(editingId, data);
    setEditingId(null);
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" data-modal-backdrop="static">
      <div className="bg-surface-2 border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Agent Templates</h2>
            <p className="text-[11px] text-gray-600 mt-0.5">Reusable agent blueprints — a role, capability, and behaviour you can drop onto any board in any sector</p>
          </div>
          <button onClick={() => setShowTemplates(false)} className="btn-ghost p-1.5 rounded-lg">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {/* Create form or button */}
          {creating ? (
            <TemplateForm
              onSave={handleCreate}
              onCancel={() => setCreating(false)}
            />
          ) : (
            <button
              onClick={() => { setCreating(true); setEditingId(null); }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-border text-xs text-gray-500 hover:text-accent hover:border-accent/40 transition-colors"
            >
              <Plus size={13} />
              New Template
            </button>
          )}

          {/* Active templates */}
          {active.length === 0 && !creating && (
            <p className="text-center text-xs text-gray-600 py-4">No templates yet. Create one above.</p>
          )}

          {active.map(tpl =>
            editingId === tpl.id ? (
              <TemplateForm
                key={tpl.id}
                initial={tpl}
                onSave={handleEdit}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <TemplateCard
                key={tpl.id}
                tpl={tpl}
                onEdit={() => { setEditingId(tpl.id); setCreating(false); }}
                onArchive={() => archiveTemplate(tpl.id)}
                onUnarchive={() => unarchiveTemplate(tpl.id)}
                onDelete={() => deleteTemplate(tpl.id)}
              />
            )
          )}

          {/* Archived section */}
          {archived.length > 0 && (
            <div>
              <button
                onClick={() => setShowArchived(v => !v)}
                className="w-full flex items-center gap-2 py-1.5 text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >
                {showArchived ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                Archived ({archived.length})
              </button>
              {showArchived && (
                <div className="space-y-2 mt-2">
                  {archived.map(tpl => (
                    <TemplateCard
                      key={tpl.id}
                      tpl={tpl}
                      onEdit={() => {}}
                      onArchive={() => {}}
                      onUnarchive={() => unarchiveTemplate(tpl.id)}
                      onDelete={() => deleteTemplate(tpl.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
