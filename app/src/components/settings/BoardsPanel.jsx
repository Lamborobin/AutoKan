import { useState, useMemo } from 'react';
import {
  Plus, Trash2, Archive, RotateCcw, Pencil, X, ChevronRight,
} from 'lucide-react';
import SettingsTable from './SettingsTable';

export default function BoardsPanel({
  projects, clients, sectors, currentProjectId,
  createProject, updateProject, archiveProject, unarchiveProject, deleteProject,
  onSwitchBoard,
}) {
  // Sector display metadata, sourced from the sector registry.
  // Unlisted / null sectors fall back gracefully.
  const SECTOR_META = useMemo(
    () => Object.fromEntries((sectors || []).map(s => [s.id, { label: s.label, color: s.color }])),
    [sectors],
  );

  // ── Create form ────────────────────────────────────────────────────────
  const [showCreate, setShowCreate]   = useState(false);
  const [newName, setNewName]         = useState('');
  const [newClientId, setNewClientId] = useState('');
  const [newSector, setNewSector]     = useState('personal');
  const [creating, setCreating]       = useState(false);
  const [createError, setCreateError] = useState('');

  // ── Archived toggle ────────────────────────────────────────────────────
  const [showArchived, setShowArchived] = useState(false);

  // ── Row actions ────────────────────────────────────────────────────────
  const [renamingId, setRenamingId]         = useState(null);
  const [renameValue, setRenameValue]       = useState('');
  const [confirmArchive, setConfirmArchive] = useState(null);
  const [confirmDelete, setConfirmDelete]   = useState(null);
  const [confirmSwitch, setConfirmSwitch]   = useState(null);
  const [actionError, setActionError]       = useState('');

  const activeClients  = (clients || []).filter(c => !c.archived_at);
  const archivedCount  = projects.filter(p => !!p.archived_at).length;
  const rows           = projects.filter(p => showArchived || !p.archived_at);

  // Build filter options from data so they stay in sync with what's actually present
  const clientFilterOpts = useMemo(() =>
    activeClients.map(c => ({ value: c.id, label: c.name })),
  [activeClients]);

  const sectorFilterOpts = useMemo(() => {
    const seen = [...new Set(projects.map(p => p.sector).filter(Boolean))];
    return seen.map(s => ({ value: s, label: SECTOR_META[s]?.label ?? s }));
  }, [projects]);

  // ── Handlers ───────────────────────────────────────────────────────────
  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true); setCreateError('');
    try {
      await createProject({
        name: newName.trim(),
        emoji: '📋',
        // Sector is locked at creation. With a client linked, it's inherited from the
        // client and the picker's value is ignored server-side; only send it when there's
        // no client, so a client-less board can pick a sector other than 'personal'.
        ...(newClientId ? { client_id: newClientId } : { sector: newSector }),
      });
      setNewName(''); setNewClientId(''); setNewSector('personal'); setShowCreate(false);
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Failed to create board');
    } finally { setCreating(false); }
  }

  async function handleRename(project) {
    if (!renameValue.trim() || renameValue.trim() === project.name) {
      setRenamingId(null); return;
    }
    try { await updateProject(project.id, { name: renameValue.trim() }); }
    catch (err) { alert(err.response?.data?.error || 'Failed to rename board'); }
    finally { setRenamingId(null); }
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
      setActionError(err.response?.data?.has_dependencies ? `${msg} — archive it instead to preserve tasks.` : msg);
    }
  }

  // ── Column definitions ────────────────────────────────────────────────
  const columns = [
    {
      key: 'name',
      label: 'Board',
      sortable: true,
      render: (p) => {
        const isCurrent = p.id === currentProjectId;
        return (
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-base"
              style={{
                background: (p.color || '#6366f1') + '20',
                border: `1px solid ${(p.color || '#6366f1')}30`,
              }}
            >
              {p.emoji || '📋'}
            </div>
            <div className="min-w-0">
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
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-sm font-medium truncate ${p.archived_at ? 'text-gray-500' : 'text-gray-200'}`}>
                    {p.name}
                  </span>
                  {isCurrent && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent/20 text-accent border border-accent/30 uppercase tracking-wide shrink-0">
                      current
                    </span>
                  )}
                  {p.archived_at && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-surface-3 text-gray-600 border border-border uppercase tracking-wide shrink-0">
                      archived
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'client_name',
      label: 'Client',
      sortable: true,
      render: (p) => p.client_name
        ? <span className="text-sm text-gray-400 truncate block">{p.client_name}</span>
        : <span className="text-sm text-gray-600">—</span>,
    },
    {
      key: 'sector',
      label: 'Sector',
      width: '130px',
      render: (p) => {
        if (!p.sector) return <span className="text-sm text-gray-600">—</span>;
        const meta = SECTOR_META[p.sector] ?? { label: p.sector, color: '#6b7280' };
        return (
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
            style={{
              background: meta.color + '18',
              color: meta.color,
              border: `1px solid ${meta.color}30`,
            }}
          >
            {meta.label}
          </span>
        );
      },
    },
    {
      key: 'client_path',
      label: 'Connection',
      width: '110px',
      render: (p) => {
        if (!p.client_path) return <span className="text-sm text-gray-600">—</span>;
        return (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
            p.path_exists
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
          }`}>
            {p.path_exists ? 'connected' : 'missing'}
          </span>
        );
      },
    },
  ];

  // ── Per-row actions ───────────────────────────────────────────────────
  function rowActions(p) {
    const isCurrent = p.id === currentProjectId;

    if (p.archived_at) {
      return (
        <>
          <button
            onClick={() => handleUnarchive(p.id)}
            title="Restore board"
            className="p-1.5 rounded-lg text-accent hover:text-accent/80 hover:bg-accent/10 transition-colors"
          >
            <RotateCcw size={12} />
          </button>
          {confirmDelete === p.id ? (
            <span className="flex items-center gap-1">
              <span className="text-xs text-red-400">Delete?</span>
              <button onClick={() => handleDelete(p.id)} className="px-1.5 py-0.5 text-xs font-medium text-red-400 hover:bg-red-500/10 rounded-md transition-colors">Yes</button>
              <button onClick={() => setConfirmDelete(null)} className="px-1.5 py-0.5 text-xs text-gray-400 hover:text-gray-200 rounded-md transition-colors">No</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(p.id)} title="Delete permanently" className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors">
              <Trash2 size={12} />
            </button>
          )}
        </>
      );
    }

    return (
      <>
        {!isCurrent && (
          <button
            onClick={() => setConfirmSwitch(p.id)}
            title="Switch to this board"
            className="p-1.5 rounded-lg text-gray-400 hover:text-accent hover:bg-accent/10 transition-colors"
          >
            <ChevronRight size={12} />
          </button>
        )}
        <button
          onClick={() => { setRenamingId(p.id); setRenameValue(p.name); }}
          title="Rename"
          className="p-1.5 rounded-lg text-accent hover:text-accent/80 hover:bg-surface-3 transition-colors"
        >
          <Pencil size={12} />
        </button>
        {confirmArchive === p.id ? (
          <span className="flex items-center gap-1">
            <span className="text-xs text-amber-400">Archive?</span>
            <button onClick={() => handleArchive(p.id)} className="px-1.5 py-0.5 text-xs font-medium text-amber-400 hover:bg-amber-500/10 rounded-md transition-colors">Yes</button>
            <button onClick={() => setConfirmArchive(null)} className="px-1.5 py-0.5 text-xs text-gray-400 hover:text-gray-200 rounded-md transition-colors">No</button>
          </span>
        ) : (
          <button onClick={() => setConfirmArchive(p.id)} title="Archive" className="p-1.5 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors">
            <Archive size={12} />
          </button>
        )}
        {confirmDelete === p.id ? (
          <span className="flex items-center gap-1">
            <span className="text-xs text-red-400">Delete?</span>
            <button onClick={() => handleDelete(p.id)} className="px-1.5 py-0.5 text-xs font-medium text-red-400 hover:bg-red-500/10 rounded-md transition-colors">Yes</button>
            <button onClick={() => setConfirmDelete(null)} className="px-1.5 py-0.5 text-xs text-gray-400 hover:text-gray-200 rounded-md transition-colors">No</button>
          </span>
        ) : (
          <button onClick={() => setConfirmDelete(p.id)} title="Delete" className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors">
            <Trash2 size={12} />
          </button>
        )}
      </>
    );
  }

  // Derive the sector preview for the selected client in the create form
  const selectedClientForCreate = activeClients.find(c => c.id === newClientId);
  const createSectorPreview = selectedClientForCreate
    ? (SECTOR_META[selectedClientForCreate.sector] ?? { label: selectedClientForCreate.sector || 'Unknown', color: '#6b7280' })
    : null;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto px-8 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-gray-200">Boards</h2>
          {!showCreate && (
            <button
              onClick={() => { setShowCreate(true); setNewName(''); setNewClientId(''); setNewSector('personal'); setCreateError(''); }}
              className="flex items-center gap-1 text-sm text-accent hover:text-accent/80 transition-colors"
            >
              <Plus size={12} /> New board
            </button>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-6">All boards in this workspace.</p>

        {/* Create form */}
        {showCreate && (
          <form onSubmit={handleCreate} className="border border-border rounded-xl p-3 space-y-2 mb-4 bg-surface-2 max-w-md">
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
                className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-accent/50"
              >
                <option value="">No client</option>
                {activeClients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            {createSectorPreview ? (
              // Client selected — sector is inherited from the client, not settable here.
              <div className="flex items-center gap-2 px-1">
                <span className="text-xs text-gray-600">Sector</span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: createSectorPreview.color + '18', color: createSectorPreview.color, border: `1px solid ${createSectorPreview.color}30` }}
                >
                  {createSectorPreview.label}
                </span>
                <span className="text-xs text-gray-600">inherited from client</span>
              </div>
            ) : (
              // No client — sector is picked directly and locked once the board is created.
              <div className="flex items-center gap-2 px-1">
                <span className="text-xs text-gray-600 shrink-0">Sector</span>
                <select
                  value={newSector}
                  onChange={e => setNewSector(e.target.value)}
                  className="flex-1 bg-surface-3 border border-border rounded-lg px-2 py-1 text-sm text-gray-200 outline-none focus:border-accent/50"
                >
                  {(sectors || []).map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
            )}
            {createError && <p className="text-sm text-red-400">{createError}</p>}
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => { setShowCreate(false); setNewName(''); setNewClientId(''); setNewSector('personal'); setCreateError(''); }}
                className="flex-1 py-1.5 text-sm text-gray-500 hover:text-gray-100 border border-border rounded-lg hover:bg-surface-3 transition-colors"
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

        {/* Table */}
        <SettingsTable
          columns={columns}
          rows={rows}
          rowKey="id"
          searchKeys={['name', 'client_name']}
          searchPlaceholder="Search boards…"
          filters={[
            ...(clientFilterOpts.length > 1
              ? [{ key: 'client_id', label: 'Client', options: clientFilterOpts }]
              : []),
            ...(sectorFilterOpts.length > 1
              ? [{ key: 'sector',    label: 'Sector', options: sectorFilterOpts }]
              : []),
          ]}
          actions={rowActions}
          emptyMessage={showArchived ? 'No boards match your search' : 'No active boards'}
        />

        {/* Archived toggle */}
        {archivedCount > 0 && (
          <button
            onClick={() => setShowArchived(v => !v)}
            className="mt-3 flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            <ChevronRight
              size={10}
              className={`transition-transform ${showArchived ? 'rotate-90' : ''}`}
            />
            {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
          </button>
        )}

        {/* Action error */}
        {actionError && (
          <div className="fixed bottom-5 right-5 z-50 flex items-start gap-2.5 max-w-sm bg-surface-2 border border-red-500/30 rounded-xl px-4 py-3 shadow-xl">
            <p className="text-sm text-red-400 flex-1">{actionError}</p>
            <button onClick={() => setActionError('')} className="text-gray-400 hover:text-gray-200 shrink-0">
              <X size={12} />
            </button>
          </div>
        )}

      {/* Switch board modal */}
      {confirmSwitch && (() => {
        const target = projects.find(p => p.id === confirmSwitch);
        if (!target) return null;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            data-modal-backdrop="static"
          >
            <div className="bg-surface-1 border border-border rounded-xl w-80 shadow-xl p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-lg mt-0.5"
                  style={{ background: (target.color || '#6366f1') + '20', border: `1px solid ${(target.color || '#6366f1')}30` }}
                >
                  {target.emoji || '📋'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-200 truncate">{target.name}</p>
                  {target.client_name && <p className="text-sm text-gray-500 truncate">{target.client_name}</p>}
                  <p className="text-sm text-gray-500 mt-1.5">
                    You'll leave Settings and switch to this board. No unsaved changes will be lost.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setConfirmSwitch(null)}
                  className="flex-1 py-1.5 text-sm text-gray-400 hover:text-gray-200 rounded-lg border border-border hover:bg-surface-3 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setConfirmSwitch(null); onSwitchBoard(target.id); }}
                  className="flex-1 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent/80 rounded-lg transition-colors"
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
