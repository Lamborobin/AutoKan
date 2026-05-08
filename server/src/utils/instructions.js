const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '../../..');
const GLOBAL_INSTRUCTIONS_DIR = path.join(PROJECT_ROOT, 'instructions');

/**
 * Scaffold an instructions-{projectId}/ folder with per-board context files only.
 * System files (pm.md, developer.md, tester.md) live in global instructions/ and are NOT copied.
 * Safe to call multiple times — existing files are never overwritten.
 * @param {string} projectId
 * @param {string|null} clientMdContent  Initial content for client.md (null = generic placeholder)
 * @param {string|null} projectMdContent Initial content for project.md (null = generic placeholder)
 */
function scaffoldProjectInstructions(projectId, clientMdContent = null, projectMdContent = null) {
  const projectDir = path.join(PROJECT_ROOT, `instructions-${projectId}`);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  const clientMd = path.join(projectDir, 'client.md');
  if (!fs.existsSync(clientMd)) {
    fs.writeFileSync(clientMd, clientMdContent ?? '# Client Context\n\nAdd client-specific information here.\n', 'utf8');
  }

  const projectMd = path.join(projectDir, 'project.md');
  if (!fs.existsSync(projectMd)) {
    fs.writeFileSync(projectMd, projectMdContent ?? '# Project Context\n\nAdd project-specific context here.\n', 'utf8');
  }
}

/**
 * Resolve an instruction file path to the project-specific version if it exists,
 * otherwise fall back to the global instructions/ path.
 */
function resolveInstructionPath(filePath, projectId) {
  if (!projectId || !filePath || !filePath.startsWith('instructions/')) {
    return path.join(PROJECT_ROOT, filePath || '');
  }
  const projectSpecific = filePath.replace(/^instructions\//, `instructions-${projectId}/`);
  const projectPath = path.join(PROJECT_ROOT, projectSpecific);
  if (fs.existsSync(projectPath)) return projectPath;
  return path.join(PROJECT_ROOT, filePath);
}

module.exports = { scaffoldProjectInstructions, resolveInstructionPath, PROJECT_ROOT, GLOBAL_INSTRUCTIONS_DIR };
