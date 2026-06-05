const path = require('path');
const fs = require('fs');
const runnersRegistry = require('../seed/runners.json');

const CAPABILITIES = runnersRegistry.capabilities || [];

function getCapabilityDef(capabilityId) {
  return CAPABILITIES.find(c => c.id === capabilityId) || null;
}

// ── Template resolution ────────────────────────────────────────────────────────

function resolveTemplateVars(str, context = {}) {
  return str
    .replace(/\{subscriptionId\}/g, context.subscriptionId || '_')
    .replace(/\{projectId\}/g, context.projectId || '_');
}

// ── Pattern parsing ────────────────────────────────────────────────────────────

/**
 * Parse a write_access string into an array of trimmed pattern strings.
 * "*.test.*, *.spec.*, __tests__/, test/" → ["*.test.*", "*.spec.*", "__tests__/", "test/"]
 */
function parsePatterns(writeAccess, context = {}) {
  if (!writeAccess) return [];
  return resolveTemplateVars(writeAccess, context)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Test a single normalised (forward-slash) path against a single pattern.
 *
 * Pattern types:
 *  - Contains '*'  → glob: replace * with .* and test as regex
 *  - Ends with '/' → directory: path must START with it (root-level) OR CONTAIN it as a segment
 *  - Anything else → exact prefix match
 */
function matchesPattern(normalizedPath, pattern) {
  if (pattern.includes('*')) {
    // Escape all regex special chars except *, then convert * → .*
    const regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(regexStr).test(normalizedPath);
  }

  if (pattern.endsWith('/')) {
    return (
      normalizedPath.startsWith(pattern) ||
      normalizedPath.includes('/' + pattern)
    );
  }

  return normalizedPath.startsWith(pattern);
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Validate whether a relative path is permitted for the given capability.
 * Returns { allowed: true } or { allowed: false, error: string }.
 *
 * @param {string} relPath      - Path relative to the repo/worktree root
 * @param {string} capabilityId - e.g. "perm_coding"
 * @param {object} context      - { subscriptionId?, projectId? } for template vars
 */
function validateWritePath(relPath, capabilityId, context = {}) {
  const cap = getCapabilityDef(capabilityId);

  if (!cap) {
    return { allowed: false, error: `Write denied: unknown capability '${capabilityId}'` };
  }
  if (!cap.write_access) {
    return { allowed: false, error: `Write denied: '${cap.label || capabilityId}' has no write access` };
  }

  const patterns = parsePatterns(cap.write_access, context);
  const normalized = relPath.replace(/\\/g, '/');

  if (!patterns.some(p => matchesPattern(normalized, p))) {
    return {
      allowed: false,
      error: `Write denied: '${relPath}' is outside the write scope for ${cap.label} (allowed: ${cap.write_access})`,
    };
  }

  return { allowed: true };
}

/**
 * Write a file after validating the path against the capability's write scope.
 * Also guards against path traversal (resolved path must stay inside baseDir).
 * Returns { success: true } or { error: string }.
 *
 * @param {string} relPath      - Path relative to baseDir / repo root
 * @param {string} content      - Full file content
 * @param {string} capabilityId - e.g. "perm_coding"
 * @param {string} baseDir      - Absolute path to the worktree or project root
 * @param {object} context      - { subscriptionId?, projectId? } for template vars
 */
function writeFileSafe(relPath, content, capabilityId, baseDir, context = {}) {
  const validation = validateWritePath(relPath, capabilityId, context);
  if (!validation.allowed) return { error: validation.error };

  const absPath = path.resolve(baseDir, relPath);
  if (!absPath.startsWith(path.resolve(baseDir) + path.sep)) {
    return { error: `Write denied: path traversal detected for '${relPath}'` };
  }

  try {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, 'utf8');
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Return a human-readable description of the write scope for a capability.
 * Useful for building tool descriptions.
 */
function getWriteScope(capabilityId) {
  const cap = getCapabilityDef(capabilityId);
  return cap?.write_access || null;
}

module.exports = { validateWritePath, writeFileSafe, getWriteScope, parsePatterns };
