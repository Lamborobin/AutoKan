import { useState } from 'react';
import { X, Plus, LayoutTemplate } from 'lucide-react';
import { useStore } from '../../store';
import { instructionsApi } from '../../api';
import {
  useAgentForm,
  NameField, ModelField, ColorField,
  SystemPromptField, TemplatePromptField, RoleField, MODELS,
} from './AgentForm';

export default function NewAgentModal() {
  const { agents, agentTemplates, createAgent, setShowNewAgent } = useStore();
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  const {
    form, set, generatedRole,
    availableFiles,
    newPrompt, setNewPromptField,
    handleNameChange, resolvePersonalityFile, toggleRole,
  } = useAgentForm();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const activeTemplates = agentTemplates.filter(t => !t.archived_at);

  const roleConflict = generatedRole ? agents.some(a => a.role === generatedRole) : false;
  const canSubmit = form.name.trim() && generatedRole && !roleConflict;

  function applyTemplate(templateId) {
    setSelectedTemplateId(templateId);
    if (!templateId) {
      set('created_from_template_id', null);
      set('is_template', false);
      set('system_prompt', '');
      return;
    }
    const tpl = activeTemplates.find(t => t.id === templateId);
    if (!tpl) return;

    set('created_from_template_id', templateId);
    handleNameChange(tpl.name);
    set('model', tpl.model);
    set('color', tpl.color);
    set('description', tpl.description || '');

    // Pre-populate system prompt content in the "Create new" inline editor
    if (tpl.system_prompt_content) {
      setNewPromptField('active', true);
      setNewPromptField('content', tpl.system_prompt_content);
      const suggested = tpl.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/, '').slice(0, 60);
      setNewPromptField('name', suggested);
    }

    // is_template = true marks "this agent inherits a personality from a template".
    // We don't copy the template's prompt onto the agent — buildSystemPrompt fetches
    // it live at runtime via created_from_template_id. The user's system_prompt
    // field starts empty and is their per-agent override if they choose to type one.
    if (tpl.template_system_prompt) {
      set('is_template', true);
    } else {
      set('is_template', false);
    }
    set('system_prompt', '');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    try {
      const personalityFilePath = await resolvePersonalityFile();
      await createAgent({
        name: form.name.trim(),
        role: generatedRole,
        model: form.model,
        description: form.description,
        personality_file: personalityFilePath,
        color: form.color,
        permissions: ['task:read'],
        created_from_template_id: selectedTemplateId || undefined,
        system_prompt: form.system_prompt || null,
        role_ids: form.role_ids,
      });
      setShowNewAgent(false);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to create agent');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
         onClick={e => e.target === e.currentTarget && setShowNewAgent(false)}>
      <div className="bg-surface-2 border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-in">
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-surface-2 z-10">
          <h2 className="text-base font-semibold text-gray-100">New Agent</h2>
          <button onClick={() => setShowNewAgent(false)} className="btn-ghost p-1.5 rounded-lg">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Template picker */}
          {activeTemplates.length > 0 && (
            <div className={`rounded-xl border p-3 space-y-2 transition-colors ${
              selectedTemplateId ? 'border-accent/40 bg-accent/5' : 'border-border bg-surface-3'
            }`}>
              <div className="flex items-center gap-2">
                <LayoutTemplate size={12} className={selectedTemplateId ? 'text-accent' : 'text-gray-600'} />
                <label className="text-xs font-medium text-gray-400">Start from template</label>
              </div>
              <select
                value={selectedTemplateId}
                onChange={e => applyTemplate(e.target.value)}
                className="w-full bg-surface-1 border border-border rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-accent"
              >
                <option value="">— none —</option>
                {activeTemplates.map(tpl => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}{tpl.tags.length > 0 ? ` · ${tpl.tags.join(', ')}` : ''}
                  </option>
                ))}
              </select>
              {selectedTemplateId && (() => {
                const tpl = activeTemplates.find(t => t.id === selectedTemplateId);
                return tpl?.description ? (
                  <p className="text-[11px] text-gray-500 leading-relaxed">{tpl.description}</p>
                ) : null;
              })()}
            </div>
          )}

          <NameField
            value={form.name}
            onChange={handleNameChange}
            generatedRole={generatedRole}
            roleConflict={roleConflict}
          />

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="What does this agent do?"
              rows={2}
              className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent transition-colors resize-none" />
          </div>

          <ModelField value={form.model} onChange={v => set('model', v)} />

          <RoleField selectedRoleIds={form.role_ids} onToggle={toggleRole} />

          <TemplatePromptField
            form={form}
            onChange={v => set('system_prompt', v)}
          />

          <SystemPromptField
            personalityFile={form.personality_file}
            onSelectFile={v => set('personality_file', v)}
            availableFiles={availableFiles}
            newPrompt={newPrompt}
            setNewPromptField={setNewPromptField}
          />

          <ColorField value={form.color} onChange={v => set('color', v)} />

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowNewAgent(false)} className="btn-ghost flex-1 justify-center py-2">
              Cancel
            </button>
            <button type="submit" disabled={saving || !canSubmit}
              className="btn-primary flex-1 justify-center py-2 disabled:opacity-40">
              <Plus size={14} />
              {saving ? 'Creating...' : 'Create Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
