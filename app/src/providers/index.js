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
//   - Providers without (Openverse, iNaturalist) are filtered client-side
//     by aspect ratio after results are returned.
//
// @package IMGverse-Search
// @since   1.0.0
// =============================================================================

'use strict';

import { search as flickr      } from './flickr.js';
import { search as wikimedia   } from './wikimedia.js';
import { search as openverse   } from './openverse.js';
import { search as inaturalist } from './inaturalist.js';
import { search as unsplash    } from './unsplash.js';
import { search as pexels      } from './pexels.js';
import { search as pixabay     } from './pixabay.js';
import { interleave, dedupeResults } from '../utils.js';

// Providers that accept an orientation param natively in their API
const NATIVE_ORIENTATION = new Set(['unsplash', 'pexels', 'pixabay']);

/**
 * Client-side orientation filter for providers that don't support it natively.
 * Images with unknown dimensions (0) are included rather than excluded.
 *
 * Thresholds:
 *   landscape  w/h > 1.15
 *   portrait   w/h < 0.87
 *   square     0.87 ≤ w/h ≤ 1.15
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
 * Results are interleaved round-robin per provider so that:
 *   - Each provider's top relevance result appears near the top of the feed
 *   - No single provider dominates a page
 *   - Random shuffling (which destroyed relevance order) is no longer used
 *
 * A provider is "active" if it either needs no key or its env key is set.
 * Failed providers silently return [] and never crash the whole search.
 *
 * @param {string}   query        - Search term.
 * @param {number}   page         - Page number (1-indexed).
 * @param {string[]} [filter]     - Optional provider whitelist e.g. ['pexels','unsplash'].
 * @param {string}   [orientation]- '' | 'landscape' | 'portrait' | 'square'
 * @returns {Promise<object[]>} Interleaved array of canonical ImageResult objects.
 */
export async function searchAll(query, page = 1, filter = [], orientation = '') {
  const all = [
    { name: 'openverse',   fn: openverse   },
    { name: 'wikimedia',   fn: wikimedia   },
    { name: 'flickr',      fn: flickr      },
    { name: 'inaturalist', fn: inaturalist },
    { name: 'unsplash',    fn: unsplash    },
    { name: 'pexels',      fn: pexels      },
    { name: 'pixabay',     fn: pixabay     },
  ];

  const active = filter.length
    ? all.filter((p) => filter.includes(p.name))
    : all;

  // Fan out to all providers concurrently
  const settled = await Promise.allSettled(
    active.map((p) =>
      NATIVE_ORIENTATION.has(p.name)
        ? p.fn(query, page, orientation)   // pass orientation natively
        : p.fn(query, page)                // will be filtered below
    )
  );

  // Log rejected providers (fulfilled adapters log their own HTTP/network errors)
  settled.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(
        `[IMGverse/providers] ${active[i]?.name} rejected for q="${query}":`,
        result.reason?.message || result.reason
      );
    }
  });

  // Collect each provider's results as a separate group (preserving order)
  const groups = settled.map((r) =>
    r.status === 'fulfilled' ? r.value : []
  );

  // Log when a provider returns zero results (helps diagnose silent API failures)
  groups.forEach((group, i) => {
    if (group.length === 0) {
      console.warn(`[IMGverse/providers] ${active[i]?.name} returned 0 results for q="${query}" page=${page}`);
    }
  });

  // Client-side orientation filter for non-native providers
  const filtered = groups.map((group, i) =>
    NATIVE_ORIENTATION.has(active[i]?.name)
      ? group
      : filterByOrientation(group, orientation)
  );

  // Round-robin interleave — provider 1 top result, provider 2 top result, …
  // then provider 1 second result, provider 2 second result, …
  // This keeps each provider's relevance ranking intact while mixing sources.
  return dedupeResults(interleave(filtered));
}
