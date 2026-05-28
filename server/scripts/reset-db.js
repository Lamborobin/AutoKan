#!/usr/bin/env node
/**
 * Full local-dev reset. Deletes:
 *   1. autokan.db (and WAL files)
 *   2. docs/.versions/  — AI context file edit history
 *   3. instructions/sub_default/<prj_*>/  — per-project instruction folders
 *
 * Subscription-level instruction files (project-manager.md, developer.md,
 * tester.md) are kept — they're your agent system prompts and survive reseeds.
 *
 * Run:  npm run db:reset   (from server/)
 *       node scripts/reset-db.js
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../../');

function rm(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
  console.log(`  deleted  ${path.relative(ROOT, p)}`);
}

console.log('\n🗑️  AutoKan full reset\n');

// 1. Database
['data/autokan.db', 'data/autokan.db-shm', 'data/autokan.db-wal'].forEach(f =>
  rm(path.join(__dirname, '..', f))
);

// 2. AI context version history
rm(path.join(ROOT, 'docs', '.versions'));

// 3. Per-project instruction folders (prj_* only — keep subscription-level files)
const subDir = path.join(ROOT, 'instructions', 'sub_default');
if (fs.existsSync(subDir)) {
  for (const entry of fs.readdirSync(subDir)) {
    if (entry.startsWith('prj_')) rm(path.join(subDir, entry));
  }
}

console.log('\n✅ Reset complete. Start the server to reseed.\n');
