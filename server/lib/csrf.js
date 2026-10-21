// server/lib/csrf.js
// Simple double-submit CSRF protection for state-changing requests.
// A token is stored in the session and mirrored in a cookie; requests to
// mutating endpoints must present a matching X-CSRF-Token header.

import crypto from 'node:crypto';
import { HttpError } from './validate.js';

export function ensureCsrfToken(req, res, next) {
  if (req.session && !req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  if (req.session) {
    res.locals.csrfToken = req.session.csrfToken;
  }
  next();
}

// Expose the current token to the frontend on same-origin GET requests.
export function csrfCookie(req, res, next) {
  if (req.session && req.session.csrfToken) {
    // Readable by JS (not httpOnly) so the SPA can echo it back in a header.
    res.cookie('csrf_token', req.session.csrfToken, {
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

  const sessionToken = req.session && req.session.csrfToken;
  const headerToken = req.get('X-CSRF-Token');
  const bodyToken = req.body && req.body._csrf;
  if (!sessionToken || (headerToken !== sessionToken && bodyToken !== sessionToken)) {
    throw new HttpError(403, 'Invalid or missing CSRF token');
  }
  next();
}
