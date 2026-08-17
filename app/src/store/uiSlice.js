import { FALLBACK_MODELS, FALLBACK_DEFAULT_MODEL } from '../constants/agents';
import { notificationsApi } from '../api';

const DEFAULT_AGENT_MODEL_STORAGE_KEY = 'fa_default_agent_model';
const AUTOSAVE_CONTEXT_STORAGE_KEY = 'fa_autosave_context_files';

// Only gates localStorage hydration at boot, before the live model list has
// loaded — checked again lazily against the live list wherever it matters.
function normalizeAgentModel(value) {
  return FALLBACK_MODELS.some(model => model.value === value) ? value : FALLBACK_DEFAULT_MODEL;
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
  // Context files (board/workspace) auto-save by default, matching prior behaviour.
  // Capability Behavior and System Behavior files never auto-save regardless of this —
  // gated at the call site, not here, since it's a fixed rule, not a preference.
  autoSaveContextFiles: localStorage.getItem(AUTOSAVE_CONTEXT_STORAGE_KEY) !== 'false',
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

  setAutoSaveContextFiles(value) {
    localStorage.setItem(AUTOSAVE_CONTEXT_STORAGE_KEY, value ? 'true' : 'false');
    set({ autoSaveContextFiles: !!value });
  },
});
