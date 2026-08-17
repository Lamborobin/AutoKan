import { useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { useStore } from '../../store';
import { COLORS } from '../../constants/agents';
import { checkModelStaleness } from '../../utils/modelStaleness';
import InfoModal from '../settings/InfoModal';

export { COLORS };

export function slugify(str) {
  return str.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Does this set of role_ids satisfy the minimum: exactly one capability (perm_*)
// and at least one column (role_access_*, where role_access_any = all columns)?
export function agentRolesValid(roleIds = []) {
  const perms = roleIds.filter(r => typeof r === 'string' && r.startsWith('perm_'));
  const cols  = roleIds.filter(r => typeof r === 'string' && r.startsWith('role_access_'));
  return perms.length === 1 && cols.length >= 1;
}

export function useAgentForm(initial = {}) {
  const defaultAgentModel = useStore(s => s.defaultAgentModel);
  const modelsDefault = useStore(s => s.modelsDefault);
  const [form, setForm] = useState({
    name: '',
    model: initial.model || defaultAgentModel || modelsDefault,
    description: '',
    color: '#6366f1',
    is_template: false,
    system_prompt: '',
    created_from_template_id: null,
    role_ids: ['role_access_any'],
    ...initial,
  });
  const [generatedRole, setGeneratedRole] = useState(initial.role || '');

  function handleNameChange(name) {
    setForm(f => ({ ...f, name }));
    if (!initial.role) setGeneratedRole(slugify(name));
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

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
    handleNameChange, toggleRole,
  };
}

// ── Reusable field components ─────────────────────────────────────────────────

export function NameField({ value, onChange, roleConflict }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-400 mb-1.5">Name *</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="QA Engineer"
        className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent transition-colors"
      />
      {roleConflict && (
        <p className="mt-1 text-xs text-red-400">An agent with this name already exists.</p>
      )}
    </div>
  );
}

export function ModelField({ value, onChange }) {
  const models = useStore(s => s.models);
  const { stale, reason } = checkModelStaleness(value, models);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-400 mb-1.5">Model</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-accent"
      >
        {/* Keep the stale value selectable so saving without touching this field
            doesn't silently switch the agent onto whatever option the browser
            defaults to. */}
        {stale && <option value={value}>{value} (no longer available)</option>}
        {models.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
      {stale && (
        <div className="mt-1.5 flex items-start gap-1.5 px-2 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-md">
          <AlertTriangle size={12} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-400/90 leading-relaxed">
            {value} — {reason.toLowerCase()}. The agent keeps running on the stored model; switch it above if you'd like to update.
          </p>
        </div>
      )}
    </div>
  );
}

export function ColorField({ value, onChange }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-400 mb-2">Color</label>
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

export function TemplatePromptField({ form, onChange }) {
  const [showInfo, setShowInfo] = useState(false);
  const charCount = (form.system_prompt || '').length;
  const maxLength = 1000;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <label className="text-sm font-medium text-gray-400">Behaviour Prompt</label>
        <span className="text-xs text-gray-600">· plain text, not markdown</span>
        <button
          type="button"
          onClick={() => setShowInfo(true)}
          className="ml-auto text-gray-400 hover:text-accent transition-colors"
          aria-label="What is the Behaviour Prompt?"
        >
          <Info size={14} />
        </button>
        <InfoModal openKey={showInfo ? 'agent' : null} onClose={() => setShowInfo(false)} />
      </div>
      <textarea
        value={form.system_prompt || ''}
        onChange={e => onChange(e.target.value.slice(0, maxLength))}
        maxLength={maxLength}
        rows={4}
        placeholder="Optional additional personality or context for this agent…"
        className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent transition-colors resize-y"
      />
      <p className={`text-right text-xs ${charCount > 900 ? 'text-amber-400' : 'text-gray-600'}`}>
        {charCount} / {maxLength}
      </p>
    </div>
  );
}

function RoleCheckbox({ checked, onToggle, color, label, badge }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group">
      <div
        onClick={onToggle}
        className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors shrink-0 ${
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
      <span className="text-sm text-gray-400 group-hover:text-gray-100 flex-1">{label}</span>
      {badge && (
        <span className="text-xs text-gray-600 bg-surface-1 border border-border px-1.5 py-0.5 rounded-md shrink-0">
          {badge}
        </span>
      )}
    </label>
  );
}

export function RoleField({ selectedRoleIds, onToggle }) {
  const { roles, currentProjectId, projects } = useStore();

  const currentProject = projects.find(p => p.id === currentProjectId);
  const hiddenCapabilities = (() => {
    try { return JSON.parse(currentProject?.hidden_capability_ids || '[]'); } catch { return []; }
  })();

  const columnRoles = roles.filter(r => r.type === 'column_access');
  const permissionRoles = roles.filter(r => r.type === 'permission' && !hiddenCapabilities.includes(r.id));

  const allColumnsChecked = selectedRoleIds.includes('role_access_any');
  const hasColumn = selectedRoleIds.some(r => typeof r === 'string' && r.startsWith('role_access_'));
  const capabilityCount = permissionRoles.filter(r => selectedRoleIds.includes(r.id)).length;

  return (
    <div className="space-y-3">
      {/* Column Access */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <label className="text-sm font-medium text-gray-400">Column Access *</label>
          <span className="text-xs text-gray-600">· which columns this agent can be assigned to</span>
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
            <div key={role.id} className={allColumnsChecked ? 'opacity-60 pointer-events-none' : ''}>
              <RoleCheckbox
                checked={selectedRoleIds.includes(role.id)}
                onToggle={() => onToggle(role.id)}
                color={role.color}
                label={role.name}
              />
            </div>
          ))}
        </div>
        {!hasColumn ? (
          <p className="mt-1 text-xs text-red-400">Select at least one column (or All Columns).</p>
        ) : (
          <p className="mt-1 text-xs text-gray-600">
            Removing a column access role moves assigned tasks in that column to Unassigned.
          </p>
        )}
      </div>

      {/* Capabilities (permission roles) — always expanded; one is required */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <label className="text-sm font-medium text-gray-400">Capability *</label>
          <span className="text-xs text-gray-600">· what this agent does (pick exactly one)</span>
          {capabilityCount > 0 && (
            <span className="ml-auto text-xs text-accent">{capabilityCount} selected</span>
          )}
        </div>
        <div className="bg-surface-3 border border-border rounded-lg p-3 space-y-1.5 max-h-64 overflow-y-auto">
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
        {capabilityCount === 0 && (
          <p className="mt-1 text-xs text-red-400">Select one capability.</p>
        )}
        {capabilityCount > 1 && (
          <p className="mt-1 text-xs text-red-400">An agent can have only one capability — pick one.</p>
        )}
      </div>
    </div>
  );
}
