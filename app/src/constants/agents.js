// ── Claude model options ──────────────────────────────────────
export const MODELS = [
  { value: 'claude-opus-4-8',           label: 'Opus 4.8 — most capable', shortLabel: 'Opus 4.8' },
  { value: 'claude-sonnet-4-6',         label: 'Sonnet 4.6 — balanced', shortLabel: 'Sonnet 4.6' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5 — fastest', shortLabel: 'Haiku 4.5' },
];

export const DEFAULT_AGENT_MODEL = MODELS[1].shortLabel;

// ── Agent avatar color swatches ───────────────────────────────
export const COLORS = [
  '#6366f1', '#3b82f6', '#8b5cf6', '#ec4899',
  '#10b981', '#f59e0b', '#ef4444', '#06b6d4',
];
