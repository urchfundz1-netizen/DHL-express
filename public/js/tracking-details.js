// public/js/tracking-details.js
// Dedicated shipment details page (email-style template). Reads ?t= from the
// URL, looks the shipment up via the public track API, and fills the template.

const $ = (id) => document.getElementById(id);

function fmtLongDate(value) {
  if (!value) return 'to be confirmed';
  const d = new Date(value);
  if (isNaN(d)) return 'to be confirmed';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function fmtShortDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: '2-digit' });
}

function fmtTrackingDisplay(raw) {
  const s = String(raw || '').toUpperCase().replace(/\s+/g, '');
  if (!s.startsWith('SWN')) return s;
  const groups = (s.slice(3).match(/.{1,4}/g) || []);
  return ['SWN', ...groups].join(' ');
}

function fmtTimeOnly(timeStr) {
  if (!timeStr) return 'By End of Day';
  const [h, m] = String(timeStr).split(':');
  const d = new Date();
  d.setHours(Number(h), Number(m), 0, 0);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function fmtDateOnly(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d)) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function fill(id, value, fallback = '—') {
  const el = $(id);
  if (el) el.textContent = (value === 0 ? String(value) : value) ? String(value) : fallback;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function render(shipment) {
  const waybill = fmtTrackingDisplay(shipment.tracking_number);
  const headline = shipment.status === 'Delivered'
    ? 'YOUR SHIPMENT HAS BEEN DELIVERED'
    : 'YOUR SHIPMENT IS ON ITS WAY';

  $('headline').textContent = headline;
  $('waybill').textContent = waybill;
  $('tableWaybill').textContent = waybill;

  const senderLine = shipment.sender_name
    ? `${shipment.sender_name}${shipment.origin_city ? ` (${shipment.origin_city}, ${shipment.origin_country})` : ''}`
    : shipment.origin_city
      ? `${shipment.origin_city}, ${shipment.origin_country}`
      : 'Express Delivery';
  $('sender').textContent = senderLine;

  const dateValue = shipment.estimated_delivery_date || shipment.created_at;
  $('deliveryDateText').textContent = fmtLongDate(dateValue);
  $('tableDate').textContent = fmtShortDate(dateValue);
  $('tableTime').textContent = shipment.estimated_delivery_time
    ? fmtTimeOnly(shipment.estimated_delivery_time)
    : 'By End of Day';

  const addr = [
    shipment.recipient_name,
    shipment.destination_address,
    shipment.destination_city,
    shipment.destination_country,
  ].filter(Boolean).join('<br>') || '—';
  $('deliveryAddress').innerHTML = addr;

  // ---- Delivery information ----
  fill('tableStatus', shipment.status);
  fill('tableInstructions', shipment.delivery_instructions);
  fill('tableDeliveredAt', shipment.delivered_at ? fmtDateTime(shipment.delivered_at) : '');

  // ---- Package details ----
  fill('tableDescription', shipment.description);
  fill('tableCategory', shipment.category);
  fill('tableWeight',
    shipment.weight_kg !== null && shipment.weight_kg !== undefined && shipment.weight_kg !== ''
      ? `${Number(shipment.weight_kg).toLocaleString()} kg`
      : '');
  fill('tableDimensions', shipment.dimensions);
  fill('tableService', shipment.shipping_method);

  // ---- Sender & recipient ----
  fill('tableSender', shipment.sender_name);
  fill('tableSenderContact', shipment.sender_contact);
  fill('tableOrigin', [
    shipment.origin_address,
    shipment.origin_city,
    shipment.origin_country,
  ].filter(Boolean).join(', '));
  fill('tableRecipient', shipment.recipient_name);
  fill('tableRecipientContact', shipment.recipient_contact);
  fill('tableDestination', [
    shipment.destination_address,
    shipment.destination_city,
    shipment.destination_country,
  ].filter(Boolean).join(', '));
  fill('tableCreatedAt', fmtDateTime(shipment.created_at));
  fill('tablePickup', shipment.pickup_date ? fmtDateOnly(shipment.pickup_date) : '');
  fill('tableDispatch', shipment.dispatch_date ? fmtDateOnly(shipment.dispatch_date) : '');
  fill('tableUpdatedAt', shipment.updated_at ? fmtDateTime(shipment.updated_at) : '');

  const customerName = $('customerName');
  if (customerName && shipment.recipient_name) customerName.textContent = shipment.recipient_name;

  $('loading').hidden = true;
  $('error').hidden = true;
  $('content').hidden = false;
}

function renderRows(bodyId, rows, columns) {
  const body = $(bodyId);
  if (!body) return;
  if (!rows || rows.length === 0) {
    body.innerHTML = `<tr><td colspan="${columns.length}">No records yet.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((row) => {
    const cells = columns.map((col) => `<td>${col(row)}</td>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
}

function showError(msg) {
  $('loading').hidden = true;
  $('content').hidden = true;
  $('error').hidden = false;
  if (msg) $('errorMessage').textContent = msg;
}

function renderHistory(events, comments) {
  renderRows('eventsBody', events, [
    (e) => esc(fmtDateTime(e.created_at)),
    (e) => esc(e.status || '—'),
    (e) => esc(e.location || '—'),
    (e) => esc(e.description || '—'),
  ]);
  renderRows('commentsBody', comments, [
    (c) => esc(fmtDateTime(c.created_at)),
    (c) => `${esc(c.text || '—')}${c.admin_name ? `<br><small>— ${esc(c.admin_name)}</small>` : ''}`,
  ]);
}

(async function init() {
  const t = new URLSearchParams(window.location.search).get('t');
  if (!t) {
    showError('No tracking number was provided. Please track a shipment first.');
    return;
  }
  const norm = t.replace(/[\s-]+/g, '').toUpperCase();
  try {
    const res = await fetch(`/api/track/${encodeURIComponent(norm)}`, { credentials: 'same-origin' });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      showError(data.error || 'No shipment found for that tracking number.');
      return;
    }
    render(data.shipment);
    renderHistory(data.events, data.customerComments);
  } catch (e) {
    showError('Something went wrong. Please try again.');
  }
})();
