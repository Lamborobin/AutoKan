import { benchmarkApi } from '../api';

// Module-level (not component state) so it survives remounts and is shared across
// every call site that might try to poll the same run — StrictMode's double-effect,
// loadBenchmarkRuns re-firing on every panel mount, and a fresh runBenchmarkCase call
// could otherwise each start their own independent 2s loop for the same runId, with
// nothing to cancel the old ones. At most one active loop per runId, ever.
const activePolls = new Set();

function pollRun(get, set, caseId, runId) {
  if (activePolls.has(runId)) return;
  activePolls.add(runId);

  const POLL_MS = 2000;
  // Matches benchmarkRunner.js's pollAndScore/waitForSettlement timeout (210s) — this
  // must stay >= the backend's own timeout, or the UI stops polling and goes stale
  // before the backend even finishes, showing "waiting" forever on a run that actually
  // completed. A margin over the backend value covers request/poll-tick latency.
  const TIMEOUT_MS = 240000;
  const deadline = Date.now() + TIMEOUT_MS;

  const stop = () => activePolls.delete(runId);

  const tick = async () => {
    let run;
    try { run = await benchmarkApi.getRun(runId); }
    catch { stop(); return; } // panel may have unmounted / run deleted — stop quietly

    set(s => ({
      benchmarkRunsByCaseId: {
        ...s.benchmarkRunsByCaseId,
        [caseId]: (s.benchmarkRunsByCaseId[caseId] || []).map(r => (r.id === runId ? run : r)),
      },
    }));

    if (['completed', 'error', 'timeout'].includes(run.status)) { stop(); return; }
    if (Date.now() > deadline) { stop(); return; }
    setTimeout(tick, POLL_MS);
  };
  setTimeout(tick, POLL_MS);
}

export const createBenchmarkSlice = (set, get) => ({
  // ── State ─────────────────────────────────────────────────────
  benchmarkCases: [],
  benchmarkRunsByCaseId: {},
  benchmarkLoading: false,

  // ── Cases ─────────────────────────────────────────────────────
  // scope: 'board' (cases pinned to one project) | 'workspace' (cases with no fixed
  // project — run against whichever real board the user picks at run time).
  async loadBenchmarkCases(scope, { subscriptionId, projectId }) {
    set({ benchmarkLoading: true });
    try {
      const params = scope === 'board'
        ? { project_id: projectId, layer: 'board' }
        : { subscription_id: subscriptionId, layer: 'workspace' };
      const cases = await benchmarkApi.listCases(params);
      set({ benchmarkCases: cases, benchmarkLoading: false });
      await Promise.all(cases.map(c => get().loadBenchmarkRuns(c.id)));
    } catch { set({ benchmarkLoading: false }); }
  },

  // Returns a draft { title, description, rule_reference, rubric } — nothing is
  // persisted until saveBenchmarkCase is called.
  async draftBenchmarkCase(projectId, subscriptionId, capability) {
    return benchmarkApi.draftCase({ project_id: projectId, subscription_id: subscriptionId, capability });
  },

  async saveBenchmarkCase(data) {
    const created = await benchmarkApi.createCase(data);
    set(s => ({ benchmarkCases: [created, ...s.benchmarkCases] }));
    return created;
  },

  async deleteBenchmarkCase(id) {
    await benchmarkApi.deleteCase(id);
    set(s => ({
      benchmarkCases: s.benchmarkCases.filter(c => c.id !== id),
      benchmarkRunsByCaseId: Object.fromEntries(Object.entries(s.benchmarkRunsByCaseId).filter(([k]) => k !== id)),
    }));
  },

  // ── Runs ──────────────────────────────────────────────────────
  async loadBenchmarkRuns(caseId) {
    const runs = await benchmarkApi.listRuns(caseId);
    set(s => ({ benchmarkRunsByCaseId: { ...s.benchmarkRunsByCaseId, [caseId]: runs } }));
    // A run can still be mid-flight on the server from a previous page load/tab —
    // pollRun only ever gets started by runBenchmarkCase below, so without this a run
    // that was "dispatched" when this fetch landed would sit stuck at that status in
    // the UI forever, even after the backend actually finishes it.
    for (const run of runs) {
      if (['pending', 'dispatched'].includes(run.status)) pollRun(get, set, caseId, run.id);
    }
  },

  async runBenchmarkCase(caseId, projectId) {
    const run = await benchmarkApi.runCase(caseId, projectId);
    set(s => ({
      benchmarkRunsByCaseId: { ...s.benchmarkRunsByCaseId, [caseId]: [run, ...(s.benchmarkRunsByCaseId[caseId] || [])] },
    }));
    pollRun(get, set, caseId, run.id);
    return run;
  },

  async reviewRunWithAI(runId, caseId) {
    const run = await benchmarkApi.reviewWithAI(runId);
    set(s => ({
      benchmarkRunsByCaseId: {
        ...s.benchmarkRunsByCaseId,
        [caseId]: (s.benchmarkRunsByCaseId[caseId] || []).map(r => (r.id === runId ? run : r)),
      },
    }));
    return run;
  },

  async submitManualReviewForRun(runId, caseId, level, notes) {
    const run = await benchmarkApi.reviewManually(runId, level, notes);
    set(s => ({
      benchmarkRunsByCaseId: {
        ...s.benchmarkRunsByCaseId,
        [caseId]: (s.benchmarkRunsByCaseId[caseId] || []).map(r => (r.id === runId ? run : r)),
      },
    }));
    return run;
  },
});
