// =============================================================================
// src/routes/search.js
// IMGverse Search — GET /api/search route.
// Checks Redis cache first, then fans out to all providers via searchAll.
// Caches results for 1 hour to respect provider rate limits.
//
// @package IMGverse-Search
// @since   1.0.0
// =============================================================================

'use strict';

import { Router } from 'express';
import { searchAll } from '../providers/index.js';
import { get, set } from '../cache.js';

const router = Router();

const VALID_ORIENTATIONS = new Set(['landscape', 'portrait', 'square']);

/**
 * GET /api/search
 *
 * Query params:
 *   q           {string}  Search term (required)
 *   page        {number}  Page number, default 1
 *   providers   {string}  Comma-separated provider filter e.g. "pexels,unsplash"
 *   orientation {string}  "landscape" | "portrait" | "square" (optional)
 */
router.get('/', async (req, res) => {
  const q = (req.query.q || '').trim();

  if (!q) {
    return res.status(400).json({ error: 'Query parameter "q" is required.' });
  }

  const page        = parseInt(req.query.page, 10) || 1;
  const providers   = req.query.providers
    ? req.query.providers.split(',').map((p) => p.trim().toLowerCase())
    : [];
  const orientation = VALID_ORIENTATIONS.has(req.query.orientation)
    ? req.query.orientation
    : '';

  const cacheKey = `imgverse:search:${q}:${page}:${providers.sort().join(',')}:${orientation}`;

  // Cache hit — return instantly
  const cached = await get(cacheKey);
  if (cached) {
    return res.json({ ...cached, cached: true });
  }

  // Cache miss — fan out to all providers
  const results = await searchAll(q, page, providers, orientation);

  const payload = { total: results.length, page, orientation, results };

  // Cache for 1 hour
  await set(cacheKey, payload, 3600);

  return res.json(payload);
});

export default router;
