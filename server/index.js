// server/index.js
// Local / self-hosted entry point. Builds the Express app from app.js and
// listens on a port. Vercel deployment uses api/index.js instead, which
// imports the same app without listening.

import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

import { app, bootstrap, setShutdownToken, setShutdownHandler } from './app.js';
import { closeFirestore } from './db/firestore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

// Fail fast if Firestore is misconfigured, rather than on the first request.
await bootstrap();

// Dev-only graceful restart hook used by restart-server.ps1. Force-killing a
// running server can leave in-flight requests unfinished, so the script asks
// the process to shut down cleanly instead. Loopback + per-run token only.
const shutdownToken = crypto.randomBytes(24).toString('hex');
const shutdownTokenFile = path.join(projectRoot, 'data', 'shutdown.token');
if (!isProd) {
  setShutdownToken(shutdownToken);
  setShutdownHandler((reason) => gracefulShutdown(reason));
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(`http://${net.address}:${PORT}`);
    }
  }
  return out;
}

const server = app.listen(PORT, '0.0.0.0', () => {
  console.info(`\n  Express Delivery`);
  console.info(`  ------------------------------------------`);
  console.info(`  Server running:  http://localhost:${PORT}`);
  console.info(`  Admin login:     http://localhost:${PORT}/admin/login`);
  const lan = lanAddresses();
  if (lan.length) {
    console.info('  On your network: ' + lan.join(', '));
  }
  console.info(`  Data store:      Firebase Firestore`);
  console.info(`  Environment:     ${NODE_ENV}\n`);

  if (!isProd) {
    try {
      // The folder holds the dev-only shutdown token; create it if it is gone
      // (a fresh clone has no "data" directory at all).
      fs.mkdirSync(path.dirname(shutdownTokenFile), { recursive: true });
      fs.writeFileSync(shutdownTokenFile, shutdownToken);
    } catch (err) {
      console.warn('[server] Could not write shutdown token:', err.message);
    }
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n  Port ${PORT} is already in use by another application.\n` +
        `  Set a different port in .env (PORT=4000) and start again.\n`
    );
  } else {
    console.error('[server error]', err);
  }
  process.exit(1);
});

async function gracefulShutdown(signal) {
  console.info(`\n  Received ${signal}. Shutting down...`);
  server.close();
  try {
    await closeFirestore();
    console.info('  Firestore connection closed cleanly.');
  } catch (err) {
    console.error('[db] Error closing Firestore:', err.message);
  }
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { gracefulShutdown(signal); });
}
