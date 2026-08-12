// Shared by any per-role checklist (currently only the PM's pm_checklist) that wants
// to expose "resolved / total" as a labelled progress bar. Reuse this for a future
// role's checklist rather than re-deriving the ratio inline.
export function getChecklistProgress(checklist) {
  const items = Array.isArray(checklist) ? checklist : [];
  const resolved = items.filter(i => i.resolved).length;
  const total = items.length;
  return {
    resolved,
    total,
    percent: total > 0 ? Math.round((resolved / total) * 100) : 0,
  };
}
