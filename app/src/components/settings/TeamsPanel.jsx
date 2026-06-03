import { useState } from 'react';
import {
  Plus, Trash2, ChevronDown, ChevronRight, Pencil,
  Check, X, UserPlus, Loader2,
} from 'lucide-react';
import { teamsApi } from '../../api';

function memberHashColor(email) {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6'];
  return colors[Math.abs(hash) % colors.length];
}

function MemberAvatar({ email, name, picture }) {
  const color = memberHashColor(email);
  const initial = (name?.[0] || email[0]).toUpperCase();
  if (picture) return <img src={picture} alt="" className="w-6 h-6 rounded-full ring-1 ring-border shrink-0" />;
  return (
    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
      style={{ background: color + '20', color, border: `1px solid ${color}30` }}>
      {initial}
    </div>
  );
}

export default function TeamsPanel({ teams, loadTeams, createTeam, deleteTeam, users }) {
  const [showNewTeamForm, setShowNewTeamForm]   = useState(false);
  const [newTeamName, setNewTeamName]           = useState('');
  const [creatingTeam, setCreatingTeam]         = useState(false);
  const [createError, setCreateError]           = useState('');

  const [expandedTeam, setExpandedTeam]         = useState(null);
  const [teamMembers, setTeamMembers]           = useState({});
  const [loadingMembers, setLoadingMembers]     = useState(null);

  const [renamingTeam, setRenamingTeam]         = useState(null);
  const [renameValue, setRenameValue]           = useState('');

  const [teamAddEmail, setTeamAddEmail]         = useState({});
  const [teamAddingId, setTeamAddingId]         = useState(null);
  const [teamError, setTeamError]               = useState({});

  const [confirmDeleteTeam, setConfirmDeleteTeam]     = useState(null);
  const [confirmRemoveMember, setConfirmRemoveMember] = useState(null);
  const [removingMember, setRemovingMember]           = useState(null);

  async function handleExpandTeam(teamId) {
    if (expandedTeam === teamId) { setExpandedTeam(null); return; }
    setExpandedTeam(teamId);
    if (!teamMembers[teamId]) {
      setLoadingMembers(teamId);
      try {
        const members = await teamsApi.listMembers(teamId);
        setTeamMembers(prev => ({ ...prev, [teamId]: members }));
      } catch {}
      finally { setLoadingMembers(null); }
    }
  }

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
    if (!renameValue.trim() || renameValue.trim() === team.name) { setRenamingTeam(null); return; }
    try {
      await teamsApi.update(team.id, { name: renameValue.trim() });
      await loadTeams();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to rename team');
    } finally { setRenamingTeam(null); }
  }

  async function handleDeleteTeam(team) {
    if (team.member_count > 0 && confirmDeleteTeam !== team.id) {
      setConfirmDeleteTeam(team.id); return;
    }
    try {
      await deleteTeam(team.id);
      if (expandedTeam === team.id) setExpandedTeam(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete team');
    } finally { setConfirmDeleteTeam(null); }
  }

  async function handleAddMember(teamId, email) {
    setTeamAddingId(teamId);
    setTeamError(prev => ({ ...prev, [teamId]: '' }));
    try {
      const result = await teamsApi.addMember(teamId, email.toLowerCase());
      setTeamMembers(prev => ({ ...prev, [teamId]: [...(prev[teamId] || []), result.member] }));
      setTeamAddEmail(prev => ({ ...prev, [teamId]: '' }));
      loadTeams();
    } catch (err) {
      setTeamError(prev => ({ ...prev, [teamId]: err.response?.data?.error || 'Failed to add' }));
    } finally { setTeamAddingId(null); }
  }

  async function handleRemoveMember(teamId, email) {
    const key = `${teamId}:${email}`;
    setRemovingMember(key);
    try {
      await teamsApi.removeMember(teamId, email);
      setTeamMembers(prev => ({ ...prev, [teamId]: (prev[teamId] || []).filter(m => m.email !== email) }));
      loadTeams();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to remove');
    } finally {
      setRemovingMember(null);
      setConfirmRemoveMember(null);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-8">
      <div className="max-w-lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-semibold text-gray-200">Teams</h2>
          {!showNewTeamForm && (
            <button
              onClick={() => { setShowNewTeamForm(true); setNewTeamName(''); setCreateError(''); }}
              className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
            >
              <Plus size={12} /> New team
            </button>
          )}
        </div>

        {/* New team form */}
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
            {createError && <p className="text-xs text-red-400">{createError}</p>}
            <div className="flex gap-1.5">
              <button type="button"
                onClick={() => { setShowNewTeamForm(false); setNewTeamName(''); setCreateError(''); }}
                className="flex-1 py-1.5 text-sm text-gray-500 hover:text-gray-300 border border-border rounded-lg hover:bg-surface-3 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={creatingTeam || !newTeamName.trim()}
                className="flex-1 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent/80 rounded-lg disabled:opacity-40 transition-colors">
                {creatingTeam ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        )}

        {/* Team list */}
        {teams.length === 0 && !showNewTeamForm ? (
          <p className="text-sm text-gray-600 text-center py-8">No teams yet.</p>
        ) : (
          <div className="space-y-2">
            {teams.map(team => {
              const members   = teamMembers[team.id] || [];
              const teamEmails = new Set(members.map(m => m.email.toLowerCase()));
              const isExpanded = expandedTeam === team.id;
              const isLoading  = loadingMembers === team.id;

              return (
                <div key={team.id} className="border border-border rounded-xl overflow-hidden">

                  {/* Team header row */}
                  <div className="flex items-center">
                    <button
                      onClick={() => handleExpandTeam(team.id)}
                      className="flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2.5 hover:bg-surface-3/50 transition-colors text-left"
                    >
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold bg-accent/15 text-accent border border-accent/20">
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
                        <span className="text-sm font-medium text-gray-200 flex-1 truncate">{team.name}</span>
                      )}

                      <span className="text-xs text-gray-600 shrink-0">
                        {team.member_count} member{team.member_count !== 1 ? 's' : ''}
                      </span>
                      {isExpanded
                        ? <ChevronDown size={13} className="text-gray-500 shrink-0" />
                        : <ChevronRight size={13} className="text-gray-500 shrink-0" />}
                    </button>

                    {/* Rename button */}
                    <button
                      onClick={() => { setRenamingTeam(team.id); setRenameValue(team.name); }}
                      className="p-2 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-surface-3 transition-colors shrink-0"
                      title="Rename"
                    >
                      <Pencil size={12} />
                    </button>

                    {/* Delete button with confirm */}
                    {confirmDeleteTeam === team.id ? (
                      <div className="flex items-center gap-1 px-2 shrink-0">
                        <span className="text-[10px] text-amber-400 whitespace-nowrap">
                          {team.member_count > 0 ? `Delete (${team.member_count} members)?` : 'Delete?'}
                        </span>
                        <button onClick={() => handleDeleteTeam(team)}
                          className="px-1.5 py-0.5 text-[10px] font-medium text-red-400 hover:bg-red-500/10 rounded transition-colors">
                          Yes
                        </button>
                        <button onClick={() => setConfirmDeleteTeam(null)}
                          className="px-1.5 py-0.5 text-[10px] text-gray-600 hover:text-gray-400 rounded transition-colors">
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleDeleteTeam(team)}
                        title={team.member_count > 0 ? 'Delete team' : 'Delete team'}
                        className="p-2 mr-1 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>

                  {/* Expanded: members + add */}
                  {isExpanded && (
                    <div className="border-t border-border bg-surface-2">
                      <div className="p-2 space-y-0.5">

                        {isLoading ? (
                          <div className="flex items-center justify-center py-4 text-gray-600">
                            <Loader2 size={14} className="animate-spin" />
                          </div>
                        ) : (
                          <>
                            {/* Current members */}
                            {members.map(tm => {
                              const name = (tm.first_name || tm.last_name)
                                ? `${tm.first_name || ''} ${tm.last_name || ''}`.trim() : null;
                              const key = `${team.id}:${tm.email}`;
                              return (
                                <div key={tm.email} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-surface-3 group transition-colors">
                                  <MemberAvatar email={tm.email} name={name} picture={tm.picture} />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-xs font-medium text-gray-300 truncate">{name || tm.email}</p>
                                      {!tm.user_id && (
                                        <span className="text-[8px] font-medium px-1 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 uppercase tracking-wide shrink-0">Pending</span>
                                      )}
                                    </div>
                                    {name && <p className="text-[10px] text-gray-600 truncate">{tm.email}</p>}
                                  </div>
                                  {confirmRemoveMember === key ? (
                                    <div className="flex items-center gap-1 shrink-0">
                                      <span className="text-[10px] text-gray-500">Remove?</span>
                                      <button
                                        onClick={() => handleRemoveMember(team.id, tm.email)}
                                        disabled={removingMember === key}
                                        className="px-1.5 py-0.5 text-[10px] font-medium text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-30"
                                      >
                                        Yes
                                      </button>
                                      <button onClick={() => setConfirmRemoveMember(null)}
                                        className="px-1.5 py-0.5 text-[10px] text-gray-600 hover:text-gray-400 rounded transition-colors">
                                        No
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setConfirmRemoveMember(key)}
                                      disabled={removingMember === key}
                                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-30"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </div>
                              );
                            })}

                            {/* Quick-add existing users not yet in team */}
                            {users.filter(u => !teamEmails.has(u.email.toLowerCase())).length > 0 && (
                              <div className="pt-1 pb-0.5">
                                <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest px-2 pb-1">Add member</p>
                                {users
                                  .filter(u => !teamEmails.has(u.email.toLowerCase()))
                                  .map(u => {
                                    const name = `${u.first_name || ''} ${u.last_name || ''}`.trim();
                                    return (
                                      <div key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-3 group transition-colors">
                                        <MemberAvatar email={u.email} name={name || undefined} picture={u.picture} />
                                        <div className="flex-1 min-w-0">
                                          {name && <p className="text-xs font-medium text-gray-400 truncate">{name}</p>}
                                          <p className="text-[10px] text-gray-600 truncate">{u.email}</p>
                                        </div>
                                        <button
                                          onClick={() => handleAddMember(team.id, u.email)}
                                          disabled={teamAddingId === team.id}
                                          className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-accent bg-accent/10 hover:bg-accent/20 rounded-lg transition-all disabled:opacity-40 shrink-0"
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
                              onSubmit={e => {
                                e.preventDefault();
                                const v = (teamAddEmail[team.id] || '').trim();
                                if (v) handleAddMember(team.id, v);
                              }}
                              className="flex gap-1.5 pt-1"
                            >
                              <input
                                value={teamAddEmail[team.id] || ''}
                                onChange={e => setTeamAddEmail(prev => ({ ...prev, [team.id]: e.target.value }))}
                                placeholder="Invite by email…"
                                type="email"
                                className="flex-1 bg-surface-3 border border-border rounded-lg px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50 transition-colors"
                              />
                              <button
                                type="submit"
                                disabled={teamAddingId === team.id || !(teamAddEmail[team.id] || '').trim()}
                                className="px-2.5 py-1.5 bg-accent/15 hover:bg-accent/25 text-accent text-xs font-medium rounded-lg transition-colors disabled:opacity-40 shrink-0"
                              >
                                <UserPlus size={12} />
                              </button>
                            </form>
                            {teamError[team.id] && (
                              <p className="text-[11px] text-red-400 px-1 pt-0.5">{teamError[team.id]}</p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
