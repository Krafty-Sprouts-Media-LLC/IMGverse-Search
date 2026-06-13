// =============================================================================
// src/providers/unsplash.js
// IMGverse Search — Unsplash provider adapter.
// Requires UNSPLASH_KEY env var. Free tier: 50 req/hour.
// AVIF problem is solved automatically by the /proxy route (sharp converts to JPEG).
// Docs: https://unsplash.com/documentation
//
// @package IMGverse-Search
// @since   1.0.0
// =============================================================================

'use strict';

import fetch from 'node-fetch';
import { normalize } from '../utils.js';

const BASE = 'https://api.unsplash.com/search/photos';

/**
 * Search Unsplash for images matching the given query.
 * Returns empty array if UNSPLASH_KEY is not set.
 *
 * @param {string} query - Search term.
 * @param {number} page  - Page number (1-indexed).
 * @returns {Promise<object[]>} Array of canonical ImageResult objects.
 */
export async function search(query, page = 1) {
  if (!process.env.UNSPLASH_KEY) return [];

  try {
    const params = new URLSearchParams({ query, page, per_page: 20 });
    const res = await fetch(`${BASE}?${params}`, {
      headers: {
        Authorization: `Client-ID ${process.env.UNSPLASH_KEY}`,
        'Accept-Version': 'v1',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];

    const data = await res.json();
    return (data.results || []).map((item) =>
      normalize({
        id:        item.id,
        provider:  'unsplash',
        thumbUrl:  item.urls.small,
        fullUrl:   item.urls.full,
        width:     item.width,
        height:    item.height,
        alt:       item.alt_description || item.description || '',
        credit:    item.user?.name || '',
        creditUrl: item.user?.links?.html || '',
        license:   'Unsplash License',
        sourceUrl: item.links?.html || '',
      })
    );
  } catch {
    return [];
  }
}
