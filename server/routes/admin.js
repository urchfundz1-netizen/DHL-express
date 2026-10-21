// server/routes/admin.js
// Protected admin API. Every route requires an authenticated session.

import express from 'express';
import multer from 'multer';
import { requireAuth } from '../lib/auth.js';
import {
  createShipment,
  getShipmentAdmin,
  editShipment,
  updateStatus,
  delayShipment,
  addComment,
  archiveShipment,
  deleteShipment,
  listShipments,
  getDashboardStats,
  recentShipments,
  recentEvents,
  delayedShipments,
  refreshAutoStatuses,
} from '../lib/shipments.js';
import { listActivity } from '../lib/activity.js';
import { ALL_STATUSES, CURRENCIES, DELAY_REASONS, PACKAGE_CATEGORIES, SHIPPING_METHODS, STATUS_TONE } from '../lib/constants.js';
import { queryRows } from '../db/firestore.js';
import { HttpError } from '../lib/validate.js';
import {
  uploadShipmentFile,
  listShipmentFiles,
  deleteShipmentFile,
  storageEnabled,
  MAX_FILE_BYTES,
} from '../lib/storage.js';

export const adminRouter = express.Router();

adminRouter.use(requireAuth);

// Files are held in memory just long enough to stream them to Storage; the
// 10 MB cap is enforced again in the upload handler.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
});

// requireAuth resolves the admin from the database and attaches req.admin
// (id, email, name, role, ip). Building it from the raw session again would
// reintroduce the dangling-adminId problem, so it is not done here.

function parseId(req) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) throw new HttpError(400, 'Invalid shipment id');
  return id;
}

// ---- Options / constants for forms -----------------------------------------
adminRouter.get('/constants', (req, res) => {
  res.json({
    ok: true,
    statuses: ALL_STATUSES,
    statusTone: STATUS_TONE,
    delayReasons: DELAY_REASONS,
    categories: PACKAGE_CATEGORIES,
    shippingMethods: SHIPPING_METHODS,
    currencies: CURRENCIES,
  });
});

// ---- Dashboard -------------------------------------------------------------
adminRouter.get('/dashboard', async (req, res, next) => {
  try {
    const [stats, recent, events, delayed] = await Promise.all([
      getDashboardStats(),
      recentShipments(6),
      recentEvents(8),
      delayedShipments(6),
    ]);
    res.json({ ok: true, stats, recentShipments: recent, recentEvents: events, delayedShipments: delayed });
  } catch (err) {
    next(err);
  }
});

// ---- Shipments list --------------------------------------------------------
adminRouter.get('/shipments', async (req, res, next) => {
  try {
    const data = await listShipments(req.query);
    res.json({ ok: true, ...data });
  } catch (err) {
    next(err);
  }
});

