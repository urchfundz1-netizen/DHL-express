// scripts/create-indexes.js
// Creates the composite Firestore indexes the app's queries need, using the
// Firestore Admin REST API with the service account from .env.
//
// This exists because `firebase deploy --only firestore:indexes` needs the
// Firebase CLI to be signed in as an account that owns the project. The
// service account already has permission, so the API can be called directly.
//
//   npm run indexes:create
//
// Safe to run repeatedly: an index that already exists is reported as such
// instead of failing.

import 'dotenv/config';

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const databaseId = (process.env.FIRESTORE_DATABASE_ID || '(default)').trim();

if (!projectId || !clientEmail || !privateKey) {
  console.error('FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY must be set in .env');
  process.exit(1);
}

const BASE = 'https://firestore.googleapis.com/v1';
const dbPath = `projects/${projectId}/databases/${databaseId}`;

// Same definitions as firestore.indexes.json, in the REST API's shape.
const INDEXES = [
  ['shipments', [['archived', 'ASCENDING'], ['created_at', 'DESCENDING']]],
  ['shipments', [['archived', 'ASCENDING'], ['updated_at', 'DESCENDING']]],
  ['shipments', [['archived', 'ASCENDING'], ['estimated_delivery_date', 'ASCENDING']]],
  ['shipments', [['archived', 'ASCENDING'], ['tracking_number', 'ASCENDING']]],
  ['shipments', [['archived', 'ASCENDING'], ['recipient_name', 'ASCENDING']]],
  ['shipments', [['archived', 'ASCENDING'], ['destination_city', 'ASCENDING']]],
  ['shipments', [['status', 'ASCENDING'], ['created_at', 'DESCENDING']]],
  ['shipments', [['archived', 'ASCENDING'], ['status', 'ASCENDING'], ['created_at', 'DESCENDING']]],
  ['shipments', [['status_mode', 'ASCENDING'], ['archived', 'ASCENDING'], ['delivered_at', 'ASCENDING']]],
  ['tracking_events', [['shipment_id', 'ASCENDING'], ['created_at', 'ASCENDING']]],
  ['comments', [['shipment_id', 'ASCENDING'], ['created_at', 'DESCENDING']]],
  ['comments', [['shipment_id', 'ASCENDING'], ['visibility', 'ASCENDING'], ['created_at', 'DESCENDING']]],
  ['delivery_estimate_history', [['shipment_id', 'ASCENDING'], ['created_at', 'DESCENDING']]],
];

// ---- Access token from the service account ---------------------------------

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
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(privateKey);
  const assertion = `${header}.${claims}.${base64url(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Token request failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return body.access_token;
}

// ---- Index helpers ---------------------------------------------------------

function describe(collection, fields) {
  return `${collection} (${fields.map(([f, o]) => `${f} ${o[0]}`).join(', ')})`;
}

async function main() {
  const token = await getAccessToken();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const existingRes = await fetch(`${BASE}/${dbPath}/collectionGroups/-/indexes`, { headers });
  const existingBody = await existingRes.json();
  if (!existingRes.ok) {
    throw new Error(`Could not list indexes (${existingRes.status}): ${JSON.stringify(existingBody)}`);
  }

  const signature = (idx) => `${idx.collectionGroup}|${(idx.fields || [])
    .filter((f) => f.fieldPath !== '__name__')
    .map((f) => `${f.fieldPath}:${f.order || f.arrayConfig}`)
    .join(',')}`;
  const present = new Set((existingBody.indexes || []).map(signature));

  console.log(`Project ${projectId}, database ${databaseId}\n`);

  let created = 0;
  let skipped = 0;

  for (const [collection, fields] of INDEXES) {
    const wanted = {
      queryScope: 'COLLECTION',
      fields: fields.map(([fieldPath, order]) => ({ fieldPath, order })),
    };

    if (present.has(signature(wanted))) {
      console.log(`  = already exists  ${describe(collection, fields)}`);
      skipped += 1;
      continue;
    }

    let res;
    let body;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      res = await fetch(`${BASE}/${dbPath}/collectionGroups/${collection}/indexes`, {
        method: 'POST',
        headers,
        body: JSON.stringify(wanted),
      });
      body = await res.json();
      if (res.ok || (body?.error?.status !== 'UNAVAILABLE' && res.status !== 503)) break;
      console.log(`  ... retrying ${describe(collection, fields)} (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }

    if (!res.ok) {
      console.error(`  ! FAILED ${describe(collection, fields)} (${res.status}): ${body?.error?.message || JSON.stringify(body)}`);
      continue;
    }
    console.log(`  + created         ${describe(collection, fields)}`);
    created += 1;
  }

  console.log(`\n${created} created, ${skipped} already present.`);
  console.log('Index builds run in the background; they are ready when the console shows "Enabled".');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nIndex creation failed:', err.message);
  process.exit(1);
});
