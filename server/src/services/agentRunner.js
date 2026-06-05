const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { v4: uuidv4 } = require('uuid');
const { exec, execSync } = require('child_process');
const util = require('util');
const { getDb } = require('../db');
const { broadcast } = require('../sse');
const { resolveInstructionPath } = require('../utils/instructions');
const { notifyHumanActionMembers } = require('./notificationsService');
const { writeFileSafe } = require('../utils/writeGuard');
const runnersRegistry = require('../seed/runners.json');

// ── Runner registry helpers ──────────────────────────────────────────────────
// Single source of truth for (capability, column) → handler mapping lives in
// server/src/seed/runners.json. Adding a new runner = add a registry entry +
// (optionally) create the personality_file + (if no existing handler fits) implement one below.

function findRunner(capability, columnId) {
  return runnersRegistry.runners.find(r => r.capability === capability && r.column === columnId) || null;
}

function getAgentCapability(agent) {
  try {
    const roleIds = JSON.parse(agent.role_ids || '[]');
    return roleIds.find(r => r.startsWith('perm_')) || null;
  } catch { return null; }
}

// ── Runner runtime prompts ──────────────────────────────────────────────────
// System-owned markdown templates live in server/src/services/runner-prompts/.
// They hold the "## Instructions" block each handler sends alongside the task
// brief — git workflow, exit semantics, tool usage. NOT in instructions/ because
// they MUST NOT be user-editable; editing changes runner mechanics.
//
// Template syntax: {varName} placeholders. Unknown vars are left as-is so any
// typo is visible to the operator. Missing files log a one-time warning and
// return '' (the handler still works — the task brief alone identifies the job).

const RUNNER_PROMPTS_DIR = path.join(__dirname, 'runner-prompts');
const _runnerPromptWarned = new Set();
function loadRunnerPrompt(name, vars = {}) {
  const filePath = path.join(RUNNER_PROMPTS_DIR, `${name}.md`);
  let template;
  try {
    template = fs.readFileSync(filePath, 'utf8');
  } catch {
    if (!_runnerPromptWarned.has(name)) {
      _runnerPromptWarned.add(name);
      console.warn(`[AgentRunner] Runner prompt not found: server/src/services/runner-prompts/${name}.md. Handler will continue without its instructions block.`);
    }
    return '';
  }
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  );
}

function broadcastTask(db, taskId) {
  const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!t) return;
  const isLocked = t.pm_approval_status != null &&
    !(t.pm_approval_status === 'approved' && t.human_approval_status === 'approved');
  broadcast('task_updated', {
    task: {
      ...t,
      tags: JSON.parse(t.tags || '[]'),
      metadata: JSON.parse(t.metadata || '{}'),
      pm_checklist: t.pm_checklist ? JSON.parse(t.pm_checklist) : null,
      is_locked: isLocked,
    },
  });
}

const execAsync = util.promisify(exec);

const PROJECT_ROOT = path.join(__dirname, '../../..');

// ---------------------------------------------------------------------------
// GitHub PR creation (no gh CLI required — uses token from env or git remote)
// ---------------------------------------------------------------------------

function getGithubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    const remote = require('child_process')
      .execSync('git remote get-url origin', { cwd: PROJECT_ROOT }).toString().trim();
    const match = remote.match(/https:\/\/[^:]+:([^@]+)@github\.com/);
    return match ? match[1] : null;
  } catch { return null; }
}

function getGithubRepoInfo() {
  try {
    const remote = require('child_process')
      .execSync('git remote get-url origin', { cwd: PROJECT_ROOT }).toString().trim();
    const match = remote.match(/github\.com[/:]([^/]+)\/(.+?)(?:\.git)?$/);
    return match ? { owner: match[1], repo: match[2] } : null;
  } catch { return null; }
}

function githubRequest({ path, method = 'GET', body = null }) {
  const token = getGithubToken();
  const repoInfo = getGithubRepoInfo();
  if (!token || !repoInfo) return Promise.resolve(null);

  const payload = body ? JSON.stringify(body) : null;
  const headers = {
    'Authorization': `token ${token}`,
    'User-Agent': 'AutoKan-agent-runner',
    'Accept': 'application/vnd.github.v3+json',
  };
  if (payload) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(payload);
  }

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: path.replace('{owner}', repoInfo.owner).replace('{repo}', repoInfo.repo),
      method,
      headers,
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    if (payload) req.write(payload);
    req.end();
  });
}

async function createGithubPr({ title, body, head, base = 'master' }) {
  const json = await githubRequest({
    path: '/repos/{owner}/{repo}/pulls',
    method: 'POST',
    body: { title, body, head, base },
  });
  if (!json || !json.html_url) return null;
  return { url: json.html_url, number: json.number };
}

async function mergeGithubPr(prNumber) {
  const json = await githubRequest({
    path: `/repos/{owner}/{repo}/pulls/${prNumber}/merge`,
    method: 'PUT',
    body: { merge_method: 'merge' },
  });
  return json && (json.merged === true || json.sha);
}

// ---------------------------------------------------------------------------
// Git worktree helpers — one isolated directory per implementation task
// ---------------------------------------------------------------------------

