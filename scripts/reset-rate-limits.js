// scripts/reset-rate-limits.js
// Clears the shared login rate-limit counters.
//
//   npm run rate-limits:reset
//
// Useful when the admin got locked out after too many failed sign-ins, or when
// the smoke test has spent the login budget of the local environment. Only the
// counters of the current namespace (development / preview / production) are
// touched, and the windows are re-created from scratch on the next request.

import 'dotenv/config';

import { FirestoreRateLimitStore, rateLimitNamespace } from '../server/lib/rate-limit-store.js';
import { closeFirestore } from '../server/db/firestore.js';

const namespace = rateLimitNamespace();
const stores = ['login-ip', 'login-account'].map(
  (name) => new FirestoreRateLimitStore({ prefix: `${name}:${namespace}` })
);

console.log(`Clearing login rate-limit counters (namespace: ${namespace})`);
for (const store of stores) {
  const removed = await store.resetAll();
  console.log(`  ${store.prefix}: removed ${removed} counter(s)`);
}

await closeFirestore();
