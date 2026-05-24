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

  setTheme(theme) {
    localStorage.setItem('theme', theme);
    const isLight = theme === 'light' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);
    document.documentElement.classList.toggle('light', isLight);
    set({ theme });
  },
});
