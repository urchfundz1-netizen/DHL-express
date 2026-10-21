// server/lib/constants.js
// Shared domain constants used by both validation and the frontend (via API).

export const TRACKING_PREFIX = 'SWN';

// Canonical ordered list of "normal flow" statuses (index drives progress bar).
export const STATUS_FLOW = [
  'Shipment Created',
  'Registered',
  'Picked Up',
  'In Transit',
  'Arrived at Facility',
  'Departed Facility',
  'Customs Clearance',
  'Out for Delivery',
  'Delivered',
];

// All statuses an admin may select, including exceptions to the normal flow.
export const ALL_STATUSES = [
  'Shipment Created',
  'Registered',
  'Picked Up',
  'In Transit',
  'Arrived at Facility',
  'Departed Facility',
  'On Hold',
  'Delayed',
  'Customs Clearance',
  'Out for Delivery',
  'Delivery Attempted',
  'Delivered',
  'Returned to Sender',
];

// Which statuses mean the package has reached the end of its journey.
export const TERMINAL_STATUSES = ['Delivered', 'Returned to Sender'];

export const PACKAGE_CATEGORIES = [
  'Documents',
  'Parcels',
  'Electronics',
  'Fragile',
  'Perishables',
  'Furniture',
  'Apparel',
  'Industrial Parts',
  'Other',
];

export const SHIPPING_METHODS = [
  'Express',
  'Standard',
  'Economy',
  'Same Day',
  'Freight',
  'International Priority',
];

// Currencies an admin can pick for the customs fee.
export const CURRENCIES = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'JPY', 'CNY', 'HKD', 'SGD',
  'INR', 'PKR', 'BDT', 'LKR', 'NPR', 'AED', 'SAR', 'QAR', 'KWD', 'BHD',
  'OMR', 'ILS', 'TRY', 'EGP', 'ZAR', 'NGN', 'KES', 'TZS', 'UGX', 'GHS',
  'XOF', 'MAD', 'DZD', 'TND', 'BRL', 'MXN', 'ARS', 'CLP', 'COP', 'PEN',
  'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'RUB', 'UAH',
  'KRW', 'THB', 'VND', 'IDR', 'MYR', 'PHP', 'TWD', 'MOP', 'BND', 'KHR',
];

export const DELAY_REASONS = [
  'Weather Conditions',
  'Customs Clearance',
  'Transportation Disruption',
  'Operational Delay',
  'Address Verification',
  'Recipient Unavailable',
  'High Shipment Volume',
  'Security Check',
  'Other',
];

// Statuses that count toward the "awaiting pickup" bucket on the dashboard.
export const AWAITING_PICKUP_STATUSES = ['Shipment Created', 'Registered'];

// Map a status to a badge color token used across the UI.
export const STATUS_TONE = {
  'Shipment Created': 'gray',
  'Registered': 'gray',
  'Picked Up': 'blue',
  'In Transit': 'blue',
  'Arrived at Facility': 'blue',
  'Departed Facility': 'blue',
  'Customs Clearance': 'amber',
  'On Hold': 'amber',
  'Delayed': 'red',
  'Out for Delivery': 'yellow',
  'Delivery Attempted': 'amber',
  'Delivered': 'green',
  'Returned to Sender': 'purple',
};

export function statusIndex(status) {
  return STATUS_FLOW.indexOf(status);
}

// Percentage of journey completed for every status. The tracking page drives
// the plane/progress bar from this value, so it must cover all statuses —
// including exception ones that are not part of the normal flow.
export const STATUS_PROGRESS = {
  'Shipment Created': 0,
  'Registered': 10,
  'Picked Up': 20,
  'In Transit': 40,
  'Arrived at Facility': 55,
  'Departed Facility': 65,
  'Customs Clearance': 75,
  'Out for Delivery': 90,
  'Delivery Attempted': 90,
  'Delivered': 100,
  'Returned to Sender': 100,
};

// Progress for one status (0-100).
export function statusProgress(status) {
  if (STATUS_PROGRESS[status] != null) return STATUS_PROGRESS[status];
  const i = STATUS_FLOW.indexOf(status);
  if (i === -1) return 0;
  return Math.round((i / (STATUS_FLOW.length - 1)) * 100);
}

// Overall progress for a shipment. A normal-flow status always maps straight
// to its own percentage (so the plane follows the live status, forwards or
// backwards). Exception statuses (On Hold, Delayed, ...) keep the progress of
// the latest real stage from the event history instead of dropping to 0.
export function shipmentProgress(status, eventStatuses = []) {
  if (TERMINAL_STATUSES.includes(status)) return 100;
  if (STATUS_FLOW.includes(status)) return statusProgress(status);
  for (let i = eventStatuses.length - 1; i >= 0; i--) {
    if (STATUS_FLOW.includes(eventStatuses[i])) return statusProgress(eventStatuses[i]);
  }
  return statusProgress(status);
}
