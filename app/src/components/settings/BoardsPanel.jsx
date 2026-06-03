import { useState } from 'react';
import {
  Plus, Trash2, Archive, RotateCcw, ChevronDown, ChevronRight, Pencil, X, Search,
} from 'lucide-react';

export default function BoardsPanel({
  projects, clients, currentProjectId,
  createProject, updateProject, archiveProject, unarchiveProject, deleteProject,
  onSwitchBoard,
}) {
  const [filter, setFilter]           = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const [showCreate, setShowCreate]   = useState(false);
  const [newName, setNewName]         = useState('');
  const [newClientId, setNewClientId] = useState('');
  const [creating, setCreating]       = useState(false);
  const [createError, setCreateError] = useState('');

  const [renamingId, setRenamingId]   = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const [confirmArchive, setConfirmArchive] = useState(null);
  const [confirmDelete, setConfirmDelete]   = useState(null);
  const [confirmSwitch, setConfirmSwitch]   = useState(null); // project id pending switch
  const [actionError, setActionError]       = useState('');

  const activeClients = (clients || []).filter(c => !c.archived_at);

  const q = filter.trim().toLowerCase();
  const active   = projects.filter(p => !p.archived_at && (!q || p.name.toLowerCase().includes(q)));
  const archived = projects.filter(p =>  p.archived_at && (!q || p.name.toLowerCase().includes(q)));

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true); setCreateError('');
    try {
      await createProject({
        name: newName.trim(),
        emoji: '📋',
        ...(newClientId ? { client_id: newClientId } : {}),
      });
      setNewName(''); setNewClientId(''); setShowCreate(false);
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Failed to create board');
    } finally { setCreating(false); }
  }

  async function handleRename(project) {
    if (!renameValue.trim() || renameValue.trim() === project.name) { setRenamingId(null); return; }
    try {
      await updateProject(project.id, { name: renameValue.trim() });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to rename board');
    } finally { setRenamingId(null); }
  }

  async function handleArchive(id) {
    setConfirmArchive(null); setActionError('');
    try { await archiveProject(id); }
    catch (err) { setActionError(err.response?.data?.error || 'Failed to archive board'); }
  }

  async function handleUnarchive(id) {
    setActionError('');
    try { await unarchiveProject(id); }
    catch (err) { setActionError(err.response?.data?.error || 'Failed to restore board'); }
  }

  async function handleDelete(id) {
    setConfirmDelete(null); setActionError('');
    try { await deleteProject(id); }
    catch (err) {
      const msg = err.response?.data?.error || 'Failed to delete board';
      const hasDeps = err.response?.data?.has_dependencies;
      setActionError(hasDeps ? `${msg} — archive it instead to preserve tasks.` : msg);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-8">
      <div className="max-w-lg">

        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-gray-200">Boards</h2>
          {!showCreate && (
            <button
              onClick={() => { setShowCreate(true); setNewName(''); setNewClientId(''); setCreateError(''); }}
              className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
            >
              <Plus size={12} /> New board
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-6">All boards in this workspace.</p>

        {/* Create form */}
        {showCreate && (
          <form onSubmit={handleCreate} className="border border-border rounded-xl p-3 space-y-2 mb-4 bg-surface-2">
            <input
              value={newName}
              onChange={e => { setNewName(e.target.value); setCreateError(''); }}
              onKeyDown={e => e.key === 'Escape' && (setShowCreate(false), setNewName(''))}
              placeholder="Board name…"
              autoFocus
              className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50"
            />
            {activeClients.length > 0 && (
              <select
                value={newClientId}
                onChange={e => setNewClientId(e.target.value)}
                className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-accent/50 appearance-none"
              >
                <option value="">No client (personal board)</option>
                {activeClients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            {createError && <p className="text-xs text-red-400">{createError}</p>}
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => { setShowCreate(false); setNewName(''); setNewClientId(''); setCreateError(''); }}
                className="flex-1 py-1.5 text-sm text-gray-500 hover:text-gray-300 border border-border rounded-lg hover:bg-surface-3 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="flex-1 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent/80 rounded-lg disabled:opacity-40 transition-colors"
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        )}

        {/* Filter */}
        <div className="relative mb-4">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter by name…"
            className="w-full bg-surface-2 border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50"
          />
        </div>

        {/* Active boards */}
        <div className="space-y-1 mb-4">
          {active.length === 0 && !showCreate && (
            <p className="text-sm text-gray-600 text-center py-4">{filter ? 'No matching boards' : 'No active boards'}</p>
          )}
          {active.map(p => {
            const isCurrent = p.id === currentProjectId;
            return (
            <div key={p.id} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl group transition-colors ${
              isCurrent ? 'bg-accent/10 border border-accent/25' : 'bg-surface-2 border border-transparent'
            }`}>

              {/* Icon + name — clickable to switch (non-current boards only) */}
              <button
                className={`flex items-center gap-2.5 flex-1 min-w-0 text-left ${!isCurrent ? 'cursor-pointer' : 'cursor-default'}`}
                onClick={() => !isCurrent && setConfirmSwitch(p.id)}
                tabIndex={isCurrent ? -1 : 0}
                title={!isCurrent ? 'Switch to this board' : undefined}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-base"
                  style={{ background: (p.color || '#6366f1') + '20', border: `1px solid ${(p.color || '#6366f1')}30` }}
                >
                  {p.emoji || '📋'}
                </div>

                <div className="flex-1 min-w-0">
                  {renamingId === p.id ? (
                    <input
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={() => handleRename(p)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); handleRename(p); }
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      autoFocus
                      onClick={e => e.stopPropagation()}
                      className="w-full bg-surface-3 border border-accent/40 rounded-lg px-2 py-0.5 text-sm text-gray-200 outline-none"
                    />
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <p className={`text-sm font-medium truncate transition-colors ${!isCurrent ? 'text-gray-200 group-hover:text-accent' : 'text-accent'}`}>
                        {p.name}
                      </p>
                      {isCurrent && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/20 text-accent border border-accent/30 uppercase tracking-wide shrink-0">current</span>
                      )}
                    </div>
                  )}
                  {p.client_name && <p className="text-xs text-gray-500 truncate">{p.client_name}</p>}
                </div>
              </button>

              {p.client_path && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full border shrink-0 ${
                  p.path_exists
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  {p.path_exists ? 'connected' : 'missing'}
                </span>
              )}

              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">


                <button
                  onClick={() => { setRenamingId(p.id); setRenameValue(p.name); }}
                  className="p-1.5 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-surface-3 transition-colors"
                  title="Rename"
                >
                  <Pencil size={12} />
                </button>

                {confirmArchive === p.id ? (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-amber-400">Archive?</span>
                    <button onClick={() => handleArchive(p.id)} className="px-1.5 py-0.5 text-[10px] font-medium text-amber-400 hover:bg-amber-500/10 rounded transition-colors">Yes</button>
                    <button onClick={() => setConfirmArchive(null)} className="px-1.5 py-0.5 text-[10px] text-gray-600 hover:text-gray-400 rounded transition-colors">No</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmArchive(p.id)}
                    className="p-1.5 rounded-lg text-gray-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                    title="Archive"
                  >
                    <Archive size={12} />
                  </button>
                )}

                {confirmDelete === p.id ? (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-red-400">Delete?</span>
                    <button onClick={() => handleDelete(p.id)} className="px-1.5 py-0.5 text-[10px] font-medium text-red-400 hover:bg-red-500/10 rounded transition-colors">Yes</button>
                    <button onClick={() => setConfirmDelete(null)} className="px-1.5 py-0.5 text-[10px] text-gray-600 hover:text-gray-400 rounded transition-colors">No</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(p.id)}
                    className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
            );
          })}
        </div>

        {/* Archived boards */}
        {archived.length > 0 && (
          <>
            <button
              onClick={() => setShowArchived(v => !v)}
              className="flex items-center gap-1.5 text-[10px] text-gray-600 hover:text-gray-400 transition-colors mb-1"
            >
              {showArchived ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
              Archived ({archived.length})
            </button>
            {showArchived && (
              <div className="space-y-1">
                {archived.map(p => (
                  <div key={p.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-surface-2 group opacity-60 hover:opacity-100 transition-opacity">
                    <span className="text-base shrink-0">{p.emoji || '📋'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-400 truncate">{p.name}</p>
                      {p.client_name && <p className="text-xs text-gray-600 truncate">{p.client_name}</p>}
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => handleUnarchive(p.id)}
                        className="p-1.5 rounded-lg text-gray-600 hover:text-accent hover:bg-accent/10 transition-colors"
                        title="Restore"
                      >
                        <RotateCcw size={12} />
                      </button>
                      {confirmDelete === p.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-red-400">Delete?</span>
                          <button onClick={() => handleDelete(p.id)} className="px-1.5 py-0.5 text-[10px] font-medium text-red-400 hover:bg-red-500/10 rounded transition-colors">Yes</button>
                          <button onClick={() => setConfirmDelete(null)} className="px-1.5 py-0.5 text-[10px] text-gray-600 hover:text-gray-400 rounded transition-colors">No</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(p.id)}
                          className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Action error toast */}
        {actionError && (
          <div className="fixed bottom-5 right-5 z-50 flex items-start gap-2.5 max-w-sm bg-surface-2 border border-red-500/30 rounded-xl px-4 py-3 shadow-xl">
            <p className="text-xs text-red-400 flex-1">{actionError}</p>
            <button onClick={() => setActionError('')} className="text-gray-600 hover:text-gray-400 shrink-0">
              <X size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Switch board modal */}
      {confirmSwitch && (() => {
        const target = projects.find(p => p.id === confirmSwitch);
        if (!target) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" data-modal-backdrop="static">
            <div className="bg-surface-1 border border-border rounded-2xl w-80 shadow-2xl p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-lg mt-0.5"
                  style={{ background: (target.color || '#6366f1') + '20', border: `1px solid ${(target.color || '#6366f1')}30` }}
                >
                  {target.emoji || '📋'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-200 truncate">{target.name}</p>
                  {target.client_name && <p className="text-xs text-gray-500 truncate">{target.client_name}</p>}
                  <p className="text-xs text-gray-500 mt-1.5">You'll leave Settings and switch to this board. No unsaved changes will be lost.</p>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setConfirmSwitch(null)}
                  className="flex-1 py-1.5 text-xs text-gray-400 hover:text-gray-200 rounded-lg border border-border hover:bg-surface-3 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setConfirmSwitch(null); onSwitchBoard(target.id); }}
                  className="flex-1 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent/80 rounded-lg transition-colors"
                >
                  Switch board
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
