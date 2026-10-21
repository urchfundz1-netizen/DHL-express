// server/lib/validate.js
// Lightweight, dependency-free server-side input validation.

export function str(v, { field, required = true, min = 1, max = 1000, trim = true } = {}) {
  let value = typeof v === 'string' ? v : v == null ? '' : String(v);
  if (trim) value = value.trim();
  if (!required && value === '') return '';
  if (value.length < min) {
    throw new ValidationError(`${field} is required`, field);
  }
  if (value.length > max) {
    throw new ValidationError(`${field} must be at most ${max} characters`, field);
  }
  return value;
}

export function optionalStr(v, { field, max = 1000 } = {}) {
  if (v == null || v === '') return null;
  const value = String(v).trim();
  if (value.length > max) throw new ValidationError(`${field} must be at most ${max} characters`, field);
  return value === '' ? null : value;
}

export function num(v, { field, required = false, min = 0, max = 1e12 } = {}) {
  if (v == null || v === '') {
    if (required) throw new ValidationError(`${field} is required`, field);
    return null;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) throw new ValidationError(`${field} must be a number`, field);
  if (n < min || n > max) throw new ValidationError(`${field} must be between ${min} and ${max}`, field);
  return n;
}

// Validate a date string "YYYY-MM-DD". Returns the string or null.
export function dateStr(v, { field, required = false } = {}) {
  if (v == null || v === '') {
    if (required) throw new ValidationError(`${field} is required`, field);
    return null;
  }
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new ValidationError(`${field} must be a valid date (YYYY-MM-DD)`, field);
  }
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) throw new ValidationError(`${field} is not a real date`, field);
  return s;
}

// Validate a time string "HH:MM" (24h). Returns the string or null.
export function timeStr(v, { field } = {}) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(s)) {
    throw new ValidationError(`${field} must be a valid time (HH:MM)`, field);
  }
  return s;
}

export function email(v, { field = 'Email', required = true } = {}) {
  const s = str(v, { field, required, max: 254 });
  if (!required && !s) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
    throw new ValidationError(`${field} is not a valid email address`, field);
  }
  return s.toLowerCase();
}

export function enumValue(v, { field, allowed, required = false }) {
  if (v == null || v === '') {
    if (required) throw new ValidationError(`${field} is required`, field);
    return null;
  }
  const s = String(v);
  if (!allowed.includes(s)) {
    throw new ValidationError(`${field} is not a valid option`, field);
  }
  return s;
}

export function boolean(v) {
  return v === true || v === 'true' || v === 1 || v === '1' || v === 'on';
}

export class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.field = field;
    this.expose = true;
  }
}

export class HttpError extends Error {
  constructor(status, message, field) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.field = field;
    this.expose = status < 500;
  }
}

// Combine a date + time string into an ISO timestamp.
// Time is interpreted in the server's local timezone; we store as timestamptz.
// Accepts a "YYYY-MM-DD" string, a Date object, or an ISO string for the date.
export function combineDateTime(dateValue, timeStrValue) {
  if (!dateValue) return null;

  let ymd;
  if (dateValue instanceof Date) {
    if (Number.isNaN(dateValue.getTime())) return null;
    const y = dateValue.getFullYear();
    const m = String(dateValue.getMonth() + 1).padStart(2, '0');
    const d = String(dateValue.getDate()).padStart(2, '0');
    ymd = `${y}-${m}-${d}`;
  } else {
    const s = String(dateValue).trim();
    // Already an ISO timestamp like 2026-10-18T00:00:00.000Z
    if (/^\d{4}-\d{2}-\d{2}[T ]/.test(s)) ymd = s.slice(0, 10);
    else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) ymd = s;
    else return null;
  }

  const time = timeStrValue || '17:00';
  const iso = `${ymd}T${time}:00`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
