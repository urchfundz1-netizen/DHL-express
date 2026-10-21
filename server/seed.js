// server/seed.js
// Populates Firestore with realistic demo data for development/testing.
// Run with: npm run seed
// NOTE: This data is clearly demo data. It is not presented as real shipments.

import dotenv from 'dotenv';
import { initSchema } from './db/schema.js';
import { queryRows, setRow, nextNumericIds } from './db/firestore.js';
import { hashPassword } from './lib/auth.js';
import { createShipment, updateStatus, delayShipment, addComment } from './lib/shipments.js';

dotenv.config();

await initSchema();

// --- Ensure admin ---
const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || '';
if (!adminEmail || !adminPassword) {
  console.error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env before seeding.');
  process.exit(1);
}
let admins = await queryRows('admins', {
  filters: [{ field: 'email', op: '==', value: adminEmail }],
  limit: 1,
});
let admin;
if (admins.length === 0) {
  const ids = await nextNumericIds(['admins']);
  admin = { id: ids.admins, name: process.env.ADMIN_NAME || 'Site Administrator', email: adminEmail };
  await setRow('admins', ids.admins, {
    id: ids.admins,
    email: adminEmail,
    password_hash: hashPassword(adminPassword),
    name: admin.name,
    role: 'admin',
    last_login_at: null,
    created_at: new Date(),
  });
  console.log(`Created admin: ${adminEmail}`);
} else {
  admin = admins[0];
  console.log(`Admin already exists: ${adminEmail}`);
}

