import { DEFAULT_AGENT_MODEL, MODELS } from '../constants/agents';

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

  // ── Actions ───────────────────────────────────────────────────
  setSelectedTask: (task) => set({ selectedTask: task }),
  _setPendingTaskId: (id) => set({ _pendingTaskId: id }),
  setShowNewTask: (v) => set({ showNewTask: v }),
  setShowNewAgent: (v) => set({ showNewAgent: v }),
  setShowTemplates: (v) => set({ showTemplates: v }),
  setEditingAgent: (agent) => set({ editingAgent: agent }),
  setCurrentPage: (page) => set({ currentPage: page }),
  setDraggingAgent: (v) => set({ isDraggingAgent: v }),
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
