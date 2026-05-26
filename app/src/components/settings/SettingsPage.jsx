import { useState, useEffect, useRef } from 'react';
import {
  FileText, Plus, Archive, RotateCcw, Trash2, Save, ChevronDown, ChevronRight,
  X, Check, ArrowLeft, Crown, Shield, UserMinus, Building2, Pencil, GitBranch,
  Github, FolderOpen, Loader2, AlertTriangle, Users, LayoutGrid, UserCheck,
} from 'lucide-react';
import { useStore } from '../../store';
import { instructionsApi, projectsApi } from '../../api'; // instructionsApi used for direct file reads in selectFile/autoSave


// ─── Main component ─────────────────────────────────────────────────────────
export default function SettingsPage() {
  const {
    instructionFiles,
    loadInstructionFiles,
    createInstructionFile,
    archiveInstructionFile,
    unarchiveInstructionFile,
    deleteInstructionFile,
    subscriptionInstructionFiles,
    loadSubscriptionInstructionFiles,
    createSubscriptionInstructionFile,
    updateSubscriptionInstructionFile,
    archiveSubscriptionInstructionFile,
    unarchiveSubscriptionInstructionFile,
    deleteSubscriptionInstructionFile,
    setCurrentPage,
    currentProjectId,
    projects,
    updateProject,
    loadProjects,
    isSuperAdmin,
    subscription,
    subscriptionAdmins,
    addSuperAdmin,
    removeSuperAdmin,
    user,
    clients,
    loadClients,
    createClient,
    updateClient,
    archiveClient,
    teams,
    loadTeams,
  } = useStore();

  const currentProject = projects.find(p => p.id === currentProjectId);

  const [section, setSection]         = useState('files');
  const [connRefreshKey, setConnRefreshKey] = useState(0);

  // ── Superadmin state ────────────────────────────────────────────────────
  const [adminEmail, setAdminEmail]   = useState('');
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [adminError, setAdminError]   = useState('');
  const [adminSuccess, setAdminSuccess] = useState('');

  async function handleAddSuperAdmin(e) {
    e.preventDefault();
    setAddingAdmin(true); setAdminError(''); setAdminSuccess('');
    try {
      await addSuperAdmin(adminEmail.trim().toLowerCase());
      setAdminEmail('');
      setAdminSuccess('Superadmin added');
    } catch (err) {
      setAdminError(err.response?.data?.error || 'Failed to add superadmin');
    } finally { setAddingAdmin(false); }
  }

  async function handleRemoveSuperAdmin(userId) {
    try { await removeSuperAdmin(userId); }
    catch (err) { alert(err.response?.data?.error || 'Failed to remove superadmin'); }
  }

  // ── Clients state ───────────────────────────────────────────────────────
  const [clientName, setClientName]           = useState('');
  const [clientWebsite, setClientWebsite]     = useState('');
  const [addingClient, setAddingClient]       = useState(false);
  const [creatingClient, setCreatingClient]   = useState(false);
  const [editingClientId, setEditingClientId] = useState(null);
  const [editClientName, setEditClientName]   = useState('');
  const [clientError, setClientError]         = useState('');

  // ── Instruction files state ─────────────────────────────────────────────
  const [selectedFile, setSelectedFile] = useState(null);
  const [content, setContent]           = useState('');
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving]             = useState(false);
  const [saveStatus, setSaveStatus]     = useState(null);
  const [dirty, setDirty]               = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [archiveConfirm, setArchiveConfirm] = useState(null);
  const [addingFile, setAddingFile]     = useState(false);
  const [newFileName, setNewFileName]   = useState('');
  const [newFileError, setNewFileError] = useState('');
  const [actionError, setActionError]   = useState(null);
  const saveTimerRef = useRef(null);

  // Refresh project data on mount so path_exists is current
  useEffect(() => { loadProjects().catch(() => {}); }, []);

  // Reload board files when board changes
  useEffect(() => {
    loadInstructionFiles();
    setSelectedFile(null);
  }, [currentProjectId]);

  // Load subscription files + other subscription data when entering subscription section
  useEffect(() => {
    if (section === 'sub_files') {
      loadSubscriptionInstructionFiles().catch(() => {});
      setSelectedFile(null);
    }
    if (section.startsWith('sub_')) {
      loadTeams().catch(() => {});
      loadClients().catch(() => {});
    }
    if (section === 'connections') {
      loadProjects().catch(() => {});
    }
  }, [section]);

  const customActive   = instructionFiles.filter(f => !f.archived);
  const customArchived = instructionFiles.filter(f => f.archived);
  const subFilesActive   = subscriptionInstructionFiles.filter(f => !f.archived);
  const subFilesArchived = subscriptionInstructionFiles.filter(f => f.archived);

  // scope = 'board' | 'subscription'
  function getApiScope(scope) {
    return scope === 'subscription'
      ? { projectId: null, subscriptionId: subscription?.id || null }
      : { projectId: currentProjectId, subscriptionId: subscription?.id || null };
  }

  async function selectFile(file, scope) {
    if (dirty && selectedFile) await saveCurrentContent();
    setSelectedFile({ ...file, scope });
    setContent(''); setDirty(false); setSaveStatus(null); setLoadingContent(true);
    try {
      const { projectId, subscriptionId } = getApiScope(scope);
      const data = await instructionsApi.get(file.name + '.md', projectId, subscriptionId);
      setContent(data.content);
    } catch { setContent(''); }
    finally { setLoadingContent(false); }
  }

  function handleContentChange(v) {
    setContent(v); setDirty(true); setSaveStatus(null);
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => autoSave(v), 1500);
  }

  async function autoSave(val) {
    if (!selectedFile) return;
    setSaving(true);
    try {
      const { projectId, subscriptionId } = getApiScope(selectedFile.scope);
      await instructionsApi.update(selectedFile.name + '.md', val, projectId, subscriptionId);
      setDirty(false); setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch { setSaveStatus('error'); }
    finally { setSaving(false); }
  }

  async function saveCurrentContent() {
    if (!selectedFile || !dirty) return;
    clearTimeout(saveTimerRef.current);
    setSaving(true);
    try {
      const { projectId, subscriptionId } = getApiScope(selectedFile.scope);
      await instructionsApi.update(selectedFile.name + '.md', content, projectId, subscriptionId);
      setDirty(false); setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch { setSaveStatus('error'); }
    finally { setSaving(false); }
  }

  // scope = 'board' | 'subscription'
  async function handleArchive(file, scope = 'board') {
    setArchiveConfirm(null); setActionError(null);
    try {
      if (scope === 'subscription') await archiveSubscriptionInstructionFile(file.name + '.md');
      else await archiveInstructionFile(file.name + '.md');
      if (selectedFile?.name === file.name) setSelectedFile(null);
    } catch (err) { setActionError(err.response?.data?.error || 'Failed to archive'); }
  }

  async function handleDelete(file, scope = 'board') {
    setDeleteConfirm(null); setActionError(null);
    try {
      if (scope === 'subscription') await deleteSubscriptionInstructionFile(file.name + '.md');
      else await deleteInstructionFile(file.name + '.md');
      if (selectedFile?.name === file.name) setSelectedFile(null);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to delete';
      const hasDeps = err.response?.data?.has_dependencies;
      setActionError(hasDeps ? `${msg} — archive it instead to preserve agent references.` : msg);
    }
  }

  async function handleUnarchive(file, scope = 'board') {
    setActionError(null);
    try {
      if (scope === 'subscription') await unarchiveSubscriptionInstructionFile(file.name + '.md');
      else await unarchiveInstructionFile(file.name + '.md');
    }
    catch (err) { setActionError(err.response?.data?.error || 'Failed to restore'); }
  }

  async function handleCreate(e) {
    e?.preventDefault();
    const trimmed = newFileName.trim();
    if (!trimmed) { setNewFileError('Name is required'); return; }
    setNewFileError('');
    try {
      if (section === 'sub_files') {
        const file = await createSubscriptionInstructionFile(trimmed, `# ${trimmed}\n\n`);
        setAddingFile(false); setNewFileName('');
        selectFile(file, 'subscription');
      } else {
        const file = await createInstructionFile(trimmed, `# ${trimmed}\n\n`);
        setAddingFile(false); setNewFileName('');
        selectFile(file, 'board');
      }
    } catch (err) { setNewFileError(err.response?.data?.error || 'Failed to create'); }
  }

  function FileRow({ file, scope, actions }) {
    const isSelected = selectedFile?.name === file.name && selectedFile?.scope === scope;
    return (
      <div
        className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
          isSelected ? 'bg-accent/15 text-accent' : 'text-gray-400 hover:bg-surface-3 hover:text-gray-200'
        }`}
        onClick={() => selectFile(file, scope)}
      >
        <FileText size={11} className="shrink-0" />
        <span className="text-[11px] flex-1 truncate">{file.label || file.name}</span>
        {actions && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
    );
  }

  // ── Nav helpers ─────────────────────────────────────────────────────────
  function navBtn(id, label, Icon, badge) {
    const active = section === id;
    return (
      <button
        key={id}
        onClick={() => setSection(id)}
        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
          active ? 'bg-accent/15 text-accent' : 'text-gray-400 hover:bg-surface-3 hover:text-gray-200'
        }`}
      >
        <Icon size={12} />
        {label}
        {badge}
      </button>
    );
  }

  const connectionDot = !currentProject?.client_path
    ? <span className="ml-auto w-1.5 h-1.5 rounded-full bg-red-400" />
    : !currentProject?.path_exists
    ? <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400" />
    : null;

  return (
    <div className="flex h-screen overflow-hidden bg-surface-0 font-sans">

      {/* ── Left panel ──────────────────────────────────────────────────── */}
      <div className="w-60 shrink-0 flex flex-col border-r border-border bg-surface-1 overflow-y-auto">

        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-border shrink-0">
          <button
            onClick={() => setCurrentPage('board')}
            className="flex items-center gap-1.5 text-[10px] text-gray-600 hover:text-gray-400 transition-colors mb-3"
          >
            <ArrowLeft size={10} /> Back to board
          </button>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Settings</p>
        </div>

        {/* BOARD section */}
        <div className="px-2 pt-3 pb-1 shrink-0">
          <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest px-2.5 mb-1">Board</p>
          <div className="space-y-0.5">
            {navBtn('files', 'Instruction Files', FileText)}
          </div>
        </div>

        {/* File list — only when section === 'files' (board-scoped) */}
        {section === 'files' && (
          <div className="mx-2 mb-1 border border-border rounded-xl bg-surface-0/50 overflow-hidden">
            <div className="px-2 py-2.5 space-y-3 overflow-y-auto max-h-[calc(100vh-240px)]">
              <div>
                {customActive.map(f => (
                  <FileRow key={f.name} file={f} scope="board"
                    actions={
                      <>
                        <button onClick={() => setArchiveConfirm({ file: f, scope: 'board' })} title="Archive"
                          className="p-0.5 text-gray-600 hover:text-amber-400 transition-colors">
                          <Archive size={10} />
                        </button>
                        <button onClick={() => setDeleteConfirm({ file: f, scope: 'board' })} title="Delete"
                          className="p-0.5 text-gray-600 hover:text-red-400 transition-colors">
                          <Trash2 size={10} />
                        </button>
                      </>
                    }
                  />
                ))}

                {addingFile ? (
                  <form onSubmit={handleCreate} className="mt-1.5 px-1">
                    <input
                      autoFocus value={newFileName}
                      onChange={e => { setNewFileName(e.target.value); setNewFileError(''); }}
                      onKeyDown={e => e.key === 'Escape' && (setAddingFile(false), setNewFileName(''))}
                      placeholder="filename"
                      className="w-full bg-surface-3 border border-border rounded-lg px-2 py-1 text-[11px] text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50"
                    />
                    {newFileError && <p className="text-[9px] text-red-400 mt-0.5">{newFileError}</p>}
                    <div className="flex gap-1.5 mt-1.5">
                      <button type="submit" className="flex-1 py-0.5 text-[10px] font-medium text-white bg-accent hover:bg-accent/80 rounded-md transition-colors">
                        Create
                      </button>
                      <button type="button" onClick={() => { setAddingFile(false); setNewFileName(''); }}
                        className="px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-300 rounded-md transition-colors">
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => { setAddingFile(true); setNewFileName(''); setNewFileError(''); }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 w-full text-[11px] text-gray-600 hover:text-gray-400 transition-colors rounded-lg"
                  >
                    <Plus size={11} /> New file
                  </button>
                )}
              </div>

              {/* Archived board files */}
              {customArchived.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowArchived(v => !v)}
                    className="flex items-center gap-1.5 px-1.5 py-1 w-full text-[9px] font-semibold text-gray-600 uppercase tracking-widest hover:text-gray-400 transition-colors"
                  >
                    {showArchived ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
                    Archived ({customArchived.length})
                  </button>
                  {showArchived && customArchived.map(f => (
                    <FileRow key={f.name} file={f} scope="board"
                      actions={
                        <>
                          <button onClick={() => handleUnarchive(f, 'board')} title="Restore"
                            className="p-0.5 text-gray-600 hover:text-accent transition-colors">
                            <RotateCcw size={10} />
                          </button>
                          <button onClick={() => setDeleteConfirm({ file: f, scope: 'board' })} title="Delete permanently"
                            className="p-0.5 text-gray-600 hover:text-red-400 transition-colors">
                            <Trash2 size={10} />
                          </button>
                        </>
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Connections nav item — always visible in BOARD section */}
        <div className="px-2 pb-1 shrink-0">
          <div className="space-y-0.5">
            {navBtn('connections', 'Connections', GitBranch, connectionDot)}
          </div>
        </div>

        {/* SUBSCRIPTION section (superadmin only) */}
        {isSuperAdmin && (
          <div className="px-2 pt-3 pb-1 shrink-0 border-t border-border">
            <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest px-2.5 mb-1">Subscription</p>
            <div className="space-y-0.5">
              {navBtn('sub_files', 'Instruction Files', FileText)}
            </div>
          </div>
        )}

        {/* Subscription file list — directly below the Instruction Files nav item */}
        {section === 'sub_files' && isSuperAdmin && (
          <div className="mx-2 mb-2 border border-border rounded-xl bg-surface-0/50 overflow-hidden">
            <div className="px-2 py-2.5 space-y-3 overflow-y-auto max-h-[calc(100vh-340px)]">
              <div>
                {subFilesActive.map(f => (
                  <FileRow key={f.name} file={f} scope="subscription"
                    actions={
                      <>
                        <button onClick={() => setArchiveConfirm({ file: f, scope: 'subscription' })} title="Archive"
                          className="p-0.5 text-gray-600 hover:text-amber-400 transition-colors">
                          <Archive size={10} />
                        </button>
                        <button onClick={() => setDeleteConfirm({ file: f, scope: 'subscription' })} title="Delete"
                          className="p-0.5 text-gray-600 hover:text-red-400 transition-colors">
                          <Trash2 size={10} />
                        </button>
                      </>
                    }
                  />
                ))}

                {addingFile ? (
                  <form onSubmit={handleCreate} className="mt-1.5 px-1">
                    <input
                      autoFocus value={newFileName}
                      onChange={e => { setNewFileName(e.target.value); setNewFileError(''); }}
                      onKeyDown={e => e.key === 'Escape' && (setAddingFile(false), setNewFileName(''))}
                      placeholder="filename"
                      className="w-full bg-surface-3 border border-border rounded-lg px-2 py-1 text-[11px] text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50"
                    />
                    {newFileError && <p className="text-[9px] text-red-400 mt-0.5">{newFileError}</p>}
                    <div className="flex gap-1.5 mt-1.5">
                      <button type="submit" className="flex-1 py-0.5 text-[10px] font-medium text-white bg-accent hover:bg-accent/80 rounded-md transition-colors">Create</button>
                      <button type="button" onClick={() => { setAddingFile(false); setNewFileName(''); }}
                        className="px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-300 rounded-md transition-colors">Cancel</button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => { setAddingFile(true); setNewFileName(''); setNewFileError(''); }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 w-full text-[11px] text-gray-600 hover:text-gray-400 transition-colors rounded-lg"
                  >
                    <Plus size={11} /> New file
                  </button>
                )}
              </div>

              {/* Archived subscription files */}
              {subFilesArchived.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowArchived(v => !v)}
                    className="flex items-center gap-1.5 px-1.5 py-1 w-full text-[9px] font-semibold text-gray-600 uppercase tracking-widest hover:text-gray-400 transition-colors"
                  >
                    {showArchived ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
                    Archived ({subFilesArchived.length})
                  </button>
                  {showArchived && subFilesArchived.map(f => (
                    <FileRow key={f.name} file={f} scope="subscription"
                      actions={
                        <>
                          <button onClick={() => handleUnarchive(f, 'subscription')} title="Restore"
                            className="p-0.5 text-gray-600 hover:text-accent transition-colors">
                            <RotateCcw size={10} />
                          </button>
                          <button onClick={() => setDeleteConfirm({ file: f, scope: 'subscription' })} title="Delete permanently"
                            className="p-0.5 text-gray-600 hover:text-red-400 transition-colors">
                            <Trash2 size={10} />
                          </button>
                        </>
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Remaining subscription nav items */}
        {isSuperAdmin && (
          <div className="px-2 pb-3 shrink-0">
            <div className="space-y-0.5">
              {navBtn('sub_clients',     'Clients',      Building2)}
              {navBtn('sub_team',        'Team',         Users)}
              {navBtn('sub_boards',      'Boards',       LayoutGrid)}
              {navBtn('sub_members',     'Members',      UserCheck)}
              {navBtn('sub_superadmins', 'Superadmins',  Crown)}
            </div>
          </div>
        )}
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Connections panel */}
        {section === 'connections' && currentProject && (
          <div className="flex-1 overflow-y-auto px-8 py-8">
            <div className="max-w-lg">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2.5">
                  <GitBranch size={15} className="text-accent" />
                  <h2 className="text-sm font-semibold text-gray-200">Connections</h2>
                </div>
                <button
                  onClick={() => { loadProjects(); setConnRefreshKey(k => k + 1); }}
                  title="Refresh connection status"
                  className="p-1.5 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-surface-2 transition-colors"
                >
                  <RotateCcw size={13} />
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-6">
                Link this board to a client folder. The folder can contain anything — a codebase, documents, or any other files relevant to this board's work.
              </p>
              <ConnectionsPanel
                project={currentProject}
                onUpdated={() => loadProjects()}
                updateProject={updateProject}
                refreshKey={connRefreshKey}
              />
            </div>
          </div>
        )}

        {/* Clients panel */}
        {section === 'sub_clients' && isSuperAdmin && (
          <div className="flex-1 overflow-y-auto px-8 py-8">
            <div className="max-w-lg">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-semibold text-gray-200">Clients</h2>
                <button onClick={() => setAddingClient(true)} className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors">
                  <Plus size={12} /> Add client
                </button>
              </div>

              {addingClient && (
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (!clientName.trim()) return;
                  setCreatingClient(true);
                  try {
                    await createClient({ name: clientName.trim(), website: clientWebsite.trim() || null });
                    setClientName(''); setClientWebsite(''); setAddingClient(false); setClientError('');
                  } catch(err) {
                    setClientError(err.response?.data?.error || 'Failed to create client');
                  } finally { setCreatingClient(false); }
                }} className="border border-border rounded-xl p-3 space-y-2 bg-surface-2 mb-4">
                  <input value={clientName} onChange={e => setClientName(e.target.value)}
                    placeholder="Client name" autoFocus
                    className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50" />
                  <input value={clientWebsite} onChange={e => setClientWebsite(e.target.value)}
                    placeholder="Website (optional)"
                    className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50" />
                  {clientError && <p className="text-xs text-red-400">{clientError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setAddingClient(false); setClientName(''); setClientWebsite(''); setClientError(''); }}
                      className="flex-1 py-1.5 text-sm text-gray-500 hover:text-gray-300 border border-border rounded-lg hover:bg-surface-3">Cancel</button>
                    <button type="submit" disabled={creatingClient || !clientName.trim()}
                      className="flex-1 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent/80 rounded-lg disabled:opacity-40">
                      {creatingClient ? 'Creating…' : 'Create'}
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-1">
                {clients.filter(c => !c.archived_at).map(client => (
                  <div key={client.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-surface-2 group">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold"
                      style={{ background: (client.color || '#6366f1') + '20', color: client.color || '#6366f1', border: `1px solid ${(client.color || '#6366f1')}30` }}>
                      {client.name[0].toUpperCase()}
                    </div>
                    {editingClientId === client.id ? (
                      <input value={editClientName} onChange={e => setEditClientName(e.target.value)}
                        onBlur={async () => {
                          if (editClientName.trim() && editClientName !== client.name) {
                            await updateClient(client.id, { name: editClientName.trim() });
                          }
                          setEditingClientId(null);
                        }}
                        onKeyDown={async e => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                          if (e.key === 'Escape') setEditingClientId(null);
                        }}
                        autoFocus
                        className="flex-1 bg-surface-3 border border-accent/40 rounded-lg px-2 py-1 text-sm text-gray-200 outline-none" />
                    ) : (
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-200 truncate">{client.name}</p>
                        {client.website && <p className="text-xs text-gray-500 truncate">{client.website}</p>}
                        <p className="text-xs text-gray-600">{client.board_count} board{client.board_count !== 1 ? 's' : ''}</p>
                      </div>
                    )}
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity shrink-0">
                      <button onClick={() => { setEditingClientId(client.id); setEditClientName(client.name); }}
                        className="p-1.5 rounded text-gray-600 hover:text-gray-300 hover:bg-surface-3 transition-colors" title="Rename">
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => archiveClient(client.id)}
                        className="p-1.5 rounded text-gray-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors" title="Archive">
                        <Archive size={12} />
                      </button>
                    </div>
                  </div>
                ))}
                {clients.filter(c => !c.archived_at).length === 0 && !addingClient && (
                  <p className="text-sm text-gray-600 text-center py-4">No clients yet</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Team panel */}
        {section === 'sub_team' && isSuperAdmin && (
          <div className="flex-1 overflow-y-auto px-8 py-8">
            <div className="max-w-lg">
              <h2 className="text-sm font-semibold text-gray-200 mb-6">Team</h2>
              {teams.length === 0 ? (
                <p className="text-sm text-gray-600">No teams yet.</p>
              ) : (
                <div className="space-y-1">
                  {teams.map(t => (
                    <div key={t.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-surface-2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold bg-accent/15 text-accent border border-accent/20">
                        {t.name[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-200 truncate">{t.name}</p>
                        {t.description && <p className="text-xs text-gray-500 truncate">{t.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Boards panel */}
        {section === 'sub_boards' && isSuperAdmin && (
          <BoardsPanel projects={projects} />
        )}

        {/* Members panel */}
        {section === 'sub_members' && isSuperAdmin && (
          <div className="flex-1 overflow-y-auto px-8 py-8">
            <div className="max-w-lg">
              <h2 className="text-sm font-semibold text-gray-200 mb-6">Members</h2>
              <p className="text-sm text-gray-600">Subscription-level member management coming soon.</p>
            </div>
          </div>
        )}

        {/* Superadmins panel */}
        {section === 'sub_superadmins' && isSuperAdmin && (
          <div className="flex-1 overflow-y-auto px-8 py-8">
            <div className="max-w-lg">
              <h2 className="text-sm font-semibold text-gray-200 mb-1">Superadmins</h2>
              <p className="text-xs text-gray-500 mb-6">
                Superadmins have full access to all boards, teams, and members in this subscription.
              </p>

              <div className="space-y-1 mb-4">
                {subscriptionAdmins.map(admin => {
                  const name = `${admin.first_name || ''} ${admin.last_name || ''}`.trim() || admin.email;
                  const isSelf = admin.user_id === user?.id;
                  return (
                    <div key={admin.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-surface-2 group">
                      {admin.picture ? (
                        <img src={admin.picture} className="w-7 h-7 rounded-full ring-1 ring-border shrink-0" alt="" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-xs font-bold text-accent shrink-0">
                          {(admin.first_name?.[0] || admin.email[0]).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-gray-200 truncate">{name}</p>
                          {isSelf && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/25 uppercase tracking-wide shrink-0">You</span>
                          )}
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 uppercase tracking-wide shrink-0 flex items-center gap-0.5">
                            <Crown size={8} /> Super
                          </span>
                        </div>
                        {name !== admin.email && <p className="text-xs text-gray-500 truncate">{admin.email}</p>}
                      </div>
                      {!isSelf && subscriptionAdmins.length > 1 && (
                        <button
                          onClick={() => handleRemoveSuperAdmin(admin.user_id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                          title="Remove superadmin"
                        >
                          <UserMinus size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <form onSubmit={handleAddSuperAdmin} className="flex gap-2">
                <input
                  value={adminEmail}
                  onChange={e => setAdminEmail(e.target.value)}
                  placeholder="Email of existing user…"
                  type="email"
                  className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50"
                />
                <button
                  type="submit"
                  disabled={addingAdmin || !adminEmail.trim()}
                  className="px-3 py-2 bg-accent hover:bg-accent/80 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 shrink-0"
                >
                  {addingAdmin ? '…' : 'Add'}
                </button>
              </form>
              {adminError   && <p className="text-xs text-red-400 mt-1.5">{adminError}</p>}
              {adminSuccess && <p className="text-xs text-green-400 mt-1.5">{adminSuccess}</p>}
            </div>
          </div>
        )}

        {/* Editor panel — shared by board files ('files') and subscription files ('sub_files') */}
        {(section === 'files' || section === 'sub_files') && (<>
          {selectedFile ? (
            <>
              <div className="flex items-center justify-between px-6 py-3.5 border-b border-border shrink-0 bg-surface-1">
                <div className="flex items-center gap-2.5">
                  <FileText size={13} className="text-accent" />
                  <span className="text-sm font-semibold text-gray-200">{selectedFile.name}.md</span>
                  {selectedFile.scope === 'subscription' && (
                    <span className="flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 uppercase tracking-wide">
                      workspace
                    </span>
                  )}
                  {selectedFile.archived && (
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-wide">
                      archived
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {saving && <span className="text-[10px] text-gray-500">Saving…</span>}
                  {saveStatus === 'saved' && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                      <Check size={10} /> Saved
                    </span>
                  )}
                  {saveStatus === 'error' && <span className="text-[10px] text-red-400">Save failed</span>}
                  {dirty && !saving && (
                    <button
                      onClick={saveCurrentContent}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium text-white bg-accent hover:bg-accent/80 rounded-lg transition-colors"
                    >
                      <Save size={10} /> Save
                    </button>
                  )}
                </div>
              </div>

              {loadingContent ? (
                <div className="flex-1 flex items-center justify-center text-gray-600 text-xs">Loading…</div>
              ) : (
                <textarea
                  className="flex-1 w-full bg-surface-0 text-gray-300 text-[13px] font-mono leading-relaxed px-8 py-6 outline-none resize-none placeholder-gray-700"
                  value={content}
                  onChange={e => handleContentChange(e.target.value)}
                  spellCheck={false}
                  placeholder="Start writing markdown…"
                  readOnly={selectedFile.archived}
                />
              )}
              {selectedFile.archived && (
                <div className="shrink-0 px-8 py-2 bg-amber-500/5 border-t border-amber-500/10 text-[10px] text-amber-400/70">
                  This file is archived and read-only. Restore it to edit.
                </div>
              )}
              {selectedFile.scope === 'subscription' && (
                <div className="shrink-0 px-8 py-2 bg-accent/5 border-t border-accent/10 text-[10px] text-accent/60">
                  Workspace file — shared by all boards in this subscription.
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-600 gap-3">
              <FileText size={28} className="opacity-30" />
              <p className="text-sm font-medium text-gray-500">Select a file to edit</p>
              <p className="text-xs text-gray-600 max-w-xs">
                Agents read these files as context. Changes take effect on the next agent run.
              </p>
            </div>
          )}
        </>)}
      </div>

      {/* ── Action errors ───────────────────────────────────────────────── */}
      {actionError && (
        <div className="fixed bottom-5 right-5 z-50 flex items-start gap-2.5 max-w-sm bg-surface-2 border border-red-500/30 rounded-xl px-4 py-3 shadow-xl">
          <p className="text-xs text-red-400 flex-1">{actionError}</p>
          <button onClick={() => setActionError(null)} className="text-gray-600 hover:text-gray-400 shrink-0">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Archive confirm */}
      {archiveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-1 border border-border rounded-2xl w-80 shadow-2xl p-5 space-y-4">
            <p className="text-sm font-semibold text-gray-200">Archive "{archiveConfirm.file.name}.md"?</p>
            <p className="text-xs text-gray-500">The file will be moved to the archive. Agents referencing it will still work while it remains on disk.</p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => handleArchive(archiveConfirm.file, archiveConfirm.scope)} className="flex-1 py-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors">Archive</button>
              <button onClick={() => setArchiveConfirm(null)} className="flex-1 py-1.5 text-xs text-gray-400 hover:text-gray-200 rounded-lg border border-border transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-1 border border-border rounded-2xl w-80 shadow-2xl p-5 space-y-4">
            <p className="text-sm font-semibold text-gray-200">Delete "{deleteConfirm.file.name}.md"?</p>
            <p className="text-xs text-gray-500">This permanently removes the file. If any agents reference it, the delete will fail and you'll be prompted to archive instead.</p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => handleDelete(deleteConfirm.file, deleteConfirm.scope)} className="flex-1 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-400 rounded-lg transition-colors">Delete</button>
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-1.5 text-xs text-gray-400 hover:text-gray-200 rounded-lg border border-border transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Boards panel ────────────────────────────────────────────────────────────
function BoardsPanel({ projects }) {
  const active   = projects.filter(p => !p.archived_at);
  const archived = projects.filter(p => p.archived_at);
  const [showArchived, setShowArchived] = useState(false);

  return (
    <div className="flex-1 overflow-y-auto px-8 py-8">
      <div className="max-w-lg">
        <h2 className="text-sm font-semibold text-gray-200 mb-6">Boards</h2>
        <div className="space-y-1 mb-4">
          {active.map(p => (
            <div key={p.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-surface-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-base"
                style={{ background: (p.color || '#6366f1') + '20', border: `1px solid ${(p.color || '#6366f1')}30` }}>
                {p.emoji || '📋'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-200 truncate">{p.name}</p>
                {p.client_name && <p className="text-xs text-gray-500 truncate">{p.client_name}</p>}
              </div>
              {p.client_path && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${
                  p.path_exists
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  {p.path_exists ? 'connected' : 'missing'}
                </span>
              )}
            </div>
          ))}
          {active.length === 0 && <p className="text-sm text-gray-600">No active boards.</p>}
        </div>

        {archived.length > 0 && (
          <button
            onClick={() => setShowArchived(v => !v)}
            className="flex items-center gap-1.5 text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
          >
            {showArchived ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
            Archived ({archived.length})
          </button>
        )}
        {showArchived && (
          <div className="mt-2 space-y-1">
            {archived.map(p => (
              <div key={p.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-surface-2 opacity-50">
                <span className="text-base">{p.emoji || '📋'}</span>
                <p className="text-sm text-gray-400 truncate">{p.name}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Connections panel ───────────────────────────────────────────────────────
function ConnectionsPanel({ project, onUpdated, updateProject, refreshKey = 0 }) {
  const [mode, setMode]           = useState(project.repo_url ? 'github' : 'local');
  const [repoUrl, setRepoUrl]     = useState(project.repo_url || '');
  const [localPath, setLocalPath] = useState(project.client_path || null);
  const [folders, setFolders]     = useState([]);
  const [basePath, setBasePath]   = useState('');
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [cloning, setCloning]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');

  const isConnected = !!project.client_path;
  const displayUrl  = project.repo_url
    ? project.repo_url.replace(/^https?:\/\/(www\.)?/, '').replace(/\.git$/, '')
    : null;

  // Load client/ subfolders when local mode is active
  useEffect(() => {
    if (mode !== 'local') return;
    setLoadingFolders(true);
    projectsApi.clientRepos()
      .then(r => { setBasePath(r.basePath || ''); setFolders(r.folders || []); })
      .catch(() => { setBasePath(''); setFolders([]); })
      .finally(() => setLoadingFolders(false));
  }, [mode, refreshKey]);

  async function handleSelectFolder(path) {
    setLocalPath(path);
    setError(''); setSuccess('');
  }

  async function handleSaveLocal() {
    if (!localPath) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      await updateProject(project.id, { client_path: localPath, repo_url: null });
      onUpdated();
      setSuccess('Linked ✓');
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to link folder');
    } finally { setSaving(false); }
  }

  async function handleClone() {
    if (!repoUrl.trim()) return;
    setCloning(true); setError(''); setSuccess('');
    try {
      const result = await projectsApi.clone(project.id, { repo_url: repoUrl.trim() });
      onUpdated(result.project);
      setSuccess(result.already_existed
        ? `Already cloned — linked to ${result.client_path}`
        : `Cloned and linked to ${result.client_path} ✓`);
    } catch (e) {
      setError(e.response?.data?.error || 'Clone failed');
    } finally { setCloning(false); }
  }

  const [confirmSwitch, setConfirmSwitch]     = useState(false);
  const [switchingFolder, setSwitchingFolder] = useState(false);
  const switchLabel = project.repo_url ? 'Use local instead' : 'Use GitHub instead';
  const switchMode  = project.repo_url ? 'local' : 'github';

  async function handleSwitch() {
    setSaving(true); setError(''); setSuccess('');
    try {
      await updateProject(project.id, { client_path: null, repo_url: null });
      setRepoUrl(''); setLocalPath(null);
      setMode(switchMode);
      setConfirmSwitch(false);
      onUpdated();
    } catch { setError('Failed to disconnect'); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">

      {/* Connected status */}
      {isConnected && (
        <div className="flex items-center gap-3">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${project.path_exists ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          <span className="text-sm font-medium text-gray-200">
            {project.repo_url ? 'Connected via GitHub' : 'Connected locally'}
          </span>
          {!project.path_exists && (
            <span className="text-xs text-amber-400 flex items-center gap-1">
              <AlertTriangle size={11} /> Folder not found
            </span>
          )}
          <span className="text-gray-700 text-xs">·</span>
          {confirmSwitch ? (
            <span className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">Switch connection?</span>
              <button onClick={handleSwitch} disabled={saving}
                className="text-red-400 hover:text-red-300 font-medium transition-colors">
                {saving ? 'Switching…' : 'Yes'}
              </button>
              <button onClick={() => setConfirmSwitch(false)} className="text-gray-600 hover:text-gray-400 transition-colors">
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmSwitch(true)}
              className="text-xs text-red-500/70 hover:text-red-400 transition-colors"
            >
              {switchLabel}
            </button>
          )}
        </div>
      )}

      {/* Mode tabs — disabled when connected */}
      <div className={`flex gap-1 p-1 bg-surface-2 rounded-xl w-fit ${isConnected ? 'opacity-40 pointer-events-none' : ''}`}>
        {[
          { id: 'github', label: 'Clone from GitHub', icon: Github },
          { id: 'local',  label: 'Link local folder', icon: FolderOpen },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setMode(id); setError(''); setSuccess(''); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              mode === id
                ? 'bg-surface-1 text-gray-200 shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Icon size={11} /> {label}
          </button>
        ))}
      </div>

      {/* GitHub mode */}
      {mode === 'github' && !isConnected && (
        <div className="space-y-3">
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
            GitHub repository URL
          </label>
          <div className="flex gap-2">
            <input
              value={repoUrl}
              onChange={e => setRepoUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleClone()}
              placeholder="https://github.com/user/repo"
              className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50 font-mono"
            />
            <button
              onClick={handleClone}
              disabled={cloning || !repoUrl.trim()}
              className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent/80 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              {cloning ? <Loader2 size={13} className="animate-spin" /> : <Github size={13} />}
              {cloning ? 'Cloning…' : 'Clone & Save'}
            </button>
          </div>
          <p className="text-[11px] text-gray-600">
            The repository will be cloned into <span className="font-mono">client/</span> and connected to this board.
          </p>
        </div>
      )}

      {/* Local folder mode */}
      {mode === 'local' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Select a folder</p>
            {isConnected && !switchingFolder && (
              <button
                onClick={() => setSwitchingFolder(true)}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Switch folder
              </button>
            )}
            {isConnected && switchingFolder && (
              <button
                onClick={() => { setSwitchingFolder(false); setLocalPath(project.client_path); }}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>

          {basePath && (
            <div className="flex items-center gap-1.5">
              <FolderOpen size={11} className="text-gray-600 shrink-0" />
              <span className="font-mono text-[11px] text-gray-600 truncate">{basePath}</span>
            </div>
          )}

          {/* Folder list — grayed out when connected and not switching */}
          <div className={isConnected && !switchingFolder ? 'opacity-40 pointer-events-none' : ''}>
            {loadingFolders ? (
              <div className="flex items-center gap-2 text-gray-500 text-sm py-2">
                <Loader2 size={13} className="animate-spin" /> Loading…
              </div>
            ) : folders.length === 0 ? (
              <div className="px-4 py-6 rounded-xl border border-dashed border-border text-center">
                <p className="text-sm text-gray-500">No folders found.</p>
                <p className="text-xs text-gray-600 mt-1">Clone a GitHub repo to get started.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {folders.map(f => {
                  const selected = localPath === f.client_path;
                  return (
                    <button
                      key={f.client_path}
                      onClick={() => handleSelectFolder(f.client_path)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors text-left ${
                        selected
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border bg-surface-2 text-gray-400 hover:text-gray-200 hover:border-gray-500'
                      }`}
                    >
                      <FolderOpen size={13} className="shrink-0" />
                      <span className="font-mono text-xs text-gray-200 flex-1 truncate">{f.name}</span>
                      {f.is_git && (
                        <span className="text-[10px] text-gray-600 shrink-0 px-1.5 py-0.5 bg-surface-3 rounded border border-border">git</span>
                      )}
                      {selected && <Check size={13} className="shrink-0 text-accent" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Save — only when not connected or actively switching */}
          {(!isConnected || switchingFolder) && localPath && (
            <button
              onClick={async () => { await handleSaveLocal(); setSwitchingFolder(false); }}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/80 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      )}

      {/* Feedback */}
      {error && <p className="text-red-400 text-sm flex items-center gap-2"><AlertTriangle size={13} />{error}</p>}
    </div>
  );
}
