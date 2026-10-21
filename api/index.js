// api/index.js
// Vercel serverless entry point. Vercel calls this function for every request
// that is not served directly as a static asset. It simply hands off to the
// same Express app used locally.

import { app } from '../server/app.js';

export default app;
