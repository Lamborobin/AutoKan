const express = require('express');
const { loadModels } = require('../services/modelRegistry');
const { broadcast } = require('../sse');
const router = express.Router();

router.get('/', (req, res) => {
  res.json(loadModels());
});

// Re-broadcasts a reload so connected clients pick up a hand-edited models.json
// without a server restart — the same 'reload' event the rest of the app already
// uses to push template/agent changes live.
router.post('/reload', (req, res) => {
  broadcast('reload', { reason: 'models_updated' });
  res.json({ ok: true });
});

module.exports = router;
