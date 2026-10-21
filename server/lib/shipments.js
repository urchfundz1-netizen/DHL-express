// server/lib/shipments.js
// Business logic for shipments: create, edit, status, delay, comments, tracking.
// All reads and writes go through the Firestore adapter (server/db/firestore.js).
//
// A shipment and its timeline event are written in one Firestore transaction,
// so a shipment can never end up without its first history entry.

import {
  queryRows,
  getRow,
  getRows,
  setRow,
  updateRow,
  deleteRow,
  transaction,
  nextNumericIds,
} from '../db/firestore.js';
import {
  ALL_STATUSES,
  CURRENCIES,
  DELAY_REASONS,
} from './constants.js';
import {
  ValidationError,
  HttpError,
  combineDateTime,
  dateStr,
  timeStr,
  str,
  optionalStr,
  num,
  enumValue,
} from './validate.js';
import { generateUniqueTrackingNumber, normalizeTrackingInput } from './tracking.js';
import { logActivity } from './activity.js';
import { maybeNotify } from './notify.js';

// Writer used when the caller is not inside a transaction.
const direct = {
  get: getRow,
  set: setRow,
  update: updateRow,
  delete: deleteRow,
};

// Fields the customer is allowed to see on the public tracking page.
const PUBLIC_SHIPMENT_FIELDS = [
  'id', 'tracking_number', 'status', 'description', 'origin_city', 'origin_country',
  'destination_city', 'destination_country', 'recipient_name', 'created_at', 'estimated_delivery_date',
  'estimated_delivery_time', 'estimated_delivered_at', 'delivered_at',
  'updated_at', 'delivery_instructions',
  'sender_name', 'sender_contact', 'origin_address',
  'recipient_contact', 'destination_address',
  'category', 'weight_kg', 'dimensions', 'shipping_method', 'customs_fee', 'customs_fee_currency',
  'pickup_date', 'dispatch_date',
];

// Fields the admin list view shows.
const LIST_FIELDS = [
  'id', 'tracking_number', 'recipient_name', 'origin_city', 'origin_country',
  'destination_city', 'destination_country', 'status', 'estimated_delivery_date',
  'estimated_delivered_at', 'delivered_at', 'created_at', 'updated_at', 'archived',
  'sender_name', 'description',
];

// ---- Create ----------------------------------------------------------------

export async function createShipment(input, admin) {
  const data = validateShipmentInput(input, { forCreate: true });

  const tracking = await generateUniqueTrackingNumber(async (candidate) => {
    const r = await queryRows('shipments', {
      filters: [{ field: 'tracking_number', op: '==', value: candidate }],
      limit: 1,
    });
    return r.length > 0;
  });

  const estimatedDeliveredAt = combineDateTime(data.estimated_delivery_date, data.estimated_delivery_time);

  // Ids are handed out before the transaction starts: Firestore transactions
  // cannot call a nested transaction, and a wasted id (if the write fails) is
  // harmless.
  const ids = await nextNumericIds(['shipments', 'tracking_events']);

  // The shipment row and its first timeline event must land together: if the
  // event write fails, a shipment without any history would be left behind.
  await transaction(async (tx) => {
    tx.set('shipments', ids.shipments, {
      id: ids.shipments,
      tracking_number: tracking,
      sender_name: data.sender_name,
      sender_contact: data.sender_contact,
      origin_address: data.origin_address,
      origin_city: data.origin_city,
      origin_country: data.origin_country,
      recipient_name: data.recipient_name,
      recipient_contact: data.recipient_contact,
      destination_address: data.destination_address,
      destination_city: data.destination_city,
      destination_country: data.destination_country,
      description: data.description,
      category: data.category,
      weight_kg: data.weight_kg,
      dimensions: data.dimensions,
      shipping_method: data.shipping_method,
      internal_reference: data.internal_reference,
      customs_fee: data.customs_fee,
      customs_fee_currency: data.customs_fee_currency,
      status: data.status,
      status_mode: 'auto',
      delivery_instructions: data.delivery_instructions,
      pickup_date: data.pickup_date,
      dispatch_date: data.dispatch_date,
      estimated_delivery_date: data.estimated_delivery_date,
      estimated_delivery_time: data.estimated_delivery_time,
      estimated_delivered_at: estimatedDeliveredAt,
      delivered_at: null,
      notify_customer: data.notify_customer,
      archived: false,
      created_by: admin.id,
      created_at: new Date(),
      updated_at: new Date(),
    });

    tx.set('tracking_events', ids.tracking_events, {
      id: ids.tracking_events,
      shipment_id: ids.shipments,
      tracking_number: tracking,
      status: data.status,
      location: data.origin_city,
      description: `Shipment created — ${data.status.toLowerCase()}.`,
      created_at: new Date(),
      created_by: admin.id,
    });
  });

  await logActivity(admin, 'CREATE_SHIPMENT', 'shipment', ids.shipments, `Created shipment ${tracking}`);

  if (data.notify_customer && data.recipient_contact && /@/.test(data.recipient_contact)) {
    await maybeNotify('registered', { shipment: { ...data, tracking_number: tracking }, admin });
  }

  return { id: ids.shipments, tracking_number: tracking };
}