function createWorktree(taskId) {
  const worktreePath = path.resolve(PROJECT_ROOT, '..', `AutoKan-wt-${taskId}`);
  const branch = `feature/${taskId}`;

  if (fs.existsSync(worktreePath)) {
    console.log(`[AgentRunner] Worktree already exists: ${worktreePath}`);
    return worktreePath;
  }

  try {
    execSync(`git worktree add "${worktreePath}" -b ${branch}`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
  } catch {
    // Branch may already exist from a previous run — add without -b
    execSync(`git worktree add "${worktreePath}" ${branch}`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
  }

  console.log(`[AgentRunner] Created worktree: ${worktreePath} (${branch})`);
  return worktreePath;
}

function removeWorktree(worktreePath) {
  try {
    execSync(`git worktree remove --force "${worktreePath}"`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
    console.log(`[AgentRunner] Removed worktree: ${worktreePath}`);
  } catch (err) {
    console.error(`[AgentRunner] Failed to remove worktree ${worktreePath}:`, err.message);
  }
}

// CLAUDE.md is loaded for all agents — it contains the context file table and project rules.
// README.md is loaded only for agents whose capability is_coder=true in runners.json.
const CODER_CAPABILITIES = runnersRegistry.capabilities.filter(c => c.is_coder).map(c => c.id);

// Lazy-init so dotenv has time to load before we read the key
let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set in server/.env');
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

const CHECKLIST_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    item: {
      type: 'string',
      description: 'A plain-language label for one decision or confirmation the client needs to make. Write from the client\'s perspective — what THEY need to decide, not what the developer will implement. Use simple language, no jargon. GOOD: "Should clicking Shoes open a product list or just a category page?" BAD: "Backend category exists or needs creation". GOOD: "Where should Shoes appear in the navigation?" BAD: "Menu placement specified (top-level or nested)". GOOD: "Should shoe products be shown right away or added later?" BAD: "Product data source confirmed". Never use meta/process labels like "Acceptance criteria defined" — instead ask the actual question that surfaces what done looks like.'
    },
    resolved: { type: 'boolean', description: 'True if this requirement is now confirmed by the conversation' }
  },
  required: ['item', 'resolved']
};

// Tools available to the clarify_and_approve handler — ask the human a
// clarifying question, or approve the task once everything is resolved.
const CLARIFICATION_TOOLS = [
  {
    name: 'ask_question',
    description: 'Send a clarifying message to the human. Lead with a one-sentence summary of what you understand is being built. Then list open questions as a numbered list — ask everything at once on first contact. On follow-up: ask at most ONE targeted question. Always provide the updated checklist with resolved items marked. Checklist items must be plain client-friendly decisions, not technical steps. If the task seems large, include a task breakdown suggestion in the message.',
    input_schema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'Your message to the human. On first contact write all questions as a numbered list: "1. ... 2. ... 3. ...". On follow-up write one focused question only.'
        },
        checklist: {
          type: 'array',
          description: 'Full list of all planning checklist items. Mark resolved: true for items confirmed so far.',
          items: CHECKLIST_ITEM_SCHEMA
        }
      },
      required: ['question', 'checklist']
    }
  },
  {
    name: 'approve_task',
    description: 'Approve the task when ALL checklist items are resolved and you are fully satisfied it is ready for a developer.',
    input_schema: {
      type: 'object',
      properties: {
        comment: {
          type: 'string',
          description: "A clear requirements summary written so both the client and developer can understand it. Structure it as: **What to build** (plain description of the feature), **Key decisions** (what was agreed during planning), **Done when** (concrete acceptance criteria). Keep it concise — 3-6 bullet points max."
        },
        acceptance_criteria: {
          type: 'string',
          description: "Concrete, testable acceptance scenarios derived from the Done-when bullets. Write as a bullet list — each item should be independently verifiable (e.g. '• Clicking Makeup in nav opens the category page with Lips, Eyes, Face subcategories'). These will be saved as the task's acceptance criteria and used by whichever runner validates the work later."
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical'],
          description: "Your assessment of how urgent this task is for the business. critical = blocks the product or revenue; high = important soon; medium = planned improvement; low = nice-to-have."
        },
        complexity: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: "Your estimate of implementation effort/risk. low = simple isolated change; medium = touches multiple areas or has moderate risk; high = significant architectural change, cross-cutting concerns, or high uncertainty."
        },
        checklist: {
          type: 'array',
          description: 'Final checklist with all items marked resolved: true.',
          items: CHECKLIST_ITEM_SCHEMA
        },
        client_context_draft: {
          type: 'string',
          description: `Optional. If this conversation confirmed something genuinely worth remembering about the client as a whole — not just for this task — write a short bullet list here. The human will review and edit it before anything is saved.

THE KEY TEST before including a bullet: "Would this fact still be useful to know on a completely different future task?" If yes, include it. If it only makes sense in the context of what was just built, leave it out.

WHAT TO INCLUDE — things that describe the client in general:
- Contact details: email addresses used for specific purposes ("info@company.com is used for customer enquiries")
- Lasting preferences: how they always want things to feel or work across the site ("client prefers clean, minimal design — avoid clutter")
- Audience facts: who their customers are, their technical level, their expectations
- Business rules that apply broadly ("no database storage of customer data — email notification only")
- Tone and voice guidelines ("all copy should be friendly but professional")
- Background context: legacy systems, existing tools, history that future agents should know

WHAT TO LEAVE OUT — things that only describe how this specific task was built:
- Where a button goes, which page something appears on
- Specific wording chosen for this feature's confirmation message
- Which method was used to solve a problem in this task
- Anything that would need rewriting the moment a different task starts

LANGUAGE RULES:
- Bullet points only, one fact per line, starting with "• "
- Plain everyday language. No developer or technical terms. Describe what something does, not what it is called. Bad: "honeypot spam protection". Good: "• Spam filtering on forms should be invisible to the user — no puzzles or tick-boxes". Bad: "SMTP emailService wrapper". Good: "• Customer emails go to info@company.com".
- Write as if briefing a new person joining the project who has never spoken to the client.

If nothing genuinely reusable was learned in this conversation, omit this field entirely.`
        }
      },
      required: ['comment', 'checklist']
    }
  }
];

