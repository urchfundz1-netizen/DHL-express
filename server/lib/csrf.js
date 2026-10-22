// server/lib/csrf.js
// Stateless double-submit CSRF protection for state-changing requests.
// A signed token is mirrored in a readable cookie; mutating endpoints must
// present the same token in the X-CSRF-Token header (or _csrf body field).
//
// The token lives only in the cookie, not in the session, so anonymous
// visitors no longer cause a Firestore session document to be created (or
// touched on every request).

import crypto from 'node:crypto';
import { HttpError } from './validate.js';

const CSRF_COOKIE = 'csrf_token';

function secret() {
  return process.env.SESSION_SECRET || 'dev-insecure-secret-change-me';
}

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('hex');
}

function createToken() {
  const raw = crypto.randomBytes(24).toString('hex');
  return `${raw}.${sign(raw)}`;
}

function isValidToken(token) {
  if (typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const raw = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(raw);
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return '';
    }
  }
  return '';
}

export function ensureCsrfToken(req, res, next) {
  const existing = readCookie(req, CSRF_COOKIE);
  req.csrfToken = isValidToken(existing) ? existing : createToken();
  res.locals.csrfToken = req.csrfToken;
  next();
}

// Expose the current token to the frontend on same-origin requests.
export function csrfCookie(req, res, next) {
  if (req.csrfToken && readCookie(req, CSRF_COOKIE) !== req.csrfToken) {
    // Readable by JS (not httpOnly) so the SPA can echo it back in a header.
    res.cookie(CSRF_COOKIE, req.csrfToken, {
      httpOnly: false,
      sameSite: 'lax',
      secure: req.secure || process.env.COOKIE_SECURE === 'true',
    });
  }
  next();
}

export function csrfProtect(req, res, next) {
  const method = req.method;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();

  // The public tracking POST is read-only in effect (it just looks up data) and
  // does not mutate state, so we allow it without a CSRF token.
  if (req.path.startsWith('/api/track')) return next();

  // The dev-only graceful shutdown endpoint has its own one-time token and a
  // loopback check, and is not part of the browser session flow.
  if (req.path === '/__shutdown') return next();

  const cookieToken = readCookie(req, CSRF_COOKIE);
  const headerToken = req.get('X-CSRF-Token');
  const bodyToken = req.body && req.body._csrf;
  const presented = headerToken || bodyToken;
  if (!req.csrfToken || cookieToken !== req.csrfToken || presented !== req.csrfToken) {
    throw new HttpError(403, 'Invalid or missing CSRF token');
  }
  next();
}
