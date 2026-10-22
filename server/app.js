// server/app.js
// Builds the Express application. Kept separate from index.js so the same app
// can be used two ways:
//   - locally / on a normal host: server/index.js calls app.listen(...)
//   - on Vercel: api/index.js exports the app as a serverless handler
//
// IMPORTANT (serverless): nothing here may run at import time except cheap,
// synchronous setup. Firestore schema/admin bootstrapping happens lazily via
// `bootstrap()` so a cold start does not fail the request.

import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { initSchema } from './db/schema.js';
import { FirestoreStore, hashPassword, SESSION_COOKIE_NAME } from './lib/auth.js';
import { ensureCsrfToken, csrfCookie, csrfProtect } from './lib/csrf.js';
import { ValidationError, HttpError } from './lib/validate.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { publicRouter } from './routes/public.js';
import { cronRouter } from './routes/cron.js';
import { purgeExpiredSessions } from './lib/sessions.js';
import { purgeExpiredRateLimits } from './lib/rate-limit-store.js';
import { queryRows, setRow, deleteRow, nextNumericIds } from './db/firestore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

// Dev-only graceful shutdown plumbing (see the /__shutdown route below).
let shutdownToken = '';
let onShutdown = null;

/** Called by server/index.js with the one-time token of this process. */
export function setShutdownToken(token) {
  shutdownToken = token;
}

/** Called by server/index.js with the function that stops the process. */
export function setShutdownHandler(fn) {
  onShutdown = fn;
}

// Runs once per process. On Vercel a cold instance boots on the first request
// it handles; the promise is cached so concurrent requests share one run.
let bootPromise = null;
export function bootstrap() {
  if (!bootPromise) {
    bootPromise = (async () => {
      await initSchema();
      // These three are independent of each other, so they run together.
      await Promise.all([
        ensureDefaultAdmin(),
        purgeExpiredSessions(),
        // Rate-limit counters expire on their own, but only when the sweep
        // gets to them - a failure here must not keep the app from starting.
        purgeExpiredRateLimits().catch((err) => {
          console.warn('[rate-limit] Could not purge expired counters:', err.message);
        }),
      ]);
    })().catch((err) => {
      bootPromise = null; // allow a later request to retry
      throw err;
    });
  }
  return bootPromise;
}

export const app = express();

// Security headers. Inline styles and data: images are allowed because some
// components use style attributes; Google Translate needs its own origins.
app.use(
  helmet({
    contentSecurityPolicy: isProd
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
              "'self'",
              'https://translate.google.com',
              'https://translate.googleapis.com',
              'https://translate-pa.googleapis.com',
              'https://www.gstatic.com',
            ],
            styleSrc: [
              "'self'",
              "'unsafe-inline'",
              'https://fonts.googleapis.com',
              'https://fonts.gstatic.com',
              'https://translate.googleapis.com',
              'https://www.gstatic.com',
            ],
            imgSrc: ["'self'", 'data:', 'https:'],
            fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://www.gstatic.com'],
            connectSrc: [
              "'self'",
              'https://translate.googleapis.com',
              'https://translate.google.com',
              'https://translate-pa.googleapis.com',
            ],
            frameSrc: ['https://translate.google.com', 'https://www.gstatic.com'],
          },
        }
      : false,
  })
);

// Behind Vercel (and any reverse proxy) so secure cookies + req.secure work.
app.set('trust proxy', 1);

// Browsers request /favicon.ico even when the page declares an SVG icon.
// Redirect it instead of serving a 404.
app.get('/favicon.ico', (req, res) => res.redirect(301, '/favicon.svg'));

// Static files are served before any Firestore/session middleware: a CSS, JS
// or image request must never wait for a cold start or a database round-trip.
// On Vercel these are normally served by the CDN (see vercel.json), but this
// also keeps local `node server/index.js` usage working.
app.use(express.static(publicDir, { extensions: ['html'], maxAge: isProd ? '1h' : 0 }));

// Ensure Firestore is reachable before any dynamic route runs.
app.use(async (req, res, next) => {
  try {
    await bootstrap();
    next();
  } catch (err) {
    next(err);
  }
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Sessions live in Firestore, which is what makes login work across devices
// and across serverless instances.
app.use(
  session({
    name: SESSION_COOKIE_NAME,
    store: new FirestoreStore(),
    secret: process.env.SESSION_SECRET || 'dev-insecure-secret-change-me',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true' || (isProd && process.env.COOKIE_SECURE !== 'false'),
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
    },
  })
);

app.use(ensureCsrfToken);
app.use(csrfCookie);
app.use(csrfProtect);

app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use('/api', publicRouter);
app.use('/api/cron', cronRouter);
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);

