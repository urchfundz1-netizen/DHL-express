// scripts/list-indexes.js
// Lists the composite indexes on the Firestore database and can remove the
// ones that are not used by the app.
//
//   npm run indexes:list
//   npm run indexes:list -- --prune=packageinfo
//
// "Pruning" is opt-in and only removes indexes whose collection group was
// named explicitly, so a typo cannot wipe the whole set.

import 'dotenv/config';

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const databaseId = (process.env.FIRESTORE_DATABASE_ID || '(default)').trim();

const BASE = 'https://firestore.googleapis.com/v1';
const dbPath = `projects/${projectId}/databases/${databaseId}`;

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken() {
  const { createSign } = await import('node:crypto');
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));
  const signature = base64url(createSign('RSA-SHA256').update(`${header}.${claims}`).sign(privateKey));
  const assertion = `${header}.${claims}.${signature}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Token request failed (${res.status}): ${JSON.stringify(body)}`);
  return body.access_token;
}

// The list response omits collectionGroup; it is only present in the name
// path: projects/.../collectionGroups/<group>/indexes/<id>
function collectionGroupOf(idx) {
  const m = /\/collectionGroups\/([^/]+)\/indexes\//.exec(idx.name || '');
  return m ? m[1] : '?';
}

function describe(idx) {
  const fields = (idx.fields || [])
    .filter((f) => f.fieldPath !== '__name__')
    .map((f) => `${f.fieldPath} ${(f.order || f.arrayConfig || '').toString().slice(0, 1)}`)
    .join(', ');
  return `${collectionGroupOf(idx).padEnd(28)} ${fields}`;
}

async function main() {
  const pruneArg = process.argv.find((a) => a.startsWith('--prune='));
  const pruneTo = pruneArg ? pruneArg.split('=')[1].split(',').map((s) => s.trim()) : [];

  const token = await getAccessToken();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const res = await fetch(`${BASE}/${dbPath}/collectionGroups/-/indexes`, { headers });
  const body = await res.json();
  if (!res.ok) throw new Error(`List failed (${res.status}): ${JSON.stringify(body)}`);

  const indexes = body.indexes || [];
  console.log(`Project ${projectId}, database ${databaseId} — ${indexes.length} index(es)\n`);
  for (const idx of indexes) {
    console.log(`  ${idx.state || '?'}\t${describe(idx)}\t${idx.name.split('/').pop()}`);
  }

  if (!pruneTo.length) {
    console.log('\nTo remove an index: npm run indexes:list -- --prune=<collectionGroup>');
    process.exit(0);
  }

  for (const idx of indexes) {
    const group = collectionGroupOf(idx);
    if (!pruneTo.includes(group)) continue;
    const del = await fetch(`${BASE}/${idx.name}`, { method: 'DELETE', headers });
    console.log(`\n  delete ${group} (${idx.name.split('/').pop()}) -> ${del.ok ? 'OK' : `FAILED (${del.status})`}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
