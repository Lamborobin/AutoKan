import { useState, useEffect } from 'react';
import {
  Plus, Trash2, Pencil, Check, X, UserPlus, Loader2,
} from 'lucide-react';
import { teamsApi } from '../../api';
import SettingsTable from './SettingsTable';

// ── Avatar helper ─────────────────────────────────────────────────────────────
function memberHashColor(email) {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6'];
  return colors[Math.abs(hash) % colors.length];
}

function MemberAvatar({ email, name, picture }) {
  const color   = memberHashColor(email);
  const initial = (name?.[0] || email[0]).toUpperCase();
  if (picture) return <img src={picture} alt="" className="w-6 h-6 rounded-full ring-1 ring-border shrink-0" />;
  return (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
      style={{ background: color + '20', color, border: `1px solid ${color}30` }}
    >
      {initial}
    </div>
  );
}

// ── Expanded team detail (self-loading) ───────────────────────────────────────
function TeamDetailPanel({ team, users, onMembersChanged }) {
  const [members, setMembers]             = useState(null);
  const [loading, setLoading]             = useState(true);
  const [addEmail, setAddEmail]           = useState('');
  const [adding, setAdding]               = useState(false);
  const [addError, setAddError]           = useState('');
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [removing, setRemoving]           = useState(null);

  useEffect(() => {
    setLoading(true);
    teamsApi.listMembers(team.id)
      .then(setMembers)
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, [team.id]);

  const memberEmails = new Set((members || []).map(m => m.email.toLowerCase()));

  async function handleAdd(email) {
    const e = email.trim().toLowerCase();
    if (!e) return;
    setAdding(true); setAddError('');
    try {
      const result = await teamsApi.addMember(team.id, e);
      setMembers(prev => [...(prev || []), result.member]);
      setAddEmail('');
      onMembersChanged?.();
    } catch (err) {
      setAddError(err.response?.data?.error || 'Failed to add');
    } finally { setAdding(false); }
  }

  async function handleRemove(email) {
    setRemoving(email);
    try {
      await teamsApi.removeMember(team.id, email);
      setMembers(prev => (prev || []).filter(m => m.email !== email));
      onMembersChanged?.();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to remove');
    } finally { setRemoving(null); setConfirmRemove(null); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-gray-600">
        <Loader2 size={14} className="animate-spin" />
      </div>
    );
  }

  const nonMembers = (users || []).filter(u => !memberEmails.has(u.email.toLowerCase()));

  return (
    <div className="p-3 space-y-0.5">
      {/* Current members */}
      {(members || []).map(tm => {
        const name = (tm.first_name || tm.last_name)
          ? `${tm.first_name || ''} ${tm.last_name || ''}`.trim() : null;
        return (
          <div key={tm.email} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-surface-3 group transition-colors">
            <MemberAvatar email={tm.email} name={name || undefined} picture={tm.picture} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-gray-300 truncate">{name || tm.email}</p>
                {!tm.user_id && (
                  <span className="text-xs font-medium px-1 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 uppercase tracking-wide shrink-0">
                    Pending
                  </span>
                )}
              </div>
              {name && <p className="text-xs text-gray-600 truncate">{tm.email}</p>}
            </div>
            {confirmRemove === tm.email ? (
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-gray-500">Remove?</span>
                <button
                  onClick={() => handleRemove(tm.email)}
                  disabled={removing === tm.email}
                  className="px-1.5 py-0.5 text-xs font-medium text-red-400 hover:bg-red-500/10 rounded-md transition-colors disabled:opacity-30"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmRemove(null)}
                  className="px-1.5 py-0.5 text-xs text-gray-400 hover:text-gray-200 rounded-md transition-colors"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmRemove(tm.email)}
                disabled={!!removing}
                className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all disabled:opacity-30"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        );
      })}

      {/* Add existing workspace members not yet in team */}
      {nonMembers.length > 0 && (
        <div className="pt-2 pb-0.5">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest px-2 pb-1">Add member</p>
          {nonMembers.map(u => {
            const name = `${u.first_name || ''} ${u.last_name || ''}`.trim();
            return (
              <div key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-3 group transition-colors">
                <MemberAvatar email={u.email} name={name || undefined} picture={u.picture} />
                <div className="flex-1 min-w-0">
                  {name && <p className="text-sm font-medium text-gray-400 truncate">{name}</p>}
                  <p className="text-xs text-gray-600 truncate">{u.email}</p>
                </div>
                <button
                  onClick={() => handleAdd(u.email)}
                  disabled={adding}
                  className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-accent bg-accent/10 hover:bg-accent/20 rounded-lg transition-all disabled:opacity-40 shrink-0"
                >
                  <Plus size={10} /> Add
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Invite by email */}
      <form
        onSubmit={e => { e.preventDefault(); handleAdd(addEmail); }}
        className="flex gap-1.5 pt-2"
      >
        <input
          value={addEmail}
          onChange={e => { setAddEmail(e.target.value); setAddError(''); }}
          placeholder="Invite by email…"
          type="email"
          className="flex-1 bg-surface-3 border border-border rounded-lg px-2.5 py-1.5 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50 transition-colors"
        />
        <button
          type="submit"
          disabled={adding || !addEmail.trim()}
          className="px-2.5 py-1.5 bg-accent/15 hover:bg-accent/25 text-accent text-sm font-medium rounded-lg transition-colors disabled:opacity-40 shrink-0"
        >
          {adding ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
        </button>
      </form>
      {addError && <p className="text-xs text-red-400 px-1 pt-0.5">{addError}</p>}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function TeamsPanel({ teams, loadTeams, createTeam, deleteTeam, users }) {
  const [showNewTeamForm, setShowNewTeamForm] = useState(false);
  const [newTeamName, setNewTeamName]         = useState('');
  const [creatingTeam, setCreatingTeam]       = useState(false);
  const [createError, setCreateError]         = useState('');

  const [renamingTeam, setRenamingTeam]   = useState(null);
  const [renameValue, setRenameValue]     = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  async function handleCreateTeam(e) {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setCreatingTeam(true); setCreateError('');
    try {
      await createTeam({ name: newTeamName.trim() });
      setNewTeamName(''); setShowNewTeamForm(false);
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Failed to create team');
    } finally { setCreatingTeam(false); }
  }

  async function handleRename(team) {
    if (!renameValue.trim() || renameValue.trim() === team.name) {
      setRenamingTeam(null); return;
    }
    try {
      await teamsApi.update(team.id, { name: renameValue.trim() });
      await loadTeams();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to rename team');
    } finally { setRenamingTeam(null); }
  }

  async function handleDeleteTeam(team) {
    if (team.member_count > 0 && confirmDelete !== team.id) {
      setConfirmDelete(team.id); return;
    }
    try {
      await deleteTeam(team.id);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete team');
    } finally { setConfirmDelete(null); }
  }

  const columns = [
    {
      key: 'name',
      label: 'Team',
      sortable: true,
      render: (team) => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold bg-accent/15 text-accent border border-accent/20">
            {team.name[0].toUpperCase()}
          </div>
          {renamingTeam === team.id ? (
            <input
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={() => handleRename(team)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); handleRename(team); }
                if (e.key === 'Escape') setRenamingTeam(null);
              }}
              autoFocus
              onClick={e => e.stopPropagation()}
              className="flex-1 bg-surface-3 border border-accent/40 rounded-lg px-2 py-0.5 text-sm text-gray-200 outline-none min-w-0"
            />
          ) : (
            <span className="text-sm font-medium text-gray-200 truncate">{team.name}</span>
          )}
        </div>
      ),
    },
    {
      key: 'member_count',
      label: 'Members',
      sortable: true,
      width: '100px',
      render: (team) => (
        <span className="text-sm text-gray-500">
          {team.member_count} {team.member_count === 1 ? 'member' : 'members'}
        </span>
      ),
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-8 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-gray-200">Teams</h2>
          {!showNewTeamForm && (
            <button
              onClick={() => { setShowNewTeamForm(true); setNewTeamName(''); setCreateError(''); }}
              className="flex items-center gap-1 text-sm text-accent hover:text-accent/80 transition-colors"
            >
              <Plus size={12} /> New team
            </button>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-6">Teams group workspace members for board assignment.</p>

        {/* Create form */}
        {showNewTeamForm && (
          <form onSubmit={handleCreateTeam} className="border border-border rounded-xl p-3 space-y-2 mb-4 bg-surface-2">
            <input
              value={newTeamName}
              onChange={e => { setNewTeamName(e.target.value); setCreateError(''); }}
              onKeyDown={e => e.key === 'Escape' && (setShowNewTeamForm(false), setNewTeamName(''))}
              placeholder="Team name…"
              autoFocus
              className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50"
            />
            {createError && <p className="text-sm text-red-400">{createError}</p>}
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => { setShowNewTeamForm(false); setNewTeamName(''); setCreateError(''); }}
                className="flex-1 py-1.5 text-sm text-gray-500 hover:text-gray-100 border border-border rounded-lg hover:bg-surface-3 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingTeam || !newTeamName.trim()}
                className="flex-1 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent/80 rounded-lg disabled:opacity-40 transition-colors"
              >
                {creatingTeam ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        )}

        {/* Table — click row to expand member panel */}
        <SettingsTable
          columns={columns}
          rows={teams}
          rowKey="id"
          searchKeys={['name']}
          searchPlaceholder="Search teams…"
          emptyMessage="No teams yet"
          actions={(team) => (
            <>
              <button
                onClick={() => { setRenamingTeam(team.id); setRenameValue(team.name); }}
                title="Rename"
                className="p-1.5 rounded-lg text-accent hover:text-accent/80 hover:bg-surface-3 transition-colors"
              >
                <Pencil size={12} />
              </button>
              {confirmDelete === team.id ? (
                <span className="flex items-center gap-1">
                  <span className="text-xs text-amber-400 whitespace-nowrap">
                    {team.member_count > 0 ? `Delete (${team.member_count})?` : 'Delete?'}
                  </span>
                  <button
                    onClick={() => handleDeleteTeam(team)}
                    className="px-1.5 py-0.5 text-xs font-medium text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="px-1.5 py-0.5 text-xs text-gray-400 hover:text-gray-200 rounded-md transition-colors"
                  >
                    No
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => handleDeleteTeam(team)}
                  title="Delete team"
                  className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </>
          )}
          rowDetail={(team) => (
            <TeamDetailPanel
              key={team.id}
              team={team}
              users={users}
              onMembersChanged={loadTeams}
            />
          )}
        />

    </div>
  );
}