// Avoid duplicating demo shipments if seeded before (Firestore has no LIKE,
// so this is a prefix range query on internal_reference).
const existing = await queryRows('shipments', {
  filters: [
    { field: 'internal_reference', op: '>=', value: 'DEMO-' },
    { field: 'internal_reference', op: '<=', value: 'DEMO-\uf8ff' },
  ],
  select: ['id'],
});
if (existing.length > 0) {
  console.log(`\nDemo shipments already present (${existing.length}). Skipping shipment seeding.`);
  console.log('Clear the "shipments" collection in Firebase to reseed from scratch.');
  process.exit(0);
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const demos = [
  {
    sender_name: 'Aisha Kumar', sender_contact: 'aisha.kumar@example.com',
    origin_address: '24 Riverside Way', origin_city: 'London', origin_country: 'United Kingdom',
    recipient_name: 'Marco Rossi', recipient_contact: 'marco.rossi@example.com',
    destination_address: '12 Via Roma', destination_city: 'Milan', destination_country: 'Italy',
    description: 'Laptop and accessories (1 carton)', category: 'Electronics', weight_kg: 3.4,
    dimensions: '40x30x15 cm', shipping_method: 'International Priority',
    status: 'In Transit', estimated_delivery_date: daysFromNow(2), estimated_delivery_time: '14:30',
  },
  {
    sender_name: 'Chen Wei', sender_contact: 'chen.wei@example.com',
    origin_address: '88 Bund Road', origin_city: 'Shanghai', origin_country: 'China',
    recipient_name: 'Sofia Alvarez', recipient_contact: 'sofia.alvarez@example.com',
    destination_address: '5 Calle Mayor', destination_city: 'Madrid', destination_country: 'Spain',
    description: 'Textile samples', category: 'Apparel', weight_kg: 8.1,
    dimensions: '60x40x30 cm', shipping_method: 'Express',
    status: 'Out for Delivery', estimated_delivery_date: daysFromNow(0), estimated_delivery_time: '17:00',
  },
  {
    sender_name: 'NovaTech GmbH', sender_contact: 'logistics@novatech.example',
    origin_address: 'Industriestrasse 9', origin_city: 'Berlin', origin_country: 'Germany',
    recipient_name: 'Emma Johnson', recipient_contact: 'emma.j@example.com',
    destination_address: '77 Maple Street', destination_city: 'Toronto', destination_country: 'Canada',
    description: 'Industrial spare parts', category: 'Industrial Parts', weight_kg: 22.5,
    dimensions: '80x50x40 cm', shipping_method: 'Freight',
    status: 'Customs Clearance', estimated_delivery_date: daysFromNow(4), estimated_delivery_time: '12:00',
  },
  {
    sender_name: 'Lagos Freight Co.', sender_contact: 'ops@lagosfreight.example',
    origin_address: '3 Marina Road', origin_city: 'Lagos', origin_country: 'Nigeria',
    recipient_name: 'Daniel Smith', recipient_contact: 'dan.smith@example.com',
    destination_address: '200 Ocean Drive', destination_city: 'New York', destination_country: 'United States',
    description: 'Handcrafted goods (2 cartons)', category: 'Fragile', weight_kg: 12.0,
    dimensions: '50x50x50 cm', shipping_method: 'Express',
    status: 'Delivered', estimated_delivery_date: daysFromNow(-3), estimated_delivery_time: '11:00',
  },
  {
    sender_name: 'Sydney Organics', sender_contact: 'hello@sydneyorganics.example',
    origin_address: '15 Harbour Lane', origin_city: 'Sydney', origin_country: 'Australia',
    recipient_name: 'Yuki Tanaka', recipient_contact: 'yuki.tanaka@example.com',
    destination_address: '9 Sakura Ave', destination_city: 'Tokyo', destination_country: 'Japan',
    description: 'Organic produce (refrigerated)', category: 'Perishables', weight_kg: 6.2,
    dimensions: '45x35x25 cm', shipping_method: 'Express',
    status: 'Registered', estimated_delivery_date: daysFromNow(3), estimated_delivery_time: '09:00',
  },
  {
    sender_name: 'Dubai Trade Hub', sender_contact: 'sales@dth.example',
    origin_address: 'Port Complex 4', origin_city: 'Dubai', origin_country: 'United Arab Emirates',
    recipient_name: 'Olivia Brown', recipient_contact: 'olivia.brown@example.com',
    destination_address: '18 King Street', destination_city: 'London', destination_country: 'United Kingdom',
    description: 'Documents (contracts)', category: 'Documents', weight_kg: 0.5,
    dimensions: '35x25x2 cm', shipping_method: 'Same Day',
    status: 'Picked Up', estimated_delivery_date: daysFromNow(1), estimated_delivery_time: '16:00',
  },
];

console.log('\nSeeding demo shipments...');
const created = [];
for (let i = 0; i < demos.length; i++) {
  const d = demos[i];
  // eslint-disable-next-line no-await-in-loop
  const res = await createShipment(
    { ...d, internal_reference: `DEMO-${String(i + 1).padStart(3, '0')}`, notify_customer: false },
    admin
  );
  created.push(res);
  console.log(`  + ${res.tracking_number}  (${d.status})`);
}

// Advance a couple of them to their target statuses and add realistic history.
async function advanceTo(index, status, location) {
  const id = created[index].id;
  await updateStatus(id, { status, location, description: `Shipment ${status.toLowerCase()} at ${location}.` }, admin);
}

// Shipment 0 -> customer comment about sorting facility
await addComment(created[0].id, {
  text: 'Your package has arrived at the sorting facility and is being prepared for the next leg of its journey.',
  visibility: 'customer',
}, admin);

// Shipment 3 -> mark delivered with actual timestamp
await advanceTo(3, 'Delivered', 'New York');

// Shipment 1 -> out for delivery comment
await addComment(created[1].id, {
  text: 'Your shipment is out for delivery today. Please ensure someone is available to receive it.',
  visibility: 'customer',
}, admin);

// Shipment 2 -> internal note
await addComment(created[2].id, {
  text: 'Customs paperwork under review; awaiting clearance. Escalate if not cleared within 48h.',
  visibility: 'internal',
}, admin);

// Delay shipment 4 to demonstrate delay history
await delayShipment(created[4].id, {
  new_date: daysFromNow(5),
  new_time: '10:00',
  reason: 'Weather Conditions',
  customer_visible: true,
  customer_explanation: 'Due to adverse weather affecting the outbound flight, your delivery has been rescheduled. We apologize for the inconvenience.',
  internal_notes: 'Carrier reported storm diversion; monitor tomorrow.',
}, admin);

console.log('\nSeed complete.');
console.log('\nDemo tracking numbers (for testing):');
created.forEach((c) => console.log(`  ${c.tracking_number}`));
console.log(`\nLogin as: ${adminEmail}\n`);
process.exit(0);