// Reads an instruction file. Returns '' if missing — instruction files are ADDITIVE
// PERSONALITY, never required for the runner to function. Missing is logged once so
// it's visible to operators, but the agent runs fine via the baked-in baseline below.
const _warnedMissing = new Set();
function readFile(filePath, subscriptionId, projectId) {
  if (!filePath) return '';
  try {
    const resolved = resolveInstructionPath(filePath, subscriptionId, projectId);
    return fs.readFileSync(resolved, 'utf8');
  } catch {
    const key = `${filePath}|${subscriptionId || ''}|${projectId || ''}`;
    if (!_warnedMissing.has(key)) {
      _warnedMissing.add(key);
      console.warn(`[AgentRunner] Personality file not found: ${filePath} (sub=${subscriptionId}, proj=${projectId}). Runner will continue using the baked-in baseline + any other available context layers.`);
    }
    return '';
  }
}

// Runner personality file basenames — these are loaded into the matching agent's
// SYSTEM PROMPT via buildSystemPrompt, so they're excluded from the workspace
// context scan. Otherwise every agent's context would be spammed with every other
// capability's persona ("You're a coder" landing in PM's context, etc.).
const RUNNER_PERSONALITY_BASENAMES = new Set(
  runnersRegistry.runners
    .map(r => r.personality_file)
    .filter(Boolean)
    .map(p => path.basename(p))
);

function readAbs(absPath) {
  try { return fs.readFileSync(absPath, 'utf8'); }
  catch { return ''; }
}

// Parse YAML-style front matter from a markdown file.
// Returns { meta: { key: value }, body: string (content without front matter) }
// Files without front matter return meta={}, body=full content.
function parseFrontMatter(content) {
  if (!content.startsWith('---\n')) return { meta: {}, body: content };
  const end = content.indexOf('\n---', 4);
  if (end === -1) return { meta: {}, body: content };
  const block = content.slice(4, end);
  const meta = {};
  for (const line of block.split('\n')) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
  }
  return { meta, body: content.slice(end + 5).trimStart() };
}

function safeListMd(folder, excludeBasenames = new Set()) {
  if (!fs.existsSync(folder)) return [];
  try {
    return fs.readdirSync(folder, { withFileTypes: true })
      .filter(d => d.isFile() && d.name.endsWith('.md') && !excludeBasenames.has(d.name))
      .map(d => d.name)
      .sort();
  } catch { return []; }
}

// Build the context block that goes into every agent's initial user message.
// Sources, all optional, all dedup'd:
//   1. Global files (CLAUDE.md always; README.md for coder capabilities)
//   2. Capability docs — docs/ files mapped to the agent's capability via
//      context_docs in runners.json (every app agent gets docs/rules.md)
//   3. Workspace context — auto-scan top-level .md in instructions/{sub}/
//      (excluding runner personality files — those go into the system prompt)
//   4. Board context — auto-scan top-level .md in instructions/{sub}/{proj}/
function buildContextBlock(agent, subscriptionId, projectId) {
  const agentCapabilities = JSON.parse(agent.role_ids || '[]');
  const isCoderAgent = CODER_CAPABILITIES.some(cap => agentCapabilities.includes(cap));
  const sections = [];
  const includedAbsPaths = new Set();

  function pushFromAbs(absPath, label) {
    if (includedAbsPaths.has(absPath)) return;
    const content = readAbs(absPath);
    if (!content) return;
    includedAbsPaths.add(absPath);
    sections.push(`## [${label}]\n${content}`);
  }

  // 1. Global files
  for (const name of ['CLAUDE.md', ...(isCoderAgent ? ['README.md'] : [])]) {
    pushFromAbs(path.join(PROJECT_ROOT, name), name.replace('.md', '').toUpperCase());
  }

  // 2. Capability docs mapped in runners.json (context_docs) — e.g. docs/rules.md
  const capability = getAgentCapability(agent);
  const capDef = capability ? runnersRegistry.capabilities.find(c => c.id === capability) : null;
  for (const docPath of (capDef?.context_docs || [])) {
    pushFromAbs(path.join(PROJECT_ROOT, docPath), path.basename(docPath, '.md').toUpperCase());
  }

  // 3. Workspace context (subscription-level)
  if (subscriptionId) {
    const workspaceFolder = path.join(PROJECT_ROOT, 'instructions', subscriptionId);
    for (const fileName of safeListMd(workspaceFolder, RUNNER_PERSONALITY_BASENAMES)) {
      pushFromAbs(
        path.join(workspaceFolder, fileName),
        `WORKSPACE/${fileName.replace('.md', '').toUpperCase()}`,
      );
    }
  }

  // 4. Board context (per-project) — filtered by capabilities front matter
  if (subscriptionId && projectId) {
    const boardFolder = path.join(PROJECT_ROOT, 'instructions', subscriptionId, projectId);
    const agentCap = getAgentCapability(agent);
    for (const fileName of safeListMd(boardFolder)) {
      const absPath = path.join(boardFolder, fileName);
      if (includedAbsPaths.has(absPath)) continue;
      const raw = readAbs(absPath);
      if (!raw) continue;
      const { meta, body } = parseFrontMatter(raw);
      // If the file declares capabilities, only load it for matching agents
      if (meta.capabilities) {
        const allowed = meta.capabilities.split(',').map(c => c.trim()).filter(Boolean);
        if (!agentCap || !allowed.includes(agentCap)) continue;
      }
      includedAbsPaths.add(absPath);
      if (body) sections.push(`## [BOARD/${fileName.replace('.md', '').toUpperCase()}]\n${body}`);
    }
  }

  return sections.join('\n\n---\n\n');
}

// Minimal baked-in baseline. Used when ALL personality layers are missing or empty —
// guarantees the model always has something identifying its role. The agent's own
// system_prompt and the template's fallback are ADDITIVE personality on top.
function bakedBaseline(runner) {
  const cap = runner?.capability || 'agent';
  const col = runner?.column || 'this column';
  return `You are an agent operating in AutoKan. Your assigned capability is "${cap}" and you have been triggered because a task landed in ${col}. Use the tools provided to do your job, escalate via request_human when uncertain, and don't fake completion. The personality and methodology guidance in your system prompt is additive context — if any of it appears missing, fall back to honest, careful default behaviour for your capability.`;
}

