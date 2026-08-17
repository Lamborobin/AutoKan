// ── Claude model options ──────────────────────────────────────
// Static fallback only — the live list comes from GET /api/constants via the
// store's `models`/`modelsDefault` (see store/modelsSlice.js). Used before the
// first successful fetch and if the app is offline.
export const FALLBACK_MODELS = [
  { value: 'claude-opus-5',    label: 'Opus 5 — most capable', shortLabel: 'Opus 5' },
  { value: 'claude-sonnet-5',  label: 'Sonnet 5 — balanced', shortLabel: 'Sonnet 5' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5 — fastest', shortLabel: 'Haiku 4.5' },
];

export const FALLBACK_DEFAULT_MODEL = FALLBACK_MODELS[1].value;

// ── Agent avatar color swatches ───────────────────────────────
export const COLORS = [
  '#6366f1', '#3b82f6', '#8b5cf6', '#ec4899',
  '#10b981', '#f59e0b', '#ef4444', '#06b6d4',
];
