import { useState, useEffect, useRef } from 'react';
import { FileText, Plus, Archive, RotateCcw, Trash2, Save, Lock, ChevronDown, ChevronRight, X, Check, ArrowLeft, SlidersHorizontal, Sun, Moon, Crown, Shield, UserMinus, Building2, Pencil } from 'lucide-react';
import { useStore } from '../store';
import { instructionsApi } from '../api';

export default function SettingsPage() {
  const {
    instructionFiles,
    loadInstructionFiles,
    createInstructionFile,
    archiveInstructionFile,
    unarchiveInstructionFile,
    deleteInstructionFile,
    setCurrentPage,
    theme,
    setTheme,
    currentProjectId,
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
    deleteClient,
  } = useStore();

  const [section, setSection] = useState('files'); // 'files' | 'preferences' | 'workspace' | 'clients'

  // Workspace / superadmin state
  const [adminEmail, setAdminEmail] = useState('');
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [adminSuccess, setAdminSuccess] = useState('');

  async function handleAddSuperAdmin(e) {
    e.preventDefault();
    setAddingAdmin(true);
    setAdminError('');
    setAdminSuccess('');
    try {
      await addSuperAdmin(adminEmail.trim().toLowerCase());
      setAdminEmail('');
      setAdminSuccess('Superadmin added');
    } catch (err) {
      setAdminError(err.response?.data?.error || 'Failed to add superadmin');
    } finally {
      setAddingAdmin(false);
    }
  }

  async function handleRemoveSuperAdmin(userId) {
    try {
      await removeSuperAdmin(userId);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to remove superadmin');
    }
  }

  // Clients section state
  const [clientName, setClientName] = useState('');
  const [clientWebsite, setClientWebsite] = useState('');
  const [addingClient, setAddingClient] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);
  const [editingClientId, setEditingClientId] = useState(null);
  const [editClientName, setEditClientName] = useState('');
  const [clientError, setClientError] = useState('');

  // System files are loaded once (global, board-independent)
  const [systemFiles, setSystemFiles] = useState([]);

  // selectedFile: { ...file, scope: 'system' | 'custom' }
  const [selectedFile, setSelectedFile] = useState(null);
  const [content, setContent] = useState('');
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'saved' | 'error'
  const [dirty, setDirty] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [archiveConfirm, setArchiveConfirm] = useState(null);
  const [addingFile, setAddingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileError, setNewFileError] = useState('');
  const [actionError, setActionError] = useState(null);
  const saveTimerRef = useRef(null);

  // Load system files once
  useEffect(() => {
    instructionsApi.list(true, null).then(files => setSystemFiles(files)).catch(() => {});
  }, []);

  // Reload custom files and reset selection when board changes
  useEffect(() => {
    loadInstructionFiles();
    setSelectedFile(null);
  }, [currentProjectId]);

  const customActive = instructionFiles.filter(f => !f.archived);
  const customArchived = instructionFiles.filter(f => f.archived);
  const activeSystemFiles = systemFiles.filter(f => !f.archived);

  // Returns the project_id to use for API calls based on selected file's scope
  function scopeProjectId(scope) {
    return scope === 'system' ? null : currentProjectId;
  }

  async function selectFile(file, scope) {
    if (dirty && selectedFile) await saveCurrentContent();
    setSelectedFile({ ...file, scope });
    setContent('');
    setDirty(false);
    setSaveStatus(null);
    setLoadingContent(true);
    try {
      const data = await instructionsApi.get(file.name + '.md', scopeProjectId(scope));
      setContent(data.content);
    } catch {
      setContent('');
    } finally {
      setLoadingContent(false);
    }
  }

  function handleContentChange(v) {
    setContent(v);
    setDirty(true);
    setSaveStatus(null);
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => autoSave(v), 1500);
  }

  async function autoSave(val) {
    if (!selectedFile) return;
    setSaving(true);
    try {
      await instructionsApi.update(selectedFile.name + '.md', val, scopeProjectId(selectedFile.scope));
      setDirty(false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  }

  async function saveCurrentContent() {
    if (!selectedFile || !dirty) return;
    clearTimeout(saveTimerRef.current);
    setSaving(true);
    try {
      await instructionsApi.update(selectedFile.name + '.md', content, scopeProjectId(selectedFile.scope));
      setDirty(false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(file) {
    setArchiveConfirm(null);
    setActionError(null);
    try {
      await archiveInstructionFile(file.name + '.md');
      if (selectedFile?.name === file.name) setSelectedFile(null);
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to archive');
    }
  }

  async function handleDelete(file) {
    setDeleteConfirm(null);
    setActionError(null);
    try {
      await deleteInstructionFile(file.name + '.md');
      if (selectedFile?.name === file.name) setSelectedFile(null);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to delete';
      const hasDeps = err.response?.data?.has_dependencies;
      setActionError(hasDeps ? `${msg} — archive it instead to preserve agent references.` : msg);
    }
  }

  async function handleUnarchive(file) {
    setActionError(null);
    try {
      await unarchiveInstructionFile(file.name + '.md');
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to restore');
    }
  }

  async function handleCreate(e) {
    e?.preventDefault();
    const trimmed = newFileName.trim();
    if (!trimmed) { setNewFileError('Name is required'); return; }
    setNewFileError('');
    try {
      const file = await createInstructionFile(trimmed, `# ${trimmed}\n\n`);
      setAddingFile(false);
      setNewFileName('');
      selectFile(file, 'custom');
    } catch (err) {
      setNewFileError(err.response?.data?.error || 'Failed to create');
    }
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

  return (
    <div className="flex h-screen overflow-hidden bg-surface-0 font-sans">
      {/* Left panel */}
      <div className="w-60 shrink-0 flex flex-col border-r border-border bg-surface-1 overflow-y-auto">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-border shrink-0">
          <button
            onClick={() => setCurrentPage('board')}
            className="flex items-center gap-1.5 text-[10px] text-gray-600 hover:text-gray-400 transition-colors mb-3"
          >
            <ArrowLeft size={10} />
            Back to board
          </button>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Settings</p>
        </div>

        {/* Section nav */}
        <nav className="px-2 py-2 border-b border-border shrink-0 space-y-0.5">
          {[
            { id: 'files', label: 'Instruction Files', icon: FileText },
            { id: 'preferences', label: 'Preferences', icon: SlidersHorizontal },
            { id: 'clients', label: 'Clients', icon: Building2 },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors ${
                section === id ? 'bg-accent/15 text-accent' : 'text-gray-400 hover:bg-surface-3 hover:text-gray-200'
              }`}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
          {isSuperAdmin && (
            <button
              onClick={() => setSection('workspace')}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors ${
                section === 'workspace' ? 'bg-accent/15 text-accent' : 'text-gray-400 hover:bg-surface-3 hover:text-gray-200'
              }`}
            >
              <Crown size={12} />
              Workspace
            </button>
          )}
        </nav>

        {/* File list (only when section === 'files') */}
        {section === 'files' && (
          <div className="flex-1 px-2 py-3 space-y-4 overflow-y-auto">
            {/* System files */}
            <div>
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest px-2 mb-1">System</p>
              <p className="text-[9px] text-gray-700 px-2 mb-2 leading-relaxed">Affects all boards</p>
              {activeSystemFiles.map(f => (
                <FileRow
                  key={f.name}
                  file={f}
                  scope="system"
                  actions={
                    <span className="flex items-center gap-0.5 shrink-0 opacity-50" title="System file — affects all boards">
                      <Lock size={9} />
                    </span>
                  }
                />
              ))}
            </div>

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Custom files (per-board) */}
            <div>
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest px-2 mb-1">Custom</p>
              <p className="text-[9px] text-gray-700 px-2 mb-2 leading-relaxed">This board only</p>
              {customActive.map(f => (
                <FileRow
                  key={f.name}
                  file={f}
                  scope="custom"
                  actions={
                    <>
                      <button onClick={() => setArchiveConfirm(f)} title="Archive"
                        className="p-0.5 text-gray-600 hover:text-amber-400 transition-colors">
                        <Archive size={10} />
                      </button>
                      <button onClick={() => setDeleteConfirm(f)} title="Delete"
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
                    autoFocus
                    value={newFileName}
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
                  <Plus size={11} />
                  New file
                </button>
              )}
            </div>

            {/* Archived */}
            {customArchived.length > 0 && (
              <div>
                <button
                  onClick={() => setShowArchived(v => !v)}
                  className="flex items-center gap-1.5 px-2 py-1 w-full text-[9px] font-semibold text-gray-600 uppercase tracking-widest hover:text-gray-400 transition-colors"
                >
                  {showArchived ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
                  Archived ({customArchived.length})
                </button>
                {showArchived && customArchived.map(f => (
                  <FileRow
                    key={f.name}
                    file={f}
                    scope="custom"
                    actions={
                      <>
                        <button onClick={() => handleUnarchive(f)} title="Restore"
                          className="p-0.5 text-gray-600 hover:text-accent transition-colors">
                          <RotateCcw size={10} />
                        </button>
                        <button onClick={() => setDeleteConfirm(f)} title="Delete permanently"
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
        )}
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Preferences panel */}
        {section === 'preferences' && (
          <div className="flex-1 overflow-y-auto px-8 py-8">
            <h2 className="text-sm font-semibold text-gray-200 mb-6">Preferences</h2>

            {/* Theme */}
            <div className="mb-8">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-3">Theme</p>
              <div className="flex gap-3">
                {[
                  { value: 'dark', label: 'Dark', icon: Moon },
                  { value: 'light', label: 'Light', icon: Sun },
                ].map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => setTheme(value)}
                    className={`flex flex-col items-center gap-2.5 px-6 py-4 rounded-xl border transition-all ${
                      theme === value
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border bg-surface-2 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                    }`}
                  >
                    <Icon size={18} />
                    <span className="text-xs font-medium">{label}</span>
                    {theme === value && <div className="w-1.5 h-1.5 rounded-full bg-accent" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Workspace panel */}
        {section === 'workspace' && isSuperAdmin && (
          <div className="flex-1 overflow-y-auto px-8 py-8">
            <h2 className="text-sm font-semibold text-gray-200 mb-6">Workspace</h2>

            {/* Subscription name */}
            <div className="mb-8">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-3">Workspace Name</p>
              <p className="text-sm text-gray-300">{subscription?.name || 'My Workspace'}</p>
            </div>

            {/* Superadmins management */}
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-2">Superadmins</p>
              <p className="text-xs text-gray-600 mb-4">
                Superadmins have access to all boards, teams, and members in the workspace without needing to be explicitly invited.
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

              {/* Add superadmin form */}
              <form onSubmit={handleAddSuperAdmin} className="flex gap-2">
                <input
                  value={adminEmail}
                  onChange={e => setAdminEmail(e.target.value)}
                  placeholder="Email of existing user..."
                  type="email"
                  className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50"
                />
                <button
                  type="submit"
                  disabled={addingAdmin || !adminEmail.trim()}
                  className="px-3 py-2 bg-accent hover:bg-accent/80 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 shrink-0"
                >
                  {addingAdmin ? '...' : 'Add'}
                </button>
              </form>
              {adminError && <p className="text-xs text-red-400 mt-1.5">{adminError}</p>}
              {adminSuccess && <p className="text-xs text-green-400 mt-1.5">{adminSuccess}</p>}
            </div>
          </div>
        )}

        {/* Clients panel */}
        {section === 'clients' && (
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
                    setClientName('');
                    setClientWebsite('');
                    setAddingClient(false);
                    setClientError('');
                  } catch(err) {
                    setClientError(err.response?.data?.error || 'Failed to create client');
                  } finally {
                    setCreatingClient(false);
                  }
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
                          if (e.key === 'Enter') { e.currentTarget.blur(); }
                          if (e.key === 'Escape') { setEditingClientId(null); }
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

        {/* Editor panel (only when section === 'files') */}
        {section === 'files' && (<>
        {selectedFile ? (
          <>
            {/* Editor header */}
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-border shrink-0 bg-surface-1">
              <div className="flex items-center gap-2.5">
                <FileText size={13} className="text-accent" />
                <span className="text-sm font-semibold text-gray-200">{selectedFile.name}.md</span>
                {selectedFile.scope === 'system' && (
                  <span className="flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 uppercase tracking-wide">
                    <Lock size={8} /> system
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

            {/* Textarea */}
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
            {selectedFile.scope === 'system' && (
              <div className="shrink-0 px-8 py-2 bg-accent/5 border-t border-accent/10 text-[10px] text-accent/60">
                System file — changes affect all boards.
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

      {/* Action errors */}
      {actionError && (
        <div className="fixed bottom-5 right-5 z-50 flex items-start gap-2.5 max-w-sm bg-surface-2 border border-red-500/30 rounded-xl px-4 py-3 shadow-xl">
          <p className="text-xs text-red-400 flex-1">{actionError}</p>
          <button onClick={() => setActionError(null)} className="text-gray-600 hover:text-gray-400 shrink-0">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Archive confirm dialog */}
      {archiveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-1 border border-border rounded-2xl w-80 shadow-2xl p-5 space-y-4">
            <p className="text-sm font-semibold text-gray-200">Archive "{archiveConfirm.name}.md"?</p>
            <p className="text-xs text-gray-500">The file will be moved to the archive. Agents referencing it will still work while it remains on disk.</p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => handleArchive(archiveConfirm)} className="flex-1 py-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors">
                Archive
              </button>
              <button onClick={() => setArchiveConfirm(null)} className="flex-1 py-1.5 text-xs text-gray-400 hover:text-gray-200 rounded-lg border border-border transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-1 border border-border rounded-2xl w-80 shadow-2xl p-5 space-y-4">
            <p className="text-sm font-semibold text-gray-200">Delete "{deleteConfirm.name}.md"?</p>
            <p className="text-xs text-gray-500">This permanently removes the file. If any agents reference it, the delete will fail and you'll be prompted to archive instead.</p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-400 rounded-lg transition-colors">
                Delete
              </button>
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-1.5 text-xs text-gray-400 hover:text-gray-200 rounded-lg border border-border transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
