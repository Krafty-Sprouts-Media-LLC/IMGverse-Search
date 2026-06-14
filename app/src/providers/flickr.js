// =============================================================================
// src/providers/flickr.js
// IMGverse Search — Flickr provider adapter.
// Requires FLICKR_KEY env var. Searches CC-licensed photos only.
// Create a key: https://www.flickr.com/services/apps/create/
// Docs: https://www.flickr.com/services/api/flickr.photos.search.html
//
// @package IMGverse-Search
// @since   1.0.16
// =============================================================================

'use strict';

import fetch from 'node-fetch';
import { normalize } from '../utils.js';

const API = 'https://api.flickr.com/services/rest/';

/** CC and public-domain license IDs only. */
const CC_LICENSES = '4,5,6,9,10';

const LICENSE_NAMES = {
  4:  'CC BY',
  5:  'CC BY-SA',
  6:  'CC BY-ND',
  9:  'Public Domain',
  10: 'Public Domain',
};

/**
 * Search Flickr for CC-licensed photos matching the given query.
 * Returns empty array if FLICKR_KEY is not set.
 *
 * @param {string} query - Search term.
 * @param {number} page  - Page number (1-indexed).
 * @returns {Promise<object[]>} Array of canonical ImageResult objects.
 */
export async function search(query, page = 1) {
  if (!process.env.FLICKR_KEY) return [];

  try {
    const params = new URLSearchParams({
      method:          'flickr.photos.search',
      api_key:         process.env.FLICKR_KEY,
      text:            query,
      page:            String(page),
      per_page:        '20',
      format:          'json',
      nojsoncallback:  '1',
      license:         CC_LICENSES,
      content_type:    '1',
      media:           'photos',
      safe_search:     '1',
      extras:          'url_o,url_l,url_m,owner_name,license,description,path_alias,o_dims',
    });

    const res = await fetch(`${API}?${params}`, {
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.error(`[IMGverse/flickr] API returned HTTP ${res.status} for q="${query}" page=${page}`);
      return [];
    }

    const data = await res.json();

    if (data.stat !== 'ok') {
      console.error(`[IMGverse/flickr] API error for q="${query}":`, data.message || data.code);
      return [];
    }

    return (data.photos?.photo || [])
      .map((photo) => {
        const fullUrl  = photo.url_o || photo.url_l || photo.url_m;
        const thumbUrl = photo.url_m || photo.url_l || photo.url_o;
        if (!fullUrl || !thumbUrl) return null;

        const width  = parseInt(photo.o_width || photo.width, 10) || 0;
        const height = parseInt(photo.o_height || photo.height, 10) || 0;
        const path   = photo.path_alias || photo.owner;

        return normalize({
          id:        photo.id,
          provider:  'flickr',
          thumbUrl,
          fullUrl,
          width,
          height,
          alt:       photo.title || photo.description || '',
          credit:    photo.ownername || '',
          creditUrl: `https://www.flickr.com/photos/${path}/`,
          license:   LICENSE_NAMES[photo.license] || 'See Flickr',
          sourceUrl: `https://www.flickr.com/photos/${path}/${photo.id}/`,
        });
      })
      .filter(Boolean);
  } catch (err) {
    console.error(`[IMGverse/flickr] Search failed for q="${query}" page=${page}:`, err.message);
    return [];
  }
}
