// server/lib/auth.js
// Password hashing + a Firestore-backed session store for express-session.

import bcrypt from 'bcryptjs';
import session from 'express-session';
import { getRow, setRow, updateRow, deleteRow } from '../db/firestore.js';

const SALT_ROUNDS = 10;

// Name of the session cookie. Exported so logout can clear the exact cookie
// the app set (it used to clear "connect.sid", which never matched).
export const SESSION_COOKIE_NAME = 'swiftnova.sid';

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, SALT_ROUNDS);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

// express-session Store backed by the `sessions` collection in Firestore.
// The session id is the document id, so a lookup is a single read.
export class FirestoreStore extends session.Store {
  // get
  get(sid, cb) {
    getRow('sessions', sid)
      .then((row) => {
        if (!row) return cb(null, null);
        if (new Date(row.expires).getTime() < Date.now()) {
          return deleteRow('sessions', sid).then(() => cb(null, null));
        }
        try {
          cb(null, JSON.parse(row.data));
        } catch {
          cb(null, null);
        }
      })
      .catch((e) => cb(e));
  }

  // set
  set(sid, sess, cb = () => {}) {
    const data = JSON.stringify(sess);
    const expires = new Date(sess.cookie.expires || Date.now() + 24 * 3600 * 1000).toISOString();
    // Mirror the session owner into its own field so the sessions of a
    // deleted admin can be revoked in bulk.
    const adminId = Number.isInteger(sess.adminId) ? sess.adminId : null;
    setRow('sessions', sid, { sid, data, expires, admin_id: adminId })
      .then(() => cb(null))
      .catch((e) => cb(e));
  }

  // destroy
  destroy(sid, cb = () => {}) {
    deleteRow('sessions', sid)
      .then(() => cb(null))
      .catch((e) => cb(e));
  }

  // touch
  touch(sid, sess, cb = () => {}) {
    const expires = new Date(sess.cookie.expires || Date.now() + 24 * 3600 * 1000).toISOString();
    updateRow('sessions', sid, { expires })
      .then(() => cb(null))
      .catch((e) => cb(e));
  }
}

// Look up the admin behind a session. Returns null when the account no
// longer exists, which means the session must be treated as signed out.
export async function loadAdmin(adminId) {
  if (!Number.isInteger(adminId)) return null;
  const row = await getRow('admins', adminId);
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

// Middleware: require an authenticated admin. Attaches req.admin.
//
// The session cookie alone is not proof of a valid login: an admin account
// can be deleted (or the database reset) while a session is still open. The
// stored adminId is then dangling, and writing it into a foreign key column
// (tracking_events.created_by, comments.admin_id, ...) fails with a 23503
// error. So we verify the admin row still exists on every request and drop
// the session when it does not.
export function requireAuth(req, res, next) {
  if (!req.session || !req.session.adminId) {
    return deny(req, res, 'Authentication required');
  }

  loadAdmin(req.session.adminId)
    .then((admin) => {
      if (!admin) {
        // The account behind this session is gone — revoke the session.
        return req.session.destroy(() => {
          res.clearCookie(SESSION_COOKIE_NAME);
          res.clearCookie('csrf_token');
          return deny(req, res, 'Your session is no longer valid. Please sign in again.');
        });
      }
      req.admin = {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        ip: req.ip,
      };
      next();
    })
    .catch(next);
}

// API requests get JSON; page requests get redirected to the login page.
// Use originalUrl because req.path is relative inside mounted routers.
function deny(req, res, message) {
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ ok: false, error: message });
  }
  const nextUrl = encodeURIComponent(req.originalUrl || '/admin');
  return res.redirect(`/admin/login?next=${nextUrl}`);
}
