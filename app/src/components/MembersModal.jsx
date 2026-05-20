import { useState, useEffect } from 'react';
import { Users, X, Plus, Trash2, UserPlus, ChevronDown, ChevronRight, Check, Copy, AlertCircle } from 'lucide-react';
import { useStore } from '../store';
import { teamsApi } from '../api';

function Avatar({ email, name, picture, size = 'md' }) {
  const sizeClass = size === 'sm' ? 'w-6 h-6 text-[9px]' : 'w-8 h-8 text-xs';

  // Generate consistent color from email
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6'];
  const color = colors[Math.abs(hash) % colors.length];

  const initials = name
    ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : email[0].toUpperCase();

  if (picture) return <img src={picture} alt="" className={`${sizeClass} rounded-full ring-1 ring-border shrink-0`} />;
  return (
    <div className={`${sizeClass} rounded-full flex items-center justify-center text-white font-bold shrink-0`} style={{ background: color }}>
      {initials}
    </div>
  );
}

function MemberRow({ member, currentUserEmail, onRemove, removing }) {
  const name = (member.first_name || member.last_name)
    ? `${member.first_name || ''} ${member.last_name || ''}`.trim()
    : null;
  const isSelf = member.email === currentUserEmail;
  const isPending = !member.accepted_at;

  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-surface-3 transition-colors group">
      <Avatar email={member.email} name={name} picture={member.picture} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-gray-200 truncate">{name || member.email}</p>
          {isSelf && (
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/25 uppercase tracking-wide shrink-0">
              You
            </span>
          )}
          {isPending && (
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 uppercase tracking-wide shrink-0">
              Pending
            </span>
          )}
        </div>
        {name && <p className="text-xs text-gray-500 truncate">{member.email}</p>}
      </div>
      {!isSelf && (
        <button
          onClick={() => onRemove(member.id)}
          disabled={removing === member.id}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-30"
          title="Remove from board"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

export default function MembersModal({ onClose }) {
  const { user, boardMembers, loadBoardMembers, addBoardMember, removeBoardMember, addTeamToBoard, teams, loadTeams, createTeam, deleteTeam } = useStore();
  const [activeTab, setActiveTab] = useState('members');

  // Board Members tab state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [removingMember, setRemovingMember] = useState(null);
  const [copiedLink, setCopiedLink] = useState('');

  // Teams tab state
  const [expandedTeam, setExpandedTeam] = useState(null);
  const [teamMembers, setTeamMembers] = useState({}); // { teamId: members[] }
  const [teamAddEmail, setTeamAddEmail] = useState('');
  const [teamAddingEmail, setTeamAddingEmail] = useState(null); // which team is adding
  const [addingToBoard, setAddingToBoard] = useState(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [showNewTeamForm, setShowNewTeamForm] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [removingTeamMember, setRemovingTeamMember] = useState(null); // 'teamId:email'

  useEffect(() => {
    loadBoardMembers();
    loadTeams();
  }, []);

  async function handleExpandTeam(teamId) {
    if (expandedTeam === teamId) { setExpandedTeam(null); return; }
    setExpandedTeam(teamId);
    if (!teamMembers[teamId]) {
      try {
        const members = await teamsApi.listMembers(teamId);
        setTeamMembers(prev => ({ ...prev, [teamId]: members }));
      } catch {}
    }
  }

  async function handleInvite(e) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError('');
    setInviteSuccess('');
    try {
      const result = await addBoardMember(inviteEmail.trim().toLowerCase());
      if (result.inviteUrl) {
        setInviteSuccess(`Invite sent! Share link: ${result.inviteUrl}`);
        setCopiedLink(result.inviteUrl);
      } else {
        setInviteSuccess(result.sent ? 'Invite email sent!' : `${inviteEmail} added to board`);
        setCopiedLink('');
      }
      setInviteEmail('');
    } catch (e) {
      setInviteError(e.response?.data?.error || 'Failed to add member');
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember(memberId) {
    setRemovingMember(memberId);
    try {
      await removeBoardMember(memberId);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to remove member');
    } finally {
      setRemovingMember(null);
    }
  }

  async function handleAddTeamToBoard(teamId) {
    setAddingToBoard(teamId);
    try {
      const result = await addTeamToBoard(teamId);
      const added = result.added?.length || 0;
      const skipped = result.skipped?.length || 0;
      alert(`Added ${added} member(s) to board${skipped > 0 ? `, ${skipped} already were members` : ''}`);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to add team to board');
    } finally {
      setAddingToBoard(null);
    }
  }

  async function handleAddTeamMember(teamId, e) {
    e.preventDefault();
    if (!teamAddEmail.trim()) return;
    setTeamAddingEmail(teamId);
    setTeamError('');
    try {
      const result = await teamsApi.addMember(teamId, teamAddEmail.trim().toLowerCase());
      setTeamMembers(prev => ({
        ...prev,
        [teamId]: [...(prev[teamId] || []), result.member]
      }));
      setTeamAddEmail('');
      setTeamAddingEmail(null);
      loadTeams();
    } catch (e) {
      setTeamError(e.response?.data?.error || 'Failed to add member');
      setTeamAddingEmail(null);
    }
  }

  async function handleRemoveTeamMember(teamId, email) {
    const key = `${teamId}:${email}`;
    setRemovingTeamMember(key);
    try {
      await teamsApi.removeMember(teamId, email);
      setTeamMembers(prev => ({
        ...prev,
        [teamId]: (prev[teamId] || []).filter(m => m.email !== email)
      }));
      loadTeams();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to remove member');
    } finally {
      setRemovingTeamMember(null);
    }
  }

  async function handleCreateTeam(e) {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setCreatingTeam(true);
    try {
      await createTeam({ name: newTeamName.trim() });
      setNewTeamName('');
      setShowNewTeamForm(false);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to create team');
    } finally {
      setCreatingTeam(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-accent" />
            <h2 className="text-sm font-semibold text-gray-200">Members</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-surface-3 transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          {[['members', 'Board Members'], ['teams', 'Teams']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeTab === id
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
              {id === 'members' && boardMembers.length > 0 && (
                <span className="ml-1.5 text-xs font-mono text-gray-600">{boardMembers.length}</span>
              )}
              {id === 'teams' && teams.length > 0 && (
                <span className="ml-1.5 text-xs font-mono text-gray-600">{teams.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {/* ── Board Members Tab ── */}
          {activeTab === 'members' && (
            <div className="p-4 space-y-4">
              {/* Invite form */}
              <form onSubmit={handleInvite} className="flex gap-2">
                <input
                  value={inviteEmail}
                  onChange={e => { setInviteEmail(e.target.value); setInviteError(''); setInviteSuccess(''); }}
                  placeholder="Email address…"
                  type="email"
                  className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50 transition-colors"
                />
                <button
                  type="submit"
                  disabled={inviting || !inviteEmail.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-accent hover:bg-accent/80 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 shrink-0"
                >
                  <UserPlus size={14} />
                  {inviting ? 'Adding…' : 'Add'}
                </button>
              </form>

              {inviteError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertCircle size={13} className="text-red-400 shrink-0" />
                  <p className="text-xs text-red-400">{inviteError}</p>
                </div>
              )}

              {inviteSuccess && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Check size={13} className="text-green-400 shrink-0" />
                    <p className="text-xs text-green-400 break-all">{inviteSuccess}</p>
                  </div>
                  {copiedLink && (
                    <button
                      onClick={() => { navigator.clipboard.writeText(copiedLink); }}
                      className="shrink-0 p-1 rounded text-green-400 hover:bg-green-500/20 transition-colors"
                      title="Copy link"
                    >
                      <Copy size={12} />
                    </button>
                  )}
                </div>
              )}

              {/* Members list */}
              <div className="space-y-0.5">
                {boardMembers.length === 0 ? (
                  <p className="text-sm text-gray-600 text-center py-6">No members yet. Invite someone above.</p>
                ) : (
                  boardMembers.map(member => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      currentUserEmail={user?.email}
                      onRemove={handleRemoveMember}
                      removing={removingMember}
                    />
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── Teams Tab ── */}
          {activeTab === 'teams' && (
            <div className="p-4 space-y-2">
              {teams.length === 0 && !showNewTeamForm && (
                <p className="text-sm text-gray-600 text-center py-6">No teams yet.</p>
              )}

              {teams.map(team => (
                <div key={team.id} className="border border-border rounded-xl overflow-hidden">
                  {/* Team header */}
                  <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-surface-3 transition-colors">
                    <button
                      onClick={() => handleExpandTeam(team.id)}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    >
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: team.color + '20', border: `1px solid ${team.color}40` }}>
                        <span className="text-[10px] font-bold" style={{ color: team.color }}>{team.name[0]}</span>
                      </div>
                      <span className="text-sm font-medium text-gray-200 flex-1 truncate">{team.name}</span>
                      <span className="text-xs text-gray-600 mr-1">{team.member_count} member{team.member_count !== 1 ? 's' : ''}</span>
                      {expandedTeam === team.id ? <ChevronDown size={13} className="text-gray-500 shrink-0" /> : <ChevronRight size={13} className="text-gray-500 shrink-0" />}
                    </button>
                    <button
                      onClick={() => handleAddTeamToBoard(team.id)}
                      disabled={addingToBoard === team.id}
                      title="Add all team members to current board"
                      className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/10 rounded-lg transition-colors disabled:opacity-40 shrink-0"
                    >
                      <Plus size={11} />
                      {addingToBoard === team.id ? '…' : 'Add to board'}
                    </button>
                  </div>

                  {/* Team members (expanded) */}
                  {expandedTeam === team.id && (
                    <div className="border-t border-border bg-surface-2">
                      <div className="p-2 space-y-0.5">
                        {(teamMembers[team.id] || []).map(tm => {
                          const name = (tm.first_name || tm.last_name) ? `${tm.first_name || ''} ${tm.last_name || ''}`.trim() : null;
                          const isSelf = tm.email === user?.email;
                          const key = `${team.id}:${tm.email}`;
                          return (
                            <div key={tm.email} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-surface-3 group transition-colors">
                              <Avatar email={tm.email} name={name} picture={tm.picture} size="sm" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-xs font-medium text-gray-300 truncate">{name || tm.email}</p>
                                  {isSelf && <span className="text-[8px] font-medium px-1 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/25 uppercase tracking-wide shrink-0">You</span>}
                                  {!tm.user_id && <span className="text-[8px] font-medium px-1 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 uppercase tracking-wide shrink-0">Pending</span>}
                                </div>
                                {name && <p className="text-[10px] text-gray-600 truncate">{tm.email}</p>}
                              </div>
                              {!isSelf && (
                                <button
                                  onClick={() => handleRemoveTeamMember(team.id, tm.email)}
                                  disabled={removingTeamMember === key}
                                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-30"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          );
                        })}

                        {/* Add member to team */}
                        <form onSubmit={(e) => handleAddTeamMember(team.id, e)} className="flex gap-1.5 pt-1">
                          <input
                            value={teamAddingEmail === team.id ? teamAddEmail : ''}
                            onChange={e => { setTeamAddEmail(e.target.value); setTeamError(''); }}
                            onFocus={() => { setTeamAddingEmail(team.id); setTeamAddEmail(''); }}
                            placeholder="Add by email…"
                            type="email"
                            className="flex-1 bg-surface-3 border border-border rounded-lg px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50 transition-colors"
                          />
                          <button
                            type="submit"
                            disabled={teamAddingEmail !== team.id || !teamAddEmail.trim()}
                            className="px-2.5 py-1.5 bg-accent/15 hover:bg-accent/25 text-accent text-xs font-medium rounded-lg transition-colors disabled:opacity-40 shrink-0"
                          >
                            <Plus size={12} />
                          </button>
                        </form>
                        {teamError && teamAddingEmail === team.id && (
                          <p className="text-[11px] text-red-400 px-1">{teamError}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Create team */}
              {showNewTeamForm ? (
                <form onSubmit={handleCreateTeam} className="border border-border rounded-xl p-3 space-y-2">
                  <p className="text-xs font-medium text-gray-400">New team</p>
                  <input
                    value={newTeamName}
                    onChange={e => setNewTeamName(e.target.value)}
                    placeholder="Team name…"
                    autoFocus
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50 transition-colors"
                  />
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => setShowNewTeamForm(false)}
                      className="flex-1 py-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors border border-border rounded-lg hover:bg-surface-3">
                      Cancel
                    </button>
                    <button type="submit" disabled={creatingTeam || !newTeamName.trim()}
                      className="flex-1 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent/80 rounded-lg transition-colors disabled:opacity-40">
                      {creatingTeam ? 'Creating…' : 'Create'}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setShowNewTeamForm(true)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-border text-gray-500 hover:text-gray-300 hover:border-gray-500 text-sm transition-colors"
                >
                  <Plus size={14} />
                  New team
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
