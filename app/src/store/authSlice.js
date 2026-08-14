import { authApi } from '../api';

export const createAuthSlice = (set, get) => ({
  // ── State ─────────────────────────────────────────────────────
  user: null,
  authLoading: true,
  authError: null,
  inviteToken: null,
  users: [],

  // ── Actions ───────────────────────────────────────────────────
  setInviteToken: (t) => set({ inviteToken: t }),
  setAuthError: (err) => set({ authError: err }),

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
      await Promise.all([get().loadProjects(), get().fetchUsers(), get().loadNotifications()]);
      await get().loadSubscription();
      await get().loadClients();
      await get().loadSectors();
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
      await Promise.all([get().loadProjects(), get().fetchUsers(), get().loadNotifications()]);
      await get().loadSubscription();
      await get().loadClients();
      await get().loadSectors();
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
});
