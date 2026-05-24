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
    'User-Agent': 'AutoKan-dev-runner',
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
// Git worktree helpers — one isolated directory per developer agent task
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

// Global codebase files — loaded for technical agents (dev, tester) but NOT for PM.
// A PM understands client priorities and product decisions, not the codebase.
const CODEBASE_FILES = ['CLAUDE.md', 'README.md'];

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

// Tools the PM agent can call
const PM_TOOLS = [
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
          description: "Concrete, testable acceptance scenarios derived from the Done-when bullets. Write as a bullet list — each item should be independently verifiable (e.g. '• Clicking Makeup in nav opens the category page with Lips, Eyes, Face subcategories'). These will be saved as the task's acceptance criteria for the tester."
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
        }
      },
      required: ['comment', 'checklist']
    }
  }
];

function readFile(filePath, subscriptionId, projectId) {
  try {
    const resolved = resolveInstructionPath(filePath, subscriptionId, projectId);
    return fs.readFileSync(resolved, 'utf8');
  } catch {
    return '';
  }
}

function buildContextBlock(agent, subscriptionId, projectId) {
  const instructionFiles = JSON.parse(agent.instruction_files || '[]');
  // PM role: client context only — no codebase files.
  // Technical roles (developer, tester): get codebase files too.
  const globalFiles = agent.role === 'pm' ? [] : CODEBASE_FILES;
  const allContextFiles = [...globalFiles, ...instructionFiles];
  const sections = [];

  for (const filePath of allContextFiles) {
    const content = readFile(filePath, subscriptionId, projectId);
    if (content) {
      const label = path.basename(filePath, '.md').toUpperCase();
      sections.push(`## [${label}]\n${content}`);
    }
  }

  return sections.join('\n\n---\n\n');
}

function buildSystemPrompt(agent, subscriptionId, projectId) {
  const promptFileContent = readFile(agent.prompt_file || '', subscriptionId, projectId);

  if (agent.is_template) {
    // Template agents: internal behavioural prompt + role-specific prompt file
    const internalPrompt = agent.system_prompt_override || agent.template_system_prompt || '';
    return [internalPrompt, promptFileContent].filter(Boolean).join('\n\n---\n\n');
  }

  return promptFileContent;
}

