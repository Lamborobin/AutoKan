// Compare a stored model id against the current registry (store's `models`).
// Mirrors server/src/services/modelRegistry.js's describeStaleness.
export function checkModelStaleness(modelId, models) {
  if (!modelId) return { stale: false, reason: null };
  if (models.some(m => m.value === modelId)) return { stale: false, reason: null };

  const stripVersion = s => s.replace(/-\d+(-\d+)?$/, '');
  const base = stripVersion(modelId);
  const sameBaseExists = models.some(m => stripVersion(m.value) === base);

  return {
    stale: true,
    reason: sameBaseExists ? 'Model version upgraded' : 'Model no longer exists',
  };
}