function buildSystemPrompt(agent, runner, subscriptionId, projectId) {
  // Personality file: runner's wins when present (defines the flow for this
  // capability+column pair). Falls back to the agent's. Both are OPTIONAL —
  // missing files yield '' and the baseline below ensures we still have a system prompt.
  const personalityFile = runner?.personality_file || agent.personality_file || '';
  const fileContent = readFile(personalityFile, subscriptionId, projectId);

  // Per-agent personality (layer 6): the agent's own system_prompt always applies
  // when set. Template personality (layer 5) is fetched fresh from agent_templates
  // (so template edits propagate) and used as the fallback for agents created from
  // a template that haven't customised. No dependency on is_template — a from-scratch
  // agent's own system_prompt is honoured too.
  let templatePersonality = '';
  if (agent.created_from_template_id) {
    const tpl = getDb().prepare('SELECT template_system_prompt FROM agent_templates WHERE id = ?')
      .get(agent.created_from_template_id);
    templatePersonality = tpl?.template_system_prompt || '';
  }
  const agentPersonality = agent.system_prompt || templatePersonality || '';

  // Assemble: agent personality + capability personality (file). Both optional.
  const layered = [agentPersonality, fileContent].filter(Boolean).join('\n\n---\n\n');

  // If absolutely nothing came through, fall back to the baked-in baseline so the
  // model always has SOMETHING identifying its role and stance.
  return layered || bakedBaseline(runner);
}

async function runClarifyAndApprove(task, agent, runner) {
  const db = getDb();
  const taskId = task.id;

  // Trigger guard from runner config (e.g. don't re-run if already approved)
  if (task.pm_approval_status === 'approved') return;
  // Don't re-run while waiting for human to answer
  if (task.pm_pending_question) return;

  // Get conversation history (questions + answers only)
  const conversationLogs = db.prepare(`
    SELECT action, message, created_at FROM task_logs
    WHERE task_id = ? AND action IN ('pm_question', 'human_answer')
    ORDER BY created_at ASC
  `).all(taskId);

  const project = task.project_id ? db.prepare('SELECT subscription_id FROM projects WHERE id = ?').get(task.project_id) : null;
  const subscriptionId = project?.subscription_id || null;
  const systemPrompt = buildSystemPrompt(agent, runner, subscriptionId, task.project_id);
  const contextBlock = buildContextBlock(agent, subscriptionId, task.project_id);

  // Build a clear picture of the task + conversation so far
  const conversationText = conversationLogs.length === 0
    ? '(No conversation yet — this is your first look at the task.)'
    : conversationLogs.map(l =>
        l.action === 'pm_question'
          ? `I asked: ${l.message}`
          : `Human answered: ${l.message}`
      ).join('\n\n');

  const currentChecklist = task.pm_checklist ? JSON.parse(task.pm_checklist) : null;
  const allItemsResolved = currentChecklist && currentChecklist.length > 0 && currentChecklist.every(i => i.resolved);
  const isFinalReview = allItemsResolved && task.pm_approval_status !== 'approved';

  const checklistBlock = currentChecklist && currentChecklist.length > 0
    ? [
        `## Current Checklist State`,
        currentChecklist.map((i, idx) => {
          const who = i.manuallyResolved ? ' (manually checked by human)' : '';
          return `- [${i.resolved ? 'x' : ' '}] ${i.item}${who}`;
        }).join('\n'),
        '',
        isFinalReview
          ? `ALL items are resolved. FINAL REVIEW MODE — see instructions below.`
          : `Re-evaluate each item based on the conversation. Mark newly resolved items. Preserve any manually-checked items unless you have a specific concern.`
      ].join('\n')
    : '';

  const turnPromptName = isFinalReview
    ? 'clarify-final-review'
    : conversationLogs.length === 0
      ? 'clarify-first-contact'
      : 'clarify-followup';
  const yourTurnBlock = loadRunnerPrompt(turnPromptName, {
    priority: task.priority,
    complexity: task.complexity,
  });

  const userMessage = [
    contextBlock ? `## Context Files\n${contextBlock}` : '',
    `## Task to Review`,
    `ID: ${task.id}`,
    `Title: ${task.title}`,
    `Description: ${task.description || '(no description provided)'}`,
    `Acceptance Criteria: ${task.acceptance_criteria || '(none)'}`,
    `Priority: ${task.priority} | Complexity: ${task.complexity}`,
    ``,
    `## Planning Conversation So Far`,
    conversationText,
    ``,
    checklistBlock,
    yourTurnBlock,
  ].filter(Boolean).join('\n');

  let response;
  try {
    response = await getClient().messages.create({
      model: agent.model || runner.model_default || 'claude-opus-4-5',
      max_tokens: 1024,
      system: systemPrompt,
      tools: getToolSet(runner),
      messages: [{ role: 'user', content: userMessage }]
    });
  } catch (err) {
    console.error(`[AgentRunner][${runner.id}][${taskId}] API error:`, err.message);
    return;
  }

  // Execute whichever tool the agent chose
  for (const block of response.content) {
    if (block.type !== 'tool_use') continue;

    if (block.name === 'ask_question') {
      const { question, checklist = [] } = block.input;
      db.prepare(`UPDATE tasks SET pm_approval_status = 'questioning', pm_pending_question = ?, pm_checklist = ? WHERE id = ?`)
        .run(question, JSON.stringify(checklist), taskId);
      db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
        .run(uuidv4(), taskId, agent.id, 'pm_question', question);
      console.log(`[AgentRunner][${runner.id}][${taskId}] asked clarifying question`);
      broadcastTask(db, taskId);

    } else if (block.name === 'approve_task') {
      const { comment, checklist = [], acceptance_criteria = '', priority, complexity, client_context_draft } = block.input;
      const resolvedChecklist = checklist.map(i => ({ ...i, resolved: true }));
      db.prepare(`
        UPDATE tasks SET pm_approval_status = 'approved', pm_review_comment = ?, pm_review_date = CURRENT_TIMESTAMP, pm_checklist = ?,
          pm_client_context_draft = ?
        WHERE id = ?
      `).run(comment, JSON.stringify(resolvedChecklist), client_context_draft || null, taskId);
      // Populate acceptance_criteria if the human hasn't already set one
      if (acceptance_criteria && !task.acceptance_criteria) {
        db.prepare(`UPDATE tasks SET acceptance_criteria = ? WHERE id = ?`).run(acceptance_criteria, taskId);
      }
      // Set priority and complexity from the agent's assessment (only if provided)
      const validPriorities = ['low', 'medium', 'high', 'critical'];
      const validComplexities = ['low', 'medium', 'high'];
      if (priority && validPriorities.includes(priority)) {
        db.prepare(`UPDATE tasks SET priority = ? WHERE id = ?`).run(priority, taskId);
      }
      if (complexity && validComplexities.includes(complexity)) {
        db.prepare(`UPDATE tasks SET complexity = ? WHERE id = ?`).run(complexity, taskId);
      }
      db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
        .run(uuidv4(), taskId, agent.id, 'pm_reviewed', `Approved — ${comment}`);
      console.log(`[AgentRunner][${runner.id}][${taskId}] approved task`);
      broadcastTask(db, taskId);
    }
  }

  // If the model replied with text only (no tool call), log it as a question fallback
  if (!response.content.some(b => b.type === 'tool_use')) {
    const text = response.content.find(b => b.type === 'text')?.text;
    if (text) {
      db.prepare(`UPDATE tasks SET pm_approval_status = 'questioning', pm_pending_question = ? WHERE id = ?`)
        .run(text, taskId);
      db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
        .run(uuidv4(), taskId, agent.id, 'pm_question', text);
      broadcastTask(db, taskId);
    }
  }

}

