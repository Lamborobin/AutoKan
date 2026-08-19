import { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileText, Plus, Archive, RotateCcw, Trash2, Save, ChevronDown, ChevronRight,
  X, XCircle, Check, ArrowLeft, Crown, Shield, UserMinus, Building2, Pencil, GitBranch,
  Github, FolderOpen, Loader2, AlertTriangle, Users, LayoutGrid, UserCheck, Settings2,
  BookOpen, Info, Mail, UserPlus, FlaskConical, Link2 as LinkIcon, Wrench, Undo2, Redo2,
} from 'lucide-react';
import AiContextPanel from './AiContextPanel';
import BenchmarkPanel from './BenchmarkPanel';
import InfoModal from './InfoModal';
import TeamsPanel from './TeamsPanel';
import BoardsPanel from './BoardsPanel';
import SettingsTable from './SettingsTable';
import { ProjectSwitcher } from '../Sidebar';
import { useStore } from '../../store';
import { instructionsApi, projectsApi, invitesApi } from '../../api'; // instructionsApi used for direct file reads in selectFile/autoSave


// Mirror of the server's filename sanitisation — lets the user type a free-text
// label and see the resulting filesystem-safe name before creating the file.
function safeFileName(name) {
  return (name || '').trim().toLowerCase()
    .replace(/\.md$/i, '')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
}

