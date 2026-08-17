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

module.exports = { loadModels, getValidModelIds, describeStaleness };
