const fs = require('fs');
const path = require('path');

const MODELS_PATH = path.join(__dirname, '../config/models.json');

// Read fresh each call — this file is small and edited by hand, so we favor
// picking up manual edits without a restart over caching it.
function loadModels() {
  return JSON.parse(fs.readFileSync(MODELS_PATH, 'utf8'));
}

function getValidModelIds() {
  return new Set(loadModels().models.map(m => m.value));
}

function stripVersion(id) {
  return id.replace(/-\d+(-\d+)?$/, '');
}

// { stale: bool, reason: string|null } — mirrors app/src/utils/modelStaleness.js
function describeStaleness(modelId) {
  if (!modelId) return { stale: false, reason: null };
  const { models } = loadModels();
  if (models.some(m => m.value === modelId)) return { stale: false, reason: null };
  const base = stripVersion(modelId);
  const sameBaseExists = models.some(m => stripVersion(m.value) === base);
  return {
    stale: true,
    reason: sameBaseExists ? 'Model version upgraded' : 'Model no longer exists',
  };
}

const THINKING_MODES = ['adaptive', 'disabled'];

// Haiku 4.5 predates adaptive thinking — flagged `adaptiveThinking: false` in models.json.
function supportsAdaptiveThinking(modelId) {
  const entry = loadModels().models.find(m => m.value === modelId);
  return entry ? entry.adaptiveThinking !== false : true;
}

// Request params for an agent's `thinking` setting. NULL/unknown sends nothing, i.e. the
// model's own default (Sonnet 5 / Opus 5 think adaptively by default).
function thinkingParams(mode, modelId) {
  if (mode === 'disabled') return { thinking: { type: 'disabled' } };
  if (mode === 'adaptive' && supportsAdaptiveThinking(modelId)) return { thinking: { type: 'adaptive' } };
  return {};
}

module.exports = { loadModels, getValidModelIds, describeStaleness, THINKING_MODES, thinkingParams };
