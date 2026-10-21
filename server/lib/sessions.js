// server/lib/sessions.js
// Session housekeeping shared by the boot sequence and the cron endpoint.
// Lives in its own module to keep server/app.js and server/routes/cron.js from
// importing each other in a cycle.

import { queryRows, deleteRow } from '../db/firestore.js';

// Remove expired session rows. Without this the collection grows forever,
// because the store only deletes a row when that exact sid is looked up.
export async function purgeExpiredSessions() {
  const expired = await queryRows('sessions', {
    filters: [{ field: 'expires', op: '<', value: new Date() }],
    select: ['sid'],
  });
  await Promise.all(expired.map((s) => deleteRow('sessions', s.sid)));
  if (expired.length > 0) console.info(`[session] Removed ${expired.length} expired session(s).`);
}