// ---------------------------------------------------------------------------
// Handler: implement_in_worktree
// Iterative code-editing loop. Creates an isolated git worktree, lets the
// agent edit, commit, and push a feature branch, then opens a PR on complete.
// ---------------------------------------------------------------------------

const CLIENT_DIR = path.join(PROJECT_ROOT, 'client');

const IMPLEMENTATION_TOOLS = [
  {
    name: 'bash',
    description: 'Execute a shell command (git, gh, npm, etc.). Working directory is the repo root.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to run' }
      },
      required: ['command']
    }
  },
  {
    name: 'read_file',
    description: 'Read a file from the repository.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the repo root (e.g. client/src/App.jsx)' }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write or overwrite a file. Path must be within your assigned write scope — the server will reject out-of-scope paths.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to repo root' },
        content: { type: 'string', description: 'Full file content' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'task_log',
    description: 'Add a progress note to the task log.',
    input_schema: {
      type: 'object',
      properties: {
        progress: { type: 'number', description: 'Progress percentage 0-100' },
        message: { type: 'string', description: 'Log message describing what was done' }
      },
      required: ['message']
    }
  },
  {
    name: 'task_complete',
    description: 'Call this after pushing the branch. The server will create the PR automatically and move the task to Human Action for review.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Brief summary of what was implemented and which files changed' }
      },
      required: ['summary']
    }
  },
  {
    name: 'request_human',
    description: 'Flag the task as blocked and move it to Human Action. Use when you need a secret, permission, or cannot continue.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'What you need from the human and why' }
      },
      required: ['reason']
    }
  }
];

const BASH_FORBIDDEN = [
  { pattern: /git\s+merge\b/, reason: 'Merging branches is not allowed — the server handles PR merging.' },
  { pattern: /git\s+push\b(?!.*feature\/)/, reason: 'Only pushing to feature/* branches is allowed.' },
  { pattern: /git\s+push\s+.*\b(master|main)\b/, reason: 'Pushing directly to master/main is not allowed.' },
];

async function runBash(command, cwd = PROJECT_ROOT) {
  for (const { pattern, reason } of BASH_FORBIDDEN) {
    if (pattern.test(command)) {
      return { success: false, output: `BLOCKED: ${reason}` };
    }
  }
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: 60000,
      maxBuffer: 2 * 1024 * 1024
    });
    return { success: true, output: [stdout, stderr ? `STDERR: ${stderr}` : ''].filter(Boolean).join('\n').trim() };
  } catch (err) {
    return { success: false, output: (err.stdout || '') + (err.stderr ? `\nSTDERR: ${err.stderr}` : '') || err.message };
  }
}


function readFileFromDir(relPath, baseDir) {
  try {
    return fs.readFileSync(path.join(baseDir, relPath), 'utf8');
  } catch {
    return '';
  }
}

