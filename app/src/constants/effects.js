// Human wording for effect ids. The ids themselves come from the server
// (services/effects.js plus the action-hook registry) — this only supplies
// labels, so an id with no entry here still renders as its raw id rather than
// vanishing when a new hook is registered.
export const EFFECT_LABELS = {
  notify_human_action: 'Notify the board when a human is needed',
  notify_all: 'Send an in-app notification to all users',
  pr_create: 'Open a pull request',
  pr_merge: 'Merge the pull request to master',
};

export function effectLabel(id) {
  return EFFECT_LABELS[id] || id;
}