// ---- Read (admin detail) ---------------------------------------------------

export async function getShipmentAdmin(id) {
  await refreshAutoStatuses();
  const shipment = await getRow('shipments', id);
  if (!shipment) throw new HttpError(404, 'Shipment not found');

  const [events, comments, history] = await Promise.all([
    queryWithFallback('tracking_events', {
      filters: [{ field: 'shipment_id', op: '==', value: Number(id) }],
      orderField: 'created_at',
      orderDir: 'asc',
    }),
    queryWithFallback('comments', {
      filters: [{ field: 'shipment_id', op: '==', value: Number(id) }],
      orderField: 'created_at',
      orderDir: 'desc',
    }),
    queryWithFallback('delivery_estimate_history', {
      filters: [{ field: 'shipment_id', op: '==', value: Number(id) }],
      orderField: 'created_at',
      orderDir: 'desc',
    }),
  ]);

  return {
    shipment,
    events: sortByCreatedAt(events ?? await queryRows('tracking_events', { filters: [{ field: 'shipment_id', op: '==', value: Number(id) }] }), 'asc'),
    comments: sortByCreatedAt(comments ?? await queryRows('comments', { filters: [{ field: 'shipment_id', op: '==', value: Number(id) }] }), 'desc'),
    delayHistory: sortByCreatedAt(history ?? await queryRows('delivery_estimate_history', { filters: [{ field: 'shipment_id', op: '==', value: Number(id) }] }), 'desc'),
  };
}

// Run a query; if Firestore rejects it because a composite index has not been
// deployed yet, retry without the ordering and sort (and optionally filter) in
// memory. The site keeps working before the indexes are deployed, and gets
// faster once they are.
async function queryWithFallback(name, { orderField, orderDir, ...opts }) {
  try {
    return await queryRows(name, { ...opts, orders: orderField ? [[orderField, orderDir]] : [] });
  } catch (err) {
    if (!/index/i.test(err.message || '')) throw err;
    console.warn(`[db] ${name}: missing composite index, falling back to in-memory sorting. Deploy with: firebase deploy --only firestore:indexes`);
    return null;
  }
}

// Firestore can only order by one field, so rows created in the same
// millisecond are re-sorted by id here — the old SQL used "created_at, id".
function sortByCreatedAt(rows, dir) {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (ta !== tb) return (ta - tb) * sign;
    return ((a.id || 0) - (b.id || 0)) * sign;
  });
}

// ---- Edit ------------------------------------------------------------------

export async function editShipment(id, input, admin) {
  const ship = await getRow('shipments', id);
  if (!ship) throw new HttpError(404, 'Shipment not found');

  // For edits we do NOT change tracking_number or status (dedicated flows).
  const data = validateShipmentInput(input, { forCreate: false, existing: ship });

  const estimatedDeliveredAt =
    data.estimated_delivery_date != null || data.estimated_delivery_time != null
      ? combineDateTime(data.estimated_delivery_date, data.estimated_delivery_time)
      : ship.estimated_delivered_at;

  await updateRow('shipments', id, {
    sender_name: data.sender_name,
    sender_contact: data.sender_contact,
    origin_address: data.origin_address,
    origin_city: data.origin_city,
    origin_country: data.origin_country,
    recipient_name: data.recipient_name,
    recipient_contact: data.recipient_contact,
    destination_address: data.destination_address,
    destination_city: data.destination_city,
    destination_country: data.destination_country,
    description: data.description,
    category: data.category,
    weight_kg: data.weight_kg,
    dimensions: data.dimensions,
    shipping_method: data.shipping_method,
    internal_reference: data.internal_reference,
    delivery_instructions: data.delivery_instructions,
    pickup_date: data.pickup_date,
    dispatch_date: data.dispatch_date,
    estimated_delivery_date: data.estimated_delivery_date,
    estimated_delivery_time: data.estimated_delivery_time,
    estimated_delivered_at: estimatedDeliveredAt,
    notify_customer: data.notify_customer,
    customs_fee: data.customs_fee,
    customs_fee_currency: data.customs_fee_currency,
    updated_at: new Date(),
  });

  await logActivity(admin, 'EDIT_SHIPMENT', 'shipment', id, `Edited shipment ${ship.tracking_number}`);
  return { ok: true };
}

