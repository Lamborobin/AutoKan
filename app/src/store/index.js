import { create } from 'zustand';
import { tasksApi, columnsApi, agentsApi, secretsApi, agentTemplatesApi, instructionsApi, rolesApi, authApi, projectsApi, membersApi, teamsApi, subscriptionApi, clientsApi } from '../api';

export const useStore = create((set, get) => ({
  // ── Auth ─────────────────────────────────────────────────────
  user: null,
  authLoading: true,
  authError: null,
  inviteToken: null,
  setInviteToken: (t) => set({ inviteToken: t }),

  // ── Subscription / Workspace ──────────────────────────────────
  isSuperAdmin: false,
  subscription: null,
  subscriptionAdmins: [],

  async loadSubscription() {
    try {
      const data = await subscriptionApi.get();
      set({ subscription: data, subscriptionAdmins: data.admins || [], isSuperAdmin: data.isSuperAdmin || false });
    } catch {}
  },

  // ── Clients ──────────────────────────────────────────────────
  clients: [],
  async loadClients() {
    try {
      const clients = await clientsApi.list();
      set({ clients });
    } catch {}
  },
  async createClient(data) {
    const client = await clientsApi.create(data);
    set(s => ({ clients: [...s.clients, client] }));
    return client;
  },
  async updateClient(id, data) {
    const client = await clientsApi.update(id, data);
    set(s => ({ clients: s.clients.map(c => c.id === id ? client : c) }));
    return client;
  },
  async archiveClient(id) {
    await clientsApi.archive(id);
    set(s => ({ clients: s.clients.map(c => c.id === id ? { ...c, archived_at: new Date().toISOString() } : c) }));
  },
  async deleteClient(id) {
    await clientsApi.delete(id);
    set(s => ({ clients: s.clients.filter(c => c.id !== id) }));
  },

  async addSuperAdmin(email) {
    const admin = await subscriptionApi.addAdmin(email);
    set(s => ({ subscriptionAdmins: [...s.subscriptionAdmins, admin] }));
    return admin;
  },

  async removeSuperAdmin(userId) {
    await subscriptionApi.removeAdmin(userId);
    set(s => ({ subscriptionAdmins: s.subscriptionAdmins.filter(a => a.user_id !== userId) }));
  },

  // ── Users (for @mention autocomplete) ────────────────────────
  users: [],
  async fetchUsers() {
    try {
      const users = await authApi.users();
      set({ users });
    } catch {}
  },

  async initAuth() {
    const token = localStorage.getItem('fa_token');
    if (!token) {
      set({ authLoading: false });
      return;
    }
    try {
      const { user } = await authApi.me();
      set({ user, authLoading: false, isSuperAdmin: user.isSuperAdmin || false });
      // Load projects and users immediately after auth
      await Promise.all([get().loadProjects(), get().fetchUsers()]);
      await get().loadSubscription();
      await get().loadClients();
    } catch {
      localStorage.removeItem('fa_token');
      set({ user: null, authLoading: false });
    }
  },

  async googleLogin(credential) {
    set({ authError: null });
    try {
      const { inviteToken } = get();
      const { token, user } = await authApi.google(credential, inviteToken || undefined);
      localStorage.setItem('fa_token', token);
      set({ user, inviteToken: null, isSuperAdmin: user.isSuperAdmin || false });
      await Promise.all([get().loadProjects(), get().fetchUsers()]);
      await get().loadSubscription();
      await get().loadClients();
    } catch (e) {
      set({ authError: e.response?.data?.error || 'Sign-in failed. Please try again.' });
    }
  },

  logout() {
    localStorage.removeItem('fa_token');
    localStorage.removeItem('fa_project');
    set({ user: null, projects: [], currentProjectId: null, tasks: [], columns: [], agents: [] });
  },

  async updateProfile(data) {
    const { user } = await authApi.updateProfile(data);
    set({ user });
    return user;
  },

  setAuthError: (err) => set({ authError: err }),

  // ── Projects ─────────────────────────────────────────────────
  projects: [],
  currentProjectId: localStorage.getItem('fa_project') || null,

  async loadProjects() {
    const projects = await projectsApi.list();
    set({ projects });
    // Ensure current project is valid; fall back to first available
    const { currentProjectId } = get();
    if (!projects.find(p => p.id === currentProjectId)) {
      const fallback = projects[0]?.id || null;
      get().setCurrentProject(fallback);
    }
  },

  setCurrentProject(id) {
    localStorage.setItem('fa_project', id);
    set({ currentProjectId: id });
    // Re-load board data for the new project
    get().load();
    get().loadBoardMembers();
  },

  async createProject(data) {
    const project = await projectsApi.create(data);
    set(s => ({ projects: [...s.projects, project] }));
    return project;
  },

  async updateProject(id, data) {
    const updated = await projectsApi.update(id, data);
    set(s => ({ projects: s.projects.map(p => p.id === id ? updated : p) }));
    return updated;
  },

  async archiveProject(id) {
    await projectsApi.archive(id);
    set(s => ({ projects: s.projects.map(p => p.id === id ? { ...p, archived_at: new Date().toISOString() } : p) }));
    // Switch to another project if current one was archived
    if (get().currentProjectId === id) {
      const next = get().projects.find(p => !p.archived_at && p.id !== id);
      if (next) get().setCurrentProject(next.id);
    }
  },

  async deleteProject(id) {
    await projectsApi.delete(id);
    set(s => ({ projects: s.projects.filter(p => p.id !== id) }));
    if (get().currentProjectId === id) {
      const next = get().projects.find(p => p.id !== id);
      if (next) get().setCurrentProject(next.id);
    }
  },

  // ── Board data ───────────────────────────────────────────────
  columns: [],
  tasks: [],
  archivedTasks: [],
  agents: [],
  roles: [],
  secrets: [],
  agentTemplates: [],
  instructionFiles: [],
  loading: false,
  selectedTask: null,
  _pendingTaskId: null,
  showNewTask: false,
  showNewAgent: false,
  showTemplates: false,
  editingAgent: null,
  currentPage: 'board',
  theme: localStorage.getItem('theme') || 'dark',
  isDraggingAgent: false,
  setDraggingAgent: (v) => set({ isDraggingAgent: v }),

  // Load everything for the current project
  async load() {
    const { currentProjectId } = get();
    set({ loading: true });
    try {
      const params = currentProjectId ? { project_id: currentProjectId } : {};
      const [columns, tasks, archivedTasks, agents, agentTemplates, roles] = await Promise.all([
        columnsApi.list(true, currentProjectId),
        tasksApi.list(params),
        tasksApi.list({ ...params, include_archived: true }).then(all => all.filter(t => t.archived_at)),
        agentsApi.list(currentProjectId),
        agentTemplatesApi.list(true),
        rolesApi.list(),
      ]);
      set({ columns, tasks, archivedTasks, agents, agentTemplates, roles, loading: false });
      // Load members and teams in the background (non-blocking)
      get().loadBoardMembers().catch(() => {});
      get().loadTeams().catch(() => {});
      // Open task from email deep-link (?task=<id>)
      const { _pendingTaskId } = get();
      if (_pendingTaskId) {
        const target = tasks.find(t => t.id === _pendingTaskId);
        if (target) set({ selectedTask: target, _pendingTaskId: null });
        else set({ _pendingTaskId: null });
      }
    } catch (e) {
      console.error('Load failed:', e);
      set({ loading: false });
    }
  },

  // Tasks
  async createTask(data) {
    const { currentProjectId } = get();
    const task = await tasksApi.create({ ...data, project_id: currentProjectId });
    // SSE may have already inserted this task before the API response resolved —
    // deduplicate by updating in-place rather than always prepending.
    set(s => ({
      tasks: s.tasks.some(t => t.id === task.id)
        ? s.tasks.map(t => t.id === task.id ? task : t)
        : [task, ...s.tasks],
    }));
    return task;
  },

  async updateTask(id, data) {
    const updated = await tasksApi.update(id, data);
    set(s => ({ tasks: s.tasks.map(t => t.id === id ? updated : t) }));
    return updated;
  },

  async moveTask(taskId, columnId) {
    const updated = await tasksApi.move(taskId, columnId);
    set(s => ({ tasks: s.tasks.map(t => t.id === taskId ? updated : t) }));
    return updated;
  },

  async deleteTask(id) {
    await tasksApi.delete(id);
    set(s => ({ tasks: s.tasks.filter(t => t.id !== id), selectedTask: s.selectedTask?.id === id ? null : s.selectedTask }));
  },

  async archiveTask(id) {
    await tasksApi.archive(id);
    set(s => ({
      tasks: s.tasks.filter(t => t.id !== id),
      archivedTasks: [...s.archivedTasks, { ...s.tasks.find(t => t.id === id), archived_at: new Date().toISOString() }].filter(Boolean),
      selectedTask: s.selectedTask?.id === id ? null : s.selectedTask,
    }));
  },

  async unarchiveTask(id) {
    const updated = await tasksApi.unarchive(id);
    set(s => ({
      archivedTasks: s.archivedTasks.filter(t => t.id !== id),
      tasks: [updated, ...s.tasks],
    }));
    return updated;
  },

  async bypassPm(id) {
    const updated = await tasksApi.bypassPm(id);
    set(s => ({ tasks: s.tasks.map(t => t.id === id ? updated : t), selectedTask: s.selectedTask?.id === id ? updated : s.selectedTask }));
    return updated;
  },

  // Agents
  async createAgent(data) {
    const { currentProjectId } = get();
    const agent = await agentsApi.create({ ...data, project_id: currentProjectId });
    set(s => ({ agents: [...s.agents, agent] }));
    return agent;
  },

  async updateAgent(id, data) {
    const res = await agentsApi.update(id, data);
    const agent = res.agent ?? res;
    const displacedTasks = res.displaced_tasks || [];
    set(s => ({
      agents: s.agents.map(a => a.id === id ? agent : a),
      tasks: displacedTasks.length > 0
        ? s.tasks.map(t => {
            const d = displacedTasks.find(dt => dt.id === t.id);
            return d ? { ...t, column_id: 'col_unassigned' } : t;
          })
        : s.tasks,
    }));
    return { agent, displacedCount: displacedTasks.length };
  },

  async archiveAgent(id) {
    await agentsApi.archive(id);
    set(s => ({ agents: s.agents.map(a => a.id === id ? { ...a, active: 0, archived_at: new Date().toISOString() } : a) }));
  },

  async deleteAgent(id) {
    await agentsApi.delete(id);
    set(s => ({ agents: s.agents.filter(a => a.id !== id) }));
  },

  // Columns
  async createColumn(data) {
    const { currentProjectId } = get();
    const col = await columnsApi.create({ ...data, project_id: currentProjectId });
    const roles = await rolesApi.list();
    set(s => ({ columns: [...s.columns, col], roles }));
  },

  async updateColumn(id, data) {
    const updated = await columnsApi.update(id, data);
    set(s => ({ columns: s.columns.map(c => c.id === id ? updated : c) }));
    return updated;
  },

  reorderColumnsLocally(orderedActiveIds) {
    set(s => {
      const archived = s.columns.filter(c => !!c.archived_at);
      const active = orderedActiveIds
        .map((id, idx) => {
          const col = s.columns.find(c => c.id === id);
          return col ? { ...col, position: idx } : null;
        })
        .filter(Boolean);
      return { columns: [...active, ...archived] };
    });
  },

  async archiveColumn(id) {
    await columnsApi.archive(id);
    set(s => ({ columns: s.columns.map(c => c.id === id ? { ...c, archived_at: new Date().toISOString() } : c) }));
  },

  async unarchiveColumn(id) {
    await columnsApi.unarchive(id);
    set(s => ({ columns: s.columns.map(c => c.id === id ? { ...c, archived_at: null } : c) }));
  },

  async deleteColumn(id) {
    await columnsApi.delete(id);
    const roles = await rolesApi.list();
    set(s => ({ columns: s.columns.filter(c => c.id !== id), roles }));
  },

  // Agent Templates
  async createTemplate(data) {
    const tpl = await agentTemplatesApi.create(data);
    set(s => ({ agentTemplates: [tpl, ...s.agentTemplates] }));
    return tpl;
  },

  async updateTemplate(id, data) {
    const updated = await agentTemplatesApi.update(id, data);
    set(s => ({ agentTemplates: s.agentTemplates.map(t => t.id === id ? updated : t) }));
    return updated;
  },

  async archiveTemplate(id) {
    await agentTemplatesApi.archive(id);
    set(s => ({
      agentTemplates: s.agentTemplates.map(t =>
        t.id === id ? { ...t, archived_at: new Date().toISOString() } : t
      ),
    }));
  },

  async unarchiveTemplate(id) {
    await agentTemplatesApi.unarchive(id);
    set(s => ({
      agentTemplates: s.agentTemplates.map(t =>
        t.id === id ? { ...t, archived_at: null } : t
      ),
    }));
  },

  async deleteTemplate(id) {
    await agentTemplatesApi.delete(id);
    set(s => ({ agentTemplates: s.agentTemplates.filter(t => t.id !== id) }));
  },

  async saveAgentAsTemplate(agentId, data) {
    const res = await agentTemplatesApi.saveAgentAs(agentId, data);
    const tpl = res.template ?? res;
    const updatedAgent = res.agent;
    set(s => ({
      agentTemplates: [tpl, ...s.agentTemplates],
      agents: updatedAgent
        ? s.agents.map(a => a.id === updatedAgent.id ? updatedAgent : a)
        : s.agents,
    }));
    return tpl;
  },

  // Instruction files (all scoped to currentProjectId)
  async loadInstructionFiles() {
    const { currentProjectId } = get();
    const files = await instructionsApi.list(true, currentProjectId);
    set({ instructionFiles: files });
    return files;
  },

  async createInstructionFile(name, content) {
    const { currentProjectId } = get();
    const file = await instructionsApi.create({ name, content }, currentProjectId);
    set(s => ({ instructionFiles: [...s.instructionFiles, file] }));
    return file;
  },

  async updateInstructionFile(filename, content) {
    const { currentProjectId } = get();
    await instructionsApi.update(filename, content, currentProjectId);
    set(s => ({
      instructionFiles: s.instructionFiles.map(f =>
        f.name + '.md' === filename ? { ...f, _content: content } : f
      ),
    }));
  },

  async archiveInstructionFile(filename) {
    const { currentProjectId } = get();
    await instructionsApi.archive(filename, currentProjectId);
    const prefix = currentProjectId ? `instructions-${currentProjectId}` : 'instructions';
    set(s => ({
      instructionFiles: s.instructionFiles.map(f =>
        f.name + '.md' === filename ? { ...f, archived: true, path: `${prefix}/archived/${filename}` } : f
      ),
    }));
  },

  async unarchiveInstructionFile(filename) {
    const { currentProjectId } = get();
    await instructionsApi.unarchive(filename, currentProjectId);
    const prefix = currentProjectId ? `instructions-${currentProjectId}` : 'instructions';
    set(s => ({
      instructionFiles: s.instructionFiles.map(f =>
        f.name + '.md' === filename ? { ...f, archived: false, path: `${prefix}/${filename}` } : f
      ),
    }));
  },

  async deleteInstructionFile(filename) {
    const { currentProjectId } = get();
    await instructionsApi.delete(filename, currentProjectId);
    set(s => ({
      instructionFiles: s.instructionFiles.filter(f => f.name + '.md' !== filename),
    }));
  },

  // Apply a server-sent event — targeted update instead of full reload
  applySSEEvent(event, data) {
    const { currentProjectId } = get();
    switch (event) {
      case 'task_updated': {
        const task = data.task;
        if (task.project_id !== currentProjectId) return;
        if (task.archived_at) {
          // Task just got archived
          set(s => ({
            tasks: s.tasks.filter(t => t.id !== task.id),
            archivedTasks: s.archivedTasks.some(t => t.id === task.id)
              ? s.archivedTasks
              : [...s.archivedTasks, task],
            selectedTask: s.selectedTask?.id === task.id ? null : s.selectedTask,
          }));
        } else {
          set(s => ({
            tasks: s.tasks.some(t => t.id === task.id)
              ? s.tasks.map(t => t.id === task.id ? task : t)
              : [task, ...s.tasks],
            archivedTasks: s.archivedTasks.filter(t => t.id !== task.id),
            selectedTask: s.selectedTask?.id === task.id ? task : s.selectedTask,
          }));
        }
        break;
      }
      case 'task_archived': {
        set(s => {
          const task = s.tasks.find(t => t.id === data.id);
          return {
            tasks: s.tasks.filter(t => t.id !== data.id),
            archivedTasks: task && !s.archivedTasks.some(t => t.id === data.id)
              ? [...s.archivedTasks, { ...task, archived_at: new Date().toISOString() }]
              : s.archivedTasks,
            selectedTask: s.selectedTask?.id === data.id ? null : s.selectedTask,
          };
        });
        break;
      }
      case 'task_deleted': {
        set(s => ({
          tasks: s.tasks.filter(t => t.id !== data.id),
          selectedTask: s.selectedTask?.id === data.id ? null : s.selectedTask,
        }));
        break;
      }
      case 'reload': {
        get().load();
        break;
      }
    }
  },

  // ── Board Members ────────────────────────────────────────────
  boardMembers: [],
  async loadBoardMembers() {
    const { currentProjectId } = get();
    if (!currentProjectId) return;
    try {
      const members = await membersApi.list(currentProjectId);
      set({ boardMembers: members });
    } catch {}
  },
  async addBoardMember(email) {
    const { currentProjectId } = get();
    const result = await membersApi.add(currentProjectId, email);
    set(s => ({ boardMembers: [...s.boardMembers, result.member] }));
    return result;
  },
  async addTeamToBoard(teamId) {
    const { currentProjectId } = get();
    const result = await membersApi.addTeam(currentProjectId, teamId);
    await get().loadBoardMembers();
    return result;
  },
  async removeBoardMember(memberId) {
    const { currentProjectId } = get();
    await membersApi.remove(currentProjectId, memberId);
    set(s => ({ boardMembers: s.boardMembers.filter(m => m.id !== memberId) }));
  },

  // ── Teams ────────────────────────────────────────────────────
  teams: [],
  async loadTeams() {
    try {
      const teams = await teamsApi.list();
      set({ teams });
    } catch {}
  },
  async createTeam(data) {
    const team = await teamsApi.create(data);
    set(s => ({ teams: [...s.teams, team] }));
    return team;
  },
  async deleteTeam(id) {
    await teamsApi.delete(id);
    set(s => ({ teams: s.teams.filter(t => t.id !== id) }));
  },

  // UI state
  setSelectedTask: (task) => set({ selectedTask: task }),
  _setPendingTaskId: (id) => set({ _pendingTaskId: id }),
  setShowNewTask: (v) => set({ showNewTask: v }),
  setShowNewAgent: (v) => set({ showNewAgent: v }),
  setShowTemplates: (v) => set({ showTemplates: v }),
  setEditingAgent: (agent) => set({ editingAgent: agent }),
  setCurrentPage: (page) => set({ currentPage: page }),

  setTheme(theme) {
    localStorage.setItem('theme', theme);
    const isLight = theme === 'light' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);
    document.documentElement.classList.toggle('light', isLight);
    set({ theme });
  },
}));