async function runImplementInWorktree(task, agent, runner) {
  const db = getDb();
  const taskId = task.id;

  // Create an isolated git worktree for this task so the main checkout is never touched
  let worktreePath;
  if (runner.use_worktree) {
    try {
      worktreePath = createWorktree(task.id);
    } catch (err) {
      console.error(`[AgentRunner] Failed to create worktree for task ${taskId}:`, err.message);
      db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
        .run(uuidv4(), taskId, agent.id, 'note', `Worktree setup failed: ${err.message}`);
      return;
    }
  }

  const project = task.project_id ? db.prepare('SELECT subscription_id FROM projects WHERE id = ?').get(task.project_id) : null;
  const subscriptionId = project?.subscription_id || null;
  const systemPrompt = buildSystemPrompt(agent, runner, subscriptionId, task.project_id);
  const contextBlock = buildContextBlock(agent, subscriptionId, task.project_id);

  const initialPrompt = [
    contextBlock ? `## Context Files\n${contextBlock}` : '',
    `## Your Assigned Task`,
    `ID: ${task.id}`,
    `Title: ${task.title}`,
    `Description: ${task.description || '(no description)'}`,
    `Acceptance Criteria: ${task.acceptance_criteria || '(none specified)'}`,
    `PM Brief: ${task.pm_review_comment || '(none — check task description)'}`,
    `Priority: ${task.priority} | Complexity: ${task.complexity}`,
    ``,
    loadRunnerPrompt('implement-in-worktree', { taskId: task.id, taskTitle: task.title }),
  ].filter(Boolean).join('\n');

  const messages = [{ role: 'user', content: initialPrompt }];

  let completed = false;
  const MAX_ITERATIONS = runner.max_iterations || 30;

  for (let i = 0; i < MAX_ITERATIONS && !completed; i++) {
    let response;
    try {
      response = await getClient().messages.create({
        model: agent.model || runner.model_default || 'claude-sonnet-4-5',
        max_tokens: 4096,
        system: systemPrompt,
        tools: getToolSet(runner),
        messages,
      });
    } catch (err) {
      console.error(`[AgentRunner][${runner.id}][${taskId}] API error:`, err.message);
      db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
        .run(uuidv4(), taskId, agent.id, 'note', `Handler error: ${err.message}`);
      if (worktreePath) removeWorktree(worktreePath);
      break;
    }

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') break;

    const toolResults = [];

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      let result;

      if (block.name === 'bash') {
        console.log(`[AgentRunner][${runner.id}][${taskId}] bash: ${block.input.command}`);
        result = await runBash(block.input.command, worktreePath);

      } else if (block.name === 'read_file') {
        const content = readFileFromDir(block.input.path, worktreePath);
        result = content ? { success: true, content } : { error: 'File not found' };

      } else if (block.name === 'write_file') {
        result = writeFileSafe(block.input.path, block.input.content, runner.capability, worktreePath || PROJECT_ROOT, { subscriptionId, projectId: task.project_id });

      } else if (block.name === 'task_log') {
        const { progress, message } = block.input;
        if (progress !== undefined) {
          db.prepare('UPDATE tasks SET progress = ? WHERE id = ?').run(progress, taskId);
        }
        db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
          .run(uuidv4(), taskId, agent.id, 'note', message);
        console.log(`[AgentRunner][${runner.id}][${taskId}] log: ${message}`);
        broadcastTask(db, taskId);
        result = { success: true };

      } else if (block.name === 'task_complete') {
        const { summary } = block.input;
        const prBody = `## Summary\n${summary}\n\n## Task\n${task.title}\n\n${task.acceptance_criteria ? `## Acceptance Criteria\n${task.acceptance_criteria}` : ''}`.trim();
        const pr = await createGithubPr({
          title: `[${taskId}] ${task.title}`,
          body: prBody,
          head: `feature/${taskId}`,
        });
        const pr_url = pr ? pr.url : '';

        if (task.auto_complete && pr) {
          // Auto-complete: merge PR immediately, move straight to Testing
          const merged = await mergeGithubPr(pr.number);
          const targetCol = merged ? 'col_testing' : 'col_humanaction';
          const reason = merged ? null : 'Auto-merge failed — please review and merge manually';
          db.prepare('UPDATE tasks SET progress = 100, column_id = ?, pr_url = ?, requires_human_action = ?, human_action_reason = ? WHERE id = ?')
            .run(targetCol, pr_url, merged ? 0 : 1, reason, taskId);
          db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
            .run(uuidv4(), taskId, agent.id, 'pr_created', `PR created and ${merged ? 'auto-merged' : 'merge failed'}: ${pr_url}`);
          db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, from_column, to_column, message) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(uuidv4(), taskId, agent.id, 'moved', 'col_inprogress', targetCol, merged ? 'Auto-completed — moved to Testing' : 'Auto-merge failed — moved to Human Action');
          console.log(`[AgentRunner][${runner.id}][${taskId}] auto-complete. merged=${merged} PR: ${pr_url}`);
        } else {
          // Manual review: park in Human Action
          db.prepare('UPDATE tasks SET progress = 100, column_id = ?, pr_url = ?, requires_human_action = 1, human_action_reason = ? WHERE id = ?')
            .run('col_humanaction', pr_url, 'PR ready for review', taskId);
          db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
            .run(uuidv4(), taskId, agent.id, 'pr_created', pr_url ? `PR created: ${pr_url}` : `Branch pushed — PR creation failed, create manually`);
          db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, from_column, to_column, message) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(uuidv4(), taskId, agent.id, 'moved', 'col_inprogress', 'col_humanaction', 'Moved to Human Action — awaiting PR review');
          console.log(`[AgentRunner][${runner.id}][${taskId}] awaiting review. PR: ${pr_url || 'creation failed'}`);
          notifyHumanActionMembers(db, taskId, 'PR ready for review').catch(() => {});
        }
        broadcastTask(db, taskId);
        completed = true;
        if (worktreePath) removeWorktree(worktreePath);
        result = { success: true, pr_url };

      } else if (block.name === 'request_human') {
        const { reason } = block.input;
        db.prepare('UPDATE tasks SET column_id = ? WHERE id = ?').run('col_humanaction', taskId);
        db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
          .run(uuidv4(), taskId, agent.id, 'human_action_requested', reason);
        console.log(`[AgentRunner][${runner.id}][${taskId}] requested human: ${reason}`);
        notifyHumanActionMembers(db, taskId, reason).catch(() => {});
        broadcastTask(db, taskId);
        completed = true; // stop the loop; human must resume
        if (worktreePath) removeWorktree(worktreePath);
        result = { success: true };
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result)
      });
    }

    if (toolResults.length > 0) {
      messages.push({ role: 'user', content: toolResults });
    }
  }
}