// ---- Status change ---------------------------------------------------------

export async function updateStatus(id, input, admin) {
  const ship = await getRow('shipments', id);
  if (!ship) throw new HttpError(404, 'Shipment not found');

  // Hand control back to the date-driven schedule.
  if (input.mode === 'auto') {
    const next = deriveStatus(ship);
    // The status change and its timeline event are one unit of work: a
    // failure halfway through must not leave the status changed but the
    // event missing from the customer's tracking history.
    const ids = await nextNumericIds(['tracking_events']);
    await transaction(async (tx) => {
      tx.update('shipments', id, { status: next, status_mode: 'auto', updated_at: new Date() });
      if (next !== ship.status) {
        tx.set('tracking_events', ids.tracking_events, {
          id: ids.tracking_events,
          shipment_id: Number(id),
          tracking_number: ship.tracking_number,
          status: next,
          location: ship.destination_city,
          description: `Status switched to automatic and recalculated as "${next}".`,
          created_at: new Date(),
          created_by: admin.id,
        });
      }
    });
    await logActivity(admin, 'UPDATE_STATUS_MODE', 'shipment', id,
      `Status mode set to automatic (${next}) for ${ship.tracking_number}`);
    return { ok: true, status: next, status_mode: 'auto', delivered_at: ship.delivered_at };
  }

  const newStatus = str(input.status, { field: 'Status', min: 2, max: 40 });
  if (!ALL_STATUSES.includes(newStatus)) {
    throw new ValidationError('Unknown status value', 'status');
  }

  const location = optionalStr(input.location, { field: 'Location', max: 120 });
  const description = optionalStr(input.description, { field: 'Description', max: 400 })
    || `Shipment status changed to "${newStatus}".`;

  let deliveredAt = ship.delivered_at;
  if (newStatus === 'Delivered') deliveredAt = new Date().toISOString();
  else if (ship.status === 'Delivered' && newStatus !== 'Delivered') deliveredAt = null;

  const ids = await nextNumericIds(['tracking_events']);
  await transaction(async (tx) => {
    tx.update('shipments', id, { status: newStatus, status_mode: 'manual', delivered_at: deliveredAt, updated_at: new Date() });
    tx.set('tracking_events', ids.tracking_events, {
      id: ids.tracking_events,
      shipment_id: Number(id),
      tracking_number: ship.tracking_number,
      status: newStatus,
      location,
      description,
      created_at: new Date(),
      created_by: admin.id,
    });
  });
  await logActivity(admin, 'UPDATE_STATUS', 'shipment', id,
    `Status "${ship.status}" -> "${newStatus}" for ${ship.tracking_number} (manual)`);

  if (ship.notify_customer) {
    await maybeNotify(eventForStatus(newStatus), { shipment: ship, admin, status: newStatus });
  }
  return { ok: true, status: newStatus, status_mode: 'manual', delivered_at: deliveredAt };
}

function eventForStatus(status) {
  switch (status) {
    case 'Registered': return 'registered';
    case 'Picked Up': return 'picked_up';
    case 'In Transit': return 'in_transit';
    case 'Out for Delivery': return 'out_for_delivery';
    case 'Delivered': return 'delivered';
    default: return 'status_update';
  }
}

// ---- Delay / delivery estimate change -------------------------------------

