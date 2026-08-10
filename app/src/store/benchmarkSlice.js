import { benchmarkApi } from '../api';

function pollRun(get, set, caseId, runId) {
  const POLL_MS = 2000;
  const TIMEOUT_MS = 90000;
  const deadline = Date.now() + TIMEOUT_MS;

  const tick = async () => {
    let run;
    try { run = await benchmarkApi.getRun(runId); }
    catch { return; } // panel may have unmounted / run deleted — stop quietly

    set(s => ({
      benchmarkRunsByCaseId: {
        ...s.benchmarkRunsByCaseId,
        [caseId]: (s.benchmarkRunsByCaseId[caseId] || []).map(r => (r.id === runId ? run : r)),
      },
    }));

    if (['completed', 'error', 'timeout'].includes(run.status)) return;
    if (Date.now() > deadline) return;
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
  async draftBenchmarkCase(projectId, subscriptionId) {
    return benchmarkApi.draftCase({ project_id: projectId, subscription_id: subscriptionId });
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
