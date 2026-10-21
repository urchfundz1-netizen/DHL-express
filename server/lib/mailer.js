// server/lib/mailer.js
// Optional email notifications via nodemailer.
// If SMTP_HOST is not configured, sending is a no-op that logs a preview so the
// rest of the system keeps working without a mail provider.

import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const host = process.env.SMTP_HOST || '';
const port = Number(process.env.SMTP_PORT || 587);
const secure = process.env.SMTP_SECURE === 'true';
const user = process.env.SMTP_USER || '';
const pass = process.env.SMTP_PASS || '';
const from = process.env.MAIL_FROM || 'SwiftNova Express <no-reply@swiftnova.test>';

export const emailEnabled = Boolean(host);

let transporter = null;
if (emailEnabled) {
  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  });
}

export async function sendMail({ to, subject, text, html }) {
  if (!to) return { sent: false, reason: 'no-recipient' };
  if (!transporter) {
    // Dev/preview mode: log instead of sending.
    console.info(`\n[mailer] Email disabled (SMTP not configured). Preview:\n  To: ${to}\n  Subject: ${subject}\n  ${text ? text.split('\n').map((l) => '  ' + l).join('\n') : ''}\n`);
    return { sent: false, reason: 'disabled' };
  }
  try {
    await transporter.sendMail({ from, to, subject, text, html });
    return { sent: true };
  } catch (err) {
    console.error('[mailer] Failed to send email:', err.message);
    return { sent: false, reason: err.message };
  }
}

// A few customer-facing templates keyed by event type.
export function templateFor(event, ctx) {
  const { tracking, status, eta } = ctx;
  switch (event) {
    case 'registered':
      return {
        subject: `Shipment ${tracking} registered`,
        text: `Good news! Your shipment ${tracking} has been registered with SwiftNova. Estimated delivery: ${eta}. Track anytime at our website.`,
      };
    case 'picked_up':
      return {
        subject: `Shipment ${tracking} picked up`,
        text: `Your shipment ${tracking} has been picked up and is on its way.`,
      };
    case 'in_transit':
      return {
        subject: `Shipment ${tracking} in transit`,
        text: `Update: shipment ${tracking} is currently in transit (${status}).`,
      };
    case 'out_for_delivery':
      return {
        subject: `Shipment ${tracking} out for delivery`,
        text: `Your shipment ${tracking} is out for delivery today!`,
      };
    case 'delayed':
      return {
        subject: `Shipment ${tracking} delayed`,
        text: `We're sorry — shipment ${tracking} has been delayed. New estimated delivery: ${eta}.`,
      };
    case 'delivered':
      return {
        subject: `Shipment ${tracking} delivered`,
        text: `Your shipment ${tracking} has been delivered. Thank you for choosing SwiftNova!`,
      };
    default:
      return {
        subject: `Shipment ${tracking} update`,
        text: `Your shipment ${tracking} has a new status: ${status}.`,
      };
  }
}