async function runPmAgent(taskId) {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);

  if (!task) return;
  if (task.pm_approval_status === 'approved') return;
  // Don't re-run while waiting for human to answer
  if (task.pm_pending_question) return;

  // Use the task's assigned agent; fall back to first active agent with perm_planning capability
  let pmAgent = task.assigned_agent_id
    ? db.prepare('SELECT * FROM agents WHERE id = ? AND active = 1').get(task.assigned_agent_id)
    : null;
  if (!pmAgent) {
    const candidates = db.prepare('SELECT * FROM agents WHERE active = 1').all();
    pmAgent = candidates.find(a => {
      try { return JSON.parse(a.role_ids || '[]').includes('perm_planning'); }
      catch { return false; }
    }) || null;
  }
  if (!pmAgent) return;

  // Get conversation history (questions + answers only)
  const conversationLogs = db.prepare(`
    SELECT action, message, created_at FROM task_logs
    WHERE task_id = ? AND action IN ('pm_question', 'human_answer')
    ORDER BY created_at ASC
  `).all(taskId);

  const pmProject = task.project_id ? db.prepare('SELECT subscription_id FROM projects WHERE id = ?').get(task.project_id) : null;
  const pmSubId = pmProject?.subscription_id || null;
  const systemPrompt = buildSystemPrompt(pmAgent, pmSubId, task.project_id);
  const contextBlock = buildContextBlock(pmAgent, pmSubId, task.project_id);

  // Build a clear picture of the task + conversation so far
  const conversationText = conversationLogs.length === 0
    ? '(No conversation yet — this is your first look at the task.)'
    : conversationLogs.map(l =>
        l.action === 'pm_question'
          ? `PM asked: ${l.message}`
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

  const yourTurnBlock = isFinalReview
    ? `## FINAL REVIEW\nAll checklist items are now marked as resolved (some were manually checked by the human). Do a careful sanity check:\n- Is each item genuinely confirmed by the conversation and task description?\n- Does the priority (${task.priority}) and complexity (${task.complexity}) match the scope?\n- Are there any items that appear prematurely resolved?\n\nIf everything checks out → call approve_task with a clean requirements summary.\nIf you have ONE specific concern → ask about it. Do NOT re-ask things already answered.`
    : conversationLogs.length === 0
      ? `## YOUR TURN — FIRST CONTACT\nYour system prompt may include a [STYLE] and/or [CONSTRAINTS] section. Apply them as follows:\n- [CONSTRAINTS] — absolute hard rules, highest priority, always enforced regardless of anything else\n- [STYLE] — changes exactly one thing: whether you add a sentence or not. Direct/concise → no additions, e.g. "Before I can plan this out, I need to understand the goal: What should this task accomplish?" Warm/bubbly/chatty → same message plus one natural sentence, e.g. "Before I can plan this out, I need to understand the goal: What should this task accomplish? Happy to dig into this with you once I have a bit more context!" The structure never changes — only that one sentence appears or not.\n\nWork in two steps, in a single tool call:\n\n**Step 1 — Understand the goal**\nCan you summarize what's being built in one sentence from the description?\n- If YES → state that summary at the top of your message, then do Step 2.\n- If NO (genuinely too vague to know what they want) → your entire message is ONE question about the goal or intent. Submit an empty checklist for now. Stop here.\n\n**Step 2 — Plan the specifics**\nNow identify only the decisions genuinely missing from the description. Build the checklist from those gaps only.\n- Anything the description already states → mark resolved immediately, do NOT ask about it\n- A well-specified task → 1–3 open items\n- A vague task where intent is clear → up to 5–7 open items\n- If the task seems large (multiple distinct areas, multi-sprint scope) → include a breakdown suggestion in your message naming the proposed sub-tasks\n- If everything is already clear → call approve_task immediately\n- Otherwise → call ask_question. Lead with a one-sentence summary of what you understand is being built, then list open questions as a numbered list.\n\nCRITICAL: Only ask about things genuinely missing. If the description gives you a URL, color, or explicit behavior — it is answered. Do not invent uncertainty.`
      : `## YOUR TURN — FOLLOW-UP\nThe human has answered. Re-evaluate the checklist and mark any newly resolved items.\n- If all items are now resolved → call approve_task immediately.\n- If items are still unresolved → ask about ALL of them in one message (numbered list). Do NOT split across multiple round trips. Do NOT re-ask anything already clearly answered.`;

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
      model: pmAgent.model || 'claude-opus-4-5',
      max_tokens: 1024,
      system: systemPrompt,
      tools: PM_TOOLS,
      messages: [{ role: 'user', content: userMessage }]
    });
  } catch (err) {
    console.error(`[AgentRunner] PM agent API error for task ${taskId}:`, err.message);
    return;
  }

  // Execute whichever tool the PM chose
  for (const block of response.content) {
    if (block.type !== 'tool_use') continue;

    if (block.name === 'ask_question') {
      const { question, checklist = [] } = block.input;
      db.prepare(`UPDATE tasks SET pm_approval_status = 'questioning', pm_pending_question = ?, pm_checklist = ? WHERE id = ?`)
        .run(question, JSON.stringify(checklist), taskId);
      db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
        .run(uuidv4(), taskId, pmAgent.id, 'pm_question', question);
      console.log(`[AgentRunner] PM asked question on task ${taskId}`);
      broadcastTask(db, taskId);

    } else if (block.name === 'approve_task') {
      const { comment, checklist = [], acceptance_criteria = '', priority, complexity } = block.input;
      const resolvedChecklist = checklist.map(i => ({ ...i, resolved: true }));
      db.prepare(`
        UPDATE tasks SET pm_approval_status = 'approved', pm_review_comment = ?, pm_review_date = CURRENT_TIMESTAMP, pm_checklist = ?
        WHERE id = ?
      `).run(comment, JSON.stringify(resolvedChecklist), taskId);
      // Populate acceptance_criteria if the human hasn't already set one
      if (acceptance_criteria && !task.acceptance_criteria) {
        db.prepare(`UPDATE tasks SET acceptance_criteria = ? WHERE id = ?`).run(acceptance_criteria, taskId);
      }
      // Set priority and complexity from PM's assessment (only if PM provided them)
      const validPriorities = ['low', 'medium', 'high', 'critical'];
      const validComplexities = ['low', 'medium', 'high'];
      if (priority && validPriorities.includes(priority)) {
        db.prepare(`UPDATE tasks SET priority = ? WHERE id = ?`).run(priority, taskId);
      }
      if (complexity && validComplexities.includes(complexity)) {
        db.prepare(`UPDATE tasks SET complexity = ? WHERE id = ?`).run(complexity, taskId);
      }
      db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
        .run(uuidv4(), taskId, pmAgent.id, 'pm_reviewed', `PM approved — ${comment}`);
      console.log(`[AgentRunner] PM approved task ${taskId}`);
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
        .run(uuidv4(), taskId, pmAgent.id, 'pm_question', text);
      broadcastTask(db, taskId);
    }
  }

}

