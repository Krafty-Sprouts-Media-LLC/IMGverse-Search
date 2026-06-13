// =============================================================================
// src/providers/pexels.js
// IMGverse Search — Pexels provider adapter.
// Requires PEXELS_KEY env var. Free tier: 200 req/hour.
// Docs: https://www.pexels.com/api/documentation/
//
// @package IMGverse-Search
// @since   1.0.0
// =============================================================================

'use strict';

import fetch from 'node-fetch';
import { normalize } from '../utils.js';

const BASE = 'https://api.pexels.com/v1/search';

/**
 * Search Pexels for images matching the given query.
 * Returns empty array if PEXELS_KEY is not set.
 *
 * @param {string} query       - Search term.
 * @param {number} page        - Page number (1-indexed).
 * @param {string} orientation - '' | 'landscape' | 'portrait' | 'square'
 * @returns {Promise<object[]>} Array of canonical ImageResult objects.
 */
export async function search(query, page = 1, orientation = '') {
  if (!process.env.PEXELS_KEY) return [];

  try {
    // Pexels supports orientation natively with the same names (landscape/portrait/square)
    const params = new URLSearchParams({ query, page, per_page: 20 });
    if (orientation) params.set('orientation', orientation);
    const res = await fetch(`${BASE}?${params}`, {
      headers: { Authorization: process.env.PEXELS_KEY },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];

    const data = await res.json();
    return (data.photos || []).map((item) =>
      normalize({
        id:        item.id,
        provider:  'pexels',
        thumbUrl:  item.src.large2x,      // 1880px — right-click Save As gives a usable image
        fullUrl:   item.src.original,    // max resolution for "Open full image" button
        width:     item.width,
        height:    item.height,
        alt:       item.alt || '',
        credit:    item.photographer || '',
        creditUrl: item.photographer_url || '',
        license:   'Pexels License',
        sourceUrl: item.url || '',
      })
    );
  } catch {
    return [];
  }
}
