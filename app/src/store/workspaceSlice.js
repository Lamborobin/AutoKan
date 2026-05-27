import { subscriptionApi, clientsApi, projectsApi } from '../api';


export const createWorkspaceSlice = (set, get) => ({
  // ── State ─────────────────────────────────────────────────────
  isSuperAdmin: false,
  subscription: null,
  subscriptionAdmins: [],
  clients: [],
  projects: [],
  currentProjectId: localStorage.getItem('fa_project') || null,

  // ── Subscription ──────────────────────────────────────────────
  async loadSubscription() {
    try {
      const data = await subscriptionApi.get();
      set({ subscription: data, subscriptionAdmins: data.admins || [], isSuperAdmin: data.isSuperAdmin || false });
    } catch {}
  },

  async updateSubscriptionName(name) {
    const updated = await subscriptionApi.updateName(name);
    set(s => ({ subscription: { ...s.subscription, name: updated.name } }));
    return updated;
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

  // ── Clients ───────────────────────────────────────────────────
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

  // ── Projects ──────────────────────────────────────────────────
  async loadProjects() {
    const data = await projectsApi.list();
    // Deduplicate by id — safeguard against stray duplicate DB rows
    const seen = new Set();
    const projects = data.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
    set({ projects });
    const { currentProjectId } = get();
    if (!projects.find(p => p.id === currentProjectId)) {
      // Prefer personal board (no client) as default, otherwise first available
      const personal = projects.find(p => !p.client_id && !p.archived_at);
      const fallback = personal?.id || projects.find(p => !p.archived_at)?.id || null;
      get().setCurrentProject(fallback);
    }
  },

  setCurrentProject(id) {
    localStorage.setItem('fa_project', id);
    set({ currentProjectId: id });
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
});
