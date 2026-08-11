// ── Column IDs ────────────────────────────────────────────────
export const COLUMN = {
  BACKLOG:      'col_backlog',
  INPROGRESS:   'col_inprogress',
  TESTING:      'col_testing',
  HUMAN_ACTION: 'col_humanaction',
  DONE:         'col_done',
  UNASSIGNED:   'col_unassigned',
};

// ── Default names for the built-in (protected) columns ──────────
// Protected columns can be renamed, but their id never changes, so this
// is what tells us — and the user — what the column was originally for.
export const COLUMN_DEFAULT_NAME = {
  [COLUMN.BACKLOG]:      'Backlog',
  [COLUMN.INPROGRESS]:   'In Progress',
  [COLUMN.TESTING]:      'Testing',
  [COLUMN.HUMAN_ACTION]: 'Human Action',
  [COLUMN.DONE]:         'Done',
};

// ── Color swatches for the "Add column" picker ─────────────────
export const PRESET_COLUMN_COLORS = [
  '#6366f1', '#3b82f6', '#8b5cf6', '#f59e0b',
  '#10b981', '#ef4444', '#ec4899', '#14b8a6',
  '#f97316', '#64748b',
];
