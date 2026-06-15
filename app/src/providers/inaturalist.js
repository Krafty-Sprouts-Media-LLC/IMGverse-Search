// =============================================================================
// src/providers/inaturalist.js
// IMGverse Search — iNaturalist provider adapter.
// Free, no API key required. Excellent for nature and wildlife photography.
// Docs: https://api.inaturalist.org/v1/
//
// @package IMGverse-Search
// @since   1.0.0
// =============================================================================

'use strict';

import fetch from 'node-fetch';
import { normalize } from '../utils.js';

const BASE = 'https://api.inaturalist.org/v1/observations';

/**
 * Search iNaturalist observations with photos for the given query.
 *
 * @param {string} query - Search term.
 * @param {number} page  - Page number (1-indexed).
 * @returns {Promise<object[]>} Array of canonical ImageResult objects.
 */
export async function search(query, page = 1) {
  try {
    const params = new URLSearchParams({
      q: query,
      page,
      per_page: 20,
      photos: true,
      order: 'votes',
      order_by: 'votes',
    });

    const res = await fetch(`${BASE}?${params}`, {
      headers: { 'User-Agent': 'IMGverse-Search/1.0' },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const results = [];

    for (const obs of data.results || []) {
      for (const photo of obs.photos || []) {
        const thumbUrl = photo.url?.replace('square', 'large') || photo.url;     // 1024px — right-click Save As gives a usable image
        const fullUrl  = photo.url?.replace('square', 'original') || photo.url;  // original resolution for "Open full image" button

        if (!thumbUrl) continue;

        results.push(
          normalize({
            id:        photo.id,
            provider:  'inaturalist',
            thumbUrl,
            fullUrl,
            width:     0,
            height:    0,
            alt:       obs.species_guess || obs.taxon?.name || 'Nature photo',
            credit:    obs.user?.login || '',
            creditUrl: obs.user ? `https://www.inaturalist.org/people/${obs.user.login}` : '',
            license:   photo.license_code || 'cc',
            sourceUrl: `https://www.inaturalist.org/observations/${obs.id}`,
          })
        );
      }
    }

    // iNaturalist returns up to `per_page` observations, but each observation can
    // contain many photos. Cap the provider at 20 image results per page so the
    // overall "20 per provider" limit is honoured.
    return results.slice(0, 20);
  } catch {
    return [];
  }
}
