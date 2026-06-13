// =============================================================================
// src/providers/index.js
// IMGverse Search — Provider aggregator (Search Controller).
// Dynamically loads all active providers, fans out to all simultaneously
// via Promise.all, merges results, and shuffles for interleaving.
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
 * Search all active providers simultaneously and return merged results.
 * A provider is "active" if it either needs no key or its key is present in env.
 * Failed providers return empty arrays — they never crash the whole search.
 *
 * @param {string}   query     - Search term.
 * @param {number}   page      - Page number (1-indexed).
 * @param {string[]} [filter]  - Optional provider whitelist e.g. ['pexels','unsplash'].
 * @returns {Promise<object[]>} Shuffled, merged array of canonical ImageResult objects.
 */
export async function searchAll(query, page = 1, filter = []) {
  const all = [
    { name: 'openverse',   fn: openverse   },
    { name: 'inaturalist', fn: inaturalist },
    { name: 'unsplash',    fn: unsplash    },
    { name: 'pexels',      fn: pexels      },
    { name: 'pixabay',     fn: pixabay     },
  ];

  // If a filter list is supplied, restrict to those providers only
  const active = filter.length
    ? all.filter((p) => filter.includes(p.name))
    : all;

  // Fan out to all providers concurrently — individual failures return []
  const settled = await Promise.allSettled(
    active.map((p) => p.fn(query, page))
  );

  // Flatten all fulfilled results into a single array
  const merged = settled.flatMap((r) =>
    r.status === 'fulfilled' ? r.value : []
  );

  // Shuffle so providers are interleaved, not grouped
  return shuffle(merged);
}
