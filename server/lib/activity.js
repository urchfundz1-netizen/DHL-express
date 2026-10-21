// server/lib/activity.js
// Audit logging for administrative actions.

import { queryRows, setRow, countDocs, nextNumericIds } from '../db/firestore.js';

export async function logActivity(admin, action, entityType = null, entityId = null, details = null, ip = null) {
  try {
    const ids = await nextNumericIds(['activity_logs']);
    await setRow('activity_logs', ids.activity_logs, {
      id: ids.activity_logs,
      admin_id: admin?.id ?? null,
      admin_name: admin?.name ?? null,
      admin_email: admin?.email ?? null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
      ip: ip ?? admin?.ip ?? null,
      created_at: new Date(),
    });
  } catch (err) {
    // Never let audit logging break the main flow.
    console.error('[activity] Failed to log:', err.message);
  }
}

export async function listActivity({ page = 1, limit = 30 } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const perPage = Math.min(100, Math.max(5, parseInt(limit, 10) || 30));
  const offset = (pageNum - 1) * perPage;

  // Firestore has no OFFSET: read the window that ends at the requested page
  // and cut it down to the page itself.
  const rows = await queryRows('activity_logs', {
    orders: [['created_at', 'desc']],
    limit: offset + perPage,
  });
  const total = await countDocs('activity_logs');

  return {
    rows: rows.slice(offset),
    page: pageNum,
    limit: perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}
