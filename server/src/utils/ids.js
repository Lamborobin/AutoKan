const crypto = require('crypto');

/**
 * Generate a random project ID: prj_ + 8 hex chars
 */
function generateProjectId() {
  return 'prj_' + crypto.randomBytes(4).toString('hex');
}

/**
 * Generate a random prefixed ID: {prefix}_ + 12 hex chars
 * e.g. generateId('pm') → 'pm_a1b2c3d4e5f6'
 */
function generateId(prefix) {
  return prefix + '_' + crypto.randomBytes(6).toString('hex');
}

module.exports = { generateProjectId, generateId };
