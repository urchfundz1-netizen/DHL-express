# SwiftNova Global Express

A complete, production-style **delivery & shipment tracking platform** — a professional courier website with a customer-facing tracking experience and a secure admin dashboard, backed by Firebase Firestore and a Node.js/Express backend.

> SwiftNova is an original brand. Its design language is inspired by major international couriers.

---

## Features

### Customer-facing
- **Homepage** with a bold hero and a prominent **Track Your Shipment** form.
- **Tracking landing page** (`/track`) — hero with a tracking form that forwards to the results page.
- **Live tracking results page** (`/tracking?t=SWN...`):
  - Shipment overview (status, package, origin, destination, dates, latest update).
  - Visual **timeline** built from real tracking events stored in the database.
  - **Live delivery countdown** that updates every second (days+hours > 24h away, hours+minutes+seconds < 24h, "estimate passed" message, and actual delivery time once delivered).
  - Latest **customer-visible comment** with expandable history.
  - Auto-refreshes every 30s so new updates appear without a manual refresh.
- **Package details page** (`/tracking/details?t=SWN...`) — waybill-style summary of the shipment.
- **Customs page** (`/customs`) — explains the clearance process; linked from the results page when a shipment's status is `Customs Clearance`.
- **Services**, **About** (incl. Privacy Policy & Terms), **Contact** (with FAQs), and a **404** page.
- Fully **responsive**: mobile-first layouts that adapt intelligently from 320px to 1440px+.

### Admin dashboard (`/admin`)
- Secure **login** with show/hide password, validation, and login rate limiting.
- Dashboard **statistics** computed from real records (total, awaiting pickup, in transit, out for delivery, delayed, on hold, delivered, archived).
- **Create shipment** → auto-generates a unique tracking number (with copy button).
- **All Shipments** with search, status/archive filters, column sorting, and pagination (table on desktop, cards on mobile).
- **Shipment detail modal**: overview, edit, update status, **delay management**, and comments.
- **Delivery delay** management: new date/time, reason, customer-visible explanation, internal notes; retains full previous-estimate history.
- **Comments**: customer-visible (shown on tracking page) and internal admin notes (private).
- **Delivery Updates** feed, **Delayed Shipments**, **Recipients**, **Reports** (charts), **Activity Logs** (audit trail), and **Settings** (change password).
- Collapsible sidebar that becomes an accessible menu on mobile.

