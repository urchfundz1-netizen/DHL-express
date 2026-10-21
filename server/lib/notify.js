// server/lib/notify.js
// Triggers customer email notifications for real shipment events.

import { sendMail, templateFor, emailEnabled } from './mailer.js';
import { formatTrackingNumber } from './tracking.js';

// maybeNotify(event, { shipment, admin, status })
export async function maybeNotify(event, { shipment, admin, status }) {
  if (!shipment) return { sent: false, reason: 'no-shipment' };
  if (shipment.notify_customer === false) return { sent: false, reason: 'opted-out' };

  const to = shipment.recipient_contact && /@/.test(shipment.recipient_contact)
    ? shipment.recipient_contact
    : null;
  if (!to) return { sent: false, reason: 'no-email-recipient' };

  const tracking = formatTrackingNumber(shipment.tracking_number);
  const eta = shipment.estimated_delivery_date
    ? `${shipment.estimated_delivery_date}${shipment.estimated_delivery_time ? ' ' + shipment.estimated_delivery_time : ''}`
    : 'to be confirmed';

  const { subject, text } = templateFor(event, { tracking, status: status || shipment.status, eta });
  const res = await sendMail({ to, subject, text });
  return res;
}

export { emailEnabled };
