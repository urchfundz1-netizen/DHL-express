// server/routes/auth.js
// Admin authentication: login, logout, session, CSRF token.

import express from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import net from 'node:net';
import { queryRows, getRow, updateRow } from '../db/firestore.js';
import { hashPassword, verifyPassword, requireAuth, loadAdmin, SESSION_COOKIE_NAME } from '../lib/auth.js';
import { email, str, ValidationError } from '../lib/validate.js';
import { logActivity } from '../lib/activity.js';
import { FirestoreRateLimitStore, rateLimitNamespace } from '../lib/rate-limit-store.js';

export const authRouter = express.Router();

// --- Login rate limiting -----------------------------------------------------
//
// The counters live in Firestore so that every serverless instance shares
// them: with the in-memory store a brute-force attempt would get `limit` tries
// per warm instance instead of `limit` tries overall. See
// server/lib/rate-limit-store.js for the cost and safety notes.
//
// Two budgets are enforced, one per IP and one per account. The IP budget is
// checked first, so a spray over many accounts only touches one counter
// instead of one counter per account.

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT_PER_IP = 20;
const LOGIN_LIMIT_PER_ACCOUNT = 8;

const limiterNamespace = rateLimitNamespace();

// Every limiter needs its own store instance (express-rate-limit refuses to
// share one) and its own prefix (it uses the prefix to tell two limiters
// apart while looking for a key that was counted twice in the same request).
const ipLoginStore = new FirestoreRateLimitStore({ prefix: `login-ip:${limiterNamespace}` });
const accountLoginStore = new FirestoreRateLimitStore({ prefix: `login-account:${limiterNamespace}` });

// Normalises the client address into a rate-limit key.
// IPv6 clients are usually handed a whole /64, so counting every address in
// that prefix would let a single host rotate through billions of them; the
// prefix counts as one client.
function clientKey(req) {
  const raw = req.ip || req.socket?.remoteAddress || '';
  const ip = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
  if (net.isIPv4(ip)) return ip;
  if (!net.isIPv6(ip)) return 'unknown';
  const [head, tail] = ip.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];
  const missing = 8 - headParts.length - tailParts.length;
  const parts = [...headParts, ...new Array(Math.max(missing, 0)).fill('0'), ...tailParts];
  return `${parts.slice(0, 4).map((p) => p.padStart(4, '0')).join(':')}::/64`;
}

// Only failed logins should eat the budget, so a successful login is given
// back (skipSuccessfulRequests) and only real failures add up.
const loginIpLimiter = rateLimit({
  windowMs: LOGIN_WINDOW_MS,
  limit: LOGIN_LIMIT_PER_IP,
  standardHeaders: true,
  legacyHeaders: false,
  store: ipLoginStore,
  skipSuccessfulRequests: true,
  message: { ok: false, error: 'Too many login attempts. Please try again in a few minutes.' },
  keyGenerator: (req) => clientKey(req),
});

const loginAccountLimiter = rateLimit({
  windowMs: LOGIN_WINDOW_MS,
  limit: LOGIN_LIMIT_PER_ACCOUNT,
  standardHeaders: true,
  legacyHeaders: false,
  store: accountLoginStore,
  skipSuccessfulRequests: true,
  message: { ok: false, error: 'Too many login attempts. Please try again in a few minutes.' },
  keyGenerator: (req) => {
    const value = req.body && req.body.email ? String(req.body.email).trim().toLowerCase() : '';
    return value || 'no-email';
  },
});

// Login
authRouter.post('/login', loginIpLimiter, loginAccountLimiter, async (req, res, next) => {
  try {
    const emailValue = email(req.body.email, { field: 'Email' });
    const password = str(req.body.password, { field: 'Password', min: 1, max: 200 });

    const found = await queryRows('admins', {
      filters: [{ field: 'email', op: '==', value: emailValue }],
      limit: 1,
    });
    const admin = found[0];

    // Always run a comparison to reduce timing side channels.
    const hash = admin ? admin.password_hash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const ok = verifyPassword(password, hash);

    if (!admin || !ok) {
      await logActivity(
        { id: null, name: 'Unknown', email: emailValue, ip: req.ip },
        'LOGIN_FAILED', 'admin', null, 'Invalid credentials'
      );
      return res.status(401).json({ ok: false, error: 'Invalid email or password.' });
    }

    // Regenerate session to prevent fixation, but preserve the CSRF token so
    // the client's existing token stays valid across the privilege change.
    const csrf = req.session.csrfToken;
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.adminId = admin.id;
      req.session.adminName = admin.name;
      req.session.adminEmail = admin.email;
      req.session.adminRole = admin.role;
      req.session.csrfToken = csrf || (req.session.csrfToken = crypto.randomBytes(24).toString('hex'));

      updateRow('admins', admin.id, { last_login_at: new Date() }).catch(() => {});
      logActivity(admin, 'LOGIN', 'admin', admin.id, 'Signed in', req.ip);

      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        return res.json({
          ok: true,
          admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
        });
      });
    });
  } catch (err) {
    next(err);
  }
});

// Current session
authRouter.get('/me', async (req, res, next) => {
  try {
    if (req.session && req.session.adminId) {
      // Re-read the admin from the database: a session can outlive the
      // account it belongs to.
      const admin = await loadAdmin(req.session.adminId);
      if (!admin) {
        await new Promise((resolve) => req.session.destroy(resolve));
        res.clearCookie(SESSION_COOKIE_NAME);
        res.clearCookie('csrf_token');
        return res.status(401).json({ ok: false, error: 'Your session is no longer valid. Please sign in again.' });
      }
      return res.json({
        ok: true,
        admin: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
        },
      });
    }
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  } catch (err) {
    next(err);
  }
});

// Logout
authRouter.post('/logout', (req, res) => {
  const admin = { id: req.session?.adminId, name: req.session?.adminName, email: req.session?.adminEmail };
  req.session.destroy(() => {
    res.clearCookie(SESSION_COOKIE_NAME);
    res.clearCookie('csrf_token');
    if (admin && admin.id) logActivity(admin, 'LOGOUT', 'admin', admin.id, 'Signed out');
    res.json({ ok: true });
  });
});

// Change own password
authRouter.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const current = str(req.body.current_password, { field: 'Current password', min: 1 });
    const newPassword = str(req.body.new_password, { field: 'New password', min: 8, max: 200 });
    const confirm = str(req.body.confirm_password, { field: 'Confirm password', min: 1 });

    if (newPassword !== confirm) throw new ValidationError('New passwords do not match', 'confirm_password');

    const row = await getRow('admins', req.session.adminId);
    if (!row || !verifyPassword(current, row.password_hash)) {
      throw new ValidationError('Current password is incorrect', 'current_password');
    }
    await updateRow('admins', req.session.adminId, { password_hash: hashPassword(newPassword) });
    await logActivity({ id: req.session.adminId, name: req.session.adminName, email: req.session.adminEmail }, 'CHANGE_PASSWORD', 'admin', req.session.adminId, 'Changed own password');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