// ---------------------------------------------------------------------------
// Handler: test_with_retry
// Iterative test-validation loop. Runs the test suite, writes additional
// tests if coverage is missing, and either passes the task forward or
// retries once before escalating to human.
// ---------------------------------------------------------------------------

const TESTING_TOOLS = [
  {
    name: 'bash',
    description: 'Execute a shell command to run tests (npm test, jest, vitest, etc.) or inspect the project.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to run' }
      },
      required: ['command']
    }
  },
  {
    name: 'read_file',
    description: 'Read a file from the repository.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the repo root' }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write a file. Path must be within your assigned write scope — the server will reject out-of-scope paths.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to repo root' },
        content: { type: 'string', description: 'Full file content' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'task_log',
    description: 'Add a progress note to the task log.',
    input_schema: {
      type: 'object',
      properties: {
        progress: { type: 'number', description: 'Progress percentage 0-100' },
        message: { type: 'string', description: 'Log message describing what was done' }
      },
      required: ['message']
    }
  },
  {
    name: 'task_complete',
    description: 'Call this when testing is done. If passed=true the task moves to Human Action for human sign-off. If passed=false it moves back to In Progress for a fix (or stays in Human Action if max retries reached).',
    input_schema: {
      type: 'object',
      properties: {
        passed: { type: 'boolean', description: 'True if all tests passed, false if any failed' },
        summary: { type: 'string', description: 'Summary of tests run, what passed, and what failed (if any)' }
      },
      required: ['passed', 'summary']
    }
  },
  {
    name: 'request_human',
    description: 'Flag the task as blocked and move it to Human Action. Use when you need a secret, permission, or cannot continue.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'What you need from the human and why' }
      },
      required: ['reason']
    }
  }
];


async function runTestWithRetry(task, agent, runner) {
  const db = getDb();
  const taskId = task.id;

  const project = task.project_id ? db.prepare('SELECT subscription_id FROM projects WHERE id = ?').get(task.project_id) : null;
  const subscriptionId = project?.subscription_id || null;
  const systemPrompt = buildSystemPrompt(agent, runner, subscriptionId, task.project_id);
  const contextBlock = buildContextBlock(agent, subscriptionId, task.project_id);

  const metadata = JSON.parse(task.metadata || '{}');
  const retryCount = metadata.test_retry_count || 0;

  const initialPrompt = [
    contextBlock ? `## Context Files\n${contextBlock}` : '',
    `## Your Assigned Task`,
    `ID: ${task.id}`,
    `Title: ${task.title}`,
    `Description: ${task.description || '(no description)'}`,
    `Acceptance Criteria: ${task.acceptance_criteria || '(none specified)'}`,
    `PM Brief: ${task.pm_review_comment || '(none)'}`,
    `Priority: ${task.priority} | Complexity: ${task.complexity}`,
    retryCount > 0 ? `\n⚠️ This is retry #${retryCount} — the previous test run failed.` : '',
    ``,
    loadRunnerPrompt('test-with-retry'),
  ].filter(Boolean).join('\n');

  const messages = [{ role: 'user', content: initialPrompt }];

  let completed = false;
  const MAX_ITERATIONS = runner.max_iterations || 30;
  const MAX_RETRIES = runner.max_retries ?? 1;

  for (let i = 0; i < MAX_ITERATIONS && !completed; i++) {
    let response;
    try {
      response = await getClient().messages.create({
        model: agent.model || runner.model_default || 'claude-sonnet-4-5',
        max_tokens: 4096,
        system: systemPrompt,
        tools: getToolSet(runner),
        messages,
      });
    } catch (err) {
      console.error(`[AgentRunner][${runner.id}][${taskId}] API error:`, err.message);
      db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
        .run(uuidv4(), taskId, agent.id, 'note', `Handler error: ${err.message}`);
      break;
    }

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') break;

    const toolResults = [];

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      let result;

      if (block.name === 'bash') {
        console.log(`[AgentRunner][${runner.id}][${taskId}] bash: ${block.input.command}`);
        result = await runBash(block.input.command, PROJECT_ROOT);

      } else if (block.name === 'read_file') {
        const content = readFileFromDir(block.input.path, PROJECT_ROOT);
        result = content ? { success: true, content } : { error: 'File not found' };

      } else if (block.name === 'write_file') {
        result = writeFileSafe(block.input.path, block.input.content, runner.capability, PROJECT_ROOT, { subscriptionId, projectId: task.project_id });

      } else if (block.name === 'task_log') {
        const { progress, message } = block.input;
        if (progress !== undefined) {
          db.prepare('UPDATE tasks SET progress = ? WHERE id = ?').run(progress, taskId);
        }
        db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
          .run(uuidv4(), taskId, agent.id, 'note', message);
        console.log(`[AgentRunner][${runner.id}][${taskId}] log: ${message}`);
        broadcastTask(db, taskId);
        result = { success: true };

      } else if (block.name === 'task_complete') {
        const { passed, summary } = block.input;
        if (passed) {
          db.prepare('UPDATE tasks SET progress = 100, column_id = ? WHERE id = ?').run('col_humanaction', taskId);
          db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
            .run(uuidv4(), taskId, agent.id, 'tests_passed', summary);
          db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, from_column, to_column, message) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(uuidv4(), taskId, agent.id, 'moved', 'col_testing', 'col_humanaction', 'Tests passed — ready for human sign-off');
          console.log(`[AgentRunner][${runner.id}][${taskId}] tests passed → Human Action (awaiting sign-off)`);
          notifyHumanActionMembers(db, taskId, 'Tests passed — ready for sign-off').catch(() => {});
        } else {
          const newRetryCount = retryCount + 1;
          if (newRetryCount > MAX_RETRIES) {
            const maxRetryReason = `Test run failed after ${newRetryCount} attempts: ${summary}`;
            db.prepare('UPDATE tasks SET column_id = ?, requires_human_action = 1, human_action_reason = ? WHERE id = ?')
              .run('col_humanaction', maxRetryReason, taskId);
            db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, from_column, to_column, message) VALUES (?, ?, ?, ?, ?, ?, ?)`)
              .run(uuidv4(), taskId, agent.id, 'moved', 'col_testing', 'col_humanaction', `Max retries reached — moved to Human Action`);
            console.log(`[AgentRunner][${runner.id}][${taskId}] max retries → Human Action`);
            notifyHumanActionMembers(db, taskId, maxRetryReason).catch(() => {});
          } else {
            const newMeta = JSON.stringify({ ...metadata, test_retry_count: newRetryCount });
            db.prepare('UPDATE tasks SET column_id = ?, metadata = ? WHERE id = ?').run('col_inprogress', newMeta, taskId);
            db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
              .run(uuidv4(), taskId, agent.id, 'tests_failed', `Tests failed (retry ${newRetryCount}/${MAX_RETRIES}): ${summary}`);
            db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, from_column, to_column, message) VALUES (?, ?, ?, ?, ?, ?, ?)`)
              .run(uuidv4(), taskId, agent.id, 'moved', 'col_testing', 'col_inprogress', 'Tests failed — sent back to In Progress');
            console.log(`[AgentRunner][${runner.id}][${taskId}] tests failed → In Progress (retry ${newRetryCount})`);
          }
        }
        broadcastTask(db, taskId);
        completed = true;
        result = { success: true };

      } else if (block.name === 'request_human') {
        const { reason } = block.input;
        db.prepare('UPDATE tasks SET column_id = ?, requires_human_action = 1, human_action_reason = ? WHERE id = ?')
          .run('col_humanaction', reason, taskId);
        db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
          .run(uuidv4(), taskId, agent.id, 'human_action_requested', reason);
        console.log(`[AgentRunner][${runner.id}][${taskId}] requested human: ${reason}`);
        notifyHumanActionMembers(db, taskId, reason).catch(() => {});
        broadcastTask(db, taskId);
        completed = true;
        result = { success: true };
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result)
      });
    }

    if (toolResults.length > 0) {
      messages.push({ role: 'user', content: toolResults });
    }
  }
}

