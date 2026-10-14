// =============================================================================
// src/routes/search.js
// IMGverse Search — GET /api/search route.
// Fans out to all providers via searchAll, which caches per provider and
// applies rate budgets; the response reports each provider's status.
//
// @package IMGverse-Search
// @since   1.0.0
// =============================================================================

'use strict';

import { Router } from 'express';
import { searchAll } from '../providers/index.js';

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

  const { results, providerStatus } = await searchAll(q, page, providers, orientation);

  return res.json({
    total:   results.length,
    page,
    orientation,
    results,
    hasNext: results.length >= 10,
    providerStatus,
  });
});

export default router;