// ---- Create ----------------------------------------------------------------
adminRouter.post('/shipments', async (req, res, next) => {
  try {
    const result = await createShipment(req.body, req.admin);
    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

// ---- Delayed shipments (before :id to avoid route clashes) -----------------
adminRouter.get('/shipments/delayed', async (req, res, next) => {
  try {
    const rows = await delayedShipments(100);
    res.json({ ok: true, rows });
  } catch (err) {
    next(err);
  }
});

// ---- Recipients / customers ------------------------------------------------
adminRouter.get('/recipients', async (req, res, next) => {
  try {
    // The old query was DISTINCT ON (recipient_name, destination_city) with the
    // newest shipment winning. Firestore has no DISTINCT, so the rows are
    // grouped in memory.
    const rows = await queryRows('shipments', {
      select: [
        'recipient_name', 'recipient_contact', 'destination_address',
        'destination_city', 'destination_country', 'created_at',
      ],
    });

    const byKey = new Map();
    for (const r of rows) {
      const key = `${r.recipient_name}|${r.destination_city}`;
      const prev = byKey.get(key);
      if (!prev || new Date(r.created_at) > new Date(prev.created_at)) byKey.set(key, r);
    }

    const out = [...byKey.values()]
      .sort((a, b) => `${a.recipient_name}|${a.destination_city}`
        .localeCompare(`${b.recipient_name}|${b.destination_city}`))
      .slice(0, 200)
      .map((r) => ({
        recipient_name: r.recipient_name,
        recipient_contact: r.recipient_contact,
        destination_address: r.destination_address,
        destination_city: r.destination_city,
        destination_country: r.destination_country,
      }));

    res.json({ ok: true, rows: out });
  } catch (err) {
    next(err);
  }
});

// ---- Reports ---------------------------------------------------------------
adminRouter.get('/reports', async (req, res, next) => {
  try {
    await refreshAutoStatuses();
    const rows = await queryRows('shipments', {
      select: ['status', 'shipping_method', 'created_at'],
    });

    const byStatusMap = {};
    const byMethodMap = {};
    for (const r of rows) {
      if (r.status) byStatusMap[r.status] = (byStatusMap[r.status] || 0) + 1;
      const method = r.shipping_method || 'Unspecified';
      byMethodMap[method] = (byMethodMap[method] || 0) + 1;
    }

    const byStatus = Object.entries(byStatusMap)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
    const byMethod = Object.entries(byMethodMap)
      .map(([method, count]) => ({ method, count }))
      .sort((a, b) => b.count - a.count);

    // Shipments created per local day over the last 30 days.
    const cutoff = Date.now() - 30 * 86400000;
    const byDay = {};
    for (const r of rows) {
      if (!r.created_at) continue;
      const d = new Date(r.created_at);
      if (d.getTime() <= cutoff) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      byDay[key] = (byDay[key] || 0) + 1;
    }
    const last30 = Object.entries(byDay)
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day.localeCompare(b.day));

    res.json({ ok: true, byStatus, byMethod, last30 });
  } catch (err) {
    next(err);
  }
});

// ---- Activity logs ---------------------------------------------------------
adminRouter.get('/activity', async (req, res, next) => {
  try {
    const data = await listActivity(req.query);
    res.json({ ok: true, ...data });
  } catch (err) {
    next(err);
  }
});

// ---- Single shipment -------------------------------------------------------
adminRouter.get('/shipments/:id', async (req, res, next) => {
  try {
    const id = parseId(req);
    const data = await getShipmentAdmin(id);
    res.json({ ok: true, ...data });
  } catch (err) {
    next(err);
  }
});

adminRouter.put('/shipments/:id', async (req, res, next) => {
  try {
    const id = parseId(req);
    await editShipment(id, req.body, req.admin);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/shipments/:id/status', async (req, res, next) => {
  try {
    const id = parseId(req);
    const result = await updateStatus(id, req.body, req.admin);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/shipments/:id/delay', async (req, res, next) => {
  try {
    const id = parseId(req);
    await delayShipment(id, req.body, req.admin);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/shipments/:id/comments', async (req, res, next) => {
  try {
    const id = parseId(req);
    await addComment(id, req.body, req.admin);
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/shipments/:id/archive', async (req, res, next) => {
  try {
    const id = parseId(req);
    const result = await archiveShipment(id, req.admin);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/shipments/:id', async (req, res, next) => {
  try {
    const id = parseId(req);
    await deleteShipment(id, req.admin);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- File attachments (Firebase Storage) -----------------------------------

adminRouter.get('/storage/status', (req, res) => {
  res.json({ ok: true, enabled: storageEnabled(), maxBytes: MAX_FILE_BYTES });
});

adminRouter.get('/shipments/:id/files', async (req, res, next) => {
  try {
    const id = parseId(req);
    res.json({ ok: true, rows: await listShipmentFiles(id) });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/shipments/:id/files', upload.single('file'), async (req, res, next) => {
  try {
    const id = parseId(req);
    const record = await uploadShipmentFile(id, req.file, req.admin);
    res.status(201).json({ ok: true, file: record });
  } catch (err) {
    // Multer rejects an oversized file before the handler runs.
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return next(new HttpError(400, `Files must be ${MAX_FILE_BYTES / 1048576} MB or smaller`));
    }
    next(err);
  }
});

adminRouter.delete('/shipments/:id/files/:fileId', async (req, res, next) => {
  try {
    const id = parseId(req);
    const result = await deleteShipmentFile(id, req.params.fileId, req.admin);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});
