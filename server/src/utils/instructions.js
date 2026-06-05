const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '../../..');
const GLOBAL_INSTRUCTIONS_DIR = path.join(PROJECT_ROOT, 'instructions');

/**
 * Scaffold an instructions/{subscriptionId}/ folder with system prompt files.
 * Safe to call multiple times — existing files are never overwritten.
 * @param {string} subscriptionId
 */
function scaffoldSubscriptionInstructions(subscriptionId) {
  const subDir = path.join(GLOBAL_INSTRUCTIONS_DIR, subscriptionId);
  if (!fs.existsSync(subDir)) fs.mkdirSync(subDir, { recursive: true });
  // System prompt files are NOT auto-created here — they live as real files
  // and are only seeded when the subscription is first created via the DB seed.
}

/**
 * Scaffold an instructions/{subscriptionId}/{projectId}/ folder.
 * For client boards: also creates client.md and project.md context files.
 * For personal boards (skipContextFiles=true): only creates the directory.
 * Safe to call multiple times — existing files are never overwritten.
 * @param {string} projectId
 * @param {string} subscriptionId
 * @param {string|null} clientMdContent    Initial content for client.md (null = generic placeholder)
 * @param {string|null} projectMdContent   Initial content for project.md (null = generic placeholder)
 * @param {boolean}     skipContextFiles   When true, only create the folder (no client/project .md)
 */
function scaffoldProjectInstructions(projectId, subscriptionId, clientMdContent = null, projectMdContent = null, skipContextFiles = false) {
  const projectDir = subscriptionId
    ? path.join(GLOBAL_INSTRUCTIONS_DIR, subscriptionId, projectId)
    : path.join(GLOBAL_INSTRUCTIONS_DIR, projectId);

  if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

  if (skipContextFiles) return; // personal board — directory only, no context files

  // client.md is for the whole team (all agents) — no capability restriction.
  const clientMd = path.join(projectDir, 'client.md');
  if (!fs.existsSync(clientMd)) {
    const body = clientMdContent ?? '# Client Context\n\nAdd client-specific information here — brand, priorities, audience, business rules.\n';
    fs.writeFileSync(clientMd, body, 'utf8');
  }

  const CODER_CAPS = 'perm_coding,perm_coding_tester,perm_frontend,perm_backend,perm_ux,perm_architect,perm_migrate,perm_code_reader';
  const projectMd = path.join(projectDir, 'project.md');
  if (!fs.existsSync(projectMd)) {
    const body = projectMdContent ?? '# Project Context\n\nAdd technical project context here — tech stack, coding conventions, architecture, domain rules.\n';
    fs.writeFileSync(projectMd, `---\ncapabilities: ${CODER_CAPS}\n---\n\n${body}`, 'utf8');
  }
}

/**
 * Resolve an instruction file path to the most specific version that exists on disk.
 * Resolution order (most specific → least specific):
 *   1. instructions/{subId}/{projId}/X.md  (per-board override)
 *   2. instructions/{subId}/X.md           (subscription-level file)
 *   3. instructions/X.md                  (legacy global fallback)
 *
 * If the stored path already contains a subscription or project prefix it is used
 * directly without substitution.
 */
function resolveInstructionPath(filePath, subscriptionId, projectId) {
  if (!filePath) return '';
  if (!filePath.startsWith('instructions/')) {
    return path.join(PROJECT_ROOT, filePath);
  }

  const rest = filePath.slice('instructions/'.length); // everything after "instructions/"

  // If the path already encodes a subscription (starts with a known sub prefix), use as-is
  if (subscriptionId && rest.startsWith(subscriptionId + '/')) {
    return path.join(PROJECT_ROOT, filePath);
  }

  if (subscriptionId && projectId) {
    // 1. Per-board: instructions/{subId}/{projId}/X.md
    const boardPath = path.join(GLOBAL_INSTRUCTIONS_DIR, subscriptionId, projectId, rest);
    if (fs.existsSync(boardPath)) return boardPath;
    // 2. Subscription-level: instructions/{subId}/X.md
    const subPath = path.join(GLOBAL_INSTRUCTIONS_DIR, subscriptionId, rest);
    if (fs.existsSync(subPath)) return subPath;
  } else if (subscriptionId) {
    // 2. Subscription-level only
    const subPath = path.join(GLOBAL_INSTRUCTIONS_DIR, subscriptionId, rest);
    if (fs.existsSync(subPath)) return subPath;
  } else if (projectId) {
    // Legacy: instructions/{projId}/X.md (no subscription — shouldn't occur in new data)
    const projPath = path.join(GLOBAL_INSTRUCTIONS_DIR, projectId, rest);
    if (fs.existsSync(projPath)) return projPath;
  }

  // Fallback: literal path from project root (handles already-absolute prefixed paths)
  return path.join(PROJECT_ROOT, filePath);
}

module.exports = {
  scaffoldProjectInstructions,
  scaffoldSubscriptionInstructions,
  resolveInstructionPath,
  PROJECT_ROOT,
  GLOBAL_INSTRUCTIONS_DIR,
};
