// =============================================================================
// src/providers/openverse.js
// IMGverse Search — Openverse provider adapter.
// Free, no API key required. Returns CC-licensed content only.
// Docs: https://api.openverse.org/v1/
//
// @package IMGverse-Search
// @since   1.0.0
// =============================================================================

'use strict';

import fetch from 'node-fetch';
import { normalize } from '../utils.js';

const BASE = 'https://api.openverse.org/v1/images/';

/**
 * Search Openverse for images matching the given query.
 *
 * @param {string} query - Search term.
 * @param {number} page  - Page number (1-indexed).
 * @returns {Promise<object[]>} Array of canonical ImageResult objects.
 */
export async function search(query, page = 1) {
  try {
    const params = new URLSearchParams({ q: query, page, page_size: 20 });
    const res = await fetch(`${BASE}?${params}`, {
      headers: { 'User-Agent': 'IMGverse-Search/1.0' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error(`[IMGverse/openverse] API returned HTTP ${res.status} for q="${query}" page=${page}`);
      return [];
    }

    const data = await res.json();
    return (data.results || []).map((item) =>
      normalize({
        id:         item.id,
        provider:   'openverse',
        thumbUrl:   item.thumbnail || item.url,
        fullUrl:    item.url,
        width:      item.width || 0,
        height:     item.height || 0,
        alt:        item.title || '',
        credit:     item.creator || '',
        creditUrl:  item.creator_url || '',
        license:    item.license || '',
        sourceUrl:  item.foreign_landing_url || '',
      })
    );
  } catch (err) {
    console.error(`[IMGverse/openverse] Search failed for q="${query}" page=${page}:`, err.message);
    return [];
  }
}
