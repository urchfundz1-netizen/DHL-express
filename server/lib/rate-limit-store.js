// server/lib/rate-limit-store.js
// A rate limit store that keeps its counters in Firestore instead of in the
// process memory.
//
// Why: express-rate-limit's default MemoryStore is per-process. On Vercel
// every warm instance has its own counters, so a brute-force attempt gets
// `limit` tries *per instance* instead of `limit` tries overall. The login
// limiter needs a counter that is shared by every instance, and Firestore is
// already the system of record for this app.
//
// Cost note: every increment is one transaction (1 read + 1 write). That is
// cheap for the admin login, which is a handful of requests per hour, but it
// is the reason the high-traffic public limiters keep using the in-memory
// store: a write per tracked request would burn the Firestore daily write
// quota and let a scraper take the whole app down.
//
// Three safety valves keep the quota safe even if someone hammers the login
// endpoint:
//   1. keys that are already over the limit are remembered locally, so the
//      requests that arrive *after* the limit was reached cost no writes;
//   2. if Firestore is unreachable the store falls back to an in-process
//      counter instead of failing the request;
//   3. expired counters are swept at boot and by the daily cron.

import crypto from 'node:crypto';
import { db, Timestamp } from '../db/firestore.js';

export const RATE_LIMIT_COLLECTION = 'rate_limits';

// How many blocked keys are remembered per instance. The cache is a quota
// guard, not the source of truth, so a small cap is enough.
const MAX_TRACKED_KEYS = 2000;

// How long an instance trusts its own "this key is over the limit" note
// before it checks Firestore again. The note exists to stop a flood of
// requests from writing to Firestore over and over; keeping it short means a
// counter that was cleared elsewhere (npm run rate-limits:reset) takes effect
// within a minute instead of at the end of the window.
const BLOCKED_CACHE_TTL_MS = 60 * 1000;

// Counters live in one shared collection, so they are namespaced by
// environment: a local run, a Vercel preview and production must never spend
// each other's budget (a failing test run must not lock the real admin out).
export function rateLimitNamespace() {
  return (
    process.env.RATE_LIMIT_NAMESPACE ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    'default'
  );
}

// Firestore document ids may not contain "/" and should stay short, while the
// limiter keys are emails and IP addresses. Hashing keeps the raw key out of
// the database as well.
function docIdFor(prefix, key) {
  return crypto.createHash('sha256').update(`${prefix}|${key}`).digest('hex');
}

export class FirestoreRateLimitStore {
  /**
   * @param {object} [options]
   * @param {string} [options.prefix] Namespaces the counter keys so several
   *   limiters can use the same collection without colliding. Express-rate-limit
   *   also uses it to tell two limiters apart when it looks for a key that was
   *   counted twice in the same request, so every limiter needs its own value.
   */
  constructor({ prefix = '' } = {}) {
    this.prefix = prefix;
    this.windowMs = 60 * 1000;
    this.limit = 0; // 0 = unknown, the over-limit cache stays disabled
    // The counters are shared by every serverless instance, which is exactly
    // what express-rate-limit asks a store to declare.
    this.localKeys = false;
    // Keys that are known to be over the limit: key -> { totalHits, resetTime }.
    this.blocked = new Map();
    // Used only while Firestore is unreachable: key -> { totalHits, resetTime }.
    this.fallback = new Map();
    this.lastWarning = 0;
  }

  /** Called by express-rate-limit with the resolved limiter options. */
  init(options) {
    if (options?.windowMs) this.windowMs = options.windowMs;
    if (typeof options?.limit === 'number') this.limit = options.limit;
    // The prefix given to the constructor wins: it is the one the limiter
    // validation knows about.
    if (!this.prefix && options?.prefix) this.prefix = options.prefix;
  }

  ref(key) {
    return db.collection(RATE_LIMIT_COLLECTION).doc(docIdFor(this.prefix, key));
  }

