# Firebase setup for SwiftNova Global Express

The site now stores **everything** in **Cloud Firestore**: shipments, the
tracking timeline, comments, admin accounts, sessions and the audit log. That
means the admin dashboard and the customer tracking page work from any device
— laptop, phone, a second computer — as long as they can reach the internet.

You said you already have a Firebase project. The steps below take about five
minutes and end with the site running against your own Firestore.

---

## 1. Create the Firestore database

1. Go to <https://console.firebase.google.com> and open your project.
2. In the left menu choose **Build → Firestore Database**.
3. Click **Create database**.
4. Choose **Production mode** (this site never reads Firestore from the
   browser — the server does every read and write — so locking it down costs
   nothing).
5. Pick the region closest to you (for example *europe-west1*).
6. Click **Enable**.

---

## 2. Create the service account key

The server talks to Firestore as an administrator using a *service account*.

1. Click the gear icon (**Project settings**) → **Service accounts**.
2. Click **Generate new private key** → **Generate key**.
3. A JSON file downloads. Keep it safe — it is a full key to your project.
4. Open it and copy three values into your `.env`:

```env
FIREBASE_PROJECT_ID=my-project-123456
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-abcde@my-project-123456.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
```

Notes that save a lot of time:

* `FIREBASE_CLIENT_EMAIL` is the value that ends in `.iam.gserviceaccount.com`
  in the JSON file (the field is called `client_email`).
* `FIREBASE_PRIVATE_KEY` **must stay inside double quotes** and the newlines
  must be written as the two characters `\n`, exactly as the JSON file has them.
* `FIREBASE_PROJECT_ID` is the `project_id` field from the JSON file.

---

## 3. Install the Firebase command line tools

The indexes this site needs have to be deployed once from your machine:

```powershell
npm install -g firebase-tools
firebase login          # opens a browser and signs you in
firebase use --add      # pick your project, accept the default alias "default"
```

Then deploy the rules and indexes:

```powershell
firebase deploy --only firestore
```

This installs:

* `firestore.rules` — locks the database down so only the server can read it.
* `firestore.indexes.json` — the 13 composite indexes the admin list, the
  reports and the timeline queries use.

If you skip this step the site still runs: the server detects the missing
index, sorts in memory instead, and logs a message. Deploying the indexes
makes it fast and cheap instead.

---

## 4. Move your existing data into Firestore

Your old data lives in the embedded PostgreSQL inside `data/pgdata`. Copy it
into the cloud so nothing is lost:

```powershell
# 1. Stop the running server (this shuts it down cleanly)
.\restart-server.ps1
#    or, if the server is already stopped, skip ahead

# 2. Copy the data
npm run migrate:firestore

# 3. Start the server again
.\restart-server.ps1
```

The migration copies every table (`admins`, `shipments`, `tracking_events`,
`comments`, `delivery_estimate_history`, `activity_logs`, `sessions`) and
**keeps the original numeric ids**, so links like
`/admin/shipments/12` and the admin login you already use all still work.

The script is safe to run twice — re-running it just overwrites with the same
values.

---

## 5. Run it

```powershell
.\restart-server.ps1
```

You should see this in `boot.log`:

```
[db] Firestore ready (project: my-project-123456)
```

Sign in at <http://localhost:3999/admin/login> with the same
`ADMIN_EMAIL` / `ADMIN_PASSWORD` as before, and your shipments, history and
comments are all there — now in the cloud.

---

## Testing locally without touching your cloud data

If you want to try the whole thing without writing anything to your real
project, the Firebase emulator keeps everything in a local folder:

```powershell
npm install --save-dev firebase-tools
npx firebase emulators:start --only firestore --project demo-swiftnova
```

Then, in a second terminal, start the app with the emulator host set:

```powershell
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:FIREBASE_PROJECT_ID='demo-swiftnova'
node server/index.js
```

`demo-` prefixed project ids are recognised by Firebase as "never touch the
production database", which makes this safe to experiment with. Emulator data
lives in `firebase-debug.log` and a `firestore-debug.log` — you can delete
those freely.

---

## What changed in the code

| Area | Before | Now |
| --- | --- | --- |
| Database | PGlite (embedded Postgres in `data/pgdata`) | Cloud Firestore |
| Sessions | `sessions` table | `sessions` collection |
| Schema | `server/db/schema.js` created tables | `server/db/schema.js` checks connectivity + id counters |
| Data access | SQL strings via `server/db/pool.js` | `server/db/firestore.js` (document reads/writes) |
| Cascade deletes | Postgres `ON DELETE CASCADE` | Explicit delete of child rows in `server/lib/shipments.js` |
| Ids | Postgres `SERIAL` | Counter documents in `_counters` |

The old PGlite code is untouched in `data/pgdata` and is only read by
`npm run migrate:firestore`, so you can still point the migration at it later.
Everything else — the HTML pages, the admin UI, the tracking page, the
customs page, emails — works exactly as before.

---

## Good to know

* **Where to see the data:** Firebase console → **Build → Firestore
  Database**. Collections are `shipments`, `tracking_events`, `comments`,
  `admins`, `sessions`, `activity_logs`, `delivery_estimate_history`.
* **Costs:** the free tier (Spark plan) is generous for a site of this size;
  Firestore charges per document read, and the dashboard reads are small.
* **Deleting demo data:** delete the documents in the `shipments` collection
  in the console (or run `npm run seed` on an empty database to create fresh
  demo shipments).
* **A new computer:** nothing to install besides the project itself — the data
  is already in the cloud.
* **Next step, if you want it:** Firebase Storage would let the admin upload
  proof-of-delivery photos and customs documents. Say the word and I will add
  the upload UI and the storage bucket.
