// server/db/schema.js
// Firestore needs no DDL: collections are created on the first write and
// indexes are deployed from firestore.indexes.json (see FIREBASE_SETUP.md).
//
// This module does the two things that do need doing at boot:
//   1. prove that the Firebase project and credentials work, and
//   2. make sure the id counters are above the highest id already stored,
//      so a new row never collides with an imported one.

import {
  COLLECTIONS,
  queryRows,
  ensureCounterAtLeast,
  ping,
} from './firestore.js';

// Highest numeric id currently used in a collection.
async function maxNumericId(name) {
  const rows = await queryRows(name, { orders: [['id', 'desc']], limit: 1, select: ['id'] });
  return rows.length ? Number(rows[0].id) || 0 : 0;
}

export async function initSchema() {
  const status = await ping();
  console.info(
    `[db] Firestore ready (project: ${status.projectId}${status.emulator ? ', emulator' : ''})`
  );

  for (const name of Object.keys(COLLECTIONS)) {
    if (!COLLECTIONS[name].numericId) continue;
    // eslint-disable-next-line no-await-in-loop
    const max = await maxNumericId(name);
    // eslint-disable-next-line no-await-in-loop
    await ensureCounterAtLeast(name, max);
  }
}
