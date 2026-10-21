// server/lib/storage.js
// File attachments for shipments, kept in Firebase Storage.
//
// The whole file lives in the cloud bucket; Firestore only stores the metadata
// (name, size, content type, download URL) on the shipment document. That means
// documents are reachable from any device, and the admin UI can list them
// without touching the bucket.

import { randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { getApp } from 'firebase-admin/app';
import { getRow, updateRow, queryRows } from '../db/firestore.js';
import { HttpError, ValidationError } from './validate.js';

const bucketName = process.env.FIREBASE_STORAGE_BUCKET
  || (process.env.FIREBASE_PROJECT_ID ? `${process.env.FIREBASE_PROJECT_ID}.appspot.com` : '');

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

// Content types we accept. Anything else is refused rather than silently
// stored, so the bucket cannot become a dumping ground for executables.
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export function storageEnabled() {
  return Boolean(bucketName);
}

function bucket() {
  if (!bucketName) {
    throw new HttpError(503, 'File storage is not configured. Set FIREBASE_STORAGE_BUCKET in .env.');
  }
  return getStorage(getApp()).bucket(bucketName);
}

// A storage path that is safe (no user-controlled separators) and unique.
function storagePathFor(shipmentId, originalName) {
  const safe = String(originalName || 'file')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(-80);
  return `shipments/${shipmentId}/${randomUUID()}-${safe}`;
}

// ---- Upload ----------------------------------------------------------------

export async function uploadShipmentFile(shipmentId, file, admin) {
  const shipment = await getRow('shipments', shipmentId);
  if (!shipment) throw new HttpError(404, 'Shipment not found');
  if (!file) throw new ValidationError('Please choose a file to upload', 'file');
  if (file.size > MAX_FILE_BYTES) {
    throw new ValidationError(`Files must be 10 MB or smaller (this one is ${(file.size / 1048576).toFixed(1)} MB)`, 'file');
  }
  if (!ALLOWED_TYPES.has(file.mimetype)) {
    throw new ValidationError(`That file type is not allowed (${file.mimetype || 'unknown'})`, 'file');
  }

  const destination = storagePathFor(shipmentId, file.originalname);
  const blob = bucket().file(destination);

  await blob.save(file.buffer, {
    contentType: file.mimetype,
    resumable: false,
    metadata: { metadata: { shipmentId: String(shipmentId), uploadedBy: admin?.email || 'unknown' } },
  });

  // A download token makes the file readable by anyone holding the URL, which
  // is what the admin UI needs. The bucket itself stays private and files are
  // never publicly listed — the app is the only thing handing out links.
  const [metadata] = await blob.getMetadata();
  let downloadToken = metadata?.metadata?.firebaseStorageDownloadTokens;
  if (!downloadToken) {
    downloadToken = randomUUID();
    await blob.setMetadata({ metadata: { firebaseStorageDownloadTokens: downloadToken } });
  }

  const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(destination)}?alt=media&token=${downloadToken}`;

  const record = {
    id: randomUUID(),
    name: file.originalname || 'file',
    path: destination,
    size: file.size,
    type: file.mimetype,
    url: downloadUrl,
    uploaded_by: admin?.name || admin?.email || 'System',
    uploaded_at: new Date().toISOString(),
    customer_visible: false,
  };

  const files = Array.isArray(shipment.files) ? shipment.files : [];
  await updateRow('shipments', shipmentId, { files: [...files, record], updated_at: new Date() });

  return record;
}

// ---- Read ------------------------------------------------------------------

export async function listShipmentFiles(shipmentId) {
  const shipment = await getRow('shipments', shipmentId);
  if (!shipment) throw new HttpError(404, 'Shipment not found');
  return Array.isArray(shipment.files) ? shipment.files : [];
}

// ---- Delete ----------------------------------------------------------------

export async function deleteShipmentFile(shipmentId, fileId, admin) {
  const shipment = await getRow('shipments', shipmentId);
  if (!shipment) throw new HttpError(404, 'Shipment not found');

  const files = Array.isArray(shipment.files) ? shipment.files : [];
  const target = files.find((f) => f.id === fileId);
  if (!target) throw new HttpError(404, 'File not found');

  try {
    await bucket().file(target.path).delete({ ignoreNotFound: true });
  } catch (err) {
    // The Firestore record is still removed even if the object is already gone,
    // otherwise a missing blob would leave an undeletable list entry behind.
    console.warn('[storage] Could not delete blob', target.path, err.message);
  }

  await updateRow('shipments', shipmentId, {
    files: files.filter((f) => f.id !== fileId),
    updated_at: new Date(),
  });

  return { ok: true, removed: target.name };
}

// ---- Orphan report ---------------------------------------------------------

// Delete a batch of storage objects. Best-effort: missing objects are ignored,
// and the whole call never rejects so callers can fire-and-forget.
export async function deleteStorageObjects(paths) {
  if (!bucketName || !paths?.length) return 0;
  let removed = 0;
  await Promise.all(paths.map(async (path) => {
    try {
      await bucket().file(path).delete({ ignoreNotFound: true });
      removed += 1;
    } catch (err) {
      console.warn('[storage] Could not delete blob', path, err.message);
    }
  }));
  return removed;
}

// Storage objects without a matching Firestore record (useful after manual
// edits in the console). Read-only: nothing is deleted.
export async function findOrphanedFiles() {
  const [files] = await bucket().getFiles({ prefix: 'shipments/' });
  const known = new Set();
  const shipments = await queryRows('shipments', { select: ['id', 'files'] });
  for (const s of shipments) {
    for (const f of Array.isArray(s.files) ? s.files : []) known.add(f.path);
  }
  return files.filter((f) => !known.has(f.name)).map((f) => f.name);
}
