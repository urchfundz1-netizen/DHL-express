// server/routes/cron.js
// Scheduled maintenance endpoints. On a long-running server these tasks run at
// boot; on Vercel they are triggered by a Cron Job (see vercel.json).
//
// Vercel signs cron requests with this header when CRON_SECRET is set. Without
// the secret configured the endpoint is left open only to loopback requests, so
// it can never be invoked from the public internet by accident.

import express from 'express';
import { purgeExpiredSessions } from '../lib/sessions.js';
import { purgeExpiredRateLimits } from '../lib/rate-limit-store.js';
import { refreshAutoStatuses } from '../lib/shipments.js';

export const cronRouter = express.Router();

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    return req.get('authorization') === `Bearer ${secret}`;
  }
  // No secret set: allow only the local machine (dev / self-hosted).
  const ip = req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

cronRouter.get('/purge-sessions', async (req, res, next) => {
  try {
    if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    await purgeExpiredSessions();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

cronRouter.get('/purge-rate-limits', async (req, res, next) => {
  try {
    if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const removed = await purgeExpiredRateLimits();
    res.json({ ok: true, removed });
  } catch (err) {
    next(err);
  }
});

// Date-driven shipment statuses only change at day boundaries, so they are
// recalculated by the daily job instead of before every read.
cronRouter.get('/refresh-statuses', async (req, res, next) => {
  try {
    if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const updated = await refreshAutoStatuses();
    res.json({ ok: true, statusesUpdated: updated });
  } catch (err) {
    next(err);
  }
});

// The daily job runs the whole housekeeping. Vercel's Hobby plan only allows
// a couple of cron entries, so one endpoint does every sweep + the status
// refresh instead of one endpoint per task.
cronRouter.get('/purge-maintenance', async (req, res, next) => {
  try {
    if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    await purgeExpiredSessions();
    const removed = await purgeExpiredRateLimits();
    const statusesUpdated = await refreshAutoStatuses();
    res.json({ ok: true, rateLimitsRemoved: removed, statusesUpdated });
  } catch (err) {
    next(err);
  }
});
