// server/db/firestore.js
// Cloud data layer (Firebase Firestore). Firestore is the system of record for
// the whole app: shipments, timeline events, comments, admins, sessions and
// the audit trail live in the cloud, so the admin dashboard and the customer
// tracking page work from any device.
//
// Document ids
//   Every collection keeps the numeric id it had in the old PostgreSQL
//   database, so existing links (/admin/shipments/12) keep working. The id is
//   stored both as the document id and as an `id` field for ordering.
//
// Field types (kept identical to the old SQL schema so the app code that
// reads and writes rows did not have to change):
//   TIMESTAMPTZ -> Firestore Timestamp   (read back as a JS Date)
//   DATE       -> Timestamp @ UTC midnight (read back as a JS Date)
//   TIME       -> "HH:MM:SS" string
//   NUMERIC    -> number                (read back as a 2-decimal string)
//   INTEGER    -> number
//   BOOLEAN    -> boolean
//   TEXT       -> string

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import dotenv from 'dotenv';

dotenv.config();

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '';

// Credentials come from the service account the Firebase console hands out
// (Project settings -> Service accounts -> Generate new private key).
const projectId = process.env.FIREBASE_PROJECT_ID || '';
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || '';
const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

export const isConfigured = Boolean(EMULATOR_HOST || (projectId && clientEmail && privateKey));

if (!isConfigured) {
  console.error(
    '\n  Firebase is not configured.\n' +
      '  Add these to your .env (see FIREBASE_SETUP.md for the console steps):\n\n' +
      '    FIREBASE_PROJECT_ID=your-project-id\n' +
      '    FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com\n' +
      '    FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"\n'
  );
  process.exit(1);
}

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential: EMULATOR_HOST ? undefined : cert({ projectId, clientEmail, privateKey }),
      projectId: projectId || 'demo-swiftnova',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || (projectId ? `${projectId}.appspot.com` : undefined),
    });

// The database named "(default)" is the one every project starts with. An
// explicit settings object is only needed for a second, named database.
const databaseId = (process.env.FIRESTORE_DATABASE_ID || '').trim();
export const db = databaseId && databaseId !== '(default)'
  ? getFirestore(app, { databaseId })
  : getFirestore(app);

export { Timestamp, FieldValue };

// ---- Collection metadata ----------------------------------------------------

// dateFields      : JS Date   <-> Timestamp
// dateStringFields: 'YYYY-MM-DD' -> Timestamp @ UTC midnight  (read back as Date)
// timeFields      : 'HH:MM' -> 'HH:MM:SS'
// decimalFields   : number   -> 2-decimal string on read (matches SQL NUMERIC)
export const COLLECTIONS = {
  admins: {
    dateFields: ['last_login_at', 'created_at'],
    numericId: true,
  },
  shipments: {
    dateFields: ['created_at', 'updated_at', 'estimated_delivered_at', 'delivered_at'],
    dateStringFields: ['pickup_date', 'dispatch_date', 'estimated_delivery_date'],
    timeFields: ['estimated_delivery_time'],
    decimalFields: ['weight_kg', 'customs_fee'],
    numericId: true,
  },
  tracking_events: {
    dateFields: ['created_at'],
    numericId: true,
  },
  comments: {
    dateFields: ['created_at'],
    numericId: true,
  },
  delivery_estimate_history: {
    dateFields: ['created_at', 'previous_estimate', 'new_estimate'],
    dateStringFields: ['previous_date', 'new_date'],
    timeFields: ['previous_time', 'new_time'],
    numericId: true,
  },
  activity_logs: {
    dateFields: ['created_at'],
    numericId: true,
  },
  sessions: {
    dateFields: ['expires'],
    numericId: false,
  },
};

const COUNTERS = '_counters';

// ---- Value conversion -------------------------------------------------------

