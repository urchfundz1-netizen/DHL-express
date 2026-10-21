// server/lib/tracking.js
// Original tracking-number generation for SwiftNova Global Express.
//
// Format (inspired by international courier conventions, NOT a copy of any
// real carrier's proprietary format):
//
//   SWN 1234567890 1 C
//   ^^^            ^ ^
//   |              | |
//   |              | +-- internal service code (letter)
//   |              +---- Luhn check digit over the 10 numeric digits
//   +------------------- 10 cryptographically random numeric digits
//   (brand prefix, above)
//
// Stored without spaces, e.g. "SWN12345678901C".
// Uniqueness is enforced by the DB (UNIQUE constraint); we also retry on the
// rare chance of a collision.

import crypto from 'node:crypto';
import { TRACKING_PREFIX } from './constants.js';

// Cryptographically-secure random integer in [0, max).
function randomInt(max) {
  return crypto.randomInt(max);
}

// Standard Luhn (mod-10) check digit for a string of digits.
function luhnCheckDigit(digits) {
  let sum = 0;
  let double = true; // the check digit position itself is "doubled" first
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
}

const SERVICE_CODES = ['C', 'E', 'P', 'X', 'G']; // C=Courier, E=Express, P=Parcel, X=Economy, G=Freight

// Build one candidate tracking number (no spaces).
function buildCandidate() {
  let digits = '';
  for (let i = 0; i < 10; i++) digits += String(randomInt(10));
  const check = luhnCheckDigit(digits);
  const service = SERVICE_CODES[randomInt(SERVICE_CODES.length)];
  return `${TRACKING_PREFIX}${digits}${check}${service}`;
}

// Format for human display: "SWN 1234 5678 901 C"
export function formatTrackingNumber(raw) {
  if (!raw) return '';
  const s = String(raw).toUpperCase().replace(/\s+/g, '');
  if (!s.startsWith(TRACKING_PREFIX)) return s;
  const body = s.slice(TRACKING_PREFIX.length);
  // body = 10 digits + check + service
  const groups = body.match(/.{1,4}/g) || [];
  return [TRACKING_PREFIX, ...groups].join(' ');
}

// Normalize user input: uppercase, strip spaces & separators.
export function normalizeTrackingInput(input) {
  return String(input || '')
    .toUpperCase()
    .replace(/[\s-]+/g, '');
}

// Validate the shape of a tracking number (used for fast client/server checks).
export function isValidTrackingShape(input) {
  const norm = normalizeTrackingInput(input);
  // SWN + 10 digits + 1 check digit + 1 service letter = SWN + 11 digits + 1 letter
  if (!/^SWN\d{11}[A-Z]$/.test(norm)) return false;
  // verify the Luhn check digit over the first 10 numeric digits
  const digits = norm.slice(3, 13);
  const check = Number(norm[13]);
  return luhnCheckDigit(digits) === check;
}

// Generate a unique tracking number, verifying against the database.
// `exists` is an async predicate: (candidate) => boolean
export async function generateUniqueTrackingNumber(exists) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = buildCandidate();
    if (isValidTrackingShape(candidate)) {
      // eslint-disable-next-line no-await-in-loop
      const taken = await exists(candidate);
      if (!taken) return candidate;
    }
  }
  throw new Error('Unable to generate a unique tracking number. Please try again.');
}