export async function delayShipment(id, input, admin) {
  const ship = await getRow('shipments', id);
  if (!ship) throw new HttpError(404, 'Shipment not found');

  const newDate = dateStr(input.new_date, { field: 'New estimated delivery date', required: true });
  const newTime = timeStr(input.new_time, { field: 'New estimated delivery time' });
  const reason = str(input.reason, { field: 'Reason for the delay', min: 3, max: 200 });
  if (!DELAY_REASONS.includes(reason)) {
    throw new ValidationError('Please choose a valid delay reason', 'reason');
  }
  const customerVisible = input.customer_visible === true || input.customer_visible === 'true'
    || input.customer_visible === 'on' || input.customer_visible === '1';
  const customerExplanation = optionalStr(input.customer_explanation, { field: 'Customer-visible explanation', max: 600 });
  const internalNotes = optionalStr(input.internal_notes, { field: 'Internal notes', max: 1000 });

  const newCombined = combineDateTime(newDate, newTime);
  const prevCombined = ship.estimated_delivered_at;
  if (prevCombined && newCombined && new Date(prevCombined).getTime() === new Date(newCombined).getTime()) {
    throw new ValidationError('The new estimated delivery date is the same as the current one', 'new_date');
  }

  const ids = await nextNumericIds(['delivery_estimate_history', 'tracking_events', 'comments']);

  await transaction(async (tx) => {
    tx.update('shipments', id, {
      estimated_delivery_date: newDate,
      estimated_delivery_time: newTime,
      estimated_delivered_at: newCombined,
      updated_at: new Date(),
    });

    tx.set('delivery_estimate_history', ids.delivery_estimate_history, {
      id: ids.delivery_estimate_history,
      shipment_id: Number(id),
      previous_estimate: prevCombined,
      new_estimate: newCombined,
      previous_date: ship.estimated_delivery_date,
      previous_time: ship.estimated_delivery_time,
      new_date: newDate,
      new_time: newTime,
      reason,
      customer_visible: customerVisible,
      customer_explanation: customerExplanation,
      internal_notes: internalNotes,
      admin_id: admin.id,
      admin_name: admin.name,
      created_at: new Date(),
    });

    const eventDescription = customerVisible && customerExplanation
      ? customerExplanation
      : `Estimated delivery date updated to ${newDate}${newTime ? ' ' + newTime : ''}. Reason: ${reason}.`;
    tx.set('tracking_events', ids.tracking_events, {
      id: ids.tracking_events,
      shipment_id: Number(id),
      tracking_number: ship.tracking_number,
      status: 'Delayed',
      location: ship.destination_city,
      description: eventDescription,
      created_at: new Date(),
      created_by: admin.id,
    });

    if (customerVisible) {
      const text = customerExplanation
        || `Your delivery has been rescheduled. New estimated delivery: ${newDate}${newTime ? ' ' + newTime : ''}. Reason: ${reason}.`;
      tx.set('comments', ids.comments, {
        id: ids.comments,
        shipment_id: Number(id),
        text,
        visibility: 'customer',
        admin_id: admin.id,
        admin_name: admin.name,
        created_at: new Date(),
      });
    }
  });

  await logActivity(admin, 'DELAY_SHIPMENT', 'shipment', id,
    `New ETA ${newDate}${newTime ? ' ' + newTime : ''} for ${ship.tracking_number} (${reason})`);

  if (customerVisible && ship.notify_customer) {
    await maybeNotify('delayed', {
      shipment: { ...ship, estimated_delivery_date: newDate, estimated_delivery_time: newTime },
      admin,
    });
  }
  return { ok: true };
}


// ---- Comments --------------------------------------------------------------

// Insert a comment row. `writer` lets callers run this inside a transaction.
export async function insertComment(id, input, admin, writer = direct, trackingNumber = null) {
  const shipment = trackingNumber
    ? { tracking_number: trackingNumber }
    : await getRow('shipments', id);
  if (!shipment) throw new HttpError(404, 'Shipment not found');

  const text = str(input.text, { field: 'Comment', min: 2, max: 1000 });
  const visibility = input.visibility === 'customer' ? 'customer' : 'internal';

  const ids = await nextNumericIds(['comments']);
  writer.set('comments', ids.comments, {
    id: ids.comments,
    shipment_id: Number(id),
    text,
    visibility,
    admin_id: admin.id,
    admin_name: admin.name,
    created_at: new Date(),
  });

  return { ok: true, tracking_number: shipment.tracking_number, visibility };
}

