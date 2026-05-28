const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const PROJECT_ROOT = path.join(__dirname, '../../..');
const VERSIONS_DIR = path.join(PROJECT_ROOT, 'docs', '.versions');
const MAX_VERSIONS  = 10;

// Read group/file definitions from agent.config.json — no hardcoding here
function getConfig() {
  const raw = fs.readFileSync(path.join(PROJECT_ROOT, 'agent.config.json'), 'utf8');
  return JSON.parse(raw).ai_context?.groups || [];
}

// Flatten groups → [{key, label, group, file}]
function allDocs() {
  return getConfig().flatMap(g =>
    g.files.map(f => ({ ...f, group: g.key }))
  );
}

function findDoc(key) {
  return allDocs().find(d => d.key === key) || null;
}

// ── Version helpers ────────────────────────────────────────────────────────────

function versionDir(key) {
  return path.join(VERSIONS_DIR, key);
}

function archiveVersion(key, currentContent) {
  const dir = versionDir(key);
  fs.mkdirSync(dir, { recursive: true });

  const ts = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
  fs.writeFileSync(path.join(dir, `${ts}.md`), currentContent, 'utf8');

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
  if (files.length > MAX_VERSIONS) {
    files.slice(0, files.length - MAX_VERSIONS).forEach(f =>
      fs.unlinkSync(path.join(dir, f))
    );
  }
}

function listVersionFiles(key) {
  try {
    return fs.readdirSync(versionDir(key))
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse();
  } catch { return []; }
}

// ── Routes ─────────────────────────────────────────────────────────────────────

// GET /api/docs — returns groups with files (content + last_modified) embedded
router.get('/', requireAuth, (req, res) => {
  const groups = getConfig().map(group => ({
    key:   group.key,
    label: group.label,
    files: group.files.map(({ key, label, file }) => {
      const absPath = path.join(PROJECT_ROOT, file);
      let content = '';
      let last_modified = null;
      try {
        content = fs.readFileSync(absPath, 'utf8');
        last_modified = fs.statSync(absPath).mtime.toISOString();
      } catch { /* file missing — return empty */ }
      return { key, label, content, last_modified };
    }),
  }));
  res.json(groups);
});

// GET /api/docs/:key/versions — list saved versions (superadmin only)
router.get('/:key/versions', requireAuth, (req, res) => {
  if (!req.isSuperAdmin) return res.status(403).json({ error: 'Superadmin access required' });
  if (!findDoc(req.params.key)) return res.status(404).json({ error: 'Doc file not found' });

  const versions = listVersionFiles(req.params.key).map(filename => ({
    filename,
    saved_at: fs.statSync(path.join(versionDir(req.params.key), filename)).mtime.toISOString(),
  }));
  res.json(versions);
});

// GET /api/docs/:key/versions/:filename — content of a specific version (superadmin only)
router.get('/:key/versions/:filename', requireAuth, (req, res) => {
  if (!req.isSuperAdmin) return res.status(403).json({ error: 'Superadmin access required' });
  if (!findDoc(req.params.key)) return res.status(404).json({ error: 'Doc file not found' });

  const filename = path.basename(req.params.filename);
  if (!filename.endsWith('.md')) return res.status(400).json({ error: 'Invalid filename' });

  const filePath = path.join(versionDir(req.params.key), filename);
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const saved_at = fs.statSync(filePath).mtime.toISOString();
    res.json({ filename, content, saved_at });
  } catch {
    res.status(404).json({ error: 'Version not found' });
  }
});

// PATCH /api/docs/:key — overwrite file; archives current version first (superadmin only)
router.patch('/:key', requireAuth, (req, res) => {
  if (!req.isSuperAdmin) return res.status(403).json({ error: 'Superadmin access required' });

  const doc = findDoc(req.params.key);
  if (!doc) return res.status(404).json({ error: 'Doc file not found' });

  const { content } = req.body;
  if (typeof content !== 'string') return res.status(400).json({ error: 'content is required' });

  const absPath = path.join(PROJECT_ROOT, doc.file);
  try {
    try {
      const current = fs.readFileSync(absPath, 'utf8');
      archiveVersion(doc.key, current);
    } catch { /* nothing to archive yet */ }

    fs.writeFileSync(absPath, content, 'utf8');
    const last_modified = fs.statSync(absPath).mtime.toISOString();
    res.json({ key: doc.key, last_modified });
  } catch (err) {
    res.status(500).json({ error: `Failed to write file: ${err.message}` });
  }
});

module.exports = router;
