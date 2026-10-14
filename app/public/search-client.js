/**
 * Shared search client: one call searches the server providers and
 * Openverse (browser-side) together and merges the results. Used by the
 * Search tab and, from Part 4, the Bulk keywords tab.
 *
 * @package SISE
 * @since   2.0.0
 */

'use strict';

import {
  mergeHasNext,
  searchOpenverse,
  shouldFetchOpenverse,
  weaveOpenverse,
} from './openverse-client.js?v=2.0.0';

/**
 * Stable key for the same image across pages (matches server dedupe logic).
 *
 * @param {object} img
 * @returns {string}
 */
export function imageKey(img) {
  const raw = img.full || img.thumb || '';
  try {
    const parsed = new URL(raw);
    return `${parsed.hostname}${parsed.pathname}`.toLowerCase();
  } catch {
    return img.id || '';
  }
}

/**
 * @param {object[]} results
 * @returns {object[]} Results without repeated images.
 */
export function dedupeClientResults(results) {
  const seen = new Set();
  return results.filter((img) => {
    const key = imageKey(img);
    if (!key || seen.has(key) || seen.has(img.id)) return false;
    seen.add(key);
    if (img.id) seen.add(img.id);
    return true;
  });
}

/**
 * Search the server providers via /api/search.
 *
 * @returns {Promise<{ results: object[], hasNext: boolean, providerStatus: object }>}
 */
export async function fetchServerSearch({ q, page = 1, provider = '', orientation = '', fetchImpl = globalThis.fetch }) {
  const params = new URLSearchParams({ q, page: String(page) });
  if (provider)    params.set('providers',   provider);
  if (orientation) params.set('orientation', orientation);

  const res  = await fetchImpl(`/api/search?${params}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Search failed');

  return {
    results:        Array.isArray(data.results) ? data.results : [],
    hasNext:        Boolean(data.hasNext),
    providerStatus: data.providerStatus || {},
  };
}

/**
 * Search any subset of providers. Never throws; failures are reported.
 *
 * @param {object}   params
 * @param {string}   params.q
 * @param {number}   [params.page]
 * @param {string}   [params.orientation]
 * @param {string[]|null} [params.serverProviders] null = all configured, [] = none.
 * @param {boolean}  [params.openverse]       Also search Openverse from the browser.
 * @param {Function} [params.fetchImpl]
 * @param {Function} [params.openverseSearch] Injected for tests; defaults to searchOpenverse.
 * @returns {Promise<{ results: object[], hasNext: boolean, providerStatus: object,
 *   openverseStatus: number|null, openverseError: string, serverError: string }>}
 *   `providerStatus.openverse` is 'paused' on HTTP 429, 'error' on other failures.
 */
export async function searchSources({
  q,
  page = 1,
  orientation = '',
  serverProviders = null,
  openverse = true,
  fetchImpl = globalThis.fetch,
  openverseSearch = searchOpenverse,
}) {
  const wantServer = serverProviders === null || serverProviders.length > 0;
  let serverError = '';

  const serverPromise = wantServer
    ? fetchServerSearch({ q, page, provider: (serverProviders || []).join(','), orientation, fetchImpl })
      .catch((err) => {
        serverError = err.message;
        console.error('[SISE/search]', err.message);
        return { results: [], hasNext: false, providerStatus: {} };
      })
    : Promise.resolve({ results: [], hasNext: false, providerStatus: {} });

  const openversePromise = openverse
    ? openverseSearch({ q, page, orientation, fetchImpl })
    : Promise.resolve(null);

  const [server, ov] = await Promise.all([serverPromise, openversePromise]);
  const providerStatus = { ...server.providerStatus };

  if (ov) {
    if (ov.error) console.error('[SISE/openverse]', ov.error);
    providerStatus.openverse = { status: ov.status === 429 ? 'paused' : (ov.error ? 'error' : 'ok') };
  }

  return {
    results:         dedupeClientResults(weaveOpenverse(server.results, ov ? ov.images : [])),
    hasNext:         mergeHasNext(server.hasNext, ov ? ov.hasNext : false),
    providerStatus,
    openverseStatus: ov ? ov.status : null,
    openverseError:  ov ? ov.error || '' : '',
    serverError,
  };
}

/**
 * Search tab: the provider pill decides the sources ('' = everything).
 *
 * @param {object}   params
 * @param {string}   params.q
 * @param {number}   [params.page]
 * @param {string}   [params.provider]    '' (all) | 'openverse' | a server provider
 * @param {string}   [params.orientation]
 * @param {Function} [params.fetchImpl]
 * @param {Function} [params.openverse]   Injected for tests; defaults to searchOpenverse.
 * @returns {Promise<{ results: object[], hasNext: boolean, openverseError: string, providerStatus: object }>}
 */
export async function searchAllSources({
  q,
  page = 1,
  provider = '',
  orientation = '',
  fetchImpl = globalThis.fetch,
  openverse = searchOpenverse,
}) {
  const out = await searchSources({
    q,
    page,
    orientation,
    serverProviders: provider === 'openverse' ? [] : (provider ? [provider] : null),
    openverse: shouldFetchOpenverse(provider),
    fetchImpl,
    openverseSearch: openverse,
  });
  const { openverse: _openverse, ...providerStatus } = out.providerStatus;
  return {
    results:        out.results,
    hasNext:        out.hasNext,
    openverseError: out.openverseError,
    providerStatus,
  };
}
