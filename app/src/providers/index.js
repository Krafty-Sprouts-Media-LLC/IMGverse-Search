// =============================================================================
// src/providers/index.js
// IMGverse Search — Provider aggregator (Search Controller).
// Fans out to all active providers simultaneously via Promise.all,
// then interleaves results round-robin to preserve each provider's
// internal relevance ranking while mixing sources.
//
// Orientation support:
//   - Providers with native support (Unsplash, Pexels, Pixabay) receive
//     the param in their API request.
//   - Providers without (iNaturalist) are filtered client-side
//     by aspect ratio after results are returned.
//
// @package IMGverse-Search
// @since   1.0.0
// =============================================================================

'use strict';

import { search as inaturalist } from './inaturalist.js';
import { search as unsplash    } from './unsplash.js';
import { search as pexels      } from './pexels.js';
import { search as pixabay     } from './pixabay.js';
import { interleave, dedupeResults } from '../utils.js';

/** Each provider returns up to this many results per page. */
export const RESULTS_PER_PROVIDER = 20;

// Providers that accept an orientation param natively in their API
const NATIVE_ORIENTATION = new Set(['unsplash', 'pexels', 'pixabay']);

/**
 * Client-side orientation filter for providers that don't support it natively.
 *
 * @param {object[]} results     - Canonical ImageResult array.
 * @param {string}   orientation - '' | 'landscape' | 'portrait' | 'square'
 * @returns {object[]}
 */
function filterByOrientation(results, orientation) {
  if (!orientation) return results;
  return results.filter(({ width, height }) => {
    if (!width || !height) return true;
    const ratio = width / height;
    if (orientation === 'landscape') return ratio > 1.15;
    if (orientation === 'portrait')  return ratio < 0.87;
    if (orientation === 'square')    return ratio >= 0.87 && ratio <= 1.15;
    return true;
  });
}

/**
 * Search all active providers simultaneously and return interleaved results.
 *
 * @param {string}   query        - Search term.
 * @param {number}   page         - Page number (1-indexed).
 * @param {string[]} [filter]     - Optional provider whitelist.
 * @param {string}   [orientation]- '' | 'landscape' | 'portrait' | 'square'
 * @returns {Promise<object[]>} Interleaved, deduplicated ImageResult array.
 */
export async function searchAll(query, page = 1, filter = [], orientation = '') {
  const all = [
    { name: 'inaturalist', fn: inaturalist },
    { name: 'unsplash',    fn: unsplash    },
    { name: 'pexels',      fn: pexels      },
    { name: 'pixabay',     fn: pixabay     },
  ];

  const active = filter.length
    ? all.filter((p) => filter.includes(p.name))
    : all;

  const settled = await Promise.allSettled(
    active.map((p) =>
      NATIVE_ORIENTATION.has(p.name)
        ? p.fn(query, page, orientation)
        : p.fn(query, page)
    )
  );

  settled.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(
        `[IMGverse/providers] ${active[i]?.name} rejected for q="${query}":`,
        result.reason?.message || result.reason
      );
    }
  });

  const groups = settled.map((r) =>
    r.status === 'fulfilled' ? r.value : []
  );

  groups.forEach((group, i) => {
    if (group.length === 0) {
      console.warn(`[IMGverse/providers] ${active[i]?.name} returned 0 results for q="${query}" page=${page}`);
    }
  });

  const filtered = groups.map((group, i) =>
    NATIVE_ORIENTATION.has(active[i]?.name)
      ? group
      : filterByOrientation(group, orientation)
  );

  return dedupeResults(interleave(filtered));
}
