import { DEFAULT_AGENT_MODEL, MODELS } from '../constants/agents';
import { notificationsApi } from '../api';

const DEFAULT_AGENT_MODEL_STORAGE_KEY = 'fa_default_agent_model';

function normalizeAgentModel(value) {
  return MODELS.some(model => model.value === value) ? value : DEFAULT_AGENT_MODEL;
}

export const createUiSlice = (set) => ({
  // ── State ─────────────────────────────────────────────────────
  selectedTask: null,
  _pendingTaskId: null,
  showNewTask: false,
  showNewAgent: false,
  showTemplates: false,
  editingAgent: null,
  currentPage: 'board',
  theme: localStorage.getItem('theme') || 'dark',
  defaultAgentModel: normalizeAgentModel(localStorage.getItem(DEFAULT_AGENT_MODEL_STORAGE_KEY)),
  isDraggingAgent: false,
  notifications: [],
  unreadCount: 0,

  // ── Actions ───────────────────────────────────────────────────
  setSelectedTask: (task) => set({ selectedTask: task }),
  _setPendingTaskId: (id) => set({ _pendingTaskId: id }),
  setShowNewTask: (v) => set({ showNewTask: v }),
  setShowNewAgent: (v) => set({ showNewAgent: v }),
  setShowTemplates: (v) => set({ showTemplates: v }),
  setEditingAgent: (agent) => set({ editingAgent: agent }),
  setCurrentPage: (page) => set({ currentPage: page }),
  setDraggingAgent: (v) => set({ isDraggingAgent: v }),

  async loadNotifications() {
    try {
      const notifications = await notificationsApi.list();
      set({ notifications, unreadCount: notifications.filter(n => !n.read_at).length });
    } catch {}
  },

  addNotification(notification) {
    set(s => ({
      notifications: [notification, ...s.notifications].slice(0, 50),
      unreadCount: s.unreadCount + 1,
    }));
  },

  async markNotificationRead(id) {
    try {
      await notificationsApi.markRead(id);
      set(s => ({
        notifications: s.notifications.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n),
        unreadCount: Math.max(0, s.unreadCount - 1),
      }));
    } catch {}
  },

  async markAllNotificationsRead() {
    try {
      await notificationsApi.markAllRead();
      set(s => ({
        notifications: s.notifications.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })),
        unreadCount: 0,
      }));
    } catch {}
  },
  setDefaultAgentModel(model) {
    const defaultAgentModel = normalizeAgentModel(model);
    localStorage.setItem(DEFAULT_AGENT_MODEL_STORAGE_KEY, defaultAgentModel);
    set({ defaultAgentModel });
  },

  setTheme(theme) {
    localStorage.setItem('theme', theme);
    const isLight = theme === 'light' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);
    document.documentElement.classList.toggle('light', isLight);
    set({ theme });
  },
});