function toDateValue(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value instanceof Timestamp) return value.toDate();
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00.000Z`);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toTimeValue(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return s;
}

// Firestore document payload for a row: field names and value types are
// normalised so the stored shape is always consistent.
export function toDoc(name, row) {
  const meta = COLLECTIONS[name] || {};
  const out = {};

  for (const [key, value] of Object.entries(row)) {
    if (value === undefined) continue;
    if (meta.dateFields?.includes(key)) {
      const d = toDateValue(value);
      out[key] = d ? Timestamp.fromDate(d) : null;
    } else if (meta.dateStringFields?.includes(key)) {
      const d = toDateValue(value);
      out[key] = d ? Timestamp.fromDate(d) : null;
    } else if (meta.timeFields?.includes(key)) {
      out[key] = toTimeValue(value);
    } else if (meta.decimalFields?.includes(key)) {
      out[key] = value == null || value === '' ? null : Number(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

// Firestore document -> row object shaped like the old SQL row.
export function toRow(name, data, docId) {
  const meta = COLLECTIONS[name] || {};
  const row = { ...data };

  for (const key of meta.dateFields || []) {
    if (row[key] instanceof Timestamp) row[key] = row[key].toDate();
  }
  for (const key of meta.dateStringFields || []) {
    if (row[key] instanceof Timestamp) row[key] = row[key].toDate();
  }
  for (const key of meta.decimalFields || []) {
    if (row[key] != null) row[key] = Number(row[key]).toFixed(2);
  }

  if (meta.numericId) row.id = Number(docId);
  return row;
}

// ---- Errors -----------------------------------------------------------------

// Firestore refuses a query whose composite index has not been deployed yet.
// Turn that into an actionable message instead of a stack trace.
export function describeFirestoreError(err) {
  const code = err?.code;
  const text = err?.message || String(err);
  if (code === 9 || /FAILED_PRECONDITION|requires an index/i.test(text)) {
    return new Error(
      'Firestore is missing a composite index for this query. Deploy the indexes with:\n' +
        '  firebase deploy --only firestore:indexes\n' +
        `Original error: ${text}`
    );
  }
  return err;
}

// ---- Core operations --------------------------------------------------------

export function col(name) {
  return db.collection(name);
}

export async function getRow(name, id) {
  const snap = await col(name).doc(String(id)).get();
  if (!snap.exists) return null;
  return toRow(name, snap.data(), snap.id);
}

export async function getRows(name, ids) {
  if (!ids || ids.length === 0) return [];
  const refs = ids.map((id) => col(name).doc(String(id)));
  const snaps = await db.getAll(...refs);
  return snaps
    .filter((s) => s.exists)
    .map((s) => toRow(name, s.data(), s.id));
}

export async function setRow(name, id, row) {
  const payload = toDoc(name, row);
  if (COLLECTIONS[name]?.numericId) payload.id = Number(id);
  await col(name).doc(String(id)).set(payload, { merge: true });
  return toRow(name, payload, String(id));
}

export async function updateRow(name, id, patch) {
  const payload = toDoc(name, patch);
  delete payload.id;
  await col(name).doc(String(id)).set(payload, { merge: true });
  return getRow(name, id);
}

export async function deleteRow(name, id) {
  await col(name).doc(String(id)).delete();
}

// Delete many documents across collections in batches. Firestore caps a batch
// (and a transaction) at 500 writes, so large cascades are split up.
export async function deleteDocs(entries) {
  let batch = db.batch();
  let count = 0;
  for (const { name, id } of entries) {
    batch.delete(col(name).doc(String(id)));
    count += 1;
    if (count >= 400) {
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
      batch = db.batch();
      count = 0;
    }
  }
  if (count > 0) await batch.commit();
}

// Query helper.
//   filters : [{ field, op, value }]  op: '==' | '!=' | '<' | '<=' | '>' | '>=' | 'array-contains'
//   orders  : [[field, 'asc' | 'desc']]
export async function queryRows(name, { filters = [], orders = [], limit = 0, startAfter = null, select = null } = {}) {
  let ref = col(name);
  for (const f of filters) {
    ref = ref.where(f.field, f.op, f.value);
  }
  for (const [field, dir] of orders) {
    ref = ref.orderBy(field, dir);
  }
  if (limit > 0) ref = ref.limit(limit);
  if (select && select.length) ref = ref.select(...select);
  if (startAfter) {
    const cursor = await col(name).doc(String(startAfter)).get();
    if (cursor.exists) ref = ref.startAfter(cursor);
  }

  try {
    const snap = await ref.get();
    return snap.docs.map((d) => toRow(name, d.data(), d.id));
  } catch (err) {
    throw describeFirestoreError(err);
  }
}

// Count documents matching the filters (counted by Firestore's aggregation
// API, so no documents are downloaded).
export async function countDocs(name, { filters = [] } = {}) {
  let ref = col(name);
  for (const f of filters) {
    ref = ref.where(f.field, f.op, f.value);
  }
  try {
    const snap = await ref.count().get();
    return snap.data().count;
  } catch (err) {
    throw describeFirestoreError(err);
  }
}

// Count documents matching the filters (counted client-side because Firestore
// has no COUNT(*) equivalent).
export async function countRows(name, { filters = [] } = {}) {
  const rows = await queryRows(name, { filters });
  return rows.length;
}

// Delete every document of a collection in batches. Used by the migration
// script and the "reset demo data" helper.
export async function clearCollection(name) {
  const snap = await col(name).get();
  const batch = db.batch();
  let count = 0;
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    count += 1;
    if (count >= 400) {
      await batch.commit();
      count = 0;
    }
  }
  if (count > 0) await batch.commit();
  return snap.size;
}

// ---- Sequential ids ---------------------------------------------------------

// Firestore has no auto-increment, so a counter document hands out the next
// numeric id. The read and the write happen in one transaction, so two
// concurrent creates can never receive the same id.
export async function nextNumericId(name) {
  const ref = col(COUNTERS).doc(name);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? Number(snap.get('value') || 0) : 0;
    const next = current + 1;
    tx.set(ref, { value: next });
    return next;
  });
}

// Allocate several ids in one transaction (a shipment write usually needs an
// id for the shipment plus one for each child row).
export async function nextNumericIds(names) {
  const list = Array.isArray(names) ? names : [names];
  const out = {};
  await db.runTransaction(async (tx) => {
    const refs = list.map((name) => col(COUNTERS).doc(name));
    const snaps = await tx.getAll(...refs);
    list.forEach((name, i) => {
      const current = snaps[i].exists ? Number(snaps[i].get('value') || 0) : 0;
      const next = current + 1;
      tx.set(refs[i], { value: next });
      out[name] = next;
    });
  });
  return out;
}

// Make sure the counter is above the highest id already stored (used after
// importing data, so new rows never collide with imported ones).
export async function ensureCounterAtLeast(name, value) {
  if (!Number.isFinite(value) || value <= 0) return;
  const ref = col(COUNTERS).doc(name);
  const snap = await ref.get();
  const current = snap.exists ? Number(snap.get('value') || 0) : 0;
  if (current < value) await ref.set({ value }, { merge: true });
}

export async function currentCounter(name) {
  const snap = await col(COUNTERS).doc(name).get();
  return snap.exists ? Number(snap.get('value') || 0) : 0;
}

// ---- Transactions -----------------------------------------------------------

// Firestore transactions require every read before every write; the helper
// gives the callback a small API with that constraint baked in.
export async function transaction(fn) {
  try {
    return await db.runTransaction(async (tx) => {
      const api = {
        get: async (name, id) => {
          const snap = await tx.get(col(name).doc(String(id)));
          return snap.exists ? toRow(name, snap.data(), snap.id) : null;
        },
        set: (name, id, row) => {
          const payload = toDoc(name, row);
          if (COLLECTIONS[name]?.numericId) payload.id = Number(id);
          tx.set(col(name).doc(String(id)), payload, { merge: true });
        },
        update: (name, id, patch) => {
          const payload = toDoc(name, patch);
          delete payload.id;
          tx.set(col(name).doc(String(id)), payload, { merge: true });
        },
        delete: (name, id) => {
          tx.delete(col(name).doc(String(id)));
        },
      };
      return fn(api);
    });
  } catch (err) {
    throw describeFirestoreError(err);
  }
}

// ---- Connectivity check -----------------------------------------------------

export async function ping() {
  // A cheap read that proves the project id and credentials are valid.
  const snap = await col(COUNTERS).limit(1).get();
  return { ok: true, emulator: Boolean(EMULATOR_HOST), projectId: projectId || 'demo-swiftnova', documents: snap.size };
}

export async function closeFirestore() {
  try {
    await db.terminate();
  } catch {
    // Nothing to clean up.
  }
}
