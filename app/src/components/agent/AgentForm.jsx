import { useState } from 'react';
import { Info } from 'lucide-react';
import { useStore } from '../../store';
import { DEFAULT_AGENT_MODEL, MODELS, COLORS } from '../../constants/agents';

export { MODELS, COLORS };

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
  const [form, setForm] = useState({
    name: '',
    model: initial.model || defaultAgentModel || DEFAULT_AGENT_MODEL,
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
      <label className="block text-xs font-medium text-gray-400 mb-1.5">Name *</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="QA Engineer"
        className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent transition-colors"
      />
      {roleConflict && (
        <p className="mt-1 text-[10px] text-red-400">An agent with this name already exists.</p>
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
        placeholder="Optional additional personality or context for this agent…"
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

  const columnRoles = roles.filter(r => r.type === 'column_access');
  const permissionRoles = roles.filter(r => r.type === 'permission');

  const allColumnsChecked = selectedRoleIds.includes('role_access_any');
  const hasColumn = selectedRoleIds.some(r => typeof r === 'string' && r.startsWith('role_access_'));
  const capabilityCount = permissionRoles.filter(r => selectedRoleIds.includes(r.id)).length;

  return (
    <div className="space-y-3">
      {/* Column Access */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <label className="text-xs font-medium text-gray-400">Column Access *</label>
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
        {!hasColumn ? (
          <p className="mt-1 text-[10px] text-red-400">Select at least one column (or All Columns).</p>
        ) : (
          <p className="mt-1 text-[10px] text-gray-600">
            Removing a column access role moves assigned tasks in that column to Unassigned.
          </p>
        )}
      </div>

      {/* Capabilities (permission roles) — always expanded; one is required */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <label className="text-xs font-medium text-gray-400">Capability *</label>
          <span className="text-[10px] text-gray-600">· what this agent does (pick exactly one)</span>
          {capabilityCount > 0 && (
            <span className="ml-auto text-[10px] font-mono text-accent">{capabilityCount} selected</span>
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
          <p className="mt-1 text-[10px] text-red-400">Select one capability.</p>
        )}
        {capabilityCount > 1 && (
          <p className="mt-1 text-[10px] text-red-400">An agent can have only one capability — pick one.</p>
        )}
      </div>
    </div>
  );
}
