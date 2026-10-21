// server/routes/public.js
// Public, customer-facing endpoints (no authentication required).

import express from 'express';
import rateLimit from 'express-rate-limit';
import { trackPublicShipment } from '../lib/shipments.js';
import {
  STATUS_FLOW,
  STATUS_TONE,
  ALL_STATUSES,
  DELAY_REASONS,
  shipmentProgress,
} from '../lib/constants.js';
import { HttpError } from '../lib/validate.js';

export const publicRouter = express.Router();

// Gentle rate limiting on the public track endpoint.
const trackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/track  — body: { tracking }
// Also supports GET /api/track/:tracking for direct linking.
async function respondTrack(req, res) {
  const tracking = req.method === 'GET' ? req.params.tracking : req.body.tracking;
  try {
    const data = await trackPublicShipment(tracking);

    // Attach progress metadata for the UI (0-100% journey completion).
    const stageIndex = STATUS_FLOW.indexOf(data.shipment.status);
    const delivered = data.shipment.status === 'Delivered';
    const progress = shipmentProgress(
      data.shipment.status,
      data.events.map((e) => e.status),
    );

    return res.json({
      ok: true,
      shipment: data.shipment,
      events: data.events,
      customerComments: data.customerComments,
      meta: {
        progress,
        stageIndex: stageIndex === -1 ? 0 : stageIndex,
        totalStages: STATUS_FLOW.length,
        delivered,
        tone: STATUS_TONE[data.shipment.status] || 'gray',
      },
    });
  } catch (err) {
    if (err instanceof HttpError || err.expose) {
      return res.status(err.status || 400).json({ ok: false, error: err.message });
    }
    console.error('[track]', err);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
}

publicRouter.post('/track', trackLimiter, respondTrack);
publicRouter.get('/track/:tracking', trackLimiter, respondTrack);

// Expose non-sensitive constants to the frontend for rendering.
publicRouter.get('/constants', (req, res) => {
  res.json({
    ok: true,
    statusFlow: STATUS_FLOW,
    statusTone: STATUS_TONE,
    allStatuses: ALL_STATUSES,
    delayReasons: DELAY_REASONS,
  });
});