const pageMap = {
  '/track': 'track.html',
  '/track/': 'track.html',
  '/tracking': 'tracking.html',
  '/tracking/': 'tracking.html',
  '/tracking/details': 'tracking-details.html',
  '/customs': 'customs.html',
  '/customs/': 'customs.html',
  '/services': 'services.html',
  '/about': 'about.html',
  '/contact': 'contact.html',
  '/admin': 'admin/dashboard.html',
  '/admin/': 'admin/dashboard.html',
  '/admin/login': 'admin/login.html',
};
app.get(/^\/(track(ing)?|customs|services|about|contact|admin)(\/.*)?$/, (req, res, next) => {
  const p = req.path.replace(/\/+$/, '') || '/';
  const file = pageMap[p] || pageMap[p + '/'];
  if (file && fs.existsSync(path.join(publicDir, file))) {
    return res.sendFile(path.join(publicDir, file));
  }
  return next();
});

app.get('/admin/*', (req, res, next) => {
  if (req.path.startsWith('/admin/login')) return next();
  return res.sendFile(path.join(publicDir, 'admin', 'dashboard.html'));
});

app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

// Dev-only graceful restart hook, used by restart-server.ps1. It lives here
// (instead of in server/index.js) because the catch-all 404 handler below is
// registered first and would otherwise swallow the request. The request must
// come from the local machine and carry the one-time token that the entry
// point writes to data/shutdown.token.
if (!isProd) {
  app.post('/__shutdown', (req, res) => {
    const ip = req.socket.remoteAddress || '';
    const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    if (!isLocal || req.get('x-shutdown-token') !== shutdownToken) {
      return res.status(403).json({ ok: false });
    }
    res.json({ ok: true });
    // Give the response a moment to reach the client before the process exits.
    if (onShutdown) setTimeout(() => onShutdown('restart script'), 250);
  });
}

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, error: 'Not found' });
  }
  return res.status(404).sendFile(path.join(publicDir, '404.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (err instanceof ValidationError || err instanceof HttpError ? 400 : 500);
  const message = err.expose || status < 500 ? err.message : 'Something went wrong. Please try again.';
  if (status >= 500) console.error('[error]', err);
  if (req.path.startsWith('/api/')) {
    return res.status(status).json({ ok: false, error: message, field: err.field });
  }
  return res.status(status).send(`<h1>Error ${status}</h1><p>${message}</p>`);
});

// ---- Bootstrap helpers -----------------------------------------------------

async function ensureDefaultAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || !password) {
    console.warn('[seed] ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping default admin creation.');
    return;
  }
  const existing = await queryRows('admins', {
    filters: [{ field: 'email', op: '==', value: email }],
    limit: 1,
  });
  if (existing.length === 0) {
    const name = process.env.ADMIN_NAME || 'Site Administrator';
    const ids = await nextNumericIds(['admins']);
    await setRow('admins', ids.admins, {
      id: ids.admins,
      email,
      password_hash: hashPassword(password),
      name,
      role: 'admin',
      last_login_at: null,
      created_at: new Date(),
    });
    console.info(`[seed] Created default admin: ${email}`);
  }

  const legacy = await queryRows('admins', {
    filters: [{ field: 'email', op: '==', value: 'admin@dhl-express.test' }],
    select: ['id', 'email'],
  });
  const removed = legacy.filter((a) => a.email !== email);
  if (removed.length > 0) {
    const legacyIds = removed.map((r) => r.id);
    await Promise.all(legacyIds.map((id) => deleteRow('admins', id)));
    await revokeSessionsForAdmins(legacyIds);
    console.info(`[seed] Removed legacy admin(s) ${legacyIds.join(', ')} and their sessions.`);
  }

  await revokeSessionsForAdmins(null);
}

async function revokeSessionsForAdmins(adminIds) {
  const sessions = await queryRows('sessions', { select: ['sid', 'admin_id'] });
  if (adminIds) {
    const drop = new Set(adminIds);
    await Promise.all(sessions.filter((s) => drop.has(s.admin_id)).map((s) => deleteRow('sessions', s.sid)));
    return;
  }
  const admins = await queryRows('admins', { select: ['id'] });
  const live = new Set(admins.map((a) => a.id));
  const orphans = sessions.filter((s) => s.admin_id != null && !live.has(s.admin_id));
  await Promise.all(orphans.map((s) => deleteRow('sessions', s.sid)));
}
