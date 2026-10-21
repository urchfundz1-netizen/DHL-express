// scripts/migrate-to-firestore.js
// One-off: copy the existing embedded PostgreSQL (PGlite) data into Firestore.
//
// Run this ONCE, after Firebase is configured in .env:
//
//   1. Stop the server (restart-server.ps1 asks it to shut down) — only one
//      process may open the PGlite data directory at a time.
//   2. npm run migrate:firestore
//   3. Start the server again: .\restart-server.ps1
//
// Document ids are the same numeric ids the SQL rows had, so existing admin
// links (/admin/shipments/12) keep working and the counters are bumped so new
// rows never collide with imported ones.

import 'dotenv/config';
import { PGlite } from '@electric-sql/pglite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { setRow, ensureCounterAtLeast } from '../server/db/firestore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const dataDir = (() => {
  const configured = process.env.PGDATA_DIR || './data/pgdata';
  return path.isAbsolute(configured) ? configured : path.resolve(projectRoot, configured);
})();

// The tables to move, in dependency order.
const TABLES = [
  'admins',
  'shipments',
  'tracking_events',
  'comments',
  'delivery_estimate_history',
  'activity_logs',
  'sessions',
];

if (!fs.existsSync(dataDir)) {
  console.error(`PGlite data directory not found: ${dataDir}`);
  console.error('Nothing to migrate — start the server once so it creates a fresh Firestore dataset.');
  process.exit(1);
}

const lockFile = path.join(dataDir, 'postmaster.pid');
if (fs.existsSync(lockFile)) {
  console.warn(
    '\n  A PGlite lock file exists. If the server is still running, stop it first\n' +
      '  (restart-server.ps1 does this cleanly), otherwise the database will be\n' +
      '  opened concurrently and may be corrupted.\n'
  );
}

const db = await PGlite.create(dataDir);
console.log(`Opened embedded database: ${dataDir}\n`);

let grandTotal = 0;

for (const table of TABLES) {
  let rows;
  try {
    const res = await db.query(`SELECT * FROM ${table}`);
    rows = res.rows;
  } catch (err) {
    console.warn(`  ! ${table}: skipped (${err.message})`);
    continue;
  }

  if (rows.length === 0) {
    console.log(`  - ${table}: empty`);
    continue;
  }

  // Write in chunks so a large table does not open thousands of sockets at once.
  const CHUNK = 200;
  let highestId = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await Promise.all(
      slice.map((row) => {
        const docId = table === 'sessions' ? row.sid : row.id;
        if (table !== 'sessions') highestId = Math.max(highestId, Number(row.id) || 0);
        return setRow(table, docId, row);
      })
    );
  }

  if (table !== 'sessions') await ensureCounterAtLeast(table, highestId);
  grandTotal += rows.length;
  console.log(`  + ${table}: ${rows.length} document(s) copied`);
}

await db.close();
await import('../server/db/firestore.js').then((m) => m.closeFirestore());

console.log(`\nMigration complete: ${grandTotal} document(s) now in Firestore.`);
console.log('Start the server again and sign in with your usual admin email/password.\n');
process.exit(0);
