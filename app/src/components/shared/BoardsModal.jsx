import { useState, useMemo } from 'react';
import { X, Search, Plus, LayoutGrid, ChevronDown, GitBranch, Settings2, AlertTriangle } from 'lucide-react';
import { useStore } from '../../store';
import BoardRepoSettings from '../settings/BoardRepoSettings';

export default function BoardsModal({ onClose }) {
  const { projects, clients, user, isSuperAdmin, setCurrentProject, createProject, createClient } = useStore();
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState('mine');          // 'all' | 'mine'
  const [clientFilter, setClientFilter] = useState(''); // '' = all | '__none__' | clientId
  const [creatorFilter, setCreatorFilter] = useState(''); // '' = all | userId
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newClientId, setNewClientId] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [addingClient, setAddingClient] = useState(false);
  const [saving, setSaving] = useState(false);

  const active = projects.filter(p => !p.archived_at);
  const activeClients = clients.filter(c => !c.archived_at);

  // Unique creators derived from visible boards (no extra API call needed)
  const creators = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const p of active) {
      if (p.created_by && !seen.has(p.created_by)) {
        seen.add(p.created_by);
        list.push({
          id: p.created_by,
          name: p.created_by_name?.trim() || p.created_by_email || p.created_by,
          picture: p.created_by_picture,
          email: p.created_by_email,
        });
      }
    }
    return list;
  }, [active]);

  // Filtered boards
  const filtered = useMemo(() => {
    let result = active;

    // Scope toggle — "my boards" = personal boards (no client)
    if (scope === 'mine') {
      result = result.filter(p => !p.client_id);
    }

    // Client dropdown
    if (clientFilter === '__none__') {
      result = result.filter(p => !p.client_id);
    } else if (clientFilter) {
      result = result.filter(p => p.client_id === clientFilter);
    }

    // Creator dropdown
    if (creatorFilter) {
      result = result.filter(p => p.created_by === creatorFilter);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.client_name || '').toLowerCase().includes(q) ||
        (p.created_by_name || '').toLowerCase().includes(q)
      );
    }

    return result;
  }, [active, scope, clientFilter, creatorFilter, search, user]);

  // Group filtered boards by client for the grid view
  const grouped = useMemo(() => {
    const withClient = filtered.filter(p => p.client_id);
    const withoutClient = filtered.filter(p => !p.client_id);
    const byClient = {};
    for (const p of withClient) {
      if (!byClient[p.client_id]) {
        byClient[p.client_id] = {
          client: activeClients.find(c => c.id === p.client_id),
          boards: [],
        };
      }
      byClient[p.client_id].boards.push(p);
    }
    return { byClient: Object.values(byClient), noClient: withoutClient };
  }, [filtered, activeClients]);

  // Whether any secondary filter is active (determines ungrouped vs grouped rendering)
  const hasSecondaryFilter = !!(clientFilter || creatorFilter || search.trim());

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    try {
      let clientId = newClientId;
      if (addingClient && newClientName.trim()) {
        const client = await createClient({ name: newClientName.trim() });
        clientId = client.id;
      }
      const proj = await createProject({ name: newName.trim(), client_id: clientId || null });
      setCurrentProject(proj.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function resetFilters() {
    setClientFilter('');
    setCreatorFilter('');
    setSearch('');
  }

  const hasActiveFilters = !!(clientFilter || creatorFilter || search.trim() || scope === 'all');

  function BoardCard({ p }) {
    const client = activeClients.find(c => c.id === p.client_id);
    const [showRepo, setShowRepo] = useState(false);
    const { projects, loadProjects } = useStore();

    // Repo status
    const repoStatus = !p.client_path ? 'none'
      : p.path_exists ? 'connected'
      : 'missing';

    function handleRepoUpdated(updated) {
      loadProjects();
    }

    return (
      <div className="bg-surface-2 border border-border rounded-xl hover:border-accent/40 transition-all group">
        <div className="flex items-start gap-2.5 p-3">
          <button
            onClick={() => { setCurrentProject(p.id); onClose(); }}
            className="flex-1 flex items-start gap-2.5 text-left min-w-0"
          >
            <span className="text-xl shrink-0">{p.emoji || '📋'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate group-hover:text-white">{p.name}</p>
              {client && (
                <span
                  className="inline-flex items-center gap-1 mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                  style={{ background: (client.color || '#6366f1') + '20', color: client.color || '#6366f1', border: `1px solid ${(client.color || '#6366f1')}40` }}
                >
                  {client.name}
                </span>
              )}
            </div>
          </button>

          {/* Repo status + settings toggle */}
          <div className="flex items-center gap-1 shrink-0">
            {repoStatus === 'connected' && (
              <span title={p.client_path} className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            )}
            {repoStatus === 'missing' && (
              <AlertTriangle size={11} className="text-amber-400" title={`Folder not found: ${p.client_path}`} />
            )}
            {repoStatus === 'none' && (
              <span className="w-1.5 h-1.5 rounded-full bg-gray-700 shrink-0" title="No repository connected" />
            )}
            <button
              onClick={e => { e.stopPropagation(); setShowRepo(v => !v); }}
              className={`p-1 rounded transition-colors ${showRepo ? 'text-accent' : 'text-gray-600 hover:text-gray-400'}`}
              title="Repository settings"
            >
              <GitBranch size={12} />
            </button>
          </div>
        </div>

        {/* Creator row */}
        {(p.created_by_name || p.created_by_email) && (
          <div className="flex items-center gap-1.5 px-3 pb-2.5">
            {p.created_by_picture ? (
              <img src={p.created_by_picture} className="w-4 h-4 rounded-full shrink-0" alt="" />
            ) : (
              <div className="w-4 h-4 rounded-full bg-accent/20 flex items-center justify-center text-[8px] font-bold text-accent shrink-0">
                {(p.created_by_name?.[0] || p.created_by_email?.[0] || '?').toUpperCase()}
              </div>
            )}
            <span className="text-[10px] text-gray-500 truncate">{p.created_by_name?.trim() || p.created_by_email}</span>
          </div>
        )}

        {/* Inline repo settings panel */}
        {showRepo && (
          <div className="px-3 pb-3">
            <BoardRepoSettings
              project={p}
              onClose={() => setShowRepo(false)}
              onUpdated={handleRepoUpdated}
            />
          </div>
        )}
      </div>
    );
  }

  function Section({ title, boards, color }) {
    if (boards.length === 0) return null;
    return (
      <div>
        {title && (
          <div className="flex items-center gap-2 mb-2">
            {color && <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{title}</p>
            <span className="text-xs text-gray-600">{boards.length}</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {boards.map(p => <BoardCard key={p.id} p={p} />)}
        </div>
      </div>
    );
  }

  // Dropdown component
  function FilterDropdown({ value, onChange, placeholder, options }) {
    return (
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`appearance-none bg-surface-2 border rounded-lg pl-3 pr-7 py-1.5 text-xs outline-none transition-colors cursor-pointer ${
            value
              ? 'border-accent/50 text-gray-200 bg-accent/5'
              : 'border-border text-gray-500 hover:border-gray-500 hover:text-gray-300'
          }`}
        >
          <option value="">{placeholder}</option>
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
      </div>
    );
  }

  const clientOptions = [
    ...activeClients.map(c => ({ value: c.id, label: c.name })),
  ];

  const creatorOptions = creators.map(c => ({
    value: c.id,
    label: c.id === user?.id ? `${c.name} (me)` : c.name,
  }));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" data-modal-backdrop="static">
      <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center gap-3 shrink-0">
          <LayoutGrid size={16} className="text-accent" />
          <h2 className="text-sm font-semibold text-gray-200 flex-1">Boards</h2>
          <button
            onClick={() => setCreating(c => !c)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/10 hover:bg-accent/20 text-accent text-xs font-medium rounded-lg transition-colors"
          >
            <Plus size={13} />
            New board
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-surface-3">
            <X size={14} />
          </button>
        </div>

        {/* New board form (collapsible) */}
        {creating && (
          <form onSubmit={handleCreate} className="px-5 py-3 border-b border-border bg-surface-2 shrink-0 space-y-2">
            <p className="text-xs font-medium text-gray-400">New board</p>
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Board name"
                autoFocus
                className="flex-1 bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50"
              />
              {!addingClient ? (
                <select
                  value={newClientId}
                  onChange={e => {
                    if (e.target.value === '__new__') { setAddingClient(true); setNewClientId(''); }
                    else setNewClientId(e.target.value);
                  }}
                  className="bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-accent/50"
                >
                  <option value="">No client</option>
                  {activeClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value="__new__">+ New client…</option>
                </select>
              ) : (
                <div className="flex gap-1.5">
                  <input
                    value={newClientName}
                    onChange={e => setNewClientName(e.target.value)}
                    placeholder="New client name"
                    className="bg-surface-3 border border-accent/40 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50"
                  />
                  <button type="button" onClick={() => { setAddingClient(false); setNewClientName(''); }}
                    className="px-2 py-2 text-gray-500 hover:text-gray-300">
                    <X size={13} />
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setCreating(false); setNewName(''); setNewClientId(''); setAddingClient(false); setNewClientName(''); }}
                className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving || !newName.trim()}
                className="px-3 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent/80 rounded-lg disabled:opacity-40">
                {saving ? 'Creating…' : 'Create board'}
              </button>
            </div>
          </form>
        )}

        {/* Search + filters */}
        <div className="px-5 py-3 border-b border-border shrink-0 space-y-2.5">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search boards, clients, creators…"
              className="w-full bg-surface-2 border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50"
            />
          </div>

          {/* Scope toggle + dropdowns row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* All / My boards toggle */}
            <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
              <button
                onClick={() => { setScope('mine'); setClientFilter(''); }}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  scope === 'mine'
                    ? 'bg-accent text-white'
                    : 'text-gray-500 hover:text-gray-300 bg-surface-2'
                }`}
              >
                My boards
              </button>
              <button
                onClick={() => setScope('all')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-border ${
                  scope === 'all'
                    ? 'bg-accent text-white'
                    : 'text-gray-500 hover:text-gray-300 bg-surface-2'
                }`}
              >
                All boards
              </button>
            </div>

            {/* Client dropdown — only in All boards tab */}
            {scope === 'all' && (
              <FilterDropdown
                value={clientFilter}
                onChange={setClientFilter}
                placeholder="All clients"
                options={clientOptions}
              />
            )}

            {/* Creator dropdown — only show when there are multiple creators or user is superadmin */}
            {(isSuperAdmin || creators.length > 1) && (
              <FilterDropdown
                value={creatorFilter}
                onChange={setCreatorFilter}
                placeholder="All creators"
                options={creatorOptions}
              />
            )}

            {/* Clear secondary filters */}
            {(clientFilter || creatorFilter || search.trim()) && (
              <button
                onClick={resetFilters}
                className="ml-auto text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Board list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {filtered.length === 0 && (
            <p className="text-sm text-gray-600 text-center py-8">No boards found</p>
          )}

          {/* Ungrouped when secondary filter / search active */}
          {hasSecondaryFilter ? (
            <Section boards={filtered} />
          ) : (
            <>
              {grouped.byClient.map(({ client, boards }) => (
                <Section
                  key={client?.id || 'no-client'}
                  title={client?.name}
                  boards={boards}
                  color={client?.color}
                />
              ))}
              {grouped.noClient.length > 0 && (
                <Section
                  title={scope === 'all' && grouped.byClient.length > 0 ? 'No client' : undefined}
                  boards={grouped.noClient}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
