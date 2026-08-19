const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { attachAgent } = require('../middleware/auth');
const {
  createRunAndDispatch,
  reviewWithAI,
  submitManualReview,
  draftCaseFromBoard,
  draftRubricForTask,
  VALID_CAPABILITIES,
  PLANNING_CAPABILITY,
} = require('../services/benchmarkRunner');
const { getValidModelIds } = require('../services/modelRegistry');

const router = express.Router();

const VALID_SOURCES = ['manual', 'ai_generated', 'ai_edited', 'cloned_task'];
const VALID_LAYERS = ['workspace', 'board'];

// Returns true for JWT-authenticated users and legacy X-Agent-Id: human — this
// feature is a human/board-admin tool, never something an AI agent calls itself.
function isHuman(req) {
  return !!(req.user || req.headers['x-agent-id'] === 'human');
}

function fmtCase(c) {
  return { ...c, rubric: JSON.parse(c.rubric || '{}') };
}

function fmtRun(r) {
  return {
    ...r,
    deterministic_result: r.deterministic_result ? JSON.parse(r.deterministic_result) : null,
    judge_result: r.judge_result ? JSON.parse(r.judge_result) : null,
    manual_review: r.manual_review ? JSON.parse(r.manual_review) : null,
    context_version: r.context_version ? JSON.parse(r.context_version) : [],
  };
}

// GET /api/benchmark/cases?subscription_id=&project_id=&layer=
router.get('/cases', attachAgent, (req, res) => {
  const db = getDb();
  const { subscription_id, project_id, layer } = req.query;
  let query = 'SELECT * FROM benchmark_cases WHERE archived_at IS NULL';
  const params = [];
  if (subscription_id) { query += ' AND subscription_id = ?'; params.push(subscription_id); }
  if (project_id) { query += ' AND project_id = ?'; params.push(project_id); }
  if (layer) { query += ' AND layer = ?'; params.push(layer); }
  query += ' ORDER BY created_at DESC';
  res.json(db.prepare(query).all(...params).map(fmtCase));
});

