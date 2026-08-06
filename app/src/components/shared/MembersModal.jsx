import { useState, useEffect } from 'react';
import { Users, X, Plus, Trash2, UserPlus, ChevronDown, ChevronRight, Check, Copy, AlertCircle, Mail, Pencil, Shield } from 'lucide-react';
import { useStore } from '../../store';
import { teamsApi } from '../../api';

function Avatar({ email, name, picture, size = 'md' }) {
  const sizeClass = size === 'sm' ? 'w-6 h-6 text-[9px]' : 'w-8 h-8 text-xs';
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

function getRoleIds(member) {
  try {
    return typeof member.role_ids === 'string'
      ? JSON.parse(member.role_ids)
      : (member.role_ids || ['role_access_any']);
  } catch { return ['role_access_any']; }
}

function RolePill({ color, label }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium shrink-0"
      style={{ background: color + '22', color, border: `1px solid ${color}44` }}>
      {label}
    </span>
  );
}

export default function MembersModal({ onClose }) {
  const {
    user, users, isSuperAdmin,
    boardMembers, loadBoardMembers, addBoardMember, removeBoardMember, updateBoardMemberRoles,
    teams, loadTeams, createTeam, deleteTeam,
    roles,
    subscriptionAdmins,
  } = useStore();
  const [activeTab, setActiveTab] = useState('members');

  // Board Members tab
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [copiedLink, setCopiedLink] = useState('');
  const [removingMember, setRemovingMember] = useState(null);
  const [addingUser, setAddingUser] = useState(null);

  // Role editing
  const [editingRoles, setEditingRoles] = useState(null);       // memberId being edited
  const [pendingRoles, setPendingRoles] = useState({});          // { [memberId]: string[] }
  const [savingRoles, setSavingRoles] = useState(null);          // memberId being saved

  // Teams tab
  const [expandedTeam, setExpandedTeam] = useState(null);
  const [teamMembers, setTeamMembers] = useState({});
  const [teamAddEmail, setTeamAddEmail] = useState({});
  const [teamAddingId, setTeamAddingId] = useState(null);
  const [teamError, setTeamError] = useState({});
  const [removingTeamMember, setRemovingTeamMember] = useState(null);
  const [confirmRemoveTeamMember, setConfirmRemoveTeamMember] = useState(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [showNewTeamForm, setShowNewTeamForm] = useState(false);
  const [confirmDeleteTeam, setConfirmDeleteTeam] = useState(null);

  useEffect(() => { loadBoardMembers(); loadTeams(); }, []);

  // Users not yet on this board — available to add directly
  const boardMemberEmails = new Set(boardMembers.map(m => m.email.toLowerCase()));
  const addableUsers = users.filter(u => u.id !== user?.id && !boardMemberEmails.has(u.email.toLowerCase()));

  // Superadmin set for fast lookup
  const superAdminEmails = new Set((subscriptionAdmins || []).map(a => a.email?.toLowerCase()).filter(Boolean));
  const superAdminUserIds = new Set((subscriptionAdmins || []).map(a => a.user_id).filter(Boolean));
  function isSuperAdminMember(member) {
    return superAdminEmails.has(member.email?.toLowerCase()) || superAdminUserIds.has(member.user_id);
  }

  // Role buckets
  const columnRoles = roles.filter(r => r.type === 'column_access');
  const permRoles = roles.filter(r => r.type === 'permission');
  const allColumnsChecked = (ids) => ids.includes('role_access_any');

  // ── Role editing helpers ───────────────────────────────────────────────────
  function openRoleEditor(member) {
    setEditingRoles(member.id);
    setPendingRoles(prev => ({ ...prev, [member.id]: getRoleIds(member) }));
  }

  function closeRoleEditor() {
    setEditingRoles(null);
  }

  function toggleRole(memberId, roleId) {
    setPendingRoles(prev => {
      const current = prev[memberId] || [];
      const next = current.includes(roleId)
        ? current.filter(r => r !== roleId)
        : [...current, roleId];
      return { ...prev, [memberId]: next };
    });
  }

  async function handleSaveRoles(memberId) {
    const roleIds = pendingRoles[memberId] ?? getRoleIds(boardMembers.find(m => m.id === memberId));
    setSavingRoles(memberId);
    try {
      await updateBoardMemberRoles(memberId, roleIds);
      setEditingRoles(null);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to update roles');
    } finally {
      setSavingRoles(null);
    }
  }

  // ── Board member handlers ──────────────────────────────────────────────────
  async function handleAddExistingUser(u) {
    setAddingUser(u.id);
    setInviteError('');
    try {
      await addBoardMember(u.email);
    } catch (e) {
      setInviteError(e.response?.data?.error || 'Failed to add');
    } finally {
      setAddingUser(null);
    }
  }

  async function handleInviteByEmail(e) {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    setInviting(true); setInviteError(''); setInviteSuccess(''); setCopiedLink('');
    try {
      const result = await addBoardMember(email);
      if (result.inviteUrl) {
        setInviteSuccess('Invite link ready — copy and share it');
        setCopiedLink(result.inviteUrl);
      } else {
        setInviteSuccess(result.sent ? 'Invite email sent!' : `${email} added to board`);
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
    try { await removeBoardMember(memberId); }
    catch (e) { alert(e.response?.data?.error || 'Failed to remove member'); }
    finally { setRemovingMember(null); }
  }

  // ── Team handlers ──────────────────────────────────────────────────────────
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

  async function handleAddTeamMember(teamId, email) {
    setTeamAddingId(teamId);
    setTeamError(prev => ({ ...prev, [teamId]: '' }));
    try {
      const result = await teamsApi.addMember(teamId, email.toLowerCase());
      setTeamMembers(prev => ({ ...prev, [teamId]: [...(prev[teamId] || []), result.member] }));
      setTeamAddEmail(prev => ({ ...prev, [teamId]: '' }));
      loadTeams();
    } catch (e) {
      setTeamError(prev => ({ ...prev, [teamId]: e.response?.data?.error || 'Failed to add' }));
    } finally {
      setTeamAddingId(null);
    }
  }

  async function handleRemoveTeamMember(teamId, email) {
    const key = `${teamId}:${email}`;
    setRemovingTeamMember(key);
    try {
      await teamsApi.removeMember(teamId, email);
      setTeamMembers(prev => ({ ...prev, [teamId]: (prev[teamId] || []).filter(m => m.email !== email) }));
      loadTeams();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to remove');
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
      setNewTeamName(''); setShowNewTeamForm(false);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to create team');
    } finally {
      setCreatingTeam(false);
    }
  }

  // Empty team → delete immediately. Team with members → confirm, then archive.
  async function handleDeleteTeam(team) {
    if (team.member_count > 0 && confirmDeleteTeam !== team.id) {
      setConfirmDeleteTeam(team.id);
      return;
    }
    try {
      await deleteTeam(team.id);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to delete team');
    } finally {
      setConfirmDeleteTeam(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" data-modal-backdrop="static">
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
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeTab === id ? 'text-accent border-b-2 border-accent' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
              {id === 'members' && boardMembers.length > 0 && <span className="ml-1.5 text-xs text-gray-600">{boardMembers.length}</span>}
              {id === 'teams'   && teams.length > 0           && <span className="ml-1.5 text-xs text-gray-600">{teams.length}</span>}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1">

          {/* ── Board Members Tab ──────────────────────────────────────── */}
          {activeTab === 'members' && (
            <div className="divide-y divide-border">

              {/* Current board members */}
              <div className="p-4 space-y-0.5">
                {boardMembers.length === 0 ? (
                  <p className="text-sm text-gray-600 text-center py-4">No members yet.</p>
                ) : boardMembers.map(member => {
                  const name = (member.first_name || member.last_name)
                    ? `${member.first_name || ''} ${member.last_name || ''}`.trim() : null;
                  const isSelf = member.email === user?.email;
                  const isSuperAdmin = isSuperAdminMember(member);
                  const memberRoleIds = getRoleIds(member);
                  const isEditing = editingRoles === member.id;
                  const editRoleIds = isEditing ? (pendingRoles[member.id] || memberRoleIds) : memberRoleIds;
                  const memberRoles = roles.filter(r => memberRoleIds.includes(r.id));

                  return (
                    <div key={member.id} className="rounded-xl overflow-hidden">
                      {/* Member row */}
                      <div className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-surface-3 transition-colors group">
                        <Avatar email={member.email} name={name} picture={member.picture} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-medium text-gray-200 truncate">{name || member.email}</p>
                            {isSelf && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/25 uppercase tracking-wide shrink-0">You</span>}
                            {!member.accepted_at && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 uppercase tracking-wide shrink-0">Pending</span>}
                            {isSuperAdmin
                              ? <span className="inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 uppercase tracking-wide shrink-0"><Shield size={8} /> Super Admin</span>
                              : memberRoles.slice(0, 3).map(r => <RolePill key={r.id} color={r.color} label={r.name} />)
                            }
                            {!isSuperAdmin && memberRoles.length > 3 && (
                              <span className="text-[9px] text-gray-500">+{memberRoles.length - 3}</span>
                            )}
                          </div>
                          {name && <p className="text-xs text-gray-500 truncate">{member.email}</p>}
                        </div>
                        {/* Role edit button — hidden for superadmins */}
                        {!isSuperAdmin && (
                          <button
                            onClick={() => isEditing ? closeRoleEditor() : openRoleEditor(member)}
                            className={`p-1.5 rounded-lg transition-all ${isEditing ? 'text-accent bg-accent/10' : 'text-gray-600 hover:text-gray-300 hover:bg-surface-3 opacity-0 group-hover:opacity-100'}`}
                            title="Edit roles"
                          >
                            <Pencil size={12} />
                          </button>
                        )}
                        <button onClick={() => handleRemoveMember(member.id)} disabled={removingMember === member.id}
                          className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-30">
                          <Trash2 size={13} />
                        </button>
                      </div>

                      {/* Inline role editor */}
                      {isEditing && !isSuperAdmin && (
                        <div className="mx-3 mb-2 bg-surface-2 border border-border rounded-xl p-3 space-y-3">
                          {/* Column Access */}
                          {columnRoles.length > 0 && (
                            <div>
                              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Column Access</p>
                              <div className="space-y-1">
                                {columnRoles.filter(r => r.id === 'role_access_any').map(role => (
                                  <label key={role.id} className="flex items-center gap-2 cursor-pointer group/r">
                                    <div
                                      onClick={() => toggleRole(member.id, role.id)}
                                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors shrink-0 ${
                                        editRoleIds.includes(role.id) ? 'border-accent bg-accent' : 'border-border bg-surface-1 group-hover/r:border-accent/50'
                                      }`}
                                    >
                                      {editRoleIds.includes(role.id) && <Check size={8} className="text-white" />}
                                    </div>
                                    <span className="text-xs text-gray-300">{role.name}</span>
                                    <span className="text-[9px] text-gray-600 ml-auto">All columns</span>
                                  </label>
                                ))}
                                <div className="border-t border-border my-1 opacity-40" />
                                {columnRoles.filter(r => r.id !== 'role_access_any').map(role => (
                                  <label key={role.id} className={`flex items-center gap-2 cursor-pointer group/r ${allColumnsChecked(editRoleIds) ? 'opacity-40 pointer-events-none' : ''}`}>
                                    <div
                                      onClick={() => toggleRole(member.id, role.id)}
                                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors shrink-0 ${
                                        editRoleIds.includes(role.id) ? 'border-accent bg-accent' : 'border-border bg-surface-1 group-hover/r:border-accent/50'
                                      }`}
                                    >
                                      {editRoleIds.includes(role.id) && <Check size={8} className="text-white" />}
                                    </div>
                                    <span className="text-xs text-gray-300">{role.name}</span>
                                    <span className="w-2.5 h-2.5 rounded-sm ml-auto shrink-0" style={{ background: role.color }} />
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Permissions */}
                          {permRoles.length > 0 && (
                            <div>
                              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Permissions</p>
                              <div className="space-y-1">
                                {permRoles.map(role => (
                                  <label key={role.id} className="flex items-center gap-2 cursor-pointer group/r">
                                    <div
                                      onClick={() => toggleRole(member.id, role.id)}
                                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors shrink-0 ${
                                        editRoleIds.includes(role.id) ? 'border-accent bg-accent' : 'border-border bg-surface-1 group-hover/r:border-accent/50'
                                      }`}
                                    >
                                      {editRoleIds.includes(role.id) && <Check size={8} className="text-white" />}
                                    </div>
                                    <span className="text-xs text-gray-300">{role.name}</span>
                                    <span className="w-2.5 h-2.5 rounded-sm ml-auto shrink-0" style={{ background: role.color }} />
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Save / Cancel */}
                          <div className="flex gap-1.5 pt-1">
                            <button
                              onClick={closeRoleEditor}
                              className="flex-1 py-1 text-xs text-gray-500 hover:text-gray-300 border border-border rounded-lg hover:bg-surface-3 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSaveRoles(member.id)}
                              disabled={savingRoles === member.id}
                              className="flex-1 py-1 text-xs font-medium text-white bg-accent hover:bg-accent/80 rounded-lg disabled:opacity-40 transition-colors"
                            >
                              {savingRoles === member.id ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add existing users */}
              {addableUsers.length > 0 && (
                <div className="p-4">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-2">Add to board</p>
                  <div className="space-y-0.5">
                    {addableUsers.map(u => {
                      const name = `${u.first_name || ''} ${u.last_name || ''}`.trim();
                      return (
                        <div key={u.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-surface-3 transition-colors group">
                          <Avatar email={u.email} name={name || undefined} picture={u.picture} />
                          <div className="flex-1 min-w-0">
                            {name && <p className="text-sm font-medium text-gray-300 truncate">{name}</p>}
                            <p className="text-xs text-gray-500 truncate">{u.email}</p>
                          </div>
                          <button
                            onClick={() => handleAddExistingUser(u)}
                            disabled={addingUser === u.id}
                            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-accent bg-accent/10 hover:bg-accent/20 rounded-lg transition-all disabled:opacity-40 shrink-0"
                          >
                            {addingUser === u.id ? '…' : <><Plus size={11} /> Add</>}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Invite by email (for users not in the system) */}
              <div className="p-4">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-2">Invite by email</p>
                <form onSubmit={handleInviteByEmail} className="flex gap-2">
                  <div className="relative flex-1">
                    <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                    <input
                      value={inviteEmail}
                      onChange={e => { setInviteEmail(e.target.value); setInviteError(''); setInviteSuccess(''); }}
                      placeholder="someone@example.com"
                      type="email"
                      className="w-full bg-surface-2 border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50 transition-colors"
                    />
                  </div>
                  <button type="submit" disabled={inviting || !inviteEmail.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 bg-accent hover:bg-accent/80 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 shrink-0">
                    <UserPlus size={13} />
                    {inviting ? '…' : 'Invite'}
                  </button>
                </form>

                {inviteError && (
                  <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <AlertCircle size={13} className="text-red-400 shrink-0" />
                    <p className="text-xs text-red-400">{inviteError}</p>
                  </div>
                )}
                {inviteSuccess && (
                  <div className="mt-2 flex items-center justify-between gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Check size={13} className="text-green-400 shrink-0" />
                      <p className="text-xs text-green-400">{inviteSuccess}</p>
                    </div>
                    {copiedLink && (
                      <button onClick={() => navigator.clipboard.writeText(copiedLink)}
                        className="shrink-0 p-1 rounded text-green-400 hover:bg-green-500/20 transition-colors" title="Copy invite link">
                        <Copy size={12} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Teams Tab ─────────────────────────────────────────────── */}
          {activeTab === 'teams' && (
            <div className="p-4 space-y-2">
              {teams.length === 0 && !showNewTeamForm && (
                <p className="text-sm text-gray-600 text-center py-6">No teams yet.</p>
              )}

              {teams.map(team => {
                const members = teamMembers[team.id] || [];
                const teamEmails = new Set(members.map(m => m.email.toLowerCase()));

                return (
                  <div key={team.id} className="border border-border rounded-xl overflow-hidden">
                    {/* Team header */}
                    <div className="flex items-center">
                      <button
                        onClick={() => handleExpandTeam(team.id)}
                        className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2.5 hover:bg-surface-3/50 transition-colors text-left"
                      >
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: team.color + '20', border: `1px solid ${team.color}40` }}>
                          <span className="text-[10px] font-bold" style={{ color: team.color }}>{team.name[0]}</span>
                        </div>
                        <span className="text-sm font-medium text-gray-200 flex-1 truncate">{team.name}</span>
                        <span className="text-xs text-gray-600">{team.member_count} member{team.member_count !== 1 ? 's' : ''}</span>
                        {expandedTeam === team.id
                          ? <ChevronDown size={13} className="text-gray-500 shrink-0" />
                          : <ChevronRight size={13} className="text-gray-500 shrink-0" />}
                      </button>
                      {confirmDeleteTeam === team.id ? (
                        <div className="flex items-center gap-1 px-2 shrink-0">
                          <span className="text-[10px] text-amber-400 whitespace-nowrap">Archive ({team.member_count})?</span>
                          <button onClick={() => handleDeleteTeam(team)} className="px-1.5 py-0.5 text-[10px] font-medium text-red-400 hover:bg-red-500/10 rounded transition-colors">Yes</button>
                          <button onClick={() => setConfirmDeleteTeam(null)} className="px-1.5 py-0.5 text-[10px] text-gray-600 hover:text-gray-400 rounded transition-colors">No</button>
                        </div>
                      ) : (
                        <button onClick={() => handleDeleteTeam(team)} title={team.member_count > 0 ? 'Archive team (has members)' : 'Delete team'}
                          className="p-2 mr-1 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>

                    {/* Team members (expanded) */}
                    {expandedTeam === team.id && (
                      <div className="border-t border-border bg-surface-2">
                        <div className="p-2 space-y-0.5">
                          {/* Member rows */}
                          {members.map(tm => {
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
                                {(!isSelf || isSuperAdmin) && (
                                confirmRemoveTeamMember === key ? (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <span className="text-[10px] text-gray-500">Remove?</span>
                                    <button
                                      onClick={() => { setConfirmRemoveTeamMember(null); handleRemoveTeamMember(team.id, tm.email); }}
                                      disabled={removingTeamMember === key}
                                      className="px-1.5 py-0.5 text-[10px] font-medium text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-30"
                                    >
                                      Yes
                                    </button>
                                    <button
                                      onClick={() => setConfirmRemoveTeamMember(null)}
                                      className="px-1.5 py-0.5 text-[10px] text-gray-600 hover:text-gray-400 rounded transition-colors"
                                    >
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  <button onClick={() => setConfirmRemoveTeamMember(key)}
                                    disabled={removingTeamMember === key}
                                    className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-30">
                                    <Trash2 size={12} />
                                  </button>
                                )
                              )}
                              </div>
                            );
                          })}

                          {/* Add from existing users not in team */}
                          {users.filter(u => !teamEmails.has(u.email.toLowerCase())).length > 0 && (
                            <div className="pt-1 pb-0.5">
                              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest px-2 pb-1">Add member</p>
                              {users
                                .filter(u => !teamEmails.has(u.email.toLowerCase()))
                                .map(u => {
                                  const name = `${u.first_name || ''} ${u.last_name || ''}`.trim();
                                  return (
                                    <div key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-3 group transition-colors">
                                      <Avatar email={u.email} name={name || undefined} picture={u.picture} size="sm" />
                                      <div className="flex-1 min-w-0">
                                        {name && <p className="text-xs font-medium text-gray-400 truncate">{name}</p>}
                                        <p className="text-[10px] text-gray-600 truncate">{u.email}</p>
                                      </div>
                                      <button
                                        onClick={() => handleAddTeamMember(team.id, u.email)}
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

                          {/* Invite by email for users not in system */}
                          <form
                            onSubmit={e => { e.preventDefault(); const v = (teamAddEmail[team.id] || '').trim(); if (v) handleAddTeamMember(team.id, v); }}
                            className="flex gap-1.5 pt-1"
                          >
                            <input
                              value={teamAddEmail[team.id] || ''}
                              onChange={e => setTeamAddEmail(prev => ({ ...prev, [team.id]: e.target.value }))}
                              placeholder="Invite by email…"
                              type="email"
                              className="flex-1 bg-surface-3 border border-border rounded-lg px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50 transition-colors"
                            />
                            <button type="submit"
                              disabled={teamAddingId === team.id || !(teamAddEmail[team.id] || '').trim()}
                              className="px-2.5 py-1.5 bg-accent/15 hover:bg-accent/25 text-accent text-xs font-medium rounded-lg transition-colors disabled:opacity-40 shrink-0">
                              <UserPlus size={12} />
                            </button>
                          </form>
                          {teamError[team.id] && (
                            <p className="text-[11px] text-red-400 px-1">{teamError[team.id]}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Create team */}
              {showNewTeamForm ? (
                <form onSubmit={handleCreateTeam} className="border border-border rounded-xl p-3 space-y-2">
                  <p className="text-xs font-medium text-gray-400">New team</p>
                  <input value={newTeamName} onChange={e => setNewTeamName(e.target.value)}
                    placeholder="Team name…" autoFocus
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50" />
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => setShowNewTeamForm(false)}
                      className="flex-1 py-1.5 text-sm text-gray-500 hover:text-gray-300 border border-border rounded-lg hover:bg-surface-3 transition-colors">Cancel</button>
                    <button type="submit" disabled={creatingTeam || !newTeamName.trim()}
                      className="flex-1 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent/80 rounded-lg disabled:opacity-40 transition-colors">
                      {creatingTeam ? 'Creating…' : 'Create'}
                    </button>
                  </div>
                </form>
              ) : (
                <button onClick={() => setShowNewTeamForm(true)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-border text-gray-500 hover:text-gray-300 hover:border-gray-500 text-sm transition-colors">
                  <Plus size={14} /> New team
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
