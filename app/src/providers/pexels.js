// =============================================================================
// src/providers/pexels.js
// SISE — Pexels provider adapter.
// Requires PEXELS_KEY env var. Free tier: 200 req/hour.
// Docs: https://www.pexels.com/api/documentation/
//
// @package SISE
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
 * @param {object} [options]   - { onResponse(res), onError(err), fetchImpl } — used by the rate budget and tests.
 * @returns {Promise<object[]>} Array of canonical ImageResult objects.
 */
export async function search(query, page = 1, orientation = '', { onResponse, onError, fetchImpl = fetch } = {}) {
  if (!process.env.PEXELS_KEY) return [];

  try {
    // Pexels supports orientation natively with the same names (landscape/portrait/square)
    const params = new URLSearchParams({ query, page, per_page: 20 });
    if (orientation) params.set('orientation', orientation);
    const res = await fetchImpl(`${BASE}?${params}`, {
      headers: { Authorization: process.env.PEXELS_KEY },
      signal: AbortSignal.timeout(8000),
    });
    onResponse?.(res);

    if (!res.ok) {
      console.error(`[SISE/pexels] HTTP ${res.status} for q="${query}"`);
      return [];
    }

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
  } catch (err) {
    console.error(`[SISE/pexels] search failed for q="${query}":`, err.message);
    onError?.(err);
    return [];
  }
}
