// =============================================================================
// src/server.js
// IMGverse Search — Express application entry point.
// Mounts all routes, serves public/ as static files.
//
// @package IMGverse-Search
// @since   1.0.0
// =============================================================================

'use strict';

import dns from 'node:dns';
import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import searchRouter from './routes/search.js';
import proxyRouter from './routes/proxy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Prefer IPv4 — many Docker/VPS hosts have broken IPv6 routes that cause
// silent fetch failures (empty err.message) when proxying CDN images.
dns.setDefaultResultOrder('ipv4first');

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(express.json());

// Serve static files from public/
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/api/search', searchRouter);
app.use('/proxy', proxyRouter);

// Health check — used by Docker healthcheck and nginx
app.get('/healthz', (_req, res) => {
  res.status(200).send('ok');
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`[IMGverse] Server running on port ${PORT}`);
});