export async function addComment(id, input, admin) {
  const result = await insertComment(id, input, admin);
  await logActivity(admin, 'ADD_COMMENT', 'shipment', id,
    `Added ${result.visibility} comment to ${result.tracking_number}`);
  return { ok: true };
}

// ---- Archive / delete ------------------------------------------------------

export async function archiveShipment(id, admin) {
  const existing = await getRow('shipments', id);
  if (!existing) throw new HttpError(404, 'Shipment not found');
  const next = !existing.archived;
  await updateRow('shipments', id, { archived: next, updated_at: new Date() });
  await logActivity(admin, next ? 'ARCHIVE_SHIPMENT' : 'UNARCHIVE_SHIPMENT', 'shipment', id, existing.tracking_number);
  return { ok: true, archived: next };
}

export async function deleteShipment(id, admin) {
  const existing = await getRow('shipments', id);
  if (!existing) throw new HttpError(404, 'Shipment not found');

  // Firestore has no foreign keys, so the child rows are removed explicitly
  // (the old schema did this with ON DELETE CASCADE).
  const [events, comments, history] = await Promise.all([
    queryRows('tracking_events', { filters: [{ field: 'shipment_id', op: '==', value: Number(id) }], select: ['id'] }),
    queryRows('comments', { filters: [{ field: 'shipment_id', op: '==', value: Number(id) }], select: ['id'] }),
    queryRows('delivery_estimate_history', { filters: [{ field: 'shipment_id', op: '==', value: Number(id) }], select: ['id'] }),
  ]);

  await transaction(async (tx) => {
    tx.delete('shipments', id);
    for (const e of events) tx.delete('tracking_events', e.id);
    for (const c of comments) tx.delete('comments', c.id);
    for (const h of history) tx.delete('delivery_estimate_history', h.id);
  });

  await logActivity(admin, 'DELETE_SHIPMENT', 'shipment', id, `Deleted ${existing.tracking_number}`);

  // Storage objects are not covered by the transaction above; remove them
  // afterwards so a failed delete never leaves a dangling Firestore record.
  if (Array.isArray(existing.files) && existing.files.length) {
    import('./storage.js')
      .then(({ deleteStorageObjects }) => deleteStorageObjects(existing.files.map((f) => f.path)))
      .catch((err) => console.warn('[shipments] Could not clean up files for', id, err.message));
  }

  return { ok: true };
}

// ---- Internal helper -------------------------------------------------------

// `writer` lets callers run this inside a transaction.
async function addEvent(shipmentId, { status, location, description, adminId, trackingNumber }, writer = direct) {
  const ids = await nextNumericIds(['tracking_events']);
  writer.set('tracking_events', ids.tracking_events, {
    id: ids.tracking_events,
    shipment_id: Number(shipmentId),
    tracking_number: trackingNumber || null,
    status,
    location: location || null,
    description,
    created_at: new Date(),
    created_by: adminId || null,
  });
}

// ---- Automatic status (date-driven) ---------------------------------------

function localDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// DATE columns come back either as 'YYYY-MM-DD' or as a Date at UTC midnight.
function dateOnlyKey(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

// Status a shipment should be in today, based only on its dates.
// Admin-pinned (manual) shipments never call this.
export function deriveStatus(ship, now = new Date()) {
  if (ship.delivered_at) return 'Delivered';

  const today = localDateKey(now);
  const eta = dateOnlyKey(ship.estimated_delivery_date);

  if (eta) {
    if (today > eta) return 'Delayed';
    if (today === eta) return 'Out for Delivery';
  }

  const dispatch = ship.dispatch_date ? localDateKey(new Date(ship.dispatch_date)) : null;
  const pickup = ship.pickup_date ? localDateKey(new Date(ship.pickup_date)) : null;

  if (dispatch && today >= dispatch) return 'In Transit';
  if (pickup && today >= pickup) return 'Picked Up';

  if (eta) {
    const daysLeft = Math.round(
      (new Date(`${eta}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000
    );
    if (daysLeft > 3) return 'Registered';
    return 'In Transit';
  }

  return ship.status || 'Registered';
}

// Recalculate every auto-mode shipment whose date-driven status moved on.
// Runs before reads so lists, counts and the public page always agree.
export async function refreshAutoStatuses(now = new Date()) {
  const rows = await queryRows('shipments', {
    filters: [
      { field: 'status_mode', op: '==', value: 'auto' },
      { field: 'archived', op: '==', value: false },
      { field: 'delivered_at', op: '==', value: null },
    ],
  });

  for (const ship of rows) {
    const next = deriveStatus(ship, now);
    if (next === ship.status) continue;

    // eslint-disable-next-line no-await-in-loop
    const ids = await nextNumericIds(['tracking_events']);
    // eslint-disable-next-line no-await-in-loop
    await transaction(async (tx) => {
      tx.update('shipments', ship.id, { status: next, updated_at: new Date() });
      tx.set('tracking_events', ids.tracking_events, {
        id: ids.tracking_events,
        shipment_id: ship.id,
        tracking_number: ship.tracking_number,
        status: next,
        location: ship.destination_city,
        description: `Status updated automatically to "${next}" based on the delivery schedule.`,
        created_at: new Date(),
        created_by: null,
      });
    });

    if (ship.notify_customer) {
      maybeNotify(eventForStatus(next), { shipment: ship, status: next }).catch(() => {});
    }
  }
}

// ---- Public tracking lookup (customer-safe projection) --------------------

export async function trackPublicShipment(rawTracking) {
  const norm = normalizeTrackingInput(rawTracking);
  if (!norm) throw new ValidationError('Please enter a tracking number', 'tracking');

  await refreshAutoStatuses();

  const found = await queryRows('shipments', {
    filters: [{ field: 'tracking_number', op: '==', value: norm }],
    limit: 1,
    select: PUBLIC_SHIPMENT_FIELDS,
  });
  if (found.length === 0) {
    throw new HttpError(404, 'No shipment found for that tracking number. Please check and try again.');
  }
  const shipment = found[0];

  const [events, comments] = await Promise.all([
    queryWithFallback('tracking_events', {
      filters: [{ field: 'shipment_id', op: '==', value: shipment.id }],
      orderField: 'created_at',
      orderDir: 'asc',
      select: ['id', 'status', 'location', 'description', 'created_at'],
    }),
    queryWithFallback('comments', {
      filters: [
        { field: 'shipment_id', op: '==', value: shipment.id },
        { field: 'visibility', op: '==', value: 'customer' },
      ],
      orderField: 'created_at',
      orderDir: 'desc',
      select: ['id', 'text', 'admin_name', 'created_at'],
    }),
  ]);

  const eventRows = events ?? await queryRows('tracking_events', {
    filters: [{ field: 'shipment_id', op: '==', value: shipment.id }],
    select: ['id', 'status', 'location', 'description', 'created_at'],
  });
  const commentRows = comments ?? await queryRows('comments', {
    filters: [
      { field: 'shipment_id', op: '==', value: shipment.id },
      { field: 'visibility', op: '==', value: 'customer' },
    ],
    select: ['id', 'text', 'admin_name', 'created_at'],
  });

  return {
    shipment,
    events: sortByCreatedAt(eventRows, 'asc'),
    customerComments: sortByCreatedAt(commentRows, 'desc'),
  };
}

// ---- List (admin, with search/filter/sort/pagination) ---------------------

export async function listShipments(query = {}) {
  await refreshAutoStatuses();
  const { search = '', status = '', sort = 'created_at', dir = 'desc', page = 1, limit = 15, archived = 'false' } = query;

  const sortable = {
    tracking_number: 'tracking_number',
    recipient_name: 'recipient_name',
    status: 'status',
    estimated_delivery_date: 'estimated_delivery_date',
    created_at: 'created_at',
    updated_at: 'updated_at',
    destination_city: 'destination_city',
  };
  const sortCol = sortable[sort] || 'created_at';
  const sortDir = String(dir).toLowerCase() === 'asc' ? 'asc' : 'desc';

  const filters = [];
  if (archived !== 'all') {
    filters.push({ field: 'archived', op: '==', value: archived === 'true' });
  }
  if (status) {
    filters.push({ field: 'status', op: '==', value: status });
  }

  // Firestore can order by one field only, and a filtered + ordered query
  // needs a deployed composite index. If that index is missing the query
  // falls back to sorting in memory, so the admin list never breaks.
  let rows;
  try {
    rows = await queryRows('shipments', {
      filters,
      orders: [[sortCol, sortDir]],
      select: LIST_FIELDS,
    });
  } catch (err) {
    if (!/index/i.test(err.message || '')) throw err;
    console.warn('[db] shipments: missing composite index for the list view, falling back to in-memory sorting. Deploy with: firebase deploy --only firestore:indexes');
    rows = await queryRows('shipments', { filters, select: LIST_FIELDS });
    rows.sort(comparator(sortCol, sortDir));
  }

  // Free-text search matches any of the visible fields, case-insensitive.
  const needle = String(search || '').trim().toLowerCase();
  if (needle) {
    rows = rows.filter((r) =>
      [r.tracking_number, r.recipient_name, r.sender_name, r.destination_city, r.origin_city, r.description]
        .some((v) => String(v || '').toLowerCase().includes(needle)));
  }

  const total = rows.length;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const perPage = Math.min(100, Math.max(5, parseInt(limit, 10) || 15));
  const offset = (pageNum - 1) * perPage;

  return {
    rows: rows.slice(offset, offset + perPage),
    page: pageNum,
    limit: perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

// Generic comparator used when the rows are sorted in memory.
function comparator(field, dir) {
  const sign = dir === 'asc' ? 1 : -1;
  return (a, b) => {
    const va = a[field];
    const vb = b[field];
    if (va == null && vb == null) return 0;
    if (va == null) return 1; // nulls last
    if (vb == null) return -1;
    const ta = va instanceof Date ? va.getTime() : va;
    const tb = vb instanceof Date ? vb.getTime() : vb;
    if (ta < tb) return -1 * sign;
    if (ta > tb) return 1 * sign;
    return 0;
  };
}

// ---- Dashboard stats -------------------------------------------------------

export async function getDashboardStats() {
  await refreshAutoStatuses();
  const rows = await queryRows('shipments', {
    select: ['id', 'status', 'archived', 'estimated_delivered_at'],
  });

  const byStatus = {};
  let total = 0;
  let archived = 0;
  let overdue = 0;
  const now = Date.now();

  for (const r of rows) {
    total += 1;
    if (r.archived) {
      archived += 1;
      continue;
    }
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    if (
      r.status !== 'Delivered' && r.status !== 'Returned to Sender'
      && r.estimated_delivered_at && new Date(r.estimated_delivered_at).getTime() < now
    ) {
      overdue += 1;
    }
  }

  return {
    total,
    archived,
    awaiting_pickup: (byStatus['Shipment Created'] || 0) + (byStatus['Registered'] || 0),
    in_transit: (byStatus['Picked Up'] || 0) + (byStatus['In Transit'] || 0)
      + (byStatus['Arrived at Facility'] || 0) + (byStatus['Departed Facility'] || 0)
      + (byStatus['Customs Clearance'] || 0),
    out_for_delivery: byStatus['Out for Delivery'] || 0,
    on_hold: byStatus['On Hold'] || 0,
    delayed: (byStatus['Delayed'] || 0) + overdue,
    delivered: byStatus['Delivered'] || 0,
    returned: byStatus['Returned to Sender'] || 0,
  };
}

// ---- Recent activity feeds for the dashboard ------------------------------

export async function recentShipments(limit = 6) {
  await refreshAutoStatuses();
  const rows = await queryRows('shipments', {
    orders: [['created_at', 'desc']],
    limit,
    select: [
      'id', 'tracking_number', 'recipient_name', 'destination_city', 'destination_country',
      'status', 'estimated_delivery_date', 'created_at',
    ],
  });
  return rows;
}

export async function recentEvents(limit = 8) {
  const rows = await queryRows('tracking_events', {
    orders: [['created_at', 'desc']],
    limit,
    select: ['id', 'status', 'location', 'description', 'created_at', 'shipment_id', 'tracking_number'],
  });

  // Events written before the tracking number was denormalised onto the event
  // still need it — look the shipment up once for all of them.
  const missing = rows.filter((r) => !r.tracking_number).map((r) => r.shipment_id);
  if (missing.length) {
    const ships = await getRows('shipments', [...new Set(missing)]);
    const map = new Map(ships.map((s) => [s.id, s.tracking_number]));
    for (const r of rows) {
      if (!r.tracking_number) r.tracking_number = map.get(r.shipment_id) || null;
    }
  }
  return rows;
}

export async function delayedShipments(limit = 20) {
  await refreshAutoStatuses();
  const rows = await queryRows('shipments', {
    filters: [{ field: 'archived', op: '==', value: false }],
    select: [
      'id', 'tracking_number', 'recipient_name', 'status', 'estimated_delivery_date',
      'estimated_delivered_at', 'destination_city',
    ],
  });

  const now = Date.now();
  const delayed = rows.filter((r) =>
    r.status === 'Delayed'
    || (r.status !== 'Delivered' && r.status !== 'Returned to Sender'
      && r.estimated_delivered_at && new Date(r.estimated_delivered_at).getTime() < now));

  delayed.sort((a, b) => {
    const ta = a.estimated_delivered_at ? new Date(a.estimated_delivered_at).getTime() : null;
    const tb = b.estimated_delivered_at ? new Date(b.estimated_delivered_at).getTime() : null;
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1; // no estimate last
    if (tb == null) return -1;
    return ta - tb;
  });

  return delayed.slice(0, limit);
}


// ---- Shared validation for create/edit ------------------------------------

function validateShipmentInput(input, { forCreate, existing }) {
  const pick = (field, min = 1, max = 1000) => {
    if (forCreate) return str(input[field], { field: label(field), min, max });
    // On edit, fall back to existing value when field omitted.
    if (input[field] == null || input[field] === '') {
      return existing ? existing[field] ?? '' : '';
    }
    return str(input[field], { field: label(field), min, max });
  };
  const pickOpt = (field, max = 1000) => {
    if (input[field] == null || input[field] === '') {
      return existing ? existing[field] ?? null : null;
    }
    return optionalStr(input[field], { field: label(field), max });
  };

  const status = input.status
    ? enumValue(input.status, { field: 'Status', allowed: ALL_STATUSES, required: forCreate })
    : (existing ? existing.status : 'Shipment Created');

  const notifyRaw = input.notify_customer;
  const notify = notifyRaw == null
    ? (existing ? existing.notify_customer : true)
    : (notifyRaw === true || notifyRaw === 'true' || notifyRaw === 'on' || notifyRaw === '1');

  return {
    sender_name: pick('sender_name', 2),
    sender_contact: pickOpt('sender_contact'),
    origin_address: pickOpt('origin_address'),
    origin_city: pick('origin_city', 2),
    origin_country: pick('origin_country', 2),

    recipient_name: pick('recipient_name', 2),
    recipient_contact: pickOpt('recipient_contact'),
    destination_address: pickOpt('destination_address'),
    destination_city: pick('destination_city', 2),
    destination_country: pick('destination_country', 2),

    description: pick('description', 3),
    category: pickOpt('category'),
    weight_kg: num(input.weight_kg ?? existing?.weight_kg, { field: label('weight_kg'), max: 100000 }),
    dimensions: pickOpt('dimensions'),
    shipping_method: pickOpt('shipping_method'),
    internal_reference: pickOpt('internal_reference'),
    customs_fee: num(input.customs_fee ?? existing?.customs_fee ?? 3000, { field: label('customs_fee'), max: 10000000 }),
    customs_fee_currency: input.customs_fee_currency
      ? enumValue(input.customs_fee_currency, { field: 'Fee currency', allowed: CURRENCIES })
      : (existing ? existing.customs_fee_currency : 'USD'),
    delivery_instructions: pickOpt('delivery_instructions', 600),

    estimated_delivery_date: input.estimated_delivery_date != null && input.estimated_delivery_date !== ''
      ? dateStr(input.estimated_delivery_date, { field: 'Estimated delivery date' })
      : (existing ? existing.estimated_delivery_date : null),
    estimated_delivery_time: input.estimated_delivery_time != null && input.estimated_delivery_time !== ''
      ? timeStr(input.estimated_delivery_time, { field: 'Estimated delivery time' })
      : (existing ? existing.estimated_delivery_time : null),
    pickup_date: input.pickup_date != null && input.pickup_date !== ''
      ? dateStr(input.pickup_date, { field: 'Pickup date' })
      : (existing ? existing.pickup_date : null),
    dispatch_date: input.dispatch_date != null && input.dispatch_date !== ''
      ? dateStr(input.dispatch_date, { field: 'Dispatch date' })
      : (existing ? existing.dispatch_date : null),

    notify_customer: notify,
    status: status || 'Shipment Created',
  };
}

function label(field) {
  return field.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
