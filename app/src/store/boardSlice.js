import { tasksApi, columnsApi, agentsApi, agentTemplatesApi, instructionsApi, rolesApi, membersApi, teamsApi } from '../api';
import { COLUMN } from '../constants/columns';

export const createBoardSlice = (set, get) => ({
  // ── State ─────────────────────────────────────────────────────
  columns: [],
  tasks: [],
  archivedTasks: [],
  agents: [],
  roles: [],
  secrets: [],
  agentTemplates: [],
  instructionFiles: [],
  subscriptionInstructionFiles: [],
  loading: false,
  boardMembers: [],
  teams: [],

  // ── Load ──────────────────────────────────────────────────────
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
      get().loadBoardMembers().catch(() => {});
      get().loadTeams().catch(() => {});
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

  // ── Tasks ─────────────────────────────────────────────────────
  async createTask(data) {
    const { currentProjectId } = get();
    const task = await tasksApi.create({ ...data, project_id: currentProjectId });
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

  // ── Agents ────────────────────────────────────────────────────
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
            return d ? { ...t, column_id: COLUMN.UNASSIGNED } : t;
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

  // ── Columns ───────────────────────────────────────────────────
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

  // ── Agent Templates ───────────────────────────────────────────
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

  // ── Instruction Files (board-scoped) ──────────────────────────
  async loadInstructionFiles() {
    const { currentProjectId, subscription } = get();
    const subId = subscription?.id || 'sub_default';
    const files = await instructionsApi.list(true, currentProjectId, subId);
    set({ instructionFiles: files });
    return files;
  },

  async createInstructionFile(name, content) {
    const { currentProjectId, subscription } = get();
    const subId = subscription?.id || 'sub_default';
    const file = await instructionsApi.create({ name, content }, currentProjectId, subId);
    set(s => ({ instructionFiles: [...s.instructionFiles, file] }));
    return file;
  },

  async updateInstructionFile(filename, content) {
    const { currentProjectId, subscription } = get();
    const subId = subscription?.id || 'sub_default';
    await instructionsApi.update(filename, content, currentProjectId, subId);
    set(s => ({
      instructionFiles: s.instructionFiles.map(f =>
        f.name + '.md' === filename ? { ...f, _content: content } : f
      ),
    }));
  },

  async archiveInstructionFile(filename) {
    const { currentProjectId, subscription } = get();
    const subId = subscription?.id || 'sub_default';
    await instructionsApi.archive(filename, currentProjectId, subId);
    const prefix = `instructions/${subId}/${currentProjectId}`;
    set(s => ({
      instructionFiles: s.instructionFiles.map(f =>
        f.name + '.md' === filename ? { ...f, archived: true, path: `${prefix}/archived/${filename}` } : f
      ),
    }));
  },

  async unarchiveInstructionFile(filename) {
    const { currentProjectId, subscription } = get();
    const subId = subscription?.id || 'sub_default';
    await instructionsApi.unarchive(filename, currentProjectId, subId);
    const prefix = `instructions/${subId}/${currentProjectId}`;
    set(s => ({
      instructionFiles: s.instructionFiles.map(f =>
        f.name + '.md' === filename ? { ...f, archived: false, path: `${prefix}/${filename}` } : f
      ),
    }));
  },

  async deleteInstructionFile(filename) {
    const { currentProjectId, subscription } = get();
    const subId = subscription?.id || 'sub_default';
    await instructionsApi.delete(filename, currentProjectId, subId);
    set(s => ({
      instructionFiles: s.instructionFiles.filter(f => f.name + '.md' !== filename),
    }));
  },

  // ── Instruction Files (subscription-scoped) ───────────────────
  async loadSubscriptionInstructionFiles() {
    const { subscription } = get();
    const subId = subscription?.id || 'sub_default';
    const files = await instructionsApi.list(true, null, subId);
    set({ subscriptionInstructionFiles: files });
    return files;
  },

  async createSubscriptionInstructionFile(name, content) {
    const { subscription } = get();
    const subId = subscription?.id || 'sub_default';
    const file = await instructionsApi.create({ name, content }, null, subId);
    set(s => ({ subscriptionInstructionFiles: [...s.subscriptionInstructionFiles, file] }));
    return file;
  },

  async updateSubscriptionInstructionFile(filename, content) {
    const { subscription } = get();
    const subId = subscription?.id || 'sub_default';
    await instructionsApi.update(filename, content, null, subId);
  },

  async archiveSubscriptionInstructionFile(filename) {
    const { subscription } = get();
    const subId = subscription?.id || 'sub_default';
    await instructionsApi.archive(filename, null, subId);
    const prefix = `instructions/${subId}`;
    set(s => ({
      subscriptionInstructionFiles: s.subscriptionInstructionFiles.map(f =>
        f.name + '.md' === filename ? { ...f, archived: true, path: `${prefix}/archived/${filename}` } : f
      ),
    }));
  },

  async unarchiveSubscriptionInstructionFile(filename) {
    const { subscription } = get();
    const subId = subscription?.id || 'sub_default';
    await instructionsApi.unarchive(filename, null, subId);
    const prefix = `instructions/${subId}`;
    set(s => ({
      subscriptionInstructionFiles: s.subscriptionInstructionFiles.map(f =>
        f.name + '.md' === filename ? { ...f, archived: false, path: `${prefix}/${filename}` } : f
      ),
    }));
  },

  async deleteSubscriptionInstructionFile(filename) {
    const { subscription } = get();
    const subId = subscription?.id || 'sub_default';
    await instructionsApi.delete(filename, null, subId);
    set(s => ({
      subscriptionInstructionFiles: s.subscriptionInstructionFiles.filter(f => f.name + '.md' !== filename),
    }));
  },

  // ── SSE ───────────────────────────────────────────────────────
  applySSEEvent(event, data) {
    const { currentProjectId } = get();
    switch (event) {
      case 'task_updated': {
        const task = data.task;
        if (task.project_id !== currentProjectId) return;
        if (task.archived_at) {
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
      case 'notification': {
        get().addNotification(data);
        break;
      }
    }
  },

  // ── Board Members ─────────────────────────────────────────────
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

  async updateBoardMemberRoles(memberId, roleIds) {
    const { currentProjectId } = get();
    const updated = await membersApi.update(currentProjectId, memberId, { role_ids: roleIds });
    set(s => ({ boardMembers: s.boardMembers.map(m => m.id === memberId ? { ...m, role_ids: updated.role_ids } : m) }));
    return updated;
  },

  async removeBoardMember(memberId) {
    const { currentProjectId } = get();
    await membersApi.remove(currentProjectId, memberId);
    set(s => ({ boardMembers: s.boardMembers.filter(m => m.id !== memberId) }));
  },

  // ── Teams ─────────────────────────────────────────────────────
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
    const res = await teamsApi.delete(id);
    set(s => ({ teams: s.teams.filter(t => t.id !== id) }));
    return res;
  },
});
