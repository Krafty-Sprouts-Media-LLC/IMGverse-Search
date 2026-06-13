// =============================================================================
// src/providers/pixabay.js
// IMGverse Search — Pixabay provider adapter.
// Requires PIXABAY_KEY env var. Free tier: 100 req/hour.
// Docs: https://pixabay.com/api/docs/
//
// @package IMGverse-Search
// @since   1.0.0
// =============================================================================

'use strict';

import fetch from 'node-fetch';
import { normalize } from '../utils.js';

const BASE = 'https://pixabay.com/api/';

/**
 * Search Pixabay for images matching the given query.
 * Returns empty array if PIXABAY_KEY is not set.
 *
 * @param {string} query - Search term.
 * @param {number} page  - Page number (1-indexed).
 * @returns {Promise<object[]>} Array of canonical ImageResult objects.
 */
export async function search(query, page = 1) {
  if (!process.env.PIXABAY_KEY) return [];

  try {
    const params = new URLSearchParams({
      key:          process.env.PIXABAY_KEY,
      q:            query,
      page,
      per_page:     20,
      image_type:   'photo',
      safesearch:   true,
    });

    const res = await fetch(`${BASE}?${params}`, {
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];

    const data = await res.json();
    return (data.hits || []).map((item) =>
      normalize({
        id:        item.id,
        provider:  'pixabay',
        thumbUrl:  item.previewURL,
        fullUrl:   item.largeImageURL,
        width:     item.imageWidth,
        height:    item.imageHeight,
        alt:       item.tags || '',
        credit:    item.user || '',
        creditUrl: `https://pixabay.com/users/${item.user}-${item.user_id}/`,
        license:   'Pixabay License',
        sourceUrl: item.pageURL || '',
      })
    );
  } catch {
    return [];
  }
}