// ── Dispatch ─────────────────────────────────────────────────────────────────
// Single entry point — looks up the matching runner by (capability, column)
// and invokes the named handler. Adding a new runner is purely a registry edit
// when an existing handler fits; otherwise add a new handler below and
// reference its name in the runner's `handler` field.

// Named tool sets — runners reference these by name in runners.json (`tools` field).
// The arrays themselves stay in code (each is a list of Anthropic tool objects with
// names, descriptions, and JSON schemas — too rich for JSON config).
const TOOL_SETS = {
  clarification_tools: CLARIFICATION_TOOLS,
  implementation_tools: IMPLEMENTATION_TOOLS,
  testing_tools: TESTING_TOOLS,
};

function getToolSet(runner) {
  const set = TOOL_SETS[runner.tools];
  if (!set) {
    throw new Error(`[AgentRunner] Unknown tool set "${runner.tools}" for runner ${runner.id}`);
  }
  return set;
}

// ── Placeholder handler ───────────────────────────────────────────────────────
// Used by capabilities that are declared in runners.json but have no real
// handler yet. Logs the dispatch, moves the task to Human Action, and notifies
// humans so the stall is visible rather than silent.
async function runPlaceholder(task, agent, runner) {
  const db = getDb();
  const taskId = task.id;
  const cap = runnersRegistry.capabilities.find(c => c.id === runner.capability);
  const capLabel = cap?.label || runner.capability;
  const reason = `${capLabel} capability has no handler implemented yet — needs human attention`;

  db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
    .run(uuidv4(), taskId, agent.id, 'note', `Agent dispatched — ${capLabel} has no handler implemented yet`);
  db.prepare(`UPDATE tasks SET column_id = 'col_humanaction', requires_human_action = 1, human_action_reason = ? WHERE id = ?`)
    .run(reason, taskId);
  db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, from_column, to_column, message) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(uuidv4(), taskId, agent.id, 'moved', task.column_id, 'col_humanaction', reason);

  console.log(`[AgentRunner][${runner.id}][${taskId}] placeholder — ${capLabel} has no handler`);
  notifyHumanActionMembers(db, taskId, reason).catch(() => {});
  broadcastTask(db, taskId);
}

const HANDLERS = {
  clarify_and_approve: runClarifyAndApprove,
  implement_in_worktree: runImplementInWorktree,
  test_with_retry: runTestWithRetry,
  placeholder: runPlaceholder,
};

async function dispatch(taskId) {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task || !task.assigned_agent_id) return;

  const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND active = 1').get(task.assigned_agent_id);
  if (!agent) return;

  const capability = getAgentCapability(agent);
  if (!capability) return;

  const runner = findRunner(capability, task.column_id);
  if (!runner) return;

  // Optional named trigger guards (skip dispatch under specific conditions)
  if (runner.trigger_guard === 'no_pm_approval_yet' && task.pm_approval_status === 'approved') return;

  const handler = HANDLERS[runner.handler];
  if (!handler) {
    console.warn(`[AgentRunner] No handler registered for "${runner.handler}" (runner ${runner.id})`);
    return;
  }

  await handler(task, agent, runner);
}

// Fire-and-forget — never blocks the HTTP request.
function triggerRunner(taskId) {
  setImmediate(() => {
    dispatch(taskId).catch(err =>
      console.error(`[AgentRunner] dispatch error for task ${taskId}:`, err)
    );
  });
}

module.exports = { triggerRunner };
