// =============================================================================
// src/providers/inaturalist.js
// SISE — iNaturalist provider adapter.
// Free, no API key required. Excellent for nature and wildlife photography.
// Docs: https://api.inaturalist.org/v1/
//
// @package SISE
// @since   1.0.0
// =============================================================================

'use strict';

import fetch from 'node-fetch';
import { normalize } from '../utils.js';
import { formatLicence } from '../../public/image-meta.js';

const BASE = 'https://api.inaturalist.org/v1/observations';

/**
 * Search iNaturalist observations with photos for the given query.
 *
 * @param {string} query - Search term.
 * @param {number} page  - Page number (1-indexed).
 * @param {string} _orientation - Ignored: iNaturalist has no orientation filter; the aggregator filters results.
 * @param {object} [options]    - { onResponse(res), onError(err), fetchImpl } — used by the rate budget and tests.
 * @returns {Promise<object[]>} Array of canonical ImageResult objects.
 */
export async function search(query, page = 1, _orientation = '', { onResponse, onError, fetchImpl = fetch } = {}) {
  try {
    const params = new URLSearchParams({
      q: query,
      page,
      per_page: 20,
      photos: true,
      order: 'votes',
      order_by: 'votes',
    });

    const res = await fetchImpl(`${BASE}?${params}`, {
      headers: { 'User-Agent': 'SISE/2.0' },
      signal: AbortSignal.timeout(8000),
    });
    onResponse?.(res);

    if (!res.ok) {
      console.error(`[SISE/inaturalist] HTTP ${res.status} for q="${query}"`);
      return [];
    }

    const data = await res.json();
    return mapObservations(data.results);
  } catch (err) {
    console.error(`[SISE/inaturalist] search failed for q="${query}":`, err.message);
    onError?.(err);
    return [];
  }
}

/**
 * Map iNaturalist observations to canonical ImageResult objects.
 *
 * iNaturalist returns up to `per_page` observations, but each observation can
 * contain many photos. Cap the provider at 20 image results per page so the
 * overall "20 per provider" limit is honoured.
 *
 * @param {object[]} observations - `results` array from the observations API.
 * @returns {object[]} Canonical ImageResult array (max 20).
 */
export function mapObservations(observations) {
  const results = [];

  for (const obs of observations || []) {
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
          // Real size lets the orientation filter work; 0 = unknown (kept by every filter).
          width:     Number(photo.original_dimensions?.width) || 0,
          height:    Number(photo.original_dimensions?.height) || 0,
          alt:       obs.species_guess || obs.taxon?.name || 'Nature photo',
          credit:    obs.user?.login || '',
          creditUrl: obs.user ? `https://www.inaturalist.org/people/${obs.user.login}` : '',
          license:   formatLicence(photo.license_code),
          sourceUrl: `https://www.inaturalist.org/observations/${obs.id}`,
        })
      );
    }
  }

  return results.slice(0, 20);
}
