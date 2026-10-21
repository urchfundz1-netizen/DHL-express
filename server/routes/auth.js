// server/routes/auth.js
// Admin authentication: login, logout, session, CSRF token.

import express from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { queryRows, getRow, updateRow } from '../db/firestore.js';
import { hashPassword, verifyPassword, requireAuth, loadAdmin, SESSION_COOKIE_NAME } from '../lib/auth.js';
import { email, str, ValidationError } from '../lib/validate.js';
import { logActivity } from '../lib/activity.js';

export const authRouter = express.Router();

// Strict limiter for login attempts (brute-force protection).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many login attempts. Please try again in a few minutes.' },
  keyGenerator: (req) => (req.body && req.body.email ? String(req.body.email).toLowerCase() : req.ip),
});

// Login
authRouter.post('/login', loginLimiter, async (req, res, next) => {
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
