import { useState, useEffect } from 'react';
import { Plus, Info } from 'lucide-react';
import { instructionsApi } from '../../api';
import { useStore } from '../../store';
import { MODELS, COLORS } from '../../constants/agents';

export { MODELS, COLORS };

export function displayName(filePath) {
  // Strip "instructions/", "instructions/{subId}/", or "instructions/{subId}/{projId}/" prefixes
  return filePath.replace(/^instructions(\/[^/]+(\/[^/]+)?)?\//, '').replace(/\.md$/, '');
}

export function slugify(str) {
  return str.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function sanitizeFileName(str) {
  return str.trim().toLowerCase()
    .replace(/\.md$/i, '')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
}

export function useAgentForm(initial = {}) {
  const currentProjectId = useStore(s => s.currentProjectId);
  const subscription     = useStore(s => s.subscription);
  const subId = subscription?.id || 'sub_default';
  const [form, setForm] = useState({
    name: '',
    model: 'claude-sonnet-4-5',
    description: '',
    personality_file: '',
    color: '#6366f1',
    is_template: false,
    system_prompt: '',
    created_from_template_id: null,
    role_ids: ['role_access_any'],
    ...initial,
  });
  const [generatedRole, setGeneratedRole] = useState(initial.role || '');
  const [availableFiles, setAvailableFiles] = useState([]);
  const [newPrompt, setNewPrompt] = useState({ active: false, name: '', content: '' });

  useEffect(() => {
    Promise.all([
      instructionsApi.list(false, null, subId),             // system (global) files
      instructionsApi.list(false, currentProjectId, subId), // custom (per-board) files
    ]).then(([system, custom]) => {
      setAvailableFiles([
        ...system.map(f => ({ ...f, scope: 'system' })),
        ...custom.map(f => ({ ...f, scope: 'custom' })),
      ]);
    }).catch(() => {});
  }, [currentProjectId, subId]);

  function handleNameChange(name) {
    setForm(f => ({ ...f, name }));
    if (!initial.role) setGeneratedRole(slugify(name));
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function setNewPromptField(k, v) {
    setNewPrompt(p => ({ ...p, [k]: v }));
  }

  async function resolvePersonalityFile() {
    if (newPrompt.active && newPrompt.name.trim()) {
      const safeName = sanitizeFileName(newPrompt.name);
      if (!safeName) throw new Error('Invalid system prompt file name');
      const result = await instructionsApi.create({ name: safeName, content: newPrompt.content }, currentProjectId, subId);
      Promise.all([
        instructionsApi.list(false, null, subId),
        instructionsApi.list(false, currentProjectId, subId),
      ]).then(([sys, cus]) => setAvailableFiles([
        ...sys.map(f => ({ ...f, scope: 'system' })),
        ...cus.map(f => ({ ...f, scope: 'custom' })),
      ])).catch(() => {});
      return result.path;
    }
    return form.personality_file || undefined;
  }

  function toggleRole(roleId) {
    setForm(f => ({
      ...f,
      role_ids: f.role_ids.includes(roleId)
        ? f.role_ids.filter(r => r !== roleId)
        : [...f.role_ids, roleId],
    }));
  }

  return {
    form, set, generatedRole,
    availableFiles,
    newPrompt, setNewPromptField,
    handleNameChange, resolvePersonalityFile, toggleRole,
  };
}

// ── Reusable field components ─────────────────────────────────────────────────

export function NameField({ value, onChange, generatedRole, roleConflict }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">Name *</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="QA Engineer"
        className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent transition-colors"
      />
      {generatedRole && (
        <p className={`mt-1 text-[10px] font-mono ${roleConflict ? 'text-red-400' : 'text-gray-600'}`}>
          role: {generatedRole}{roleConflict ? ' — already taken' : ''}
        </p>
      )}
    </div>
  );
}

export function ModelField({ value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">Model</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-accent"
      >
        {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
    </div>
  );
}

export function ColorField({ value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-2">Color</label>
      <div className="flex gap-2">
        {COLORS.map(c => (
          <button key={c} type="button" onClick={() => onChange(c)}
            className="w-6 h-6 rounded-full transition-transform hover:scale-110"
            style={{ background: c, outline: value === c ? '2px solid white' : 'none', outlineOffset: '2px' }}
          />
        ))}
      </div>
    </div>
  );
}

export function SystemPromptField({ personalityFile, onSelectFile, availableFiles, newPrompt, setNewPromptField }) {
  const showCreate = newPrompt.active;
  const sanitized = sanitizeFileName(newPrompt.name);
  const fileExists = sanitized && availableFiles.some(f => f.name === sanitized && f.scope === 'custom');

  const systemFiles = availableFiles.filter(f => f.scope === 'system');
  const customFiles = availableFiles.filter(f => f.scope === 'custom');

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-400">System Prompt File</label>
        <button
          type="button"
          onClick={() => setNewPromptField('active', !showCreate)}
          className={`text-[10px] flex items-center gap-1 transition-colors ${
            showCreate ? 'text-accent' : 'text-gray-600 hover:text-gray-400'
          }`}
        >
          <Plus size={10} />
          {showCreate ? 'Cancel' : 'Create new'}
        </button>
      </div>

      {showCreate ? (
        <div className="space-y-2 bg-surface-3 border border-accent/30 rounded-xl p-3">
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">File name (max 100 chars)</label>
            <div className="flex items-center gap-1.5">
              <input
                value={newPrompt.name}
                onChange={e => setNewPromptField('name', e.target.value)}
                placeholder="my_pm_agent"
                maxLength={100}
                className="flex-1 bg-surface-1 border border-border rounded-lg px-3 py-1.5 text-xs font-mono text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent transition-colors"
              />
              <span className="text-[10px] text-gray-600 shrink-0">.md</span>
            </div>
            {newPrompt.name && (
              <p className="mt-0.5 text-[10px] font-mono text-gray-600">
                → saved as custom file: {sanitized || '…'}.md
              </p>
            )}
            {fileExists && (
              <p className="mt-1 text-[10px] text-amber-400 flex items-center gap-1">
                ⚠ A file with this name already exists — saving will overwrite it.
              </p>
            )}
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">Content (Markdown)</label>
            <textarea
              value={newPrompt.content}
              onChange={e => setNewPromptField('content', e.target.value)}
              placeholder={`# My Agent\n\nYou are...`}
              rows={8}
              className="w-full bg-surface-1 border border-border rounded-lg px-3 py-2 text-xs font-mono text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent transition-colors resize-y"
            />
          </div>
        </div>
      ) : (
        <div>
          {availableFiles.length > 0 ? (
            <select
              value={personalityFile}
              onChange={e => onSelectFile(e.target.value)}
              className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-accent"
            >
              <option value="">— none —</option>
              {systemFiles.length > 0 && (
                <optgroup label="System (all boards)">
                  {systemFiles.map(f => (
                    <option key={f.path} value={f.path}>{displayName(f.path)}</option>
                  ))}
                </optgroup>
              )}
              {customFiles.length > 0 && (
                <optgroup label="Custom (this board)">
                  {customFiles.map(f => (
                    <option key={f.path} value={f.path}>{displayName(f.path)}</option>
                  ))}
                </optgroup>
              )}
            </select>
          ) : (
            <p className="text-[10px] text-gray-600 italic">No instruction files found. Create one above.</p>
          )}
        </div>
      )}
    </div>
  );
}

const BEHAVIOUR_PROMPT_TOOLTIP = `Additional personality and context for this agent — plain text, not markdown.

Example: "You are the Project Manager agent called Alex. You help the client and the team reach the project goal. You have an extroverted personality with an interest for shoes and like comedy shows. You are also very analytical and empathic."`;

export function TemplatePromptField({ form, onChange }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const charCount = (form.system_prompt || '').length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <label className="text-xs font-medium text-gray-400">Behaviour Prompt</label>
        <span className="text-[10px] text-gray-600">· plain text, not markdown</span>
        <div className="relative ml-auto">
          <button
            type="button"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            className="text-gray-600 hover:text-gray-400 transition-colors"
          >
            <Info size={11} />
          </button>
          {showTooltip && (
            <div className="absolute right-0 bottom-full mb-2 z-30 w-72 bg-surface-1 border border-border rounded-xl px-3 py-2.5 text-[10px] text-gray-400 leading-relaxed shadow-xl whitespace-pre-wrap">
              {BEHAVIOUR_PROMPT_TOOLTIP}
            </div>
          )}
        </div>
      </div>
      <textarea
        value={form.system_prompt || ''}
        onChange={e => onChange(e.target.value.slice(0, 1000))}
        maxLength={1000}
        rows={4}
        placeholder="Optional additional personality or context injected before the system prompt file…"
        className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent transition-colors resize-y"
      />
      <p className={`text-right text-[10px] ${charCount > 900 ? 'text-amber-400' : 'text-gray-600'}`}>
        {charCount} / 1000
      </p>
    </div>
  );
}

function RoleCheckbox({ checked, onToggle, color, label, badge }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group">
      <div
        onClick={onToggle}
        className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${
          checked ? 'border-accent bg-accent' : 'border-border bg-surface-1 group-hover:border-accent/50'
        }`}
      >
        {checked && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-xs text-gray-400 group-hover:text-gray-300 flex-1">{label}</span>
      {badge && (
        <span className="text-[9px] font-mono text-gray-600 bg-surface-1 border border-border px-1.5 py-0.5 rounded shrink-0">
          {badge}
        </span>
      )}
    </label>
  );
}

export function RoleField({ selectedRoleIds, onToggle }) {
  const { roles } = useStore();
  const [showCapabilities, setShowCapabilities] = useState(false);

  const columnRoles = roles.filter(r => r.type === 'column_access');
  const permissionRoles = roles.filter(r => r.type === 'permission');

  const allColumnsChecked = selectedRoleIds.includes('role_access_any');

  function handleAllColumnsToggle() {
    onToggle('role_access_any');
  }

  return (
    <div className="space-y-3">
      {/* Column Access */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <label className="text-xs font-medium text-gray-400">Column Access</label>
          <span className="text-[10px] text-gray-600">· which columns this agent can be assigned to</span>
        </div>
        <div className="bg-surface-3 border border-border rounded-lg p-3 space-y-1.5">
          {/* All Columns toggle first */}
          {columnRoles.filter(r => r.id === 'role_access_any').map(role => (
            <RoleCheckbox
              key={role.id}
              checked={selectedRoleIds.includes(role.id)}
              onToggle={() => onToggle(role.id)}
              color={role.color}
              label={role.name}
              badge="all"
            />
          ))}
          {/* Divider */}
          <div className="border-t border-border my-1 opacity-50" />
          {/* Individual column roles — dimmed when All Columns is on */}
          {columnRoles.filter(r => r.id !== 'role_access_any').map(role => (
            <div key={role.id} className={allColumnsChecked ? 'opacity-40 pointer-events-none' : ''}>
              <RoleCheckbox
                checked={selectedRoleIds.includes(role.id)}
                onToggle={() => onToggle(role.id)}
                color={role.color}
                label={role.name}
              />
            </div>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-gray-600">
          Removing a column access role moves assigned tasks in that column to Unassigned.
        </p>
      </div>

      {/* Capabilities (permission roles) */}
      <div>
        <button
          type="button"
          onClick={() => setShowCapabilities(v => !v)}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-300 transition-colors w-full"
        >
          <svg className={`w-3 h-3 transition-transform ${showCapabilities ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 12 12">
            <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Capabilities
          <span className="text-[10px] text-gray-600 font-normal ml-0.5">· what this agent is allowed to do</span>
          {permissionRoles.some(r => selectedRoleIds.includes(r.id)) && (
            <span className="ml-auto text-[10px] font-mono text-accent">
              {permissionRoles.filter(r => selectedRoleIds.includes(r.id)).length} selected
            </span>
          )}
        </button>
        {showCapabilities && (
          <div className="mt-1.5 bg-surface-3 border border-border rounded-lg p-3 space-y-1.5">
            {permissionRoles.map(role => (
              <RoleCheckbox
                key={role.id}
                checked={selectedRoleIds.includes(role.id)}
                onToggle={() => onToggle(role.id)}
                color={role.color}
                label={role.name}
                badge={null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

