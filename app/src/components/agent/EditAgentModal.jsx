import { useState, useEffect } from 'react';
import { X, Save, Trash2, Archive, LayoutTemplate, Check, AlertCircle } from 'lucide-react';
import { useStore } from '../../store';
import { COLUMN } from '../../constants/columns';
import {
  useAgentForm, agentRolesValid,
  ModelField, ColorField,
  TemplatePromptField, RoleField,
} from './AgentForm';

export default function EditAgentModal() {
  const { editingAgent, updateAgent, deleteAgent, archiveAgent, saveAgentAsTemplate, agentTemplates, setEditingAgent, tasks, roles, columns } = useStore();
  const agent = editingAgent;

  const {
    form, set, toggleRole,
  } = useAgentForm({
    name: agent.name,
    role: agent.role,
    model: agent.model,
    description: agent.description || '',
    color: agent.color,
    is_template: agent.is_template || false,
    system_prompt: agent.system_prompt || '',
    created_from_template_id: agent.created_from_template_id || null,
    role_ids: agent.role_ids || [],
  });

  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [error, setError] = useState('');
  const [displacementWarning, setDisplacementWarning] = useState(null); // { tasks: [] } | null

  // Dismiss confirmation chips on any keypress
  useEffect(() => {
    if (!confirming && !confirmingArchive) return;
    function dismiss() { setConfirming(false); setConfirmingArchive(false); }
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [confirming, confirmingArchive]);
  const [savingAsTemplate, setSavingAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState(agent.name);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [showSaveAsTemplate, setShowSaveAsTemplate] = useState(false);

  // Check if agent was created from an archived template
  const originTemplate = agent.created_from_template_id
    ? agentTemplates.find(t => t.id === agent.created_from_template_id)
    : null;
  const originArchived = originTemplate?.archived_at;

  function close() { setEditingAgent(null); }

  function getDisplacedTasks(newRoleIds) {
    if (newRoleIds.includes('role_access_any')) return [];
    return tasks.filter(t => {
      if (t.assigned_agent_id !== agent.id) return false;
      if (t.archived_at) return false;
      if (t.column_id === COLUMN.UNASSIGNED) return false;
      const coveringRoles = roles.filter(r =>
        r.type === 'column_access' && (r.allowed_column_ids || []).includes(t.column_id)
      );
      if (coveringRoles.length === 0) return false;
      return !coveringRoles.some(r => newRoleIds.includes(r.id));
    });
  }

  async function doSave() {
    setSaving(true);
    setError('');
    setDisplacementWarning(null);
    try {
      const payload = {
        name: form.name.trim(),
        model: form.model,
        description: form.description,
        color: form.color,
        system_prompt: form.system_prompt || null,
        role_ids: form.role_ids,
      };
      await updateAgent(agent.id, payload);
      close();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to save agent');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || !agentRolesValid(form.role_ids)) return;

    // Check if column access roles were reduced → tasks may be displaced
    const displaced = getDisplacedTasks(form.role_ids);
    if (displaced.length > 0 && !displacementWarning) {
      setDisplacementWarning({ tasks: displaced });
      return;
    }

    await doSave();
  }

  async function handleArchiveAgent() {
    if (!confirmingArchive) { setConfirmingArchive(true); return; }
    await archiveAgent(agent.id);
    close();
  }

  async function handleDelete() {
    if (!confirming) { setConfirming(true); return; }
    try {
      await deleteAgent(agent.id);
      close();
    } catch (err) {
      setConfirming(false);
      if (err.response?.data?.has_dependencies) {
        setConfirmingArchive(true);
        setError(err.response.data.error);
      } else {
        setError(err.response?.data?.error || err.message || 'Failed to delete');
      }
    }
  }

  async function handleSaveAsTemplate() {
    if (!templateName.trim()) return;
    setSavingAsTemplate(true);
    try {
      await saveAgentAsTemplate(agent.id, { name: templateName.trim() });
      setTemplateSaved(true);
      setShowSaveAsTemplate(false);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to save template');
    } finally {
      setSavingAsTemplate(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" data-modal-backdrop="static">
      <div className="bg-surface-2 border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-in">
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-surface-2 z-10">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Edit Agent</h2>
          </div>
          <button onClick={close} className="btn-ghost p-1.5 rounded-lg">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Archived template warning */}
          {originArchived && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <LayoutTemplate size={12} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-400 leading-relaxed">
                Created from template <span className="font-medium">{originTemplate.name}</span>, which has since been archived.
              </p>
            </div>
          )}

          {/* Name — no role generation in edit mode */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Name *</label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="What does this agent do?"
              rows={2}
              className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent transition-colors resize-none"
            />
          </div>

          <ModelField value={form.model} onChange={v => set('model', v)} />

          <RoleField selectedRoleIds={form.role_ids} onToggle={toggleRole} />

          <TemplatePromptField
            form={form}
            onChange={v => set('system_prompt', v)}
          />

          <ColorField value={form.color} onChange={v => set('color', v)} />

          {/* Save as template inline UI */}
          {showSaveAsTemplate ? (
            <div className="bg-surface-3 border border-accent/30 rounded-xl p-3 space-y-2.5">
              <p className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
                <LayoutTemplate size={12} className="text-accent" />
                Save as template
              </p>
              <input
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="Template name"
                className="w-full bg-surface-1 border border-border rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent transition-colors"
              />
              <p className="text-[10px] text-gray-600">Saves this agent's description, model, and color. You can edit the system prompt content in the Templates manager.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowSaveAsTemplate(false)}
                  className="btn-ghost flex-1 justify-center py-1.5 text-xs">
                  Cancel
                </button>
                <button type="button" onClick={handleSaveAsTemplate}
                  disabled={savingAsTemplate || !templateName.trim()}
                  className="btn-primary flex-1 justify-center py-1.5 text-xs disabled:opacity-40">
                  <Check size={12} />
                  {savingAsTemplate ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setShowSaveAsTemplate(true); setTemplateSaved(false); }}
              className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs transition-colors ${
                templateSaved
                  ? 'border-accent/40 text-accent bg-accent/5'
                  : 'border-dashed border-border text-gray-600 hover:text-accent hover:border-accent/40'
              }`}
            >
              <LayoutTemplate size={12} />
              {templateSaved ? 'Saved as template' : 'Save as template'}
            </button>
          )}

          {/* Displacement warning */}
          {displacementWarning && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 space-y-2.5">
              <div className="flex items-start gap-2">
                <AlertCircle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-amber-300">Column access removed — tasks will be displaced</p>
                  <p className="text-[10px] text-amber-400/80 mt-0.5">
                    {displacementWarning.tasks.length} task{displacementWarning.tasks.length > 1 ? 's' : ''} assigned to this agent will be moved to Unassigned:
                  </p>
                  <ul className="mt-1.5 space-y-0.5 max-h-32 overflow-y-auto">
                    {displacementWarning.tasks.map(t => (
                      <li key={t.id} className="text-[10px] text-amber-400 flex items-center gap-2">
                        <span className="text-[9px] text-amber-500/70 shrink-0">{columns.find(c => c.id === t.column_id)?.name || t.column_id}</span>
                        <span className="truncate">{t.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setDisplacementWarning(null)}
                  className="flex-1 py-1.5 text-xs rounded-lg border border-border text-gray-400 hover:text-gray-200 transition-colors">
                  Cancel
                </button>
                <button type="button" onClick={doSave} disabled={saving}
                  className="flex-1 py-1.5 text-xs font-medium bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-lg hover:bg-amber-500/30 transition-colors disabled:opacity-40">
                  {saving ? 'Saving…' : 'Save & Move to Unassigned'}
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2 pt-2 flex-wrap">
            <div className="relative">
              <button
                type="button"
                onClick={handleArchiveAgent}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors ${
                  confirmingArchive
                    ? 'bg-amber-500/20 border border-amber-500/40 text-amber-400'
                    : 'btn-ghost text-gray-600 hover:text-amber-400'
                }`}
              >
                <Archive size={13} />
                Archive
              </button>
              {confirmingArchive && (
                <div className="absolute bottom-full left-0 mb-1 z-20 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] rounded-lg px-2.5 py-1.5 whitespace-nowrap flex items-center gap-2 shadow-lg">
                  <span>Are you sure you want to archive this agent?</span>
                  <button type="button" onClick={e => { e.stopPropagation(); setConfirmingArchive(false); }} className="text-amber-400 hover:text-amber-200 leading-none">✕</button>
                </div>
              )}
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={handleDelete}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors ${
                  confirming
                    ? 'bg-red-500/20 border border-red-500/40 text-red-400'
                    : 'btn-ghost text-gray-600 hover:text-red-400'
                }`}
              >
                <Trash2 size={13} />
                Delete
              </button>
              {confirming && (
                <div className="absolute bottom-full left-0 mb-1 z-20 bg-red-500/20 border border-red-500/40 text-red-300 text-[10px] rounded-lg px-2.5 py-1.5 whitespace-nowrap flex items-center gap-2 shadow-lg">
                  <span>Are you sure you want to delete this agent?</span>
                  <button type="button" onClick={e => { e.stopPropagation(); setConfirming(false); }} className="text-red-400 hover:text-red-200 leading-none">✕</button>
                </div>
              )}
            </div>
            <button type="button" onClick={close} className="btn-ghost flex-1 justify-center py-2">
              Cancel
            </button>
            <button type="submit" disabled={saving || !form.name.trim() || !agentRolesValid(form.role_ids)}
              className="btn-primary flex-1 justify-center py-2 disabled:opacity-40">
              <Save size={14} />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
