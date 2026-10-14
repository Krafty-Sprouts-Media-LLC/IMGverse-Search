// =============================================================================
// src/providers/index.js
// IMGverse Search — Provider aggregator (Search Controller).
// Fans out to all active providers simultaneously, then interleaves results
// round-robin to preserve each provider's relevance ranking.
//
// Per provider: serve the Redis-cached group if present; otherwise ask the
// rate budget (src/lib/rate-budget.js) whether the provider may be called,
// call it, feed the response into the budget, filter by orientation, and
// cache non-empty groups for an hour. Paused/failed providers are reported
// in `providerStatus` so the UI can say so.
//
// Orientation: providers with native support (Unsplash, Pexels, Pixabay)
// receive the param; every group is also filtered with the shared rules in
// public/image-shape.js (Pixabay has no native "square").
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
import { filterByOrientation } from '../../public/image-shape.js';
import { get as cacheGet, set as cacheSet } from '../cache.js';
import { createRateBudget, limitsFromEnv } from '../lib/rate-budget.js';

/** Each provider returns up to this many results per page. */
export const RESULTS_PER_PROVIDER = 20;

const CACHE_PREFIX = 'imgverse:search';

/**
 * Build a search function over the given providers.
 *
 * @param {object}   deps
 * @param {Array<{ name: string, search: Function, nativeOrientation: boolean }>} deps.providers
 * @param {object}   deps.budget      From createRateBudget().
 * @param {{ get: Function, set: Function }} deps.cache
 * @param {number}   [deps.ttlSeconds]
 * @returns {Function} searchAll(query, page, filter, orientation)
 */
export function createSearchAll({ providers, budget, cache, ttlSeconds = 3600 }) {
  /**
   * @param {string}   query
   * @param {number}   [page]
   * @param {string[]} [filter]      Provider whitelist.
   * @param {string}   [orientation] '' | 'landscape' | 'portrait' | 'square'
   * @returns {Promise<{ results: object[], providerStatus: object }>}
   */
  return async function searchAll(query, page = 1, filter = [], orientation = '') {
    const active = filter.length
      ? providers.filter((p) => filter.includes(p.name))
      : providers;
    const providerStatus = {};

    const groups = await Promise.all(active.map(async (p) => {
      const key = `${CACHE_PREFIX}:${p.name}:${query}:${page}:${orientation}`;

      const cached = await cache.get(key);
      if (Array.isArray(cached)) {
        providerStatus[p.name] = { status: 'ok', cached: true };
        return cached;
      }

      const gate = budget.canCall(p.name);
      if (!gate.ok) {
        const resumeAt = new Date(gate.resumeAt).toISOString();
        providerStatus[p.name] = { status: 'paused', resumeAt };
        console.warn(`[IMGverse/budget] ${p.name} paused until ${resumeAt}, skipped for q="${query}"`);
        return [];
      }

      budget.recordCall(p.name);
      let group;
      try {
        group = await p.search(query, page, p.nativeOrientation ? orientation : '', {
          onResponse: (res) => budget.observe(p.name, res.status, res.headers),
        });
      } catch (err) {
        console.error(`[IMGverse/providers] ${p.name} rejected for q="${query}":`, err?.message || err);
        providerStatus[p.name] = { status: 'error' };
        return [];
      }

      group = filterByOrientation(Array.isArray(group) ? group : [], orientation);

      if (group.length > 0) {
        await cache.set(key, group, ttlSeconds);
        providerStatus[p.name] = { status: 'ok' };
        return group;
      }

      const after = budget.canCall(p.name);
      providerStatus[p.name] = after.ok
        ? { status: 'ok' }
        : { status: 'paused', resumeAt: new Date(after.resumeAt).toISOString() };
      console.warn(`[IMGverse/providers] ${p.name} returned 0 results for q="${query}" page=${page}`);
      return group;
    }));

    return {
      results: dedupeResults(interleave(groups)),
      providerStatus,
    };
  };
}

/** Process-wide rate budget, shared by every search and /api/providers/status. */
export const budget = createRateBudget({ limits: limitsFromEnv() });

const PROVIDERS = [
  { name: 'inaturalist', search: inaturalist, nativeOrientation: false },
  { name: 'unsplash',    search: unsplash,    nativeOrientation: true  },
  { name: 'pexels',      search: pexels,      nativeOrientation: true  },
  { name: 'pixabay',     search: pixabay,     nativeOrientation: true  },
];

export const searchAll = createSearchAll({
  providers: PROVIDERS,
  budget,
  cache: { get: cacheGet, set: cacheSet },
});
