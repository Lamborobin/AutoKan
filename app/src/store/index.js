import { create } from 'zustand';
import { tasksApi, columnsApi, agentsApi, secretsApi, agentTemplatesApi, instructionsApi, rolesApi, authApi, projectsApi } from '../api';

export const useStore = create((set, get) => ({
  // ── Auth ─────────────────────────────────────────────────────
  user: null,
  authLoading: true,
  authError: null,

  async initAuth() {
    const token = localStorage.getItem('fa_token');
    if (!token) {
      set({ authLoading: false });
      return;
    }
    try {
      const { user } = await authApi.me();
      set({ user, authLoading: false });
      // Load projects immediately after auth
      await get().loadProjects();
    } catch {
      localStorage.removeItem('fa_token');
      set({ user: null, authLoading: false });
    }
  },

  async googleLogin(credential) {
    set({ authError: null });
    try {
      const { token, user } = await authApi.google(credential);
      localStorage.setItem('fa_token', token);
      set({ user });
      await get().loadProjects();
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
  currentProjectId: localStorage.getItem('fa_project') || 'proj_velour',

  async loadProjects() {
    const projects = await projectsApi.list();
    set({ projects });
    // Ensure current project is valid
    const { currentProjectId } = get();
    if (!projects.find(p => p.id === currentProjectId)) {
      const fallback = projects[0]?.id || 'proj_velour';
      get().setCurrentProject(fallback);
    }
  },

  setCurrentProject(id) {
    localStorage.setItem('fa_project', id);
    set({ currentProjectId: id });
    // Re-load board data for the new project
    get().load();
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
        columnsApi.list(true),
        tasksApi.list(params),
        tasksApi.list({ ...params, include_archived: true }).then(all => all.filter(t => t.archived_at)),
        agentsApi.list(),
        agentTemplatesApi.list(true),
        rolesApi.list(),
      ]);
      set({ columns, tasks, archivedTasks, agents, agentTemplates, roles, loading: false });
    } catch (e) {
      console.error('Load failed:', e);
      set({ loading: false });
    }
  },

  // Tasks
  async createTask(data) {
    const { currentProjectId } = get();
    const task = await tasksApi.create({ ...data, project_id: currentProjectId });
    set(s => ({ tasks: [task, ...s.tasks] }));
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
    const agent = await agentsApi.create(data);
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
    const col = await columnsApi.create(data);
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

  // Instruction files
  async loadInstructionFiles() {
    const files = await instructionsApi.list(true);
    set({ instructionFiles: files });
    return files;
  },

  async createInstructionFile(name, content) {
    const file = await instructionsApi.create({ name, content });
    set(s => ({ instructionFiles: [...s.instructionFiles, file] }));
    return file;
  },

  async updateInstructionFile(filename, content) {
    await instructionsApi.update(filename, content);
    set(s => ({
      instructionFiles: s.instructionFiles.map(f =>
        f.name + '.md' === filename ? { ...f, _content: content } : f
      ),
    }));
  },

  async archiveInstructionFile(filename) {
    await instructionsApi.archive(filename);
    set(s => ({
      instructionFiles: s.instructionFiles.map(f =>
        f.name + '.md' === filename ? { ...f, archived: true, path: `instructions/archived/${filename}` } : f
      ),
    }));
  },

  async unarchiveInstructionFile(filename) {
    await instructionsApi.unarchive(filename);
    set(s => ({
      instructionFiles: s.instructionFiles.map(f =>
        f.name + '.md' === filename ? { ...f, archived: false, path: `instructions/${filename}` } : f
      ),
    }));
  },

  async deleteInstructionFile(filename) {
    await instructionsApi.delete(filename);
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

  // UI state
  setSelectedTask: (task) => set({ selectedTask: task }),
  setShowNewTask: (v) => set({ showNewTask: v }),
  setShowNewAgent: (v) => set({ showNewAgent: v }),
  setShowTemplates: (v) => set({ showTemplates: v }),
  setEditingAgent: (agent) => set({ editingAgent: agent }),
  setCurrentPage: (page) => set({ currentPage: page }),

  setTheme(theme) {
    localStorage.setItem('theme', theme);
    document.documentElement.classList.toggle('light', theme === 'light');
    set({ theme });
  },
}));