  /**
   * Counts one hit for `key` and returns the running total.
   *
   * The counter lives in a single document per key and carries the moment the
   * current window ends. Once that moment has passed the counter starts over,
   * so the window is anchored to the first hit of a burst rather than to the
   * clock - the same behaviour as the in-memory store.
   */
  async increment(key) {
    const now = Date.now();

    // A key that is already over the limit is answered from memory: the
    // request stays blocked, but it costs no Firestore write. This is the
    // path a brute-force attempt takes, so it is the path that must not be
    // allowed to burn the daily write quota.
    const cached = this.blocked.get(key);
    if (cached) {
      const stillBlocked = cached.resetTime.getTime() > now;
      const stillFresh = now - cached.cachedAt < BLOCKED_CACHE_TTL_MS;
      if (stillBlocked && stillFresh) {
        return { totalHits: cached.totalHits, resetTime: cached.resetTime };
      }
      this.blocked.delete(key);
    }

    const ref = this.ref(key);
    let result;
    try {
      result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() : null;
        const expiresAt = data?.expires_at?.toMillis?.() ?? 0;

        if (!data || expiresAt <= now) {
          // First hit of a new window.
          const resetTime = new Date(now + this.windowMs);
          tx.set(ref, {
            count: 1,
            prefix: this.prefix,
            expires_at: Timestamp.fromMillis(resetTime.getTime()),
            updated_at: Timestamp.fromMillis(now),
          });
          return { totalHits: 1, resetTime };
        }

        const totalHits = Number(data.count || 0) + 1;
        tx.set(ref, { count: totalHits, updated_at: Timestamp.fromMillis(now) }, { merge: true });
        return { totalHits, resetTime: data.expires_at.toDate() };
      });
    } catch (err) {
      // Firestore is unreachable. Failing the request would turn a database
      // hiccup into a login outage, so fall back to a per-process counter:
      // weaker, but the endpoint keeps working and keeps being limited.
      this.warn('Firestore unavailable, using an in-memory counter', err);
      return this.fallbackIncrement(key, now);
    }

    if (this.limit > 0 && result.totalHits > this.limit) {
      this.remember(key, result);
    }
    return result;
  }

  /**
   * Gives one hit back. Used by express-rate-limit when `skipSuccessfulRequests`
   * is on: a successful login must not count against the allowance.
   */
  async decrement(key) {
    // This method is called from a response event handler, where a rejected
    // promise would become an unhandled rejection and take the process down.
    // Errors are therefore swallowed on purpose.
    try {
      const ref = this.ref(key);
      const now = Date.now();

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const data = snap.data();
        // The window has rolled over, so there is nothing left to give back.
        if ((data.expires_at?.toMillis?.() ?? 0) <= now) return;
        const count = Math.max(0, Number(data.count || 0) - 1);
        tx.set(ref, { count }, { merge: true });
      });
    } catch (err) {
      this.warn('Could not give a hit back', err);
    }

    const blocked = this.blocked.get(key);
    if (blocked) {
      blocked.totalHits = Math.max(0, blocked.totalHits - 1);
      if (this.limit > 0 && blocked.totalHits <= this.limit) this.blocked.delete(key);
    }
    const fb = this.fallback.get(key);
    if (fb) fb.totalHits = Math.max(0, fb.totalHits - 1);
  }

  /** Forgets the counter for one key. */
  async resetKey(key) {
    this.blocked.delete(key);
    this.fallback.delete(key);
    try {
      await this.ref(key).delete();
    } catch (err) {
      this.warn('Could not reset a key', err);
    }
  }

  /** Forgets every counter this store owns. */
  async resetAll() {
    this.blocked.clear();
    this.fallback.clear();
    const docs = await db.collection(RATE_LIMIT_COLLECTION).where('prefix', '==', this.prefix).get();
    const batch = db.batch();
    docs.docs.forEach((d) => batch.delete(d.ref));
    if (docs.docs.length) await batch.commit();
    return docs.docs.length;
  }

  // ---- internals -------------------------------------------------------------

  /** Remembers that `key` is over the limit, so further hits cost no writes. */
  remember(key, result) {
    this.blocked.set(key, { ...result, cachedAt: Date.now() });
    if (this.blocked.size <= MAX_TRACKED_KEYS) return;
    // Drop the oldest entries first; Map keeps insertion order.
    const excess = this.blocked.size - MAX_TRACKED_KEYS;
    let removed = 0;
    for (const [k, v] of this.blocked) {
      if (removed >= excess) break;
      if (v.resetTime.getTime() <= Date.now()) {
        this.blocked.delete(k);
        removed++;
      }
    }
    for (const k of this.blocked.keys()) {
      if (removed >= excess) break;
      this.blocked.delete(k);
      removed++;
    }
  }

  /** In-process counter used while Firestore cannot be reached. */
  fallbackIncrement(key, now) {
    const entry = this.fallback.get(key);
    if (!entry || entry.resetTime.getTime() <= now) {
      const fresh = { totalHits: 1, resetTime: new Date(now + this.windowMs) };
      this.fallback.set(key, fresh);
      if (this.fallback.size > MAX_TRACKED_KEYS) {
        const oldest = this.fallback.keys().next().value;
        this.fallback.delete(oldest);
      }
      return fresh;
    }
    entry.totalHits += 1;
    return { totalHits: entry.totalHits, resetTime: entry.resetTime };
  }

  /** Logs at most one warning per minute so an outage cannot flood the logs. */
  warn(message, err) {
    const now = Date.now();
    if (now - this.lastWarning < 60 * 1000) return;
    this.lastWarning = now;
    console.warn(`[rate-limit] ${message}: ${err?.message || err}`);
  }
}

/**
 * Removes counters whose window has ended.
 *
 * Firestore can expire these on its own through a TTL policy, but the policy
 * is applied at the project's discretion and the deletion can lag by hours.
 * This sweep runs at boot and from the cron endpoint so the collection stays
 * small either way.
 */
export async function purgeExpiredRateLimits() {
  const now = Timestamp.fromMillis(Date.now());
  const expired = await db
    .collection(RATE_LIMIT_COLLECTION)
    .where('expires_at', '<=', now)
    .limit(500)
    .get();

  if (expired.docs.length === 0) return 0;

  const batch = db.batch();
  expired.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return expired.docs.length;
}