### Security
- Server-side sessions stored in Firestore, **bcrypt** password hashing.
- **CSRF** protection (double-submit token) on all state-changing requests.
- **Rate limiting**: a shared, Firestore-backed budget for admin logins and in-memory budgets for the public endpoints (see [Rate limiting](#rate-limiting)).
- **Helmet** security headers, strict Content-Security-Policy in production.
- Server-side input validation on every endpoint; the public tracking endpoint exposes customer-safe fields only (never internal notes, admin comments, or delay history).
- Firestore is only reachable through the server (Admin SDK); the client rules deny every direct read and write.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS (Tailwind CSS), vanilla JavaScript (no build step for JS) |
| Backend | Node.js + Express (ESM) |
| Database | [Firebase Firestore](https://firebase.google.com/docs/firestore) via the Admin SDK |
| Auth | `express-session` with a Firestore session store, `bcryptjs`, `express-rate-limit` |
| Email (optional) | `nodemailer` (no-op with a preview log when SMTP isn't configured) |
| Hosting | Vercel (serverless) or any Node host |

Firestore needs no schema: collections are created on the first write, and the composite indexes the queries rely on are declared in `firestore.indexes.json`.

---

## Requirements

- **Node.js 18.17+** (developed on Node 24). Check with `node --version`.
- npm (bundled with Node).
- A **Firebase project** (the free *Spark* plan is enough) with a service-account key.

No database server, no migrations, no environment-specific setup beyond a `.env` file.

---

## Setup

### 1. Create the Firebase project

1. Create a project in the [Firebase console](https://console.firebase.google.com/).
2. **Project settings → Service accounts → Generate new private key** and download the JSON file.
3. Copy the three values from it:

   | `.env` key | Where it comes from |
   |---|---|
   | `FIREBASE_PROJECT_ID` | `project_id` in the JSON |
   | `FIREBASE_CLIENT_EMAIL` | `client_email` in the JSON |
   | `FIREBASE_PRIVATE_KEY` | `private_key` in the JSON, wrapped in double quotes with `\n` line breaks |

   `FIREBASE_SETUP.md` walks through the same steps with screenshots of the console.

### 2. Configure the environment

```bash
# Windows (PowerShell):
Copy-Item .env.example .env
# macOS/Linux:
cp .env.example .env
```

Then fill in `.env`:

```dotenv
PORT=3999
NODE_ENV=development
SESSION_SECRET=<a long random string>
COOKIE_SECURE=false
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=<a strong password>
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

The private key must stay in **one line** with escaped `\n` — a real multi-line key breaks the environment parser.

### 3. Install, build and run

```bash
npm install
npm run build:css     # one-time (also available via npm run watch:css)
npm start             # http://localhost:3999
```

Then open:

- Website: http://localhost:3999
- Tracking: http://localhost:3999/track
- Admin login: http://localhost:3999/admin/login

The default administrator is created on the **first start** from `ADMIN_EMAIL` / `ADMIN_PASSWORD`; change the password afterwards under **Settings**.

### 4. Create the Firestore indexes

```bash
npm run indexes:create   # creates every composite index in firestore.indexes.json
npm run indexes:list     # shows what the database actually has
```

`npm run indexes:create` needs a service account with the *Cloud Datastore Index Admin* role (`roles/datastore.indexAdmin`). The script is idempotent: existing indexes are left alone. The app works without them, but the affected queries (`shipments` list, `comments`, `tracking_events`, delay history) fail with a "missing index" error.

### 5. Optional: demo data

```bash
npm run seed
```

inserts six clearly-labelled demo shipments (`DEMO-001`…`DEMO-006`) with timelines, comments and one delay. They are demo records, not real shipments — delete them from the dashboard when you are done.

---

## Rate limiting

Three budgets protect the app. They are configured in `server/app.js` and `server/routes/auth.js`.

| Scope | Limit | Window | Counter |
|---|---|---|---|
| All `/api` requests | 300 | 1 minute | in memory (per instance) |
| Public tracking (`POST /api/track`) | 60 | 1 minute | in memory (per instance) |
| Admin login, per **IP** | 20 | 15 minutes | **Firestore (shared)** |
| Admin login, per **account** | 8 failed | 15 minutes | **Firestore (shared)** |

The login budgets live in Firestore because the in-memory store is per process: on Vercel every warm instance has its own counters, so a brute-force attempt would get `limit` tries *per instance*. The IP budget is checked first, so a spray across many accounts only touches one counter instead of one counter per account, and a **successful** login is given back (`skipSuccessfulRequests`), so only real failures add up.

The public budgets deliberately stay in memory. A Firestore write per tracked request would burn the free daily write quota and let a scraper take the whole app down.

Details worth knowing:

- **Namespaces.** Counters are namespaced by environment (`development` / `preview` / `production`, from `RATE_LIMIT_NAMESPACE`, `VERCEL_ENV` or `NODE_ENV`), so a local run or a failing test can never lock the real admin out.
- **Quota protection.** A key that is already over its limit is remembered locally for a minute, so a flood of blocked requests costs no Firestore writes.
- **Availability.** If Firestore cannot be reached the store falls back to an in-process counter instead of failing the request with a 500.
- **Cleanup.** Expired counters are swept at boot and by the daily cron; a Firestore TTL policy can be enabled on the `rate_limits` collection as well.

To clear the login counters (for example after the admin got locked out):

```bash
npm run rate-limits:reset
```

It only clears the counters of the current namespace. A running server may keep answering "blocked" for up to a minute from its local cache; restart it to make the reset instant.

---

## Development

```bash
npm run dev        # Tailwind watcher + node --watch server/index.js
```

Windows helpers:

```powershell
.\restart-server.ps1   # graceful restart of the server on port 3999
.\smoke-test.ps1       # end-to-end checks: pages, auth, CSRF, create/track/delete
```

`smoke-test.ps1` logs in with the credentials from `.env`, creates a throwaway shipment, tracks it publicly and deletes it again. It expects the server to be running and prints `RESULT: 19 passed, 0 failed`.

> The login limiter allows 8 failed attempts per 15 minutes per account and the counters live in Firestore, so they survive a restart of the server. Run `npm run rate-limits:reset` if the smoke test starts answering `429`.

### npm scripts

| Script | What it does |
|---|---|
| `npm start` | Runs the server (`server/index.js`) |
| `npm run dev` | Server with `--watch` plus the Tailwind watcher |
| `npm run build:css` / `npm run watch:css` | Builds / watches `public/css/styles.css` |
| `npm run seed` | Inserts the demo shipments and the default admin |
| `npm run indexes:create` | Creates the composite indexes from `firestore.indexes.json` |
| `npm run indexes:list` | Lists the indexes that exist (`-- --prune=<collectionGroup>` removes them) |
| `npm run rate-limits:reset` | Clears the shared login counters of the current namespace |
| `npm run migrate:firestore` | One-off import of a legacy embedded-Postgres dump into Firestore |

---

## Environment variables

See `.env.example` for the full list. Key values:

| Variable | Purpose |
|---|---|
| `PORT` | Port to listen on (default `3000`; the shipped `.env` sets `3999`). |
| `NODE_ENV` | `development` or `production`. |
| `SESSION_SECRET` | Long random string used to sign session cookies. **Change in production.** |
| `COOKIE_SECURE` | `true` when serving over HTTPS (sets the Secure flag on cookies). |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | Default admin created on the first start / by the seed script. |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Firestore credentials (Admin SDK). |
| `FIRESTORE_DATABASE_ID` | Optional second (named) database; empty means `(default)`. |
| `FIREBASE_STORAGE_BUCKET` | Optional bucket for file attachments (Blaze plan only). |
| `RATE_LIMIT_NAMESPACE` | Overrides the namespace of the shared rate-limit counters. |
| `CRON_SECRET` | Bearer token for `/api/cron/*`. Empty means loopback requests only. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `MAIL_FROM` | Optional email. Leave `SMTP_HOST` empty to disable sending (events are logged instead). |

---

## Data model

Firestore collections (see `COLLECTIONS` in `server/db/firestore.js`):

| Collection | Contents |
|---|---|
| `admins` | Admin accounts (`email`, `password_hash`, `role`, `last_login_at`). |
| `shipments` | The shipments, their status, estimates and addresses. |
| `tracking_events` | Timeline entries of a shipment. |
| `comments` | Customer-visible and internal comments. |
| `delivery_estimate_history` | Previous delivery estimates (delay management). |
| `activity_logs` | Audit trail (logins, shipment changes, …). |
| `sessions` | Server-side sessions (`express-session` store). |
| `rate_limits` | Shared rate-limit counters (see [Rate limiting](#rate-limiting)). |

Numeric ids are kept stable through a `_counters` collection, so imported rows never collide with new ones.

---

## API overview

Public (no auth):
- `POST /api/track` — body `{ tracking }` → customer-safe shipment + events + comments + countdown metadata.
- `GET /api/track/:tracking` — same, by URL.
- `GET /api/constants` — non-sensitive constants for the UI.

Auth:
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password`

Admin (session required; CSRF required on writes):
- `GET /api/admin/dashboard`, `/constants`, `/shipments`, `/shipments/:id`
- `POST /api/admin/shipments` — create
- `PUT /api/admin/shipments/:id` — edit
- `PATCH /api/admin/shipments/:id/status` — update status
- `PATCH /api/admin/shipments/:id/delay` — change delivery estimate (records history)
- `POST /api/admin/shipments/:id/comments` — add comment (customer/internal)
- `PATCH /api/admin/shipments/:id/archive`, `DELETE /api/admin/shipments/:id`
- `GET /api/admin/shipments/delayed`, `/recipients`, `/reports`, `/activity`

Maintenance (bearer token or loopback only):
- `GET /api/cron/purge-sessions` — removes expired sessions
- `GET /api/cron/purge-rate-limits` — removes expired rate-limit counters
- `GET /api/cron/purge-maintenance` — both of the above (this is what the daily cron calls)

---

## Project structure

```
.
├── api/index.js            # Vercel serverless entry point (exports the app)
├── server/
│   ├── app.js              # Express app: middleware, routes, error handling
│   ├── index.js            # Local/self-hosted entry point (listen + graceful shutdown)
│   ├── seed.js             # Demo data seeder (npm run seed)
│   ├── db/
│   │   ├── firestore.js    # Firestore adapter (collections, rows, counters, transactions)
│   │   └── schema.js       # Boot-time checks (credentials, id counters)
│   ├── lib/
│   │   ├── constants.js    # Statuses, reasons, categories
│   │   ├── tracking.js     # Tracking-number generation + validation
│   │   ├── shipments.js    # Business logic (CRUD, status, delay, comments, tracking)
│   │   ├── auth.js         # Password hashing + Firestore session store + requireAuth
│   │   ├── csrf.js         # CSRF token middleware
│   │   ├── validate.js     # Server-side input validation
│   │   ├── rate-limit-store.js  # Firestore-backed rate-limit store
│   │   ├── sessions.js     # Session housekeeping
│   │   ├── storage.js      # Firebase Storage helper (optional attachments)
│   │   ├── mailer.js       # Optional email (nodemailer)
│   │   ├── notify.js       # Notification triggers
│   │   └── activity.js     # Audit logging
│   └── routes/
│       ├── auth.js         # /api/auth/* (login, logout, me, change-password)
│       ├── admin.js        # /api/admin/* (protected)
│       ├── public.js       # /api/* (tracking + constants)
│       └── cron.js         # /api/cron/* (maintenance)
├── public/                 # Frontend (served statically)
│   ├── index.html, track.html, tracking.html, tracking-details.html,
│   │   customs.html, services.html, about.html, contact.html, 404.html
│   ├── admin/ (login.html, dashboard.html)
│   ├── css/styles.css      # Generated by Tailwind (git-ignored; run build:css)
│   └── js/ (shared.js, home.js, track.js, tracking-details.js, services.js, contact.js, admin.js, admin-login.js)
├── scripts/                # indexes:create / indexes:list / rate-limits:reset / migration
├── src/input.css           # Tailwind source (custom components/utilities)
├── firestore.rules         # deny-all client rules (the server uses the Admin SDK)
├── firestore.indexes.json  # the composite indexes the queries need
├── vercel.json             # build, routing, serverless config, daily cron
└── package.json
```

---

## Deployment

The app runs unchanged on Vercel (serverless) or on any Node host.

### Vercel

1. Import the repository. The build command is `npm run build:css` (from `vercel.json`).
2. Add the environment variables of `.env` to the project (Production **and** Preview), most importantly:

   ```
   NODE_ENV=production
   SESSION_SECRET=<long random string>
   COOKIE_SECURE=true
   ADMIN_EMAIL=…  ADMIN_PASSWORD=…
   FIREBASE_PROJECT_ID=…  FIREBASE_CLIENT_EMAIL=…  FIREBASE_PRIVATE_KEY=…
   CRON_SECRET=<random token>
   ```

   `FIREBASE_PRIVATE_KEY` must be pasted with `\n` line breaks, exactly as in `.env`.
3. Deploy. `vercel.json` routes every request to `api/index.js` and serves `public/` from the CDN.
4. The daily cron (`0 3 * * *`) calls `/api/cron/purge-maintenance`; Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set.

### Any Node host

```bash
npm ci --omit=dev
npm run build:css
NODE_ENV=production SESSION_SECRET=… COOKIE_SECURE=true node server/index.js
```

Put it behind a reverse proxy (Nginx/Caddy) that terminates TLS, and run `node server/index.js` under a process manager.

---

## Tracking number format

Tracking numbers are generated server-side and are unique. Format:

```
SWN 1234 5678 901 C
│   │            │
│   │            └── service code (letter)
│   └────────────── 10 random digits + Luhn check digit
└────────────────── brand prefix "SWN"
```

Stored without spaces (e.g. `SWN12345678901C`). Input is **case-insensitive** and ignores spaces/dashes. Invalid numbers return a clear error. This is an original format, not any real carrier's identifier.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Firebase is not configured` at boot | `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` are missing or the key was pasted with real line breaks instead of `\n`. |
| `The query requires an index` | Run `npm run indexes:create` (the error message contains the exact command). |
| Login returns `429` | The account used up its 8 failed attempts (or the IP its 20). Run `npm run rate-limits:reset` and restart the server. |
| Public pages are slow | Every request hits Firestore. Check the network path to `firestore.googleapis.com` and that the composite indexes exist. |
| `Port 3999 is already in use` | Another instance is running: `.\restart-server.ps1` stops it first. |
| Emails are never sent | `SMTP_HOST` is empty (sending is disabled and the mail is only logged). |

---

## License

MIT (sample project). Replace the demo credentials, set a real `SESSION_SECRET`, and use a strong admin password before any real use.
