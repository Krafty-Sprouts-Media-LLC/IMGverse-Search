// =============================================================================
// src/providers/index.js
// IMGverse Search — Provider aggregator (Search Controller).
// Fans out to all active providers simultaneously via Promise.all,
// merges and shuffles results. Supports orientation filtering:
//   - Providers with native support (Unsplash, Pexels, Pixabay) get the param
//   - Providers without (Openverse, iNaturalist) are filtered by aspect ratio
//
// @package IMGverse-Search
// @since   1.0.0
// =============================================================================

'use strict';

import { search as openverse   } from './openverse.js';
import { search as inaturalist } from './inaturalist.js';
import { search as unsplash    } from './unsplash.js';
import { search as pexels      } from './pexels.js';
import { search as pixabay     } from './pixabay.js';
import { shuffle } from '../utils.js';

/**
 * Client-side orientation filter for providers that don't support it natively.
 * Skips images where width/height are unknown (0) to avoid false negatives.
 *
 * @param {object[]} results     - Canonical ImageResult array.
 * @param {string}   orientation - '' | 'landscape' | 'portrait' | 'square'
 * @returns {object[]}
 */
function filterByOrientation(results, orientation) {
  if (!orientation) return results;

  return results.filter(({ width, height }) => {
    if (!width || !height) return true; // unknown — include rather than exclude
    const ratio = width / height;
    if (orientation === 'landscape') return ratio > 1.15;
    if (orientation === 'portrait')  return ratio < 0.87;
    if (orientation === 'square')    return ratio >= 0.87 && ratio <= 1.15;
    return true;
  });
}

/**
 * Search all active providers simultaneously and return merged results.
 * A provider is "active" if it either needs no key or its key is present in env.
 * Failed providers return empty arrays — they never crash the whole search.
 *
 * @param {string}   query        - Search term.
 * @param {number}   page         - Page number (1-indexed).
 * @param {string[]} [filter]     - Optional provider whitelist e.g. ['pexels','unsplash'].
 * @param {string}   [orientation]- '' | 'landscape' | 'portrait' | 'square'
 * @returns {Promise<object[]>} Shuffled, merged array of canonical ImageResult objects.
 */
export async function searchAll(query, page = 1, filter = [], orientation = '') {
  // Providers with native orientation param support
  const nativeOrientation = new Set(['unsplash', 'pexels', 'pixabay']);

  const all = [
    { name: 'openverse',   fn: openverse   },
    { name: 'inaturalist', fn: inaturalist },
    { name: 'unsplash',    fn: unsplash    },
    { name: 'pexels',      fn: pexels      },
    { name: 'pixabay',     fn: pixabay     },
  ];

  const active = filter.length
    ? all.filter((p) => filter.includes(p.name))
    : all;

  // Fan out concurrently — pass orientation to native supporters only
  const settled = await Promise.allSettled(
    active.map((p) =>
      nativeOrientation.has(p.name)
        ? p.fn(query, page, orientation)
        : p.fn(query, page)
    )
  );

  const merged = settled.flatMap((r) =>
    r.status === 'fulfilled' ? r.value : []
  );

  // Client-side fallback filter for non-native providers (Openverse, iNaturalist)
  const filtered = filterByOrientation(merged, orientation);

  return shuffle(filtered);
}
