// ── Priority ──────────────────────────────────────────────────
export const PRIORITY = {
  LOW:      'low',
  MEDIUM:   'medium',
  HIGH:     'high',
  CRITICAL: 'critical',
};
export const PRIORITIES = [PRIORITY.LOW, PRIORITY.MEDIUM, PRIORITY.HIGH, PRIORITY.CRITICAL];

// ── Complexity ────────────────────────────────────────────────
export const COMPLEXITY = {
  LOW:    'low',
  MEDIUM: 'medium',
  HIGH:   'high',
};
export const COMPLEXITIES = [COMPLEXITY.LOW, COMPLEXITY.MEDIUM, COMPLEXITY.HIGH];

// ── PM approval status ────────────────────────────────────────
export const PM_STATUS = {
  PENDING:      'pending',
  QUESTIONING:  'questioning',
  APPROVED:     'approved',
  REJECTED:     'rejected',
};

// ── Human approval status ─────────────────────────────────────
export const HUMAN_STATUS = {
  PENDING:  'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

// ── Task log action types ─────────────────────────────────────
export const LOG_ACTION = {
  CREATED:                  'created',
  UPDATED:                  'updated',
  MOVED:                    'moved',
  PM_REVIEW_REQUESTED:      'pm_review_requested',
  PM_QUESTION:              'pm_question',
  HUMAN_ANSWER:             'human_answer',
  PM_REVIEWED:              'pm_reviewed',
  HUMAN_APPROVED:           'human_approved',
  HUMAN_REJECTED:           'human_rejected',
  DEVELOPER_ASSIGNED:       'developer_assigned',
  BRANCH_CREATED:           'branch_created',
  PR_APPROVED:              'pr_approved',
  HUMAN_ACTION_REQUESTED:   'human_action_requested',
  GITHUB_COMMENT:           'github_comment',
  GITHUB_CI:                'github_ci',
};

// ── Priority display helpers ──────────────────────────────────
export const PRIORITY_STYLES = {
  [PRIORITY.CRITICAL]: 'bg-red-500/15 text-red-400 border border-red-500/20',
  [PRIORITY.HIGH]:     'bg-orange-500/15 text-orange-400 border border-orange-500/20',
  [PRIORITY.MEDIUM]:   'bg-blue-500/15 text-blue-400 border border-blue-500/20',
  [PRIORITY.LOW]:      'bg-gray-500/15 text-gray-400 border border-gray-500/20',
};

export const PRIORITY_COLORS = {
  [PRIORITY.CRITICAL]: '#ef4444',
  [PRIORITY.HIGH]:     '#f97316',
  [PRIORITY.MEDIUM]:   '#3b82f6',
  [PRIORITY.LOW]:      '#6b7280',
};
