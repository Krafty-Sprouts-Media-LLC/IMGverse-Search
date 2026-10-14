// =============================================================================
// src/providers/index.js
// SISE — Provider aggregator (Search Controller).
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
// @package SISE
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

const CACHE_PREFIX = 'sise:search';

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
    const active = (filter.length ? providers.filter((p) => filter.includes(p.name)) : providers)
      .filter((p) => (p.configured ? p.configured() : true));
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
        console.warn(`[SISE/budget] ${p.name} paused until ${resumeAt}, skipped for q="${query}"`);
        return [];
      }

      budget.recordCall(p.name);
      // Adapters swallow their own failures and return []; these two hooks
      // let us tell "no images" apart from "provider failed".
      let lastStatus = 0;
      let reportedError = false;
      let group;
      try {
        group = await p.search(query, page, p.nativeOrientation ? orientation : '', {
          onResponse: (res) => {
            lastStatus = res.status;
            budget.observe(p.name, res.status, res.headers);
          },
          onError: () => { reportedError = true; },
        });
      } catch (err) {
        console.error(`[SISE/providers] ${p.name} rejected for q="${query}":`, err?.message || err);
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
      if (!after.ok) {
        providerStatus[p.name] = { status: 'paused', resumeAt: new Date(after.resumeAt).toISOString() };
      } else if (reportedError || lastStatus >= 400) {
        providerStatus[p.name] = { status: 'error' };
      } else {
        providerStatus[p.name] = { status: 'ok' };
        console.warn(`[SISE/providers] ${p.name} returned 0 results for q="${query}" page=${page}`);
      }
      return group;
    }));

    return {
      results: dedupeResults(interleave(groups)),
      providerStatus,
    };
  };
}

/**
 * Budget snapshot limited to providers that are configured (have their key).
 *
 * @param {object} budget
 * @param {Array<{ name: string, configured?: Function }>} providers
 * @returns {object}
 */
export function snapshotConfigured(budget, providers) {
  const snap = budget.snapshot();
  const out = {};
  for (const p of providers) {
    if (snap[p.name] && (p.configured ? p.configured() : true)) out[p.name] = snap[p.name];
  }
  return out;
}

/** Process-wide rate budget, shared by every search and /api/providers/status. */
export const budget = createRateBudget({ limits: limitsFromEnv() });

// `configured` keeps keyless providers out of searches, budgets and the UI.
export const PROVIDERS = [
  { name: 'inaturalist', search: inaturalist, nativeOrientation: false },
  { name: 'unsplash',    search: unsplash,    nativeOrientation: true, configured: () => Boolean(process.env.UNSPLASH_KEY) },
  { name: 'pexels',      search: pexels,      nativeOrientation: true, configured: () => Boolean(process.env.PEXELS_KEY) },
  { name: 'pixabay',     search: pixabay,     nativeOrientation: true, configured: () => Boolean(process.env.PIXABAY_KEY) },
];

export const searchAll = createSearchAll({
  providers: PROVIDERS,
  budget,
  cache: { get: cacheGet, set: cacheSet },
});
