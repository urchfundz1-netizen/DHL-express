// server/db/pool.js
// Single PGlite (embedded PostgreSQL) instance shared across the app.
// PGlite has one exclusive connection, so all queries are serialized here.

import { PGlite } from '@electric-sql/pglite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

function resolveDataDir() {
  const configured = process.env.PGDATA_DIR || './data/pgdata';
  if (path.isAbsolute(configured)) return configured;
  return path.resolve(projectRoot, configured);
}

const dataDir = resolveDataDir();

// Ensure the storage directory exists before PGlite tries to write to it.
fs.mkdirSync(dataDir, { recursive: true });

// PostgreSQL (and therefore PGlite) writes a `postmaster.pid` lock into the
// data directory. If the process is force-killed or crashes, that lock file
// survives and the next start aborts with "RuntimeError: Aborted()", leaving
// the app permanently down. Clean up stale locks and retry once so a hard
// restart always recovers.
//
// The lock must NEVER be removed while its owner is still alive: two PGlite
// instances writing the same data directory corrupt it (which is what the
// stale "pgdata.corrupt*" backups in data/ came from). A live owner means a
// second server was started by mistake — refuse to start instead.
const lockFile = path.join(dataDir, 'postmaster.pid');

function removeStaleLock(reason) {
  try {
    if (fs.existsSync(lockFile)) {
      fs.rmSync(lockFile, { force: true });
      console.warn(`[db] Removed ${reason} PGlite lock: ${lockFile}`);
    }
  } catch (err) {
    console.warn('[db] Could not remove lock file:', err.message);
  }
}

// The pid recorded in the lock file, or null when there is no usable lock.
function lockOwnerPid() {
  try {
    if (!fs.existsSync(lockFile)) return null;
    const pid = Number.parseInt(fs.readFileSync(lockFile, 'utf8').split(/\r?\n/)[0], 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // exists but owned by another user
  }
}

// Refuse to start when another live process owns the data directory.
function assertNoLiveInstance() {
  const pid = lockOwnerPid();
  if (!pid || pid === process.pid) return;
  if (!isProcessAlive(pid)) return;
  console.error(
    `\n  Another server instance is already running (PID ${pid}) and holds the\n` +
      `  embedded database at ${dataDir}.\n` +
      `  Two processes must never open the same PGlite data directory — it corrupts the data.\n` +
      `  Stop the other instance first (e.g. run restart-server.ps1) and try again.\n`
  );
  process.exit(1);
}

assertNoLiveInstance();
if (fs.existsSync(lockFile)) {
  removeStaleLock('stale');
}

async function openDatabase() {
  try {
    return await PGlite.create(dataDir);
  } catch (err) {
    // The WASM instance aborts on an inconsistent/locked data dir. Only retry
    // after confirming that no other live process owns the lock.
    console.warn('[db] PGlite failed to open (' + (err?.message || err) + '); retrying once after clearing the lock.');
    assertNoLiveInstance();
    removeStaleLock('stale');
    return await PGlite.create(dataDir);
  }
}

export const db = await openDatabase();

// Small helper that mirrors node-postgres' result shape ({ rows, rowCount }).
export async function q(text, params = []) {
  const res = await db.query(text, params);
  return { rows: res.rows, rowCount: res.rowCount ?? (res.rows ? res.rows.length : 0) };
}

// Run multiple statements (schema / migrations).
export async function exec(sql) {
  return db.exec(sql);
}

// Run a group of statements atomically. The callback receives a query
// function with the same signature as `q`, so existing helpers can be reused
// inside a transaction. If any statement throws, every statement in the
// group is rolled back — a partial write can never be left behind.
//
// IMPORTANT: inside the callback, use the supplied query function only.
// PGlite has a single connection, so calling the global `q` while a
// transaction is open deadlocks (the transaction holds the connection until
// it commits). Audit logging and notifications therefore belong outside.
export async function transaction(fn) {
  return db.transaction(async (tx) => {
    const run = async (text, params = []) => {
      const res = await tx.query(text, params);
      return { rows: res.rows, rowCount: res.rowCount ?? res.affectedRows ?? (res.rows ? res.rows.length : 0) };
    };
    return fn(run);
  });
}

export { dataDir };