// Picker for which capabilities a board file is visible to.
// Empty selection = visible to every agent ("All agents").
// Defined at module scope (not inside SettingsPage) so its component identity
// stays stable across re-renders — otherwise React remounts it on every
// keystroke/click, which reset its internal scroll position to the top.
function CapabilityPicker({ selected, onChange, capabilityRoles }) {
  const allAgents = selected.length === 0;
  return (
    <div className="bg-surface-3 border border-border rounded-lg p-2 space-y-1 max-h-56 overflow-y-auto">
      <label className="flex items-center gap-1.5 px-0.5 cursor-pointer">
        <input type="checkbox" className="accent-accent w-2.5 h-2.5" checked={allAgents} onChange={() => onChange([])} />
        <span className="text-xs text-gray-300 font-medium">All agents</span>
        <span className="text-xs text-gray-600">· no restriction</span>
      </label>
      <div className="border-t border-border my-0.5 opacity-50" />
      {capabilityRoles.length === 0 && <p className="text-xs text-gray-600 px-0.5">No capabilities available.</p>}
      {capabilityRoles.map(role => (
        <label key={role.id} className={`flex items-center gap-1.5 px-0.5 cursor-pointer ${allAgents ? 'opacity-50' : ''}`}>
          <input type="checkbox" className="accent-accent w-2.5 h-2.5"
            checked={selected.includes(role.id)}
            onChange={e => onChange(e.target.checked ? [...selected, role.id] : selected.filter(c => c !== role.id))}
          />
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: role.color }} />
          <span className="text-xs text-gray-400">{role.name}</span>
        </label>
      ))}
    </div>
  );
}

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
    setCurrentProject,
    currentProjectId,
    projects,
    createProject,
    updateProject,
    archiveProject,
    unarchiveProject,
    deleteProject,
    loadProjects,
    isSuperAdmin,
    subscription,
    loadSubscription,
    updateSubscriptionName,
    subscriptionAdmins,
    addSuperAdmin,
    removeSuperAdmin,
    user,
    users,
    clients,
    loadClients,
    createClient,
    updateClient,
    archiveClient,
    sectors,
    teams,
    loadTeams,
    createTeam,
    deleteTeam,
    roles,
    autoSaveContextFiles,
    setAutoSaveContextFiles,
  } = useStore();

  const currentProject = projects.find(p => p.id === currentProjectId);
  const isClientBoard = !!currentProject?.client_id;

  // Sector display metadata, sourced from the sector registry (server/src/seed/sectors.json)
  // rather than hardcoded — keeps client/board sector badges and pickers in sync with it.
  const sectorMeta = useMemo(
    () => Object.fromEntries((sectors || []).map(s => [s.id, { label: s.label, color: s.color }])),
    [sectors],
  );

  // Clients are companies/organisations — 'personal' is a board-only sector with no client attached.
  const clientSectors = useMemo(
    () => (sectors || []).filter(s => s.id !== 'personal'),
    [sectors],
  );

  // Capability metadata, sourced from the roles store (permission-type roles).
  // Drives the "Visible to" pickers and the badges on file rows.
  const capabilityRoles = (roles || []).filter(r => r.type === 'permission');
  const capMeta = Object.fromEntries(capabilityRoles.map(r => [r.id, { label: r.name, color: r.color }]));

  const [section, setSection]         = useState('files');
  const [connRefreshKey, setConnRefreshKey] = useState(0);
  const [openInfoKey, setOpenInfoKey]       = useState(null); // 'board' | 'workspace' | 'ai_context' | null
  const [workspaceSwitcherOpen, setWorkspaceSwitcherOpen] = useState(false);
  const workspaceSwitcherRef = useRef(null);

  useEffect(() => {
    if (!workspaceSwitcherOpen) return;
    function handleOutside(e) {
      if (workspaceSwitcherRef.current && !workspaceSwitcherRef.current.contains(e.target)) {
        setWorkspaceSwitcherOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [workspaceSwitcherOpen]);


  // ── Subscription overview state ─────────────────────────────────────────
  const [subName, setSubName]           = useState('');
  const [editingSubName, setEditingSubName] = useState(false);
  const [savingSubName, setSavingSubName]   = useState(false);
  const [subNameError, setSubNameError]     = useState('');

  useEffect(() => {
    if (subscription?.name) setSubName(subscription.name);
  }, [subscription?.name]);

  async function handleSaveSubName(e) {
    e.preventDefault();
    if (!subName.trim()) return;
    setSavingSubName(true); setSubNameError('');
    try {
      await updateSubscriptionName(subName.trim());
      setEditingSubName(false);
    } catch (err) {
      setSubNameError(err.response?.data?.error || 'Failed to update');
    } finally { setSavingSubName(false); }
  }

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
  const [clientSector, setClientSector]       = useState('software');
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
  const [addingFile, setAddingFile]       = useState(false);
  const [newFileName, setNewFileName]     = useState('');
  const [newFileCapabilities, setNewFileCapabilities] = useState([]);
  const [newFileError, setNewFileError]   = useState('');
  const [actionError, setActionError]     = useState(null);
  const [editingCaps, setEditingCaps]     = useState(false);
  const [savingCaps, setSavingCaps]       = useState(false);
  const saveTimerRef = useRef(null);
  const savedContentRef = useRef(''); // last-persisted content, for Cancel to revert to

  // ── Undo/redo — coalesced by typing pause, not per-keystroke ────────────
  // history/future hold past content snapshots for the currently open file.
  // burstAnchorRef captures the pre-edit content once per uninterrupted typing
  // burst; it's committed to history when typing pauses for HISTORY_DEBOUNCE_MS.
  const HISTORY_DEBOUNCE_MS = 500;
  const HISTORY_LIMIT = 100;
  const [history, setHistory] = useState([]);
  const [future, setFuture]   = useState([]);
  const historyTimerRef = useRef(null);
  const burstAnchorRef  = useRef(null);

  function resetHistory() {
    clearTimeout(historyTimerRef.current);
    burstAnchorRef.current = null;
    setHistory([]); setFuture([]);
  }

  // Capability Behavior files never auto-save, regardless of the preference —
  // they drive real agent behaviour, so a save should always be a deliberate act.
  function shouldAutoSave() {
    return !!selectedFile && selectedFile.kind !== 'capability_behavior' && autoSaveContextFiles;
  }

  // Refresh project + subscription data on mount
  useEffect(() => {
    loadProjects().catch(() => {});
    loadSubscription().catch(() => {});
  }, []);

  // Reload board files when board changes
  useEffect(() => {
    loadInstructionFiles();
    setSelectedFile(null);
  }, [currentProjectId]);

  // Load subscription files + other subscription data when entering subscription section
  useEffect(() => {
    if (section === 'sub_files' || section === 'sub_capability') {
      loadSubscriptionInstructionFiles().catch(() => {});
      setSelectedFile(null);
    }
    if (section.startsWith('sub_')) {
      loadSubscription().catch(() => {});
      loadTeams().catch(() => {});
      loadClients().catch(() => {});
    }
    if (section === 'connections') {
      loadProjects().catch(() => {});
    }
  }, [section]);

  // client.md and project.md are client-board-only context files — hide on personal boards
  const CLIENT_BOARD_FILES = new Set(['client', 'project']);
  const customActive   = instructionFiles.filter(f => !f.archived  && (isClientBoard || !CLIENT_BOARD_FILES.has(f.name)));
  const customArchived = instructionFiles.filter(f =>  f.archived  && (isClientBoard || !CLIENT_BOARD_FILES.has(f.name)));
  const capabilityFilesActive  = subscriptionInstructionFiles.filter(f => !f.archived && f.kind === 'capability_behavior');
  const workspaceFilesActive   = subscriptionInstructionFiles.filter(f => !f.archived && f.kind !== 'capability_behavior');
  const workspaceFilesArchived = subscriptionInstructionFiles.filter(f =>  f.archived && f.kind !== 'capability_behavior');

  // scope = 'board' | 'subscription'
  function getApiScope(scope) {
    return scope === 'subscription'
      ? { projectId: null, subscriptionId: subscription?.id || null }
      : { projectId: currentProjectId, subscriptionId: subscription?.id || null };
  }

  async function selectFile(file, scope) {
    // Only save-on-navigate for files that are allowed to auto-save at all — for
    // Capability Behavior (and context files with the toggle off), leaving a dirty
    // file discards the edit rather than silently persisting it. Use Save or Cancel
    // explicitly instead; that's the whole point of "never auto-save behaviour files."
    if (dirty && selectedFile && shouldAutoSave()) await saveCurrentContent();
    setSelectedFile({ ...file, scope });
    setContent(''); setDirty(false); setSaveStatus(null); setLoadingContent(true);
    setEditingCaps(false);
    resetHistory();
    try {
      const { projectId, subscriptionId } = getApiScope(scope);
      const data = await instructionsApi.get(file.name + '.md', projectId, subscriptionId);
      setContent(data.content);
      savedContentRef.current = data.content;
      // GET returns authoritative capabilities + protected/kind flags (front matter stripped)
      setSelectedFile({ ...file, scope, capabilities: data.capabilities || [], protected: !!data.protected, kind: data.kind, archived: !!data.archived });
    } catch { setContent(''); }
    finally { setLoadingContent(false); }
  }

  // Discards the pending edit and reverts to the last-persisted content — the
  // explicit counterpart to Save for files that never auto-save.
  function handleCancel() {
    clearTimeout(saveTimerRef.current);
    resetHistory();
    setContent(savedContentRef.current);
    setDirty(false); setSaveStatus(null);
  }

  // Change which capabilities a board file is visible to. Persists immediately
  // (also flushes any pending content edit), then refreshes the list badges.
  async function handleCapabilitiesChange(newCaps) {
    if (!selectedFile) return;
    setSavingCaps(true);
    setSelectedFile(f => ({ ...f, capabilities: newCaps }));
    try {
      const { projectId, subscriptionId } = getApiScope(selectedFile.scope);
      await instructionsApi.update(selectedFile.name + '.md', content, projectId, subscriptionId, newCaps);
      setDirty(false);
      await loadInstructionFiles();
    } catch { setActionError('Failed to update visibility'); }
    finally { setSavingCaps(false); }
  }

  function handleContentChange(v) {
    // Capture the pre-edit state once per burst; commit it as an undo step once
    // typing pauses. Redo stack is invalidated by any new edit, same as usual.
    if (burstAnchorRef.current === null) burstAnchorRef.current = content;
    clearTimeout(historyTimerRef.current);
    historyTimerRef.current = setTimeout(() => {
      const anchor = burstAnchorRef.current;
      burstAnchorRef.current = null;
      if (anchor === null) return;
      setHistory(h => (h[h.length - 1] === anchor ? h : [...h, anchor].slice(-HISTORY_LIMIT)));
      setFuture([]);
    }, HISTORY_DEBOUNCE_MS);

    setContent(v); setDirty(true); setSaveStatus(null);
    clearTimeout(saveTimerRef.current);
    if (shouldAutoSave()) saveTimerRef.current = setTimeout(() => autoSave(v), 1500);
  }

  function handleUndo() {
    if (history.length === 0) return;
    clearTimeout(historyTimerRef.current);
    burstAnchorRef.current = null;
    const prev = history[history.length - 1];
    setFuture(f => [content, ...f]);
    setHistory(h => h.slice(0, -1));
    setContent(prev); setDirty(true); setSaveStatus(null);
    clearTimeout(saveTimerRef.current);
    if (shouldAutoSave()) saveTimerRef.current = setTimeout(() => autoSave(prev), 1500);
  }

  function handleRedo() {
    if (future.length === 0) return;
    clearTimeout(historyTimerRef.current);
    burstAnchorRef.current = null;
    const next = future[0];
    setHistory(h => [...h, content]);
    setFuture(f => f.slice(1));
    setContent(next); setDirty(true); setSaveStatus(null);
    clearTimeout(saveTimerRef.current);
    if (shouldAutoSave()) saveTimerRef.current = setTimeout(() => autoSave(next), 1500);
  }

  async function autoSave(val) {
    if (!selectedFile) return;
    setSaving(true);
    try {
      const { projectId, subscriptionId } = getApiScope(selectedFile.scope);
      await instructionsApi.update(selectedFile.name + '.md', val, projectId, subscriptionId);
      savedContentRef.current = val;
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
      savedContentRef.current = content;
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
      setShowArchived(true); // reveal the Archived section so the restore action is discoverable
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

  async function handleCreate(e, scope = 'board') {
    e?.preventDefault();
    const trimmed = newFileName.trim();
    if (!trimmed) { setNewFileError('Name is required'); return; }
    setNewFileError('');
    try {
      const file = scope === 'subscription'
        ? await createSubscriptionInstructionFile(trimmed, `# ${trimmed}\n\n`, newFileCapabilities)
        : await createInstructionFile(trimmed, `# ${trimmed}\n\n`, newFileCapabilities);
      setAddingFile(false); setNewFileName(''); setNewFileCapabilities([]);
      selectFile(file, scope);
    } catch (err) { setNewFileError(err.response?.data?.error || 'Failed to create'); }
  }

  function CapBadge({ cap }) {
    const meta = capMeta[cap] || { label: cap, color: '#6366f1' };
    return (
      <span className="text-xs px-1 py-0.5 rounded-full font-medium"
        style={{ background: meta.color + '20', color: meta.color }}>
        {meta.label}
      </span>
    );
  }

  function FileRow({ file, scope, actions, deleteAction }) {
    const isSelected = selectedFile?.name === file.name && selectedFile?.scope === scope;
    return (
      <div
        className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
          isSelected ? 'bg-accent/15 text-accent' : 'text-gray-400 hover:bg-surface-3 hover:text-gray-200'
        }`}
        onClick={() => selectFile(file, scope)}
      >
        <FileText size={14} className="shrink-0" />
        <span className="text-sm flex-1 truncate">{file.label || file.name}</span>
        {file.protected && <span className="text-xs px-1 py-0.5 rounded-md bg-surface-3 text-gray-400 border border-border uppercase tracking-wide shrink-0">protected</span>}
        {/* All actions stay visible (and tinted) always — none hidden behind hover */}
        {actions && (
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            {actions}
          </div>
        )}
        {deleteAction && (
          <div className="flex items-center" onClick={e => e.stopPropagation()}>
            {deleteAction}
          </div>
        )}
      </div>
    );
  }

  // ── Nav helpers ─────────────────────────────────────────────────────────
  function navBtn(id, label, Icon, badge, infoKey) {
    const active = section === id;
    return (
      <button
        key={id}
        onClick={() => setSection(id)}
        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors group ${
          active ? 'bg-accent/15 text-accent' : 'text-gray-400 hover:bg-surface-3 hover:text-gray-200'
        }`}
      >
        <Icon size={12} />
        <span className="flex-1 text-left truncate">{label}</span>
        {badge}
        {infoKey && (
          <span
            role="button"
            tabIndex={0}
            onClick={e => { e.stopPropagation(); setOpenInfoKey(infoKey); }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); setOpenInfoKey(infoKey); } }}
            title="What is this?"
            className="p-0.5 rounded-md text-gray-400 hover:text-accent hover:bg-surface-3 transition-colors"
          >
            <Info size={14} />
          </span>
        )}
      </button>
    );
  }

  const connectionDot = !currentProject?.client_path
    ? <span className="ml-auto shrink-0 text-amber-400" title="No folder connected"><AlertTriangle size={13} /></span>
    : !currentProject?.path_exists
    ? <span className="ml-auto shrink-0 text-amber-400" title="Connected folder not found"><AlertTriangle size={13} /></span>
    : null;

  return (
    <div className="flex h-screen overflow-hidden bg-surface-0 font-sans">

      {/* ── Left panel ──────────────────────────────────────────────────── */}
      <div className="w-60 shrink-0 flex flex-col border-r border-border bg-surface-1">

        {/* Header — kept OUTSIDE the scrollable nav body below, and neither this nor
            the outer container has overflow-hidden/auto — any overflow: auto/hidden
            ancestor clips horizontal overflow too (not just the axis you set), which is
            what was cutting the board switcher's dropdown off. Only the nav body below
            scrolls; the header (and its dropdown) sits in an unconstrained sibling, same
            as the main app Sidebar. "Settings" is the largest text here on purpose: this
            is the official settings surface for the whole app (workspace, platform,
            system), not just this one board, so the board identity reads as context,
            not title. */}
        <div className="px-4 pt-4 pb-3 border-b border-border shrink-0">
          <button
            onClick={() => setCurrentPage('board')}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors mb-3"
          >
            <ArrowLeft size={10} /> Back to start
          </button>
          <h1 className="text-lg font-bold text-gray-100 mb-2">Settings</h1>
          {/* Same board switcher as the main app sidebar — selecting a board here only
              changes which board's context you're editing, it never navigates away. */}
          <ProjectSwitcher />
        </div>

        {/* Scrollable nav body — everything below the header */}
        <div className="flex-1 overflow-y-auto flex flex-col">

        {/* BOARD section */}
        <div className="px-2 pt-3 pb-1 shrink-0">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest px-2.5 mb-1">Board</p>
          <div className="space-y-0.5">
            {navBtn('files', 'Board Context', FileText, null, 'board')}
          </div>
        </div>

        {/* File list — only when section === 'files' (board-scoped) */}
        {section === 'files' && (
          <div className="mx-2 mb-1 shrink-0 border border-border rounded-xl bg-surface-0/50 overflow-hidden">
            <div className="px-2 py-2.5 space-y-3 overflow-y-auto max-h-[calc(100vh-240px)]">
              <div>
                {customActive.map(f => (
                  <FileRow key={f.name} file={f} scope="board"
                    actions={
                      <>
                        <button onClick={() => selectFile(f, 'board')} title="Edit content & visibility"
                          className="p-0.5 text-accent hover:text-accent/80 transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => setArchiveConfirm({ file: f, scope: 'board' })} title="Archive"
                          className="p-0.5 text-amber-400 hover:text-amber-300 transition-colors">
                          <Archive size={13} />
                        </button>
                      </>
                    }
                    deleteAction={
                      <button onClick={() => setDeleteConfirm({ file: f, scope: 'board' })} title="Delete"
                        className="p-0.5 text-red-400 hover:text-red-300 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    }
                  />
                ))}

                {addingFile ? (
                  <form onSubmit={handleCreate} className="mt-1.5 px-1 space-y-1.5">
                    <input
                      autoFocus value={newFileName}
                      onChange={e => { setNewFileName(e.target.value); setNewFileError(''); }}
                      onKeyDown={e => e.key === 'Escape' && (setAddingFile(false), setNewFileName(''), setNewFileCapabilities([]))}
                      placeholder="e.g. Brand voice, Returns policy…"
                      className="w-full bg-surface-3 border border-border rounded-lg px-2 py-1 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50"
                    />
                    {newFileName.trim() && (
                      safeFileName(newFileName)
                        ? <p className="text-xs text-gray-600 px-0.5">Saved as <span className="text-gray-500">{safeFileName(newFileName)}.md</span></p>
                        : <p className="text-xs text-amber-500/80 px-0.5">Needs at least one letter or number</p>
                    )}
                    {newFileError && <p className="text-xs text-red-400">{newFileError}</p>}
                    <div className="flex gap-1.5">
                      <button type="submit" disabled={!safeFileName(newFileName)}
                        className="flex-1 py-1 text-xs font-medium text-white bg-accent hover:bg-accent/80 disabled:opacity-40 rounded-md transition-colors">
                        Create
                      </button>
                      <button type="button" onClick={() => { setAddingFile(false); setNewFileName(''); setNewFileCapabilities([]); setNewFileError(''); }}
                        className="px-3 py-1 text-xs text-gray-400 hover:text-gray-200 border border-border rounded-md transition-colors">
                        Cancel
                      </button>
                    </div>
                    <div className="space-y-1 pt-0.5">
                      <p className="text-xs text-gray-600 uppercase tracking-wide font-medium px-0.5">Visible to</p>
                      <CapabilityPicker selected={newFileCapabilities} onChange={setNewFileCapabilities} />
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => { setAddingFile(true); setNewFileName(''); setNewFileError(''); setNewFileCapabilities([]); }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 w-full text-sm text-gray-400 hover:text-gray-200 transition-colors rounded-lg"
                  >
                    <Plus size={11} className="text-accent" /> New file
                  </button>
                )}
              </div>

              {/* Archived board files */}
              {customArchived.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowArchived(v => !v)}
                    className="flex items-center gap-1.5 px-1.5 py-1 w-full text-xs font-semibold text-gray-400 uppercase tracking-widest hover:text-gray-200 transition-colors"
                  >
                    {showArchived ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
                    Archived ({customArchived.length})
                  </button>
                  {showArchived && customArchived.map(f => (
                    <FileRow key={f.name} file={f} scope="board"
                      actions={
                        <button onClick={() => handleUnarchive(f, 'board')} title="Restore"
                          className="p-0.5 text-accent hover:text-accent/80 transition-colors">
                          <RotateCcw size={13} />
                        </button>
                      }
                      deleteAction={
                        <button onClick={() => setDeleteConfirm({ file: f, scope: 'board' })} title="Delete permanently"
                          className="p-0.5 text-red-400 hover:text-red-300 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Board-level Benchmark Tasks — after the Board Context file list, not sandwiched inside it */}
        <div className="px-2 pb-1 shrink-0">
          <div className="space-y-0.5">
            {navBtn('benchmark', 'Benchmark Tasks', FlaskConical)}
          </div>
        </div>

        {/* Connections nav item — visible for all boards */}
        {currentProject && (
          <div className="px-2 pb-1 shrink-0">
            <div className="space-y-0.5">
              {navBtn('connections', 'Connections', GitBranch, connectionDot)}
            </div>
          </div>
        )}

        {/* SUBSCRIPTION section (superadmin only) */}
        {isSuperAdmin && (
          <div className="px-2 pt-3 pb-1 shrink-0 border-t border-border">
            <div className="relative mb-1" ref={workspaceSwitcherRef}>
              <button
                onClick={() => setWorkspaceSwitcherOpen(v => !v)}
                className="w-full flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-surface-3/50 transition-colors group"
              >
                <span className="text-xs font-semibold text-gray-600 group-hover:text-gray-400 uppercase tracking-widest flex-1 text-left truncate">
                  Workspace · {subscription?.name || 'My Workspace'}
                </span>
                <ChevronDown size={10} className={`text-gray-400 shrink-0 transition-transform ${workspaceSwitcherOpen ? 'rotate-180' : ''}`} />
              </button>

              {workspaceSwitcherOpen && (
                <div className="absolute left-0 top-full mt-1 w-[260px] bg-surface-2 border border-border rounded-xl shadow-[0_25px_60px_-10px_rgba(0,0,0,0.8)] z-50 overflow-hidden">
                  <div className="py-1">
                    <div className="w-full flex items-center gap-2.5 px-3 py-2">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-accent" />
                      <p className="flex-1 text-sm font-medium text-gray-200 text-left truncate">{subscription?.name || 'My Workspace'}</p>
                      <Check size={12} className="text-accent shrink-0" />
                    </div>
                  </div>
                  <div className="border-t border-border">
                    <button
                      onClick={() => setWorkspaceSwitcherOpen(false)}
                      title="Coming soon"
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-400 hover:text-gray-200 hover:bg-surface-3 transition-colors"
                    >
                      <Plus size={13} className="text-accent" />
                      New workspace
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-0.5">
              {navBtn('sub_overview',   'Settings', Settings2)}
              {navBtn('sub_benchmark',  'Benchmark Tasks', FlaskConical)}
            </div>
          </div>
        )}

        {/* Lists — clients, team, boards, members */}
        {isSuperAdmin && (
          <div className="px-2 pt-3 pb-1 shrink-0">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest px-2.5 mb-1">Lists</p>
            <div className="space-y-0.5">
              {navBtn('sub_clients', 'Clients', Building2)}
              {navBtn('sub_team',    'Team',    Users)}
              {navBtn('sub_boards',  'Boards',  LayoutGrid)}
              {navBtn('sub_members', 'Members', UserCheck)}
            </div>
          </div>
        )}

        {/* Context — workspace rules + capability behavior files. Each nav button is
            immediately followed by its own file-list panel (not both buttons, then both
            panels) so the visible panel always sits under the button that opened it,
            regardless of which of the two is active. */}
        {isSuperAdmin && (
          <div className="px-2 pt-3 pb-1 shrink-0">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest px-2.5 mb-1">Context</p>

            <div className="space-y-0.5">
              {navBtn('sub_files', 'Workspace Context', FileText, null, 'workspace')}
            </div>

            {/* Workspace Context file list — genuine workspace-wide rules, creatable */}
            {section === 'sub_files' && (
              <div className="my-1.5 shrink-0 border border-border rounded-xl bg-surface-0/50 overflow-hidden">
            <div className="px-2 py-2.5 space-y-3 overflow-y-auto max-h-[calc(100vh-340px)]">
              <div>
                {workspaceFilesActive.map(f => (
                  <FileRow key={f.name} file={f} scope="subscription"
                    actions={
                      <button onClick={() => setArchiveConfirm({ file: f, scope: 'subscription' })} title="Archive"
                        className="p-0.5 text-amber-400 hover:text-amber-300 transition-colors">
                        <Archive size={13} />
                      </button>
                    }
                    deleteAction={
                      <button onClick={() => setDeleteConfirm({ file: f, scope: 'subscription' })} title="Delete"
                        className="p-0.5 text-red-400 hover:text-red-300 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    }
                  />
                ))}

                {addingFile ? (
                  <form onSubmit={e => handleCreate(e, 'subscription')} className="mt-1.5 px-1 space-y-1.5">
                    <input
                      autoFocus value={newFileName}
                      onChange={e => { setNewFileName(e.target.value); setNewFileError(''); }}
                      onKeyDown={e => e.key === 'Escape' && (setAddingFile(false), setNewFileName(''), setNewFileCapabilities([]))}
                      placeholder="e.g. ISO certification, review policy…"
                      className="w-full bg-surface-3 border border-border rounded-lg px-2 py-1 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50"
                    />
                    {newFileName.trim() && (
                      safeFileName(newFileName)
                        ? <p className="text-xs text-gray-600 px-0.5">Saved as <span className="text-gray-500">{safeFileName(newFileName)}.md</span></p>
                        : <p className="text-xs text-amber-500/80 px-0.5">Needs at least one letter or number</p>
                    )}
                    {newFileError && <p className="text-xs text-red-400">{newFileError}</p>}
                    <div className="flex gap-1.5">
                      <button type="submit" disabled={!safeFileName(newFileName)}
                        className="flex-1 py-1 text-xs font-medium text-white bg-accent hover:bg-accent/80 disabled:opacity-40 rounded-md transition-colors">
                        Create
                      </button>
                      <button type="button" onClick={() => { setAddingFile(false); setNewFileName(''); setNewFileCapabilities([]); setNewFileError(''); }}
                        className="px-3 py-1 text-xs text-gray-400 hover:text-gray-200 border border-border rounded-md transition-colors">
                        Cancel
                      </button>
                    </div>
                    <div className="space-y-1 pt-0.5">
                      <p className="text-xs text-gray-600 uppercase tracking-wide font-medium px-0.5">Visible to</p>
                      <CapabilityPicker selected={newFileCapabilities} onChange={setNewFileCapabilities} />
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => { setAddingFile(true); setNewFileName(''); setNewFileError(''); setNewFileCapabilities([]); }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 w-full text-sm text-gray-400 hover:text-gray-200 transition-colors rounded-lg"
                  >
                    <Plus size={11} className="text-accent" /> New file
                  </button>
                )}
              </div>

              {/* Archived workspace files */}
              {workspaceFilesArchived.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowArchived(v => !v)}
                    className="flex items-center gap-1.5 px-1.5 py-1 w-full text-xs font-semibold text-gray-400 uppercase tracking-widest hover:text-gray-200 transition-colors"
                  >
                    {showArchived ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
                    Archived ({workspaceFilesArchived.length})
                  </button>
                  {showArchived && workspaceFilesArchived.map(f => (
                    <FileRow key={f.name} file={f} scope="subscription"
                      actions={
                        <button onClick={() => handleUnarchive(f, 'subscription')} title="Restore"
                          className="p-0.5 text-accent hover:text-accent/80 transition-colors">
                          <RotateCcw size={13} />
                        </button>
                      }
                      deleteAction={
                        <button onClick={() => setDeleteConfirm({ file: f, scope: 'subscription' })} title="Delete permanently"
                          className="p-0.5 text-red-400 hover:text-red-300 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      }
                    />
                  ))}
                </div>
              )}
            </div>
              </div>
            )}

            <div className="space-y-0.5">
              {navBtn('sub_capability', 'Capability Behavior', Wrench, null, 'capability')}
            </div>

            {/* Capability Behavior file list — fixed set, one per capability, read/edit only */}
            {section === 'sub_capability' && (
              <div className="my-1.5 shrink-0 border border-border rounded-xl bg-surface-0/50 overflow-hidden">
                <div className="px-2 py-2.5 space-y-3 overflow-y-auto max-h-[calc(100vh-340px)]">
                  <div>
                    {capabilityFilesActive.map(f => (
                      <FileRow key={f.name} file={f} scope="subscription" actions={null} deleteAction={null} />
                    ))}
                    <p className="text-xs text-gray-600 px-2.5 py-1">One file per capability — fixed set, edit their content, but no new ones can be added here.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PLATFORM section — superadmin management sits above workspaces, not inside one */}
        {isSuperAdmin && (
          <div className="px-2 pt-3 pb-1 shrink-0 border-t border-border">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest px-2.5 mb-1">Platform</p>
            <div className="space-y-0.5">
              {navBtn('sub_superadmins', 'Superadmins',  Crown)}
            </div>
          </div>
        )}

        {/* SYSTEM section */}
        <div className="px-2 pt-3 pb-3 shrink-0 border-t border-border">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest px-2.5 mb-1">System</p>
          <div className="space-y-0.5">
            {navBtn('ai_context', 'System Behavior', BookOpen, null, 'ai_context')}
          </div>
        </div>

        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Connections panel */}
        {section === 'connections' && currentProject && (
          <div className="flex-1 overflow-y-auto px-8 py-8">
            <div className="max-w-lg">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2.5">
                  <GitBranch size={15} className="text-gray-400" />
                  <h2 className="text-base font-semibold text-gray-200">Connections</h2>
                </div>
                <button
                  onClick={() => { loadProjects(); setConnRefreshKey(k => k + 1); }}
                  title="Refresh connection status"
                  className="p-1.5 rounded-lg text-accent hover:text-accent/80 hover:bg-surface-2 transition-colors"
                >
                  <RotateCcw size={13} />
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-6">
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

        {/* Subscription overview panel */}
        {section === 'sub_overview' && isSuperAdmin && (
          <div className="flex-1 overflow-y-auto px-8 py-8">
            <div className="max-w-lg space-y-8">
              <div>
                <h2 className="text-base font-semibold text-gray-200 mb-1">Workspace</h2>
                <p className="text-sm text-gray-500 mb-6">
                  Applies to all boards in this workspace.
                </p>

                {/* Workspace name */}
                <div className="bg-surface-2 border border-border rounded-xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Workspace name</p>
                  {editingSubName ? (
                    <form onSubmit={handleSaveSubName} className="space-y-2">
                      <input
                        value={subName}
                        onChange={e => setSubName(e.target.value)}
                        autoFocus
                        className="w-full bg-surface-3 border border-accent/40 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-accent/60"
                      />
                      {subNameError && <p className="text-sm text-red-400">{subNameError}</p>}
                      <div className="flex gap-2">
                        <button type="submit" disabled={savingSubName || !subName.trim()}
                          className="px-3 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent/80 rounded-lg disabled:opacity-40">
                          {savingSubName ? 'Saving…' : 'Save'}
                        </button>
                        <button type="button" onClick={() => { setEditingSubName(false); setSubName(subscription?.name || ''); setSubNameError(''); }}
                          className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-100 transition-colors">
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-200">{subscription?.name || '—'}</p>
                      <button onClick={() => { setEditingSubName(true); setSubNameError(''); }}
                        className="p-1.5 rounded-md text-accent hover:text-accent/80 hover:bg-surface-3 transition-colors" title="Rename">
                        <Pencil size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h2 className="text-base font-semibold text-gray-200 mb-1">Editing</h2>
                <p className="text-sm text-gray-500 mb-6">
                  How changes to markdown files are saved in this workspace.
                </p>
                <div className="bg-surface-2 border border-border rounded-xl p-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-gray-200">Auto-save context files</p>
                    <p className="text-xs text-gray-500 mt-0.5 max-w-sm">
                      Applies to <b>Board Context</b> and <b>Workspace Context</b> — automatically saves shortly after you stop typing. <br /><br />
                      If turned off, edits only save when you click <b>Save</b>. 
                      <br /><br />
                      <b>Capability Behavior</b> and <b>System Behavior</b> files must never auto-save because of capability and action constraints.
                    </p>
                  </div>
                  <button
                    onClick={() => setAutoSaveContextFiles(!autoSaveContextFiles)}
                    role="switch"
                    aria-checked={autoSaveContextFiles}
                    style={{ width: 40, height: 22, flexShrink: 0 }}
                    className={`relative rounded-full transition-colors mt-0.5 ${autoSaveContextFiles ? 'bg-accent' : 'bg-surface-4 border border-border'}`}
                  >
                    <span
                      style={{ width: 16, height: 16, top: 3, left: autoSaveContextFiles ? 21 : 3 }}
                      className="absolute rounded-full bg-white shadow transition-[left]"
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Clients panel */}
        {section === 'sub_clients' && isSuperAdmin && (
          <div className="flex-1 overflow-y-auto px-8 py-8">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-semibold text-gray-200">Clients</h2>
              {!addingClient && (
                <button onClick={() => setAddingClient(true)} className="flex items-center gap-1 text-sm text-accent hover:text-accent/80 transition-colors">
                  <Plus size={12} /> Add client
                </button>
              )}
            </div>
            <p className="text-sm text-gray-500 mb-6">Companies and organisations this workspace serves.</p>

            {/* Add client modal */}
            {addingClient && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" data-modal-backdrop="static">
                <div className="bg-surface-2 border border-border rounded-xl w-full max-w-md animate-slide-in">
                  <div className="flex items-center justify-between p-5 border-b border-border">
                    <h2 className="text-base font-semibold text-gray-100">Add client</h2>
                    <button
                      type="button"
                      onClick={() => { setAddingClient(false); setClientName(''); setClientWebsite(''); setClientSector('software'); setClientError(''); }}
                      className="btn-ghost p-1.5 rounded-lg"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (!clientName.trim()) return;
                    setCreatingClient(true);
                    try {
                      await createClient({ name: clientName.trim(), website: clientWebsite.trim() || null, sector: clientSector });
                      setClientName(''); setClientWebsite(''); setClientSector('software'); setAddingClient(false); setClientError('');
                    } catch(err) {
                      setClientError(err.response?.data?.error || 'Failed to create client');
                    } finally { setCreatingClient(false); }
                  }} className="p-5 space-y-3">
                    <input value={clientName} onChange={e => setClientName(e.target.value)}
                      placeholder="Client name" autoFocus
                      className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50" />
                    <input value={clientWebsite} onChange={e => setClientWebsite(e.target.value)}
                      placeholder="Website (optional)"
                      className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50" />
                    <select value={clientSector} onChange={e => setClientSector(e.target.value)}
                      className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-accent/50">
                      {clientSectors.map(s => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                    {clientError && <p className="text-sm text-red-400">{clientError}</p>}
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => { setAddingClient(false); setClientName(''); setClientWebsite(''); setClientSector('software'); setClientError(''); }}
                        className="flex-1 py-1.5 text-sm text-gray-500 hover:text-gray-100 border border-border rounded-lg hover:bg-surface-3">Cancel</button>
                      <button type="submit" disabled={creatingClient || !clientName.trim()}
                        className="flex-1 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent/80 rounded-lg disabled:opacity-40">
                        {creatingClient ? 'Creating…' : 'Create'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Clients table — full width */}
            <SettingsTable
              columns={[
                {
                  key: 'name',
                  label: 'Client',
                  sortable: true,
                  render: (client) => (
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold"
                        style={{ background: (client.color || '#6366f1') + '20', color: client.color || '#6366f1', border: `1px solid ${(client.color || '#6366f1')}30` }}
                      >
                        {client.name[0].toUpperCase()}
                      </div>
                      {editingClientId === client.id ? (
                        <input
                          value={editClientName}
                          onChange={e => setEditClientName(e.target.value)}
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
                          onClick={e => e.stopPropagation()}
                          className="flex-1 bg-surface-3 border border-accent/40 rounded-lg px-2 py-1 text-sm text-gray-200 outline-none"
                        />
                      ) : (
                        <span className="text-sm font-medium text-gray-200 truncate">{client.name}</span>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'website',
                  label: 'Website',
                  render: (client) => client.website
                    ? <span className="text-sm text-gray-500 truncate block">{client.website}</span>
                    : <span className="text-sm text-gray-600">—</span>,
                },
                {
                  key: 'sector',
                  label: 'Sector',
                  width: '140px',
                  sortable: true,
                  render: (client) => {
                    const meta = sectorMeta[client.sector] ?? { label: client.sector || '—', color: '#6b7280' };
                    return (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
                        style={{ background: meta.color + '18', color: meta.color, border: `1px solid ${meta.color}30` }}
                      >
                        {meta.label}
                      </span>
                    );
                  },
                },
                {
                  key: 'board_count',
                  label: 'Boards',
                  sortable: true,
                  width: '80px',
                  render: (client) => (
                    <span className="text-sm text-gray-400 whitespace-nowrap">
                      {client.board_count} {client.board_count === 1 ? 'board' : 'boards'}
                    </span>
                  ),
                },
              ]}
              rows={clients.filter(c => !c.archived_at)}
              rowKey="id"
              searchKeys={['name', 'website']}
              searchPlaceholder="Search clients…"
              filters={[
                {
                  key: 'sector',
                  label: 'Sector',
                  options: clientSectors.map(s => ({ value: s.id, label: s.label })),
                },
              ]}
              emptyMessage="No clients yet"
              actions={(client) => (
                <>
                  <button
                    onClick={() => { setEditingClientId(client.id); setEditClientName(client.name); }}
                    title="Rename"
                    className="p-1.5 rounded-md text-accent hover:text-accent/80 hover:bg-surface-3 transition-colors"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => archiveClient(client.id)}
                    title="Archive"
                    className="p-1.5 rounded-md text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
                  >
                    <Archive size={12} />
                  </button>
                </>
              )}
            />
          </div>
        )}

        {/* Teams panel */}
        {section === 'sub_team' && isSuperAdmin && (
          <TeamsPanel
            teams={teams}
            loadTeams={loadTeams}
            createTeam={createTeam}
            deleteTeam={deleteTeam}
            users={users}
          />
        )}

        {/* Boards panel */}
        {section === 'sub_boards' && isSuperAdmin && (
          <BoardsPanel
            projects={projects}
            clients={clients}
            sectors={sectors}
            currentProjectId={currentProjectId}
            createProject={createProject}
            updateProject={updateProject}
            archiveProject={archiveProject}
            unarchiveProject={unarchiveProject}
            deleteProject={deleteProject}
            onSwitchBoard={(id) => { setCurrentProject(id); setCurrentPage('board'); }}
          />
        )}

        {/* Members panel */}
        {section === 'sub_members' && isSuperAdmin && (
          <MembersPanel users={users} subscriptionAdmins={subscriptionAdmins} currentUser={user} />
        )}

        {/* Superadmins panel */}
        {section === 'sub_superadmins' && isSuperAdmin && (
          <div className="flex-1 overflow-y-auto px-8 py-8">
            <div className="max-w-lg">
              <h2 className="text-base font-semibold text-gray-200 mb-1">Superadmins</h2>
              <p className="text-sm text-gray-500 mb-6">
                Superadmins have full access to all boards, teams, and members across the platform.
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
                        <div className="w-7 h-7 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-sm font-bold text-accent shrink-0">
                          {(admin.first_name?.[0] || admin.email[0]).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-gray-200 truncate">{name}</p>
                          {isSelf && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/25 uppercase tracking-wide shrink-0">You</span>
                          )}
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 uppercase tracking-wide shrink-0 flex items-center gap-0.5">
                            <Crown size={8} /> Super
                          </span>
                        </div>
                        {name !== admin.email && <p className="text-sm text-gray-500 truncate">{admin.email}</p>}
                      </div>
                      {!isSelf && subscriptionAdmins.length > 1 && (
                        <button
                          onClick={() => handleRemoveSuperAdmin(admin.user_id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
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
              {adminError   && <p className="text-sm text-red-400 mt-1.5">{adminError}</p>}
              {adminSuccess && <p className="text-sm text-green-400 mt-1.5">{adminSuccess}</p>}
            </div>
          </div>
        )}

        {/* System Behavior panel */}
        {section === 'ai_context' && <AiContextPanel />}

        {/* Benchmark Tasks panels */}
        {section === 'benchmark' && <BenchmarkPanel scope="board" />}
        {section === 'sub_benchmark' && isSuperAdmin && <BenchmarkPanel scope="workspace" />}

        {/* Editor panel — shared by board files ('files') and subscription files ('sub_files' / 'sub_capability') */}
        {(section === 'files' || section === 'sub_files' || section === 'sub_capability') && (<>
          {selectedFile ? (
            <>
              <div className="flex items-center justify-between px-6 py-3.5 border-b border-border shrink-0 bg-surface-1">
                <div className="flex items-center gap-2.5">
                  <FileText size={13} className="text-gray-400" />
                  <span className="text-sm font-semibold text-gray-200">{selectedFile.name}.md</span>
                  {selectedFile.scope === 'subscription' && (
                    <span className="flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 uppercase tracking-wide">
                      {selectedFile.kind === 'capability_behavior' ? 'capability' : 'workspace'}
                    </span>
                  )}
                  {selectedFile.archived && (
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-wide">
                      archived
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {saving && <span className="text-xs text-gray-500">Saving…</span>}
                  {saveStatus === 'saved' && (
                    <span className="flex items-center gap-1 text-xs text-green-400">
                      <Check size={10} /> Saved
                    </span>
                  )}
                  {saveStatus === 'error' && <span className="text-xs text-red-400">Save failed</span>}
                  {dirty && !saving && (
                    <>
                      <button
                        onClick={handleCancel}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-300 hover:text-gray-100 hover:bg-surface-3 rounded-lg transition-colors"
                      >
                        <XCircle size={10} /> Cancel
                      </button>
                      <button
                        onClick={saveCurrentContent}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white bg-accent hover:bg-accent/80 rounded-lg transition-colors"
                      >
                        <Save size={10} /> Save
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Visibility editor — board files only (workspace files load for all agents) */}
              {selectedFile.scope === 'board' && !selectedFile.archived && (
                <div className="shrink-0 px-6 py-2.5 border-b border-border bg-surface-1/40">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">Visible to</span>
                    {(selectedFile.capabilities?.length
                      ? selectedFile.capabilities.map(c => <CapBadge key={c} cap={c} />)
                      : <span className="text-xs px-1 py-0.5 rounded-full font-medium bg-surface-3 text-gray-500">All agents</span>)}
                    {savingCaps && <span className="text-xs text-gray-600">saving…</span>}
                    <button
                      onClick={() => setEditingCaps(v => !v)}
                      className="ml-auto text-xs text-accent hover:text-accent/80 transition-colors"
                    >
                      {editingCaps ? 'Done' : 'Edit'}
                    </button>
                  </div>
                  {editingCaps && (
                    <div className="mt-2 max-w-xs">
                      <CapabilityPicker
                        selected={selectedFile.capabilities || []}
                        onChange={handleCapabilitiesChange}
                        capabilityRoles={capabilityRoles}
                      />
                      <p className="text-xs text-gray-600 mt-1">Controls which agents load this file as context.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Editor toolbar — undo/redo today; room for format, AI validation, etc. later */}
              {!selectedFile.archived && (
                <div className="shrink-0 flex items-center gap-1 px-6 py-2 border-b border-border bg-surface-2">
                  <button
                    onClick={handleUndo} disabled={history.length === 0} title="Undo"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-300 hover:text-gray-100 hover:bg-surface-3 disabled:text-gray-600 disabled:hover:bg-transparent transition-colors"
                  >
                    <Undo2 size={15} /> Undo
                  </button>
                  <button
                    onClick={handleRedo} disabled={future.length === 0} title="Redo"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-300 hover:text-gray-100 hover:bg-surface-3 disabled:text-gray-600 disabled:hover:bg-transparent transition-colors"
                  >
                    <Redo2 size={15} /> Redo
                  </button>
                </div>
              )}

              {loadingContent ? (
                <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">Loading…</div>
              ) : (
                <textarea
                  className="flex-1 w-full bg-surface-0 text-gray-300 text-sm leading-relaxed px-8 py-6 outline-none resize-none placeholder-gray-700"
                  value={content}
                  onChange={e => handleContentChange(e.target.value)}
                  spellCheck={false}
                  placeholder="Start writing markdown…"
                  readOnly={selectedFile.archived}
                />
              )}
              {selectedFile.archived && (
                <div className="shrink-0 px-8 py-2 bg-amber-500/5 border-t border-amber-500/10 text-xs text-amber-400/70">
                  This file is archived and read-only. Restore it to edit.
                </div>
              )}
              {selectedFile.scope === 'subscription' && (
                <div className="shrink-0 px-8 py-2 bg-accent/5 border-t border-accent/10 text-xs text-accent/60">
                  {selectedFile.kind === 'capability_behavior'
                    ? 'Capability Behavior — shapes how every agent of this capability works, across every board in this workspace.'
                    : 'Workspace file — shared by all boards in this subscription.'}
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-600 gap-3">
              <FileText size={28} className="opacity-30" />
              <p className="text-sm font-medium text-gray-500">Select a file to edit</p>
              <p className="text-sm text-gray-600 max-w-xs">
                Agents read these files as context. Changes take effect on the next agent run.
              </p>
            </div>
          )}
        </>)}
      </div>

      {/* Section info modal (Board Context / Workspace Context / System Behavior explainer) */}
      <InfoModal openKey={openInfoKey} onClose={() => setOpenInfoKey(null)} />

      {/* ── Action errors ───────────────────────────────────────────────── */}
      {actionError && (
        <div className="fixed bottom-5 right-5 z-50 flex items-start gap-2.5 max-w-sm bg-surface-2 border border-red-500/30 rounded-xl px-4 py-3 shadow-xl">
          <p className="text-sm text-red-400 flex-1">{actionError}</p>
          <button onClick={() => setActionError(null)} className="text-gray-400 hover:text-gray-200 shrink-0">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Archive confirm */}
      {archiveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" data-modal-backdrop="static">
          <div className="bg-surface-1 border border-border rounded-xl w-80 shadow-xl p-5 space-y-4">
            <p className="text-base font-semibold text-gray-200">Archive "{archiveConfirm.file.name}.md"?</p>
            <p className="text-sm text-gray-500">The file will be moved to the archive. Agents referencing it will still work while it remains on disk.</p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => handleArchive(archiveConfirm.file, archiveConfirm.scope)} className="flex-1 py-1.5 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors">Archive</button>
              <button onClick={() => setArchiveConfirm(null)} className="flex-1 py-1.5 text-sm text-gray-400 hover:text-gray-200 rounded-lg border border-border transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" data-modal-backdrop="static">
          <div className="bg-surface-1 border border-border rounded-xl w-80 shadow-xl p-5 space-y-4">
            <p className="text-base font-semibold text-gray-200">Delete "{deleteConfirm.file.name}.md"?</p>
            <p className="text-sm text-gray-500">This permanently removes the file. If any agents reference it, the delete will fail and you'll be prompted to archive instead.</p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => handleDelete(deleteConfirm.file, deleteConfirm.scope)} className="flex-1 py-1.5 text-sm font-medium text-white bg-red-500 hover:bg-red-400 rounded-lg transition-colors">Delete</button>
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-1.5 text-sm text-gray-400 hover:text-gray-200 rounded-lg border border-border transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Members panel ───────────────────────────────────────────────────────────
function memberHashColor(email) {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6'];
  return colors[Math.abs(hash) % colors.length];
}

function MembersPanel({ users, subscriptionAdmins, currentUser }) {
  const [invites, setInvites]               = useState([]);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [inviteEmail, setInviteEmail]       = useState('');
  const [inviting, setInviting]             = useState(false);
  const [inviteError, setInviteError]       = useState('');
  const [inviteSuccess, setInviteSuccess]   = useState('');
  const [removingInvite, setRemovingInvite] = useState(null);

  useEffect(() => {
    invitesApi.list()
      .then(setInvites)
      .catch(() => {})
      .finally(() => setLoadingInvites(false));
  }, []);

  const superAdminEmails = new Set(
    (subscriptionAdmins || []).map(a => a.email?.toLowerCase()).filter(Boolean)
  );

  // Add a combined name field so search works across "John Smith" as one query
  const rows = users.map(u => ({
    ...u,
    _display_name: `${u.first_name || ''} ${u.last_name || ''}`.trim(),
  }));

  async function handleInvite(e) {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    setInviting(true); setInviteError(''); setInviteSuccess('');
    try {
      const result = await invitesApi.send(email);
      setInvites(prev => [...prev, result]);
      setInviteEmail('');
      setInviteSuccess(`Invite sent to ${email}`);
      setTimeout(() => setInviteSuccess(''), 3000);
    } catch (err) {
      setInviteError(err.response?.data?.error || 'Failed to send invite');
    } finally { setInviting(false); }
  }

  async function handleCancelInvite(inviteId) {
    setRemovingInvite(inviteId);
    try {
      await invitesApi.remove(inviteId);
      setInvites(prev => prev.filter(i => i.id !== inviteId));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to cancel invite');
    } finally { setRemovingInvite(null); }
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-gray-200">Members</h2>
          <span className="text-sm text-gray-500">{users.length}</span>
        </div>
        <p className="text-sm text-gray-500 mb-6">All users in this workspace.</p>

        {/* Invite form */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Invite member</p>
          <form onSubmit={handleInvite} className="flex gap-2">
            <div className="relative flex-1">
              <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <input
                value={inviteEmail}
                onChange={e => { setInviteEmail(e.target.value); setInviteError(''); }}
                placeholder="someone@example.com"
                type="email"
                className="w-full bg-surface-2 border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50"
              />
            </div>
            <button
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
              className="flex items-center gap-1.5 px-3 py-2 bg-accent hover:bg-accent/80 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 shrink-0"
            >
              <UserPlus size={13} />
              {inviting ? '…' : 'Invite'}
            </button>
          </form>
          {inviteError   && <p className="text-sm text-red-400 mt-1.5">{inviteError}</p>}
          {inviteSuccess && <p className="text-sm text-green-400 mt-1.5">{inviteSuccess}</p>}
        </div>

        {/* Pending invites */}
        {!loadingInvites && invites.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
              Pending invites ({invites.length})
            </p>
            <div className="space-y-1">
              {invites.map(inv => (
                <div key={inv.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-surface-2 group">
                  <div className="w-7 h-7 rounded-full bg-surface-3 border border-border flex items-center justify-center shrink-0">
                    <Mail size={12} className="text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-300 truncate">{inv.email}</p>
                    <p className="text-sm text-gray-600">Invite pending</p>
                  </div>
                  <button
                    onClick={() => handleCancelInvite(inv.id)}
                    disabled={removingInvite === inv.id}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-30"
                    title="Cancel invite"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Members table */}
        <SettingsTable
          columns={[
            {
              key: '_display_name',
              label: 'Member',
              sortable: true,
              render: (u) => {
                const name  = u._display_name;
                const isSelf  = u.id === currentUser?.id;
                const isAdmin = superAdminEmails.has(u.email.toLowerCase());
                const color   = memberHashColor(u.email);
                return (
                  <div className="flex items-center gap-2.5 min-w-0">
                    {u.picture ? (
                      <img src={u.picture} className="w-7 h-7 rounded-full ring-1 ring-border shrink-0" alt="" />
                    ) : (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                        style={{ background: color + '20', color, border: `1px solid ${color}30` }}
                      >
                        {(name?.[0] || u.email[0]).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium text-gray-200 truncate">{name || u.email}</span>
                        {isSelf && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/25 uppercase tracking-wide shrink-0">You</span>
                        )}
                        {isAdmin && (
                          <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 uppercase tracking-wide shrink-0">
                            <Crown size={8} /> Super
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              },
            },
            {
              key: 'email',
              label: 'Email',
              sortable: true,
              render: (u) => (
                <span className="text-sm text-gray-500 truncate block">{u.email}</span>
              ),
            },
          ]}
          rows={rows}
          rowKey="id"
          searchKeys={['_display_name', 'email']}
          searchPlaceholder="Search members…"
          emptyMessage="No members yet"
        />
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

      {/* Not connected — explain what's missing */}
      {!isConnected && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-500/25 bg-amber-500/10">
          <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-amber-300">This board is not connected to a folder</p>
            <p className="text-sm text-amber-200/70">
              Pick a local folder below, or clone a GitHub repository, so agents on this board have files to work with.
            </p>
          </div>
        </div>
      )}

      {/* Connected status */}
      {isConnected && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${project.path_exists ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <span className="text-sm font-medium text-gray-200">
              {project.repo_url ? 'Connected via GitHub' : 'Connected locally'}
            </span>
            {!project.path_exists && (
              <span className="text-sm text-amber-400 flex items-center gap-1">
                <AlertTriangle size={11} /> Folder not found
              </span>
            )}
            <span className="text-gray-600 text-sm">·</span>
            {confirmSwitch ? (
              <span className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Switch connection?</span>
                <button onClick={handleSwitch} disabled={saving}
                  className="text-red-400 hover:text-red-300 font-medium transition-colors">
                  {saving ? 'Switching…' : 'Yes'}
                </button>
                <button onClick={() => setConfirmSwitch(false)} className="text-gray-400 hover:text-gray-200 transition-colors">
                  Cancel
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmSwitch(true)}
                className="text-sm text-red-500/70 hover:text-red-400 transition-colors"
              >
                {switchLabel}
              </button>
            )}
          </div>
          {/* Show the connected URL or path */}
          {displayUrl && (
            <p className="text-sm text-gray-400 pl-4">{displayUrl}</p>
          )}
          {!project.repo_url && project.client_path && (
            <p className="text-sm text-gray-400 pl-4">{project.client_path}</p>
          )}
        </div>
      )}

      {/* Mode tabs — disabled when connected */}
      <div className={`flex gap-1 p-1 bg-surface-2 rounded-xl w-fit ${isConnected ? 'opacity-60 pointer-events-none' : ''}`}>
        {[
          { id: 'github', label: 'Clone from GitHub', icon: Github },
          { id: 'local',  label: 'Link local folder', icon: FolderOpen },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setMode(id); setError(''); setSuccess(''); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mode === id
                ? 'bg-surface-1 text-gray-200 shadow-sm'
                : 'text-gray-500 hover:text-gray-100'
            }`}
          >
            <Icon size={11} /> {label}
          </button>
        ))}
      </div>

      {/* GitHub mode */}
      {mode === 'github' && !isConnected && (
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest">
            GitHub repository URL
          </label>
          <div className="flex gap-2">
            <input
              value={repoUrl}
              onChange={e => setRepoUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleClone()}
              placeholder="https://github.com/user/repo"
              className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50"
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
          <p className="text-sm text-gray-400">
            The repository will be cloned into <span>client/</span> and connected to this board.
          </p>
        </div>
      )}

      {/* Local folder mode */}
      {mode === 'local' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Select a folder</p>
            {isConnected && !switchingFolder && (
              <button
                onClick={() => setSwitchingFolder(true)}
                className="text-sm text-gray-500 hover:text-gray-100 transition-colors"
              >
                Switch folder
              </button>
            )}
            {isConnected && switchingFolder && (
              <button
                onClick={() => { setSwitchingFolder(false); setLocalPath(project.client_path); }}
                className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>

          {basePath && (
            <div className="flex items-center gap-1.5">
              <FolderOpen size={11} className="text-gray-600 shrink-0" />
              <span className="text-sm text-gray-400 truncate">{basePath}</span>
            </div>
          )}

          {/* Folder list — grayed out when connected and not switching */}
          <div className={isConnected && !switchingFolder ? 'opacity-60 pointer-events-none' : ''}>
            {loadingFolders ? (
              <div className="flex items-center gap-2 text-gray-500 text-sm py-2">
                <Loader2 size={13} className="animate-spin" /> Loading…
              </div>
            ) : folders.length === 0 ? (
              <div className="px-4 py-6 rounded-xl border border-dashed border-border text-center">
                <p className="text-sm text-gray-500">No folders found.</p>
                <p className="text-sm text-gray-600 mt-1">Clone a GitHub repo to get started.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {folders.map(f => {
                  const selected = localPath === f.client_path;
                  const linked      = f.linked_boards || [];
                  const linkedHere  = linked.some(b => b.id === project.id);
                  const otherBoards = linked.filter(b => b.id !== project.id);
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
                      <span className="text-sm text-gray-200 flex-1 truncate">{f.name}</span>

                      {/* Who else is using this folder */}
                      {linkedHere && (
                        <span className="text-xs font-medium text-emerald-400 shrink-0 px-1.5 py-0.5 bg-emerald-500/10 rounded-md border border-emerald-500/20">
                          This board
                        </span>
                      )}
                      {otherBoards.length > 0 && (
                        <span
                          title={`Also linked to ${otherBoards.map(b => b.name).join(', ')}`}
                          className="flex items-center gap-1 text-xs text-gray-300 shrink-0 max-w-[45%] px-1.5 py-0.5 bg-surface-3 rounded-md border border-border"
                        >
                          <LinkIcon size={10} className="shrink-0 text-gray-400" />
                          <span className="truncate">
                            {otherBoards.length === 1
                              ? otherBoards[0].name
                              : `${otherBoards.length} boards`}
                          </span>
                        </span>
                      )}

                      {f.is_git && (
                        <span className="text-xs text-gray-400 shrink-0 px-1.5 py-0.5 bg-surface-3 rounded-md border border-border">git</span>
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
      {error && <p className="text-red-400 text-sm flex items-center gap-2"><XCircle size={13} />{error}</p>}
    </div>
  );
}
