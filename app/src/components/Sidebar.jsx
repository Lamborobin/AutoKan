import { useState, useRef, useEffect } from 'react';
import { Bot, Plus, Settings, ChevronDown, ChevronRight, AlertCircle, FileText, X, Cpu, Pencil, LayoutTemplate, Home, Archive, LogOut, Check, FolderOpen, Briefcase, Layers, Bell, Globe, User, Sun, Moon, Monitor, UserPlus, Users, LayoutGrid } from 'lucide-react';
import brandImg from '../assets/images/brand.png';
import ArchivedTasksModal from './shared/ArchivedTasksModal';
import InviteModal from './shared/InviteModal';
import MembersModal from './shared/MembersModal';
import BoardsModal from './shared/BoardsModal';
import { useDraggable } from '@dnd-kit/core';
import { useStore } from '../store';
import { COLUMN } from '../constants/columns';

function AgentPanel({ agent, onClose, onEdit }) {
  const { roles } = useStore();
  const instructionFiles = agent.instruction_files || [];
  const agentRoles = (agent.role_ids || [])
    .map(id => roles.find(r => r.id === id))
    .filter(Boolean);

  return (
    <div className="mt-1 mb-2 mx-1 bg-surface-3 border border-border rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
            style={{ background: agent.color }}>
            {agent.name[0]}
          </div>
          <span className="text-xs font-semibold text-gray-200">{agent.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onEdit} className="text-gray-600 hover:text-accent transition-colors p-1 rounded" title="Edit agent">
            <Pencil size={11} />
          </button>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-400 transition-colors p-1 rounded">
            <X size={12} />
          </button>
        </div>
      </div>

      {agent.is_template && (
        <span className="self-start text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/25 uppercase tracking-wide">
          Template
        </span>
      )}

      {agent.description && (
        <p className="text-[11px] text-gray-500 leading-relaxed">{agent.description}</p>
      )}

      <div className="flex items-center gap-1.5">
        <Cpu size={10} className="text-gray-600 shrink-0" />
        <span className="text-[10px] font-mono text-gray-600">{agent.model}</span>
      </div>

      {agentRoles.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {agentRoles.map(role => (
            <span key={role.id} className="text-[9px] font-medium px-1.5 py-0.5 rounded-full border"
              style={{ color: role.color, borderColor: role.color + '40', background: role.color + '18' }}>
              {role.name}
            </span>
          ))}
        </div>
      )}

      {agent.prompt_file && (
        <div>
          <p className="text-[10px] font-medium text-gray-500 mb-1.5">System Prompt</p>
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-accent/10 border border-accent/20 rounded-lg">
            <FileText size={10} className="text-accent shrink-0" />
            <span className="text-[10px] font-mono text-accent truncate">
              {agent.prompt_file.replace(/^instructions\//, '').replace(/\.md$/, '')}
            </span>
          </div>
        </div>
      )}

      {instructionFiles.length > 0 && (
        <div>
          <p className="text-[10px] font-medium text-gray-500 mb-1.5">Context Files</p>
          <div className="space-y-1">
            {instructionFiles.map(f => (
              <div key={f} className="flex items-center gap-1.5 px-2 py-1.5 bg-surface-1 border border-border rounded-lg">
                <FileText size={10} className="text-gray-600 shrink-0" />
                <span className="text-[10px] font-mono text-gray-500 truncate">
                  {f.replace(/^instructions\//, '').replace(/\.md$/, '')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[10px] font-medium text-gray-500 mb-1.5">Always loaded (global)</p>
        <div className="space-y-1">
          {['CLAUDE.md', 'README.md'].map(f => (
            <div key={f} className="flex items-center gap-1.5 px-2 py-1.5 bg-surface-1 border border-border rounded-lg opacity-50">
              <FileText size={10} className="text-gray-600 shrink-0" />
              <span className="text-[10px] font-mono text-gray-600 truncate">{f}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DraggableAgentRow({ agent, isSelected, showTemplateBadge, templateArchived, originTemplate, onToggle }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: agent.id });
  return (
    <div ref={setNodeRef} style={{ opacity: isDragging ? 0.4 : 1 }}>
      <button
        {...attributes}
        {...listeners}
        onClick={() => onToggle(agent.id)}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors text-left ${
          isSelected ? 'bg-surface-3' : 'hover:bg-surface-3'
        }`}
        title="Click to expand · Drag to assign to a task"
      >
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
          style={{ background: agent.color }}>
          {agent.name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-gray-300 truncate">{agent.name}</p>
            {showTemplateBadge && (
              <span
                title={originTemplate ? `From template: ${originTemplate.name}${templateArchived ? ' (archived)' : ''}` : 'Template agent'}
                className={`shrink-0 text-[8px] font-medium px-1 py-px rounded uppercase tracking-wide leading-none ${
                  templateArchived
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                    : 'bg-accent/15 text-accent border border-accent/20'
                }`}>
                T
              </span>
            )}
          </div>
          <p className="text-xs text-gray-600 truncate">{agent.role}</p>
        </div>
      </button>
    </div>
  );
}

function ProjectSwitcher() {
  const { projects, clients, currentProjectId, setCurrentProject, createProject, user } = useStore();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newClientId, setNewClientId] = useState('');
  const [creating, setCreating] = useState(false);
  const [showBoardsModal, setShowBoardsModal] = useState(false);
  const ref = useRef(null);
  const inputRef = useRef(null);

  const current = projects.find(p => p.id === currentProjectId) || projects[0];
  const active = projects.filter(p => !p.archived_at);
  const activeClients = clients.filter(c => !c.archived_at);

  // Group boards by client_id
  const personalBoards = active.filter(p => !p.client_id);
  // Build per-client groups: { clientId -> { client, boards[] } }
  const clientGroups = {};
  for (const p of active.filter(p => !!p.client_id)) {
    if (!clientGroups[p.client_id]) {
      clientGroups[p.client_id] = {
        client: activeClients.find(c => c.id === p.client_id),
        boards: [],
      };
    }
    clientGroups[p.client_id].boards.push(p);
  }
  const clientGroupList = Object.values(clientGroups);

  useEffect(() => {
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setAdding(false); }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    if (adding) setTimeout(() => inputRef.current?.focus(), 50);
  }, [adding]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const proj = await createProject({ name: newName.trim(), client_id: newClientId || null });
      setCurrentProject(proj.id);
      setAdding(false);
      setOpen(false);
      setNewName('');
      setNewClientId('');
    } finally {
      setCreating(false);
    }
  }

  function BoardRow({ p }) {
    return (
      <button
        key={p.id}
        onClick={() => { setCurrentProject(p.id); setOpen(false); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-surface-3 transition-colors"
      >
        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.color || '#6366f1' }} />
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium text-gray-200 truncate">{p.name}</p>
          {p.client_name && <p className="text-[10px] text-gray-600 truncate">{p.client_name}</p>}
        </div>
        {p.id === currentProjectId && <Check size={12} className="text-accent shrink-0" />}
      </button>
    );
  }

  // Label for current board shown in trigger button
  const currentLabel = current?.client_name
    ? `${current.client_name} · ${current.name}`
    : current?.name || 'No board';

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          onClick={() => { setOpen(o => !o); setAdding(false); }}
          className="w-full flex items-center gap-2 px-1 py-1.5 rounded-lg hover:bg-surface-3/50 transition-colors"
        >
          <Layers size={13} className="text-gray-500 shrink-0" />
          <span className="flex-1 text-sm font-bold text-gray-100 truncate text-left">{currentLabel}</span>
          <ChevronDown size={11} className={`text-gray-600 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-surface-2 border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="max-h-64 overflow-y-auto">
              {personalBoards.length > 0 && (
                <>
                  <p className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-600">Personal</p>
                  {personalBoards.map(p => <BoardRow key={p.id} p={p} />)}
                </>
              )}
              {clientGroupList.map(({ client, boards }, idx) => (
                <div key={client?.id || idx}>
                  <p className={`px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-600 ${
                    (personalBoards.length > 0 || idx > 0) ? 'pt-2 border-t border-border/50 mt-1' : 'pt-2.5'
                  }`}>
                    {client?.name || 'Client'}
                  </p>
                  {boards.map(p => <BoardRow key={p.id} p={p} />)}
                </div>
              ))}
              {active.length === 0 && (
                <p className="px-3 py-4 text-sm text-gray-600 text-center">No boards yet</p>
              )}
            </div>

            <div className="border-t border-border">
              {/* Browse all boards */}
              <button
                onClick={() => { setOpen(false); setShowBoardsModal(true); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-600 hover:text-gray-400 hover:bg-surface-3 transition-colors border-b border-border/50"
              >
                <LayoutGrid size={12} />
                Browse all boards
              </button>

              {adding ? (
                <form onSubmit={handleCreate} className="p-2.5 space-y-2">
                  <input
                    ref={inputRef}
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Board name"
                    className="w-full bg-surface-3 border border-border rounded-lg px-2 py-1.5 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50"
                  />
                  <select
                    value={newClientId}
                    onChange={e => setNewClientId(e.target.value)}
                    className="w-full bg-surface-3 border border-border rounded-lg px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-accent/50"
                  >
                    <option value="">No client</option>
                    {activeClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => setAdding(false)}
                      className="flex-1 py-1.5 text-sm text-gray-600 hover:text-gray-400 transition-colors">
                      Cancel
                    </button>
                    <button type="submit" disabled={creating || !newName.trim()}
                      className="flex-1 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent/80 rounded-lg transition-colors disabled:opacity-40">
                      {creating ? '...' : 'Create'}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setAdding(true)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-600 hover:text-gray-400 hover:bg-surface-3 transition-colors"
                >
                  <Plus size={13} />
                  New board
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {showBoardsModal && <BoardsModal onClose={() => setShowBoardsModal(false)} />}
    </>
  );
}

const THEMES = [
  { id: 'dark',   label: 'Dark',   Icon: Moon,    color: 'text-indigo-400',  bg: 'bg-indigo-500/15' },
  { id: 'light',  label: 'Light',  Icon: Sun,     color: 'text-yellow-400',  bg: 'bg-yellow-500/15' },
  { id: 'system', label: 'System', Icon: Monitor, color: 'text-gray-400',    bg: 'bg-gray-500/20'   },
];

function Toggle({ on, onToggle }) {
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      style={{ width: 40, height: 22, flexShrink: 0 }}
      className={`relative rounded-full transition-colors ${on ? 'bg-accent' : 'bg-surface-4 border border-border'}`}
    >
      <span
        style={{ width: 16, height: 16, top: 3, left: on ? 21 : 3 }}
        className="absolute rounded-full bg-white shadow transition-[left]"
      />
    </button>
  );
}

function SectionHeader({ onBack, title, onClose }) {
  return (
    <div className="flex items-center gap-2 px-4 py-4 border-b border-border">
      <button onClick={onBack} className="btn-ghost p-1.5 rounded-lg text-gray-500 hover:text-gray-300">
        <ChevronRight size={14} className="rotate-180" />
      </button>
      <h2 className="text-sm font-semibold text-gray-200">{title}</h2>
      <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg text-gray-500 hover:text-gray-300 ml-auto">
        <X size={14} />
      </button>
    </div>
  );
}

function UserProfileModal({ onClose }) {
  const { user, logout, updateProfile, theme, setTheme } = useStore();
  const [activeSection, setActiveSection] = useState(null);
  const [company, setCompany] = useState(user?.company_name || '');
  const [saving, setSaving] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [language, setLanguage] = useState('English');

  const displayName = user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email : '';

  async function handleSave() {
    setSaving(true);
    try {
      await updateProfile({ company_name: company });
      setActiveSection(null);
    } finally {
      setSaving(false);
    }
  }

  function handleLogout() {
    onClose();
    logout();
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">

        {/* ── Main menu ── */}
        {!activeSection && (
          <>
            <div className="px-5 pt-5 pb-4 border-b border-border flex items-center justify-between">
              <button
                onClick={() => setActiveSection('profile')}
                className="flex items-center gap-3 flex-1 min-w-0 group text-left"
              >
                {user?.picture ? (
                  <img src={user.picture} alt="" className="w-12 h-12 rounded-full ring-2 ring-border shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-lg font-bold text-accent shrink-0">
                    {(user?.first_name?.[0] || user?.email?.[0] || '?').toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-200 truncate group-hover:text-white transition-colors">{displayName}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                  {user?.company_name && <p className="text-xs text-gray-600 truncate">{user.company_name}</p>}
                </div>
              </button>
              <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg text-gray-500 hover:text-gray-300 ml-2 shrink-0">
                <X size={14} />
              </button>
            </div>

            <div className="py-2">
              {/* Account */}
              <div className="px-3 pb-1">
                <p className="px-2 pb-1 text-[10px] uppercase tracking-widest text-gray-600 font-semibold">Account</p>
                <button
                  onClick={() => setActiveSection('profile')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-3 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
                    <User size={15} className="text-accent" />
                  </div>
                  <span className="flex-1 text-sm text-gray-300 text-left group-hover:text-gray-200">Your Profile</span>
                  <ChevronRight size={14} className="text-gray-600" />
                </button>
              </div>

              {/* Preferences */}
              <div className="px-3 pb-1 pt-3">
                <p className="px-2 pb-1 text-[10px] uppercase tracking-widest text-gray-600 font-semibold">Preferences</p>

                <button
                  onClick={() => setActiveSection('notifications')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-3 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-yellow-500/15 flex items-center justify-center shrink-0">
                    <Bell size={15} className="text-yellow-400" />
                  </div>
                  <span className="flex-1 text-sm text-gray-300 text-left group-hover:text-gray-200">Notifications</span>
                  <ChevronRight size={14} className="text-gray-600" />
                </button>

                <button
                  onClick={() => setActiveSection('language')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-3 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
                    <Globe size={15} className="text-blue-400" />
                  </div>
                  <span className="flex-1 text-sm text-gray-300 text-left group-hover:text-gray-200">Language</span>
                  <span className="text-xs text-gray-500 mr-1">{language}</span>
                  <ChevronRight size={14} className="text-gray-600" />
                </button>

                <button
                  onClick={() => setActiveSection('settings')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-3 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-gray-500/20 flex items-center justify-center shrink-0">
                    <Settings size={15} className="text-gray-400" />
                  </div>
                  <span className="flex-1 text-sm text-gray-300 text-left group-hover:text-gray-200">Settings</span>
                  <span className="text-xs text-gray-500 mr-1 capitalize">{theme}</span>
                  <ChevronRight size={14} className="text-gray-600" />
                </button>
              </div>

              {/* Sign out */}
              <div className="px-3 pt-2 pb-3 border-t border-border mt-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-500/10 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0">
                    <LogOut size={15} className="text-red-400" />
                  </div>
                  <span className="flex-1 text-sm text-red-400 text-left">Sign out</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Your Profile ── */}
        {activeSection === 'profile' && (
          <>
            <SectionHeader onBack={() => setActiveSection(null)} title="Your Profile" onClose={onClose} />
            <div className="p-5 space-y-5">
              <div className="flex justify-center">
                {user?.picture ? (
                  <img src={user.picture} alt="" className="w-16 h-16 rounded-full ring-2 ring-border" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-2xl font-bold text-accent">
                    {(user?.first_name?.[0] || user?.email?.[0] || '?').toUpperCase()}
                  </div>
                )}
              </div>
              <div className="space-y-0.5">
                <p className="text-center text-sm font-semibold text-gray-200">{displayName}</p>
                <p className="text-center text-xs text-gray-500">{user?.email}</p>
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">
                  <Briefcase size={11} /> Company
                </label>
                <input
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  placeholder="Enter company name…"
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50 transition-colors"
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                />
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button onClick={() => setActiveSection(null)}
                className="flex-1 py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors rounded-lg border border-border hover:bg-surface-3">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2 text-sm font-medium text-white bg-accent hover:bg-accent/80 rounded-lg transition-colors disabled:opacity-40">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        )}

        {/* ── Language ── */}
        {activeSection === 'language' && (
          <>
            <SectionHeader onBack={() => setActiveSection(null)} title="Language" onClose={onClose} />
            <div className="px-3 py-2">
              <p className="px-2 pb-2 text-[10px] uppercase tracking-widest text-gray-600 font-semibold">Display language</p>
              {['English', 'Swedish', 'German', 'French', 'Spanish'].map(lang => (
                <button
                  key={lang}
                  onClick={() => { setLanguage(lang); setActiveSection(null); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-3 transition-colors"
                >
                  <span className="flex-1 text-sm text-gray-300 text-left">{lang}</span>
                  {language === lang && <Check size={14} className="text-accent" />}
                </button>
              ))}
              <p className="px-3 pt-3 pb-1 text-xs text-gray-600">Full translation support coming soon.</p>
            </div>
          </>
        )}

        {/* ── Notifications ── */}
        {activeSection === 'notifications' && (
          <>
            <SectionHeader onBack={() => setActiveSection(null)} title="Notifications" onClose={onClose} />
            <div className="px-3 py-2">
              <p className="px-2 pb-2 text-[10px] uppercase tracking-widest text-gray-600 font-semibold">Alerts</p>
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-3 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-yellow-500/15 flex items-center justify-center shrink-0">
                  <Bell size={15} className="text-yellow-400" />
                </div>
                <span className="flex-1 text-sm text-gray-300">Enable notifications</span>
                <Toggle on={notifications} onToggle={() => setNotifications(n => !n)} />
              </div>
            </div>
          </>
        )}

        {/* ── Settings ── */}
        {activeSection === 'settings' && (
          <>
            <SectionHeader onBack={() => setActiveSection(null)} title="Settings" onClose={onClose} />
            <div className="px-3 py-2">
              <p className="px-2 pb-2 text-[10px] uppercase tracking-widest text-gray-600 font-semibold">Appearance</p>
              {THEMES.map(({ id, label, Icon, color, bg }) => (
                <button
                  key={id}
                  onClick={() => setTheme(id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-3 transition-colors"
                >
                  <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                    <Icon size={15} className={color} />
                  </div>
                  <span className="flex-1 text-sm text-gray-300 text-left">{label}</span>
                  {(theme === id || (id === 'system' && !['dark','light'].includes(theme))) && (
                    <Check size={14} className="text-accent" />
                  )}
                </button>
              ))}
            </div>
          </>
        )}

      </div>
    </div>
  );
}

function UserMenu() {
  const { user } = useStore();
  const [showModal, setShowModal] = useState(false);

  const displayName = user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email : '';

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-surface-3 transition-colors"
        title={displayName}
      >
        {user?.picture ? (
          <img src={user.picture} alt="" className="w-7 h-7 rounded-full shrink-0 ring-1 ring-border" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-xs font-bold text-accent shrink-0">
            {(user?.first_name?.[0] || user?.email?.[0] || '?').toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium text-gray-300 truncate">{displayName || user?.email}</p>
          {user?.company_name && (
            <p className="text-xs text-gray-500 truncate">{user.company_name}</p>
          )}
        </div>
      </button>

      {showModal && <UserProfileModal onClose={() => setShowModal(false)} />}
    </>
  );
}

const NAV_ITEMS = [ // kept for reference; no longer rendered as dropdown
  { label: 'Board', icon: Home, page: 'board' },
  { label: 'Settings', icon: Settings, page: 'settings' },
];

export default function Sidebar() {
  const { agents, tasks, archivedTasks, agentTemplates, setShowNewAgent, setShowNewTask, setShowTemplates, setEditingAgent, currentPage, setCurrentPage, boardMembers, user } = useStore();
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [showArchivedModal, setShowArchivedModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const humanActionCount = tasks.filter(t => t.column_id === COLUMN.HUMAN_ACTION).length;

  function toggleAgent(agentId) {
    setSelectedAgentId(prev => prev === agentId ? null : agentId);
  }

  return (
    <>
      <aside className="w-64 bg-surface-1 border-r border-border flex flex-col shrink-0">
        {/* Header — brand + nav */}
        <div className="px-4 pt-4 pb-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between">
            <img src={brandImg} alt="AutoKan" className="h-6 w-auto object-contain" />
            <button
              onClick={() => setCurrentPage('settings')}
              className={`p-2 rounded-lg transition-colors ${currentPage === 'settings' ? 'bg-surface-3 text-gray-300' : 'text-gray-500 hover:text-gray-300 hover:bg-surface-3'}`}
              title="Settings"
            >
              <Settings size={18} />
            </button>
          </div>
          <ProjectSwitcher />
        </div>

        {/* Actions */}
        <nav className="p-3 space-y-1 border-b border-border">
          <button
            onClick={() => setShowNewTask(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors"
          >
            <Plus size={15} />
            New Task
          </button>

          {archivedTasks.length > 0 && (
            <button
              onClick={() => setShowArchivedModal(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-surface-3 text-sm transition-colors"
            >
              <Archive size={13} />
              Archived tasks
              <span className="ml-auto font-mono text-xs">{archivedTasks.length}</span>
            </button>
          )}

          {humanActionCount > 0 && (
            <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-amber-400 hover:bg-surface-3 text-sm transition-colors">
              <AlertCircle size={15} />
              Human Action
              <span className="ml-auto bg-amber-500/20 text-amber-400 text-xs px-1.5 py-0.5 rounded-full font-mono">
                {humanActionCount}
              </span>
            </button>
          )}
        </nav>

        {/* Agents */}
        <div className="flex-1 overflow-y-auto p-3">
          <button
            onClick={() => setAgentsOpen(o => !o)}
            className="w-full flex items-center justify-between px-1 py-1 mb-1.5 text-xs font-semibold text-gray-500 hover:text-gray-300 transition-colors uppercase tracking-widest"
          >
            <span className="flex items-center gap-1.5">
              <Bot size={12} />
              Agents
            </span>
            {agentsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>

          {agentsOpen && (
            <div className="space-y-0.5">
              {agents.filter(a => a.active).map(agent => {
                const isSelected = selectedAgentId === agent.id;
                const originTemplate = agent.created_from_template_id
                  ? agentTemplates.find(t => t.id === agent.created_from_template_id)
                  : null;
                const templateArchived = originTemplate?.archived_at;
                const showTemplateBadge = agent.is_template || !!agent.created_from_template_id;
                return (
                  <div key={agent.id}>
                    <DraggableAgentRow
                      agent={agent}
                      isSelected={isSelected}
                      showTemplateBadge={showTemplateBadge}
                      templateArchived={templateArchived}
                      originTemplate={originTemplate}
                      onToggle={toggleAgent}
                    />
                    {isSelected && (
                      <AgentPanel
                        agent={agent}
                        onClose={() => setSelectedAgentId(null)}
                        onEdit={() => { setSelectedAgentId(null); setEditingAgent(agent); }}
                      />
                    )}
                  </div>
                );
              })}

              <button onClick={() => setShowNewAgent(true)}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-surface-3 transition-colors text-sm">
                <Plus size={13} />
                Add agent
              </button>
              <button onClick={() => setShowTemplates(true)}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-surface-3 transition-colors text-sm">
                <LayoutTemplate size={13} />
                Templates
                {agentTemplates.filter(t => !t.archived_at).length > 0 && (
                  <span className="ml-auto text-xs font-mono text-gray-600">
                    {agentTemplates.filter(t => !t.archived_at).length}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Members */}
          <div className="mt-3 pt-3 border-t border-border/50">
            <button
              onClick={() => setMembersOpen(o => !o)}
              className="w-full flex items-center justify-between px-1 py-1 mb-1.5 text-xs font-semibold text-gray-500 hover:text-gray-300 transition-colors uppercase tracking-widest"
            >
              <span className="flex items-center gap-1.5">
                <Users size={12} />
                Members
              </span>
              {membersOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>

            {membersOpen && (
              <div className="space-y-0.5">
                {boardMembers.slice(0, 5).map(member => {
                  const name = (member.first_name || member.last_name)
                    ? `${member.first_name || ''} ${member.last_name || ''}`.trim()
                    : null;
                  const isSelf = member.email === user?.email;
                  // Generate color from email hash
                  let hash = 0;
                  for (let i = 0; i < member.email.length; i++) hash = member.email.charCodeAt(i) + ((hash << 5) - hash);
                  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6'];
                  const avatarColor = colors[Math.abs(hash) % colors.length];
                  return (
                    <div key={member.id} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg">
                      {member.picture ? (
                        <img src={member.picture} alt="" className="w-6 h-6 rounded-full ring-1 ring-border shrink-0" />
                      ) : (
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 ring-1 ring-border"
                          style={{ background: avatarColor }}>
                          {(name?.[0] || member.email[0]).toUpperCase()}
                        </div>
                      )}
                      <p className="text-sm text-gray-400 truncate flex-1">{name || member.email}</p>
                      {isSelf && <span className="text-[8px] text-accent shrink-0">you</span>}
                    </div>
                  );
                })}
                {boardMembers.length > 5 && (
                  <p className="text-xs text-gray-600 px-2.5 py-1">+{boardMembers.length - 5} more</p>
                )}
                <button
                  onClick={() => setShowMembersModal(true)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-surface-3 transition-colors text-sm"
                >
                  <UserPlus size={13} />
                  Manage members
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer — members + user menu */}
        <div className="p-3 border-t border-border space-y-1">
          <button
            onClick={() => setShowMembersModal(true)}
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-surface-3 transition-colors text-gray-500 hover:text-gray-300"
            title="Manage board members"
          >
            <Users size={15} />
            <span className="text-xs font-medium">Members & Teams</span>
          </button>
          <UserMenu />
        </div>
      </aside>

      {showArchivedModal && <ArchivedTasksModal onClose={() => setShowArchivedModal(false)} />}
      {showInviteModal && <InviteModal onClose={() => setShowInviteModal(false)} />}
      {showMembersModal && <MembersModal onClose={() => setShowMembersModal(false)} />}
    </>
  );
}
