# SwiftNova Global Express

A complete, production-style **delivery & shipment tracking platform** — a professional courier website with a customer-facing tracking experience and a secure admin dashboard, backed by a real persistent database and a Node.js/Express backend.

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
- Server-side sessions (stored in Postgres), **bcrypt** password hashing.
- **CSRF** protection (double-submit token) on all state-changing requests.
- **Rate limiting** on login and API routes, **Helmet** security headers.
- Server-side input validation on every endpoint; the public tracking endpoint exposes customer-safe fields only (never internal notes, admin comments, or delay history).

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS (Tailwind CSS), vanilla JavaScript (no build step for JS) |
| Backend | Node.js + Express |
| Database | PostgreSQL via [`@electric-sql/pglite`](https://pglite.dev) (embedded, persistent — no separate DB install) |
| Auth | `express-session` + custom PGlite store, `bcryptjs`, `express-rate-limit` |
| Email (optional) | `nodemailer` (no-op with a preview log when SMTP isn't configured) |

The database persists to `data/pgdata` on disk, so data survives server restarts and is available across devices.

---

## Requirements

- **Node.js 18.17+** (developed on Node 24). Check with `node --version`.
- npm (bundled with Node).

No separate database server, no environment-specific setup beyond a `.env` file.

---

## Quick start (local)

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
#    Windows (PowerShell):
Copy-Item .env.example .env
#    macOS/Linux:
cp .env.example .env

# 3. Build the CSS (one-time; also available via npm run watch:css)
npm run build:css

# 4. (Optional) Seed realistic demo shipments + a default admin
npm run seed

# 5. Start the server
npm start
```

Then open:

- Website: http://localhost:3999
- Tracking: http://localhost:3999/track
- Admin login: http://localhost:3999/admin/login

> The shipped `.env` uses `PORT=3999` to avoid clashing with other local apps
> (e.g. Next.js dev servers) that commonly occupy port 3000. Change `PORT` in
> `.env` if you prefer a different port.

### Verifying the install (Windows PowerShell)

```powershell
.\restart-server.ps1   # graceful restart of the server on port 3999
.\smoke-test.ps1       # end-to-end checks: pages, auth, CSRF, create/track/delete
```

`smoke-test.ps1` logs in with the credentials from `.env`, creates a throwaway
shipment, tracks it publicly, and deletes it again. It expects the server to be
running.

> The login endpoint allows 8 attempts per 15 minutes per email, and the smoke
> test uses 2 of them. Run `.\restart-server.ps1` before the test if you have
> been signing in repeatedly (the limiter is in-memory, so a restart clears it).

### Development mode (auto-reload server + CSS watch)

```bash
npm run dev
```

This runs the Tailwind watcher and the Node server (with `--watch`) together.

---

## Default admin & demo data

On first run the app creates a default administrator using the credentials set in your `.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).

> Set strong values in `.env` **before** seeding, and change the password after your first login via **Settings**.

Running `npm run seed` also inserts six clearly-labeled demo shipments (internal references `DEMO-001`…`DEMO-006`) with timelines, comments, and one delay — useful for testing. **These are demo records, not real shipments.** Delete the `data/` folder to reseed from scratch.

---

## Environment variables

See `.env.example` for the full list. Key values:

| Variable | Purpose |
|---|---|
| `PORT` | Port to listen on (default `3000`; the shipped `.env` sets `3999`). |
| `NODE_ENV` | `development` or `production`. |
| `SESSION_SECRET` | Long random string used to sign session cookies. **Change in production.** |
| `COOKIE_SECURE` | `true` when serving over HTTPS (sets the Secure flag on cookies). |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | Default admin created on first run / by the seed script. |
| `PGDATA_DIR` | Directory for the embedded database (default `./data/pgdata`). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `MAIL_FROM` | Optional email. Leave `SMTP_HOST` empty to disable sending (events are logged instead). |


---

## Project structure

```
.
├── server/
│   ├── index.js            # App entry: middleware, routes, static, error handling
│   ├── seed.js             # Demo data seeder (npm run seed)
│   ├── db/
│   │   ├── pool.js         # PGlite connection + query helpers
│   │   └── schema.js       # SQL schema (tables, constraints, indexes)
│   ├── lib/
│   │   ├── constants.js    # Statuses, reasons, categories
│   │   ├── tracking.js     # Tracking-number generation + validation
│   │   ├── shipments.js    # Business logic (CRUD, status, delay, comments, tracking)
│   │   ├── auth.js         # Password hashing + PGlite session store + requireAuth
│   │   ├── csrf.js         # CSRF token middleware
│   │   ├── validate.js     # Server-side input validation
│   │   ├── mailer.js       # Optional email (nodemailer)
│   │   ├── notify.js       # Notification triggers
│   │   └── activity.js     # Audit logging
│   └── routes/
│       ├── auth.js         # /api/auth/* (login, logout, me, change-password)
│       ├── admin.js        # /api/admin/* (protected)
│       └── public.js       # /api/* (tracking + constants)
├── public/                 # Frontend (served statically)
│   ├── index.html, track.html, tracking.html, tracking-details.html,
│   │   customs.html, services.html, about.html, contact.html, 404.html
│   ├── admin/ (login.html, dashboard.html)
│   ├── css/styles.css      # Generated by Tailwind (git-ignored; run build:css)
│   └── js/ (shared.js, home.js, track.js, tracking-details.js, services.js, contact.js, admin.js, admin-login.js)
├── src/input.css           # Tailwind source (custom components/utilities)
├── tailwind.config.js
├── .env.example
└── package.json
```

---

## Pages

| Route | File | Purpose |
|---|---|---|
| `/` | `index.html` | Homepage with the tracking form |
| `/track` | `track.html` | Tracking landing page (form forwards to `/tracking?t=…`) |
| `/tracking?t=…` | `tracking.html` | Live tracking results (timeline, countdown, updates) |
| `/tracking/details?t=…` | `tracking-details.html` | Waybill-style package details |
| `/customs` | `customs.html` | Customs clearance information |
| `/services`, `/about`, `/contact` | matching files | Static content pages |
| `/admin/login`, `/admin` | `admin/login.html`, `admin/dashboard.html` | Admin auth and dashboard |

Legacy `/track?t=…` links redirect to `/tracking?t=…`.

---

## Tracking number format

Tracking numbers are generated server-side and are unique (enforced by a database `UNIQUE` constraint). Format:

```
SWN 1234 5678 901 C
│   │            │
│   │            └── service code (letter)
│   └────────────── 10 random digits + Luhn check digit
└────────────────── brand prefix "SWN"
```

Stored without spaces (e.g. `SWN12345678901C`). Input is **case-insensitive** and ignores spaces/dashes. Invalid numbers return a clear error. This is an original format, not any real carrier's identifier.

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

---

## Deployment notes

1. Set `NODE_ENV=production`, a strong `SESSION_SECRET`, and `COOKIE_SECURE=true` (serve behind HTTPS).
2. Run `npm install --omit=dev`, `npm run build:css`, and `npm run seed` (optional).
3. The embedded database lives in `PGDATA_DIR`. Back up that directory to persist data. For multi-instance deployments, move to a hosted PostgreSQL (the query layer uses standard SQL; only `server/db/pool.js` needs to change to `node-postgres`).
4. Put the app behind a reverse proxy (Nginx/Caddy) terminating TLS.

---

## License

MIT (sample project). Replace the demo credentials and configure a production secret before any real use.