// POST /api/benchmark/cases — save a task (any of the 4 creation modes land here:
// manual, ai_generated, ai_edited, cloned_task — `source` just records which one).
// The user only ever supplies a title + description. If no rubric came along with
// it (manual entry, or cloned from a real task), one is generated here automatically —
// scoring mechanics are strictly backend, never something the user configures.
router.post('/cases', attachAgent, async (req, res) => {
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can create benchmark tasks' });
  const db = getDb();
  const { subscription_id, project_id, layer, title, description, rubric, rule_reference, source, capability, acceptance_criteria } = req.body;

  if (!subscription_id || !layer || !title || !description) {
    return res.status(400).json({ error: 'subscription_id, layer, title, and description are required' });
  }
  if (!VALID_LAYERS.includes(layer)) {
    return res.status(400).json({ error: `layer must be one of: ${VALID_LAYERS.join(', ')}` });
  }
  if (capability && !VALID_CAPABILITIES.includes(capability)) {
    return res.status(400).json({ error: `capability must be one of: ${VALID_CAPABILITIES.join(', ')}` });
  }
  const resolvedCapability = capability || PLANNING_CAPABILITY;
  const resolvedSource = source && VALID_SOURCES.includes(source) ? source : 'manual';
  const needsRubric = !rubric || Object.keys(rubric).length === 0;

  const id = 'bmc_' + uuidv4().replace(/-/g, '').slice(0, 12);
  db.prepare(`
    INSERT INTO benchmark_cases (id, subscription_id, project_id, layer, capability, rule_reference, title, description, acceptance_criteria, rubric, source, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, subscription_id, project_id || null, layer, resolvedCapability, rule_reference || null, title, description, acceptance_criteria || null, JSON.stringify(rubric || {}), resolvedSource, req.user?.sub || null);

  res.status(201).json(fmtCase(db.prepare('SELECT * FROM benchmark_cases WHERE id = ?').get(id)));

  // Scoring rubric isn't needed until the case is actually run, so don't block the
  // create response on an LLM round-trip — draft it in the background and patch it in.
  if (needsRubric) {
    draftRubricForTask(title, description, project_id || null, subscription_id, resolvedCapability)
      .then(draftedRubric => {
        db.prepare('UPDATE benchmark_cases SET rubric = ? WHERE id = ?')
          .run(JSON.stringify(draftedRubric || {}), id);
      })
      .catch(err => console.error('[benchmark] background rubric draft failed:', err.message));
  }
});

// POST /api/benchmark/cases/draft — AI drafts title/description/rubric from a board's
// real docs. Returns the draft only — nothing is persisted until POST /cases saves it.
router.post('/cases/draft', attachAgent, async (req, res) => {
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can request an AI draft' });
  const { project_id, subscription_id, capability } = req.body;
  if (!project_id || !subscription_id) {
    return res.status(400).json({ error: 'project_id and subscription_id are required' });
  }
  if (capability && !VALID_CAPABILITIES.includes(capability)) {
    return res.status(400).json({ error: `capability must be one of: ${VALID_CAPABILITIES.join(', ')}` });
  }
  try {
    const draft = await draftCaseFromBoard(project_id, subscription_id, capability || PLANNING_CAPABILITY);
    res.json(draft);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/benchmark/cases/:id — edit an existing case's fields
router.patch('/cases/:id', attachAgent, (req, res) => {
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can edit benchmark cases' });
  const db = getDb();
  const existing = db.prepare('SELECT * FROM benchmark_cases WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Case not found' });

  const { title, description, rubric, acceptance_criteria } = req.body;
  db.prepare(`
    UPDATE benchmark_cases SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      acceptance_criteria = CASE WHEN ? THEN ? ELSE acceptance_criteria END,
      rubric = COALESCE(?, rubric)
    WHERE id = ?
  `).run(title || null, description || null,
    acceptance_criteria !== undefined ? 1 : 0, acceptance_criteria || null,
    rubric ? JSON.stringify(rubric) : null, req.params.id);

  res.json(fmtCase(db.prepare('SELECT * FROM benchmark_cases WHERE id = ?').get(req.params.id)));
});

// POST /api/benchmark/cases/:id/draft-rubric — (re)generate a rubric for an existing
// case. Exists because the background draft on creation (see POST /cases) can fail
// silently — nothing surfaces that today, so a case can end up with rubric={} forever,
// which also means it never gets an automatic AI review (pollAndScore only calls the
// judge when the rubric actually has judge criteria in it).
router.post('/cases/:id/draft-rubric', attachAgent, async (req, res) => {
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can draft a rubric' });
  const db = getDb();
  const caseRow = db.prepare('SELECT * FROM benchmark_cases WHERE id = ?').get(req.params.id);
  if (!caseRow) return res.status(404).json({ error: 'Case not found' });

  try {
    const rubric = await draftRubricForTask(
      caseRow.title, caseRow.description, caseRow.project_id, caseRow.subscription_id, caseRow.capability || PLANNING_CAPABILITY
    );
    db.prepare('UPDATE benchmark_cases SET rubric = ? WHERE id = ?').run(JSON.stringify(rubric || {}), req.params.id);
    res.json(fmtCase(db.prepare('SELECT * FROM benchmark_cases WHERE id = ?').get(req.params.id)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/benchmark/cases/:id — archive if it has runs, hard-delete otherwise
router.delete('/cases/:id', attachAgent, (req, res) => {
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can delete benchmark cases' });
  const db = getDb();
  const existing = db.prepare('SELECT * FROM benchmark_cases WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Case not found' });

  const hasRuns = db.prepare('SELECT 1 FROM benchmark_runs WHERE case_id = ? LIMIT 1').get(req.params.id);
  if (hasRuns) {
    db.prepare(`UPDATE benchmark_cases SET archived_at = CURRENT_TIMESTAMP WHERE id = ?`).run(req.params.id);
    return res.json({ archived: true });
  }
  db.prepare('DELETE FROM benchmark_cases WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

// POST /api/benchmark/cases/:id/run — dispatch a probing task through the real planner flow
router.post('/cases/:id/run', attachAgent, async (req, res) => {
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can run benchmark cases' });
  const db = getDb();
  const caseRow = db.prepare('SELECT * FROM benchmark_cases WHERE id = ?').get(req.params.id);
  if (!caseRow) return res.status(404).json({ error: 'Case not found' });

  const projectId = req.body.project_id || caseRow.project_id;
  if (!projectId) return res.status(400).json({ error: 'project_id is required — pick a board to run this case against' });

  // Optional per-run model override — lets the same case be compared across models
  // without reassigning the board's real agent (see dev/upcoming-changes.md). Omit
  // or leave blank to run on whatever model the board's agent is actually configured with.
  const { model } = req.body;
  if (model && !getValidModelIds().has(model)) {
    return res.status(400).json({ error: `Unknown model "${model}"` });
  }

  try {
    const run = await createRunAndDispatch(caseRow, { projectId, userId: req.user?.sub || null, model: model || null });
    res.status(201).json(fmtRun(run));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/benchmark/runs?case_id=
router.get('/runs', attachAgent, (req, res) => {
  const db = getDb();
  const { case_id } = req.query;
  if (!case_id) return res.status(400).json({ error: 'case_id is required' });
  const runs = db.prepare('SELECT * FROM benchmark_runs WHERE case_id = ? ORDER BY started_at DESC').all(case_id);
  res.json(runs.map(fmtRun));
});

// GET /api/benchmark/runs/:id
router.get('/runs/:id', attachAgent, (req, res) => {
  const db = getDb();
  const run = db.prepare('SELECT * FROM benchmark_runs WHERE id = ?').get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json(fmtRun(run));
});

// POST /api/benchmark/runs/:id/review-ai — on-demand judge call (alternative to manual review)
router.post('/runs/:id/review-ai', attachAgent, async (req, res) => {
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can trigger an AI review' });
  try {
    const run = await reviewWithAI(req.params.id);
    res.json(fmtRun(run));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/benchmark/runs/:id/review-manual — on-demand manual review (alternative to AI review)
router.post('/runs/:id/review-manual', attachAgent, (req, res) => {
  if (!isHuman(req)) return res.status(403).json({ error: 'Only humans can submit a manual review' });
  const { level, notes } = req.body;
  try {
    const run = submitManualReview(req.params.id, { level, notes, reviewerId: req.user?.sub || null });
    res.json(fmtRun(run));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