// Fire-and-forget wrapper — never blocks the HTTP request
function triggerPmAgent(taskId) {
  setImmediate(() => {
    runPmAgent(taskId).catch(err =>
      console.error(`[AgentRunner] Unhandled error for task ${taskId}:`, err)
    );
  });
}

// ---------------------------------------------------------------------------
// Developer agent
// ---------------------------------------------------------------------------

const CLIENT_DIR = path.join(PROJECT_ROOT, 'client');

const DEV_TOOLS = [
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
    description: 'Write or overwrite a file. Path MUST be inside the client/ folder.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to repo root, must start with client/' },
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

function devWriteFile(relPath, content, worktreeDir) {
  const baseDir = worktreeDir || PROJECT_ROOT;
  const clientDir = path.join(baseDir, 'client');
  const absPath = path.join(baseDir, relPath);
  if (!absPath.startsWith(clientDir + path.sep) && absPath !== clientDir) {
    return { error: `Write denied: path must be inside client/. Got: ${relPath}` };
  }
  try {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, 'utf8');
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
}

function readFileFromDir(relPath, baseDir) {
  try {
    return fs.readFileSync(path.join(baseDir, relPath), 'utf8');
  } catch {
    return '';
  }
}

async function runDevAgent(taskId) {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) return;
  if (task.column_id !== 'col_inprogress') return;

  const devAgent = task.assigned_agent_id
    ? db.prepare('SELECT * FROM agents WHERE id = ? AND active = 1').get(task.assigned_agent_id)
    : null;
  if (!devAgent) return;
  try {
    if (!JSON.parse(devAgent.role_ids || '[]').includes('perm_coding')) return;
  } catch { return; }

  // Create an isolated git worktree for this task so the main checkout is never touched
  let worktreePath;
  try {
    worktreePath = createWorktree(task.id);
  } catch (err) {
    console.error(`[AgentRunner] Failed to create worktree for task ${taskId}:`, err.message);
    db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
      .run(uuidv4(), taskId, devAgent.id, 'note', `Worktree setup failed: ${err.message}`);
    return;
  }

  const devProject = task.project_id ? db.prepare('SELECT subscription_id FROM projects WHERE id = ?').get(task.project_id) : null;
  const devSubId = devProject?.subscription_id || null;
  const systemPrompt = buildSystemPrompt(devAgent, devSubId, task.project_id);
  const contextBlock = buildContextBlock(devAgent, devSubId, task.project_id);

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
    `## Instructions`,
    `You are working in an isolated git worktree already checked out on branch feature/${task.id}. Do NOT run git checkout or git worktree — you are already on the correct branch.`,
    `Work through this git workflow exactly:`,
    `1. Implement changes inside client/ only`,
    `2. git add -A && git commit -m "[${task.id}] ${task.title}"`,
    `3. git push -u origin feature/${task.id}`,
    `4. Call task_complete with a brief summary`,
    `IMPORTANT: Do NOT merge branches. Do NOT push to master. Do NOT run gh commands. The server handles PR creation automatically when you call task_complete.`,
    `Use task_log at each milestone (25%, 50%, 75%). If you hit a blocker you cannot resolve, push whatever you have first (git add -A && git commit -m "[${task.id}] WIP" && git push -u origin feature/${task.id}), then call request_human.`
  ].filter(Boolean).join('\n');

  const messages = [{ role: 'user', content: initialPrompt }];

  let completed = false;
  const MAX_ITERATIONS = 30;

  for (let i = 0; i < MAX_ITERATIONS && !completed; i++) {
    let response;
    try {
      response = await getClient().messages.create({
        model: devAgent.model || 'claude-sonnet-4-5',
        max_tokens: 4096,
        system: systemPrompt,
        tools: DEV_TOOLS,
        messages,
      });
    } catch (err) {
      console.error(`[AgentRunner] Dev agent API error for task ${taskId}:`, err.message);
      db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
        .run(uuidv4(), taskId, devAgent.id, 'note', `Dev agent error: ${err.message}`);
      removeWorktree(worktreePath);
      break;
    }

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') break;

    const toolResults = [];

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      let result;

      if (block.name === 'bash') {
        console.log(`[AgentRunner][dev][${taskId}] bash: ${block.input.command}`);
        result = await runBash(block.input.command, worktreePath);

      } else if (block.name === 'read_file') {
        const content = readFileFromDir(block.input.path, worktreePath);
        result = content ? { success: true, content } : { error: 'File not found' };

      } else if (block.name === 'write_file') {
        result = devWriteFile(block.input.path, block.input.content, worktreePath);

      } else if (block.name === 'task_log') {
        const { progress, message } = block.input;
        if (progress !== undefined) {
          db.prepare('UPDATE tasks SET progress = ? WHERE id = ?').run(progress, taskId);
        }
        db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
          .run(uuidv4(), taskId, devAgent.id, 'note', message);
        console.log(`[AgentRunner][dev][${taskId}] log: ${message}`);
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
            .run(uuidv4(), taskId, devAgent.id, 'pr_created', `PR created and ${merged ? 'auto-merged' : 'merge failed'}: ${pr_url}`);
          db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, from_column, to_column, message) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(uuidv4(), taskId, devAgent.id, 'moved', 'col_inprogress', targetCol, merged ? 'Auto-completed — moved to Testing' : 'Auto-merge failed — moved to Human Action');
          console.log(`[AgentRunner][dev][${taskId}] auto-complete. merged=${merged} PR: ${pr_url}`);
        } else {
          // Manual review: park in Human Action
          db.prepare('UPDATE tasks SET progress = 100, column_id = ?, pr_url = ?, requires_human_action = 1, human_action_reason = ? WHERE id = ?')
            .run('col_humanaction', pr_url, 'PR ready for review', taskId);
          db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
            .run(uuidv4(), taskId, devAgent.id, 'pr_created', pr_url ? `PR created: ${pr_url}` : `Branch pushed — PR creation failed, create manually`);
          db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, from_column, to_column, message) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(uuidv4(), taskId, devAgent.id, 'moved', 'col_inprogress', 'col_humanaction', 'Moved to Human Action — awaiting PR review');
          console.log(`[AgentRunner][dev][${taskId}] awaiting review. PR: ${pr_url || 'creation failed'}`);
        }
        broadcastTask(db, taskId);
        completed = true;
        removeWorktree(worktreePath);
        result = { success: true, pr_url };

      } else if (block.name === 'request_human') {
        const { reason } = block.input;
        db.prepare('UPDATE tasks SET column_id = ? WHERE id = ?').run('col_humanaction', taskId);
        db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
          .run(uuidv4(), taskId, devAgent.id, 'human_action_requested', reason);
        console.log(`[AgentRunner][dev][${taskId}] requested human: ${reason}`);
        broadcastTask(db, taskId);
        completed = true; // stop the loop; human must resume
        removeWorktree(worktreePath);
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

function triggerDevAgent(taskId) {
  setImmediate(() => {
    runDevAgent(taskId).catch(err =>
      console.error(`[AgentRunner] Dev unhandled error for task ${taskId}:`, err)
    );
  });
}

// ── Tester Agent ──────────────────────────────────────────────────────────────

const TESTER_TOOLS = [
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
    description: 'Write a test file. Path must be inside a test directory or match a test file pattern (*.test.*, *.spec.*, __tests__/, test/).',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to repo root — must be a test file or inside a test directory' },
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
    description: 'Call this when testing is done. If passed=true the task moves to Human Review. If passed=false it moves back to In Progress for a fix (or to Human Action if max retries reached).',
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

function testerWriteFile(relPath, content) {
  const TEST_PATTERNS = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /__tests__\//, /[/\\]test[/\\]/];
  const allowed = TEST_PATTERNS.some(p => p.test(relPath));
  if (!allowed) {
    return { error: `Write denied: tester can only write test files. Got: ${relPath}` };
  }
  try {
    const absPath = path.join(PROJECT_ROOT, relPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, 'utf8');
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
}

async function runTesterAgent(taskId) {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) return;
  if (task.column_id !== 'col_testing') return;

  const testerAgent = task.assigned_agent_id
    ? db.prepare('SELECT * FROM agents WHERE id = ? AND active = 1').get(task.assigned_agent_id)
    : null;
  if (!testerAgent) return;
  try {
    if (!JSON.parse(testerAgent.role_ids || '[]').includes('perm_coding_tester')) return;
  } catch { return; }

  const testProject = task.project_id ? db.prepare('SELECT subscription_id FROM projects WHERE id = ?').get(task.project_id) : null;
  const testSubId = testProject?.subscription_id || null;
  const systemPrompt = buildSystemPrompt(testerAgent, testSubId, task.project_id);
  const contextBlock = buildContextBlock(testerAgent, testSubId, task.project_id);

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
    `## Instructions`,
    `You are in the Testing column. Your job is to verify this task is complete and correct.`,
    `1. Read the relevant source files and understand what was implemented`,
    `2. Run the existing test suite: npm test (or the appropriate test command for this project)`,
    `3. Write additional unit/integration tests if coverage is missing for the acceptance criteria`,
    `4. Run tests again after writing them`,
    `5. Call task_complete with passed=true if all tests pass, passed=false if any fail`,
    `Use task_log at each milestone. If you hit a blocker you cannot resolve, call request_human.`
  ].filter(Boolean).join('\n');

  const messages = [{ role: 'user', content: initialPrompt }];

  let completed = false;
  const MAX_ITERATIONS = 30;

  for (let i = 0; i < MAX_ITERATIONS && !completed; i++) {
    let response;
    try {
      response = await getClient().messages.create({
        model: testerAgent.model || 'claude-sonnet-4-5',
        max_tokens: 4096,
        system: systemPrompt,
        tools: TESTER_TOOLS,
        messages,
      });
    } catch (err) {
      console.error(`[AgentRunner] Tester agent API error for task ${taskId}:`, err.message);
      db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
        .run(uuidv4(), taskId, testerAgent.id, 'note', `Tester agent error: ${err.message}`);
      break;
    }

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') break;

    const toolResults = [];

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      let result;

      if (block.name === 'bash') {
        console.log(`[AgentRunner][tester][${taskId}] bash: ${block.input.command}`);
        result = await runBash(block.input.command, PROJECT_ROOT);

      } else if (block.name === 'read_file') {
        const content = readFileFromDir(block.input.path, PROJECT_ROOT);
        result = content ? { success: true, content } : { error: 'File not found' };

      } else if (block.name === 'write_file') {
        result = testerWriteFile(block.input.path, block.input.content);

      } else if (block.name === 'task_log') {
        const { progress, message } = block.input;
        if (progress !== undefined) {
          db.prepare('UPDATE tasks SET progress = ? WHERE id = ?').run(progress, taskId);
        }
        db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
          .run(uuidv4(), taskId, testerAgent.id, 'note', message);
        console.log(`[AgentRunner][tester][${taskId}] log: ${message}`);
        broadcastTask(db, taskId);
        result = { success: true };

      } else if (block.name === 'task_complete') {
        const { passed, summary } = block.input;
        if (passed) {
          db.prepare('UPDATE tasks SET progress = 100, column_id = ? WHERE id = ?').run('col_humanreview', taskId);
          db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
            .run(uuidv4(), taskId, testerAgent.id, 'tests_passed', summary);
          db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, from_column, to_column, message) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(uuidv4(), taskId, testerAgent.id, 'moved', 'col_testing', 'col_humanreview', 'Tests passed — moved to Human Review');
          console.log(`[AgentRunner][tester][${taskId}] tests passed → Human Review`);
        } else {
          const newRetryCount = retryCount + 1;
          const MAX_RETRIES = 1;
          if (newRetryCount > MAX_RETRIES) {
            db.prepare('UPDATE tasks SET column_id = ?, requires_human_action = 1, human_action_reason = ? WHERE id = ?')
              .run('col_humanaction', `Test run failed after ${newRetryCount} attempts: ${summary}`, taskId);
            db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, from_column, to_column, message) VALUES (?, ?, ?, ?, ?, ?, ?)`)
              .run(uuidv4(), taskId, testerAgent.id, 'moved', 'col_testing', 'col_humanaction', `Max retries reached — moved to Human Action`);
            console.log(`[AgentRunner][tester][${taskId}] max retries → Human Action`);
          } else {
            const newMeta = JSON.stringify({ ...metadata, test_retry_count: newRetryCount });
            db.prepare('UPDATE tasks SET column_id = ?, metadata = ? WHERE id = ?').run('col_inprogress', newMeta, taskId);
            db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, message) VALUES (?, ?, ?, ?, ?)`)
              .run(uuidv4(), taskId, testerAgent.id, 'tests_failed', `Tests failed (retry ${newRetryCount}/${MAX_RETRIES}): ${summary}`);
            db.prepare(`INSERT INTO task_logs (id, task_id, agent_id, action, from_column, to_column, message) VALUES (?, ?, ?, ?, ?, ?, ?)`)
              .run(uuidv4(), taskId, testerAgent.id, 'moved', 'col_testing', 'col_inprogress', 'Tests failed — sent back to In Progress');
            console.log(`[AgentRunner][tester][${taskId}] tests failed → In Progress (retry ${newRetryCount})`);
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
          .run(uuidv4(), taskId, testerAgent.id, 'human_action_requested', reason);
        console.log(`[AgentRunner][tester][${taskId}] requested human: ${reason}`);
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

function triggerTesterAgent(taskId) {
  setImmediate(() => {
    runTesterAgent(taskId).catch(err =>
      console.error(`[AgentRunner] Tester unhandled error for task ${taskId}:`, err)
    );
  });
}

module.exports = { triggerPmAgent, triggerDevAgent, triggerTesterAgent };
