// server/routes/cron.js
// Scheduled maintenance endpoints. On a long-running server these tasks run at
// boot; on Vercel they are triggered by a Cron Job (see vercel.json).
//
// Vercel signs cron requests with this header when CRON_SECRET is set. Without
// the secret configured the endpoint is left open only to loopback requests, so
// it can never be invoked from the public internet by accident.

import express from 'express';
import { purgeExpiredSessions } from '../lib/sessions.js';

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
