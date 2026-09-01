/**
 * Browser-side Openverse search.
 *
 * Hosting IPs are often served a Cloudflare challenge by api.openverse.org
 * ("Just a moment..."). Gutenberg and the IMGVerse WordPress plugin search
 * from the user's browser instead; this app does the same. Proxy/download
 * of full-size files still go through the server (Flickr/Wikimedia/etc.).
 *
 * @package IMGverse-Search
 * @since   1.0.33
 */

'use strict';

export const OPENVERSE_ENDPOINT = 'https://api.openverse.org/v1/images/';
export const OPENVERSE_ANON_PAGE_SIZE = 20;

/**
 * Cap page size to Openverse's anonymous maximum.
 *
 * @param {number|string} pageSize Requested page size.
 * @returns {number} Page size between 1 and 20.
 */
export function capPageSize(pageSize) {
  const size = parseInt(pageSize, 10);
  if (!size || size < 1) return 1;
  return Math.min(OPENVERSE_ANON_PAGE_SIZE, size);
}

/**
 * Map a raw Openverse result to the canonical ImageResult shape.
 *
 * @param {object} raw Openverse result item.
 * @returns {object|null} Canonical image or null.
 */
export function mapOpenverseItem(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const id = raw.id || '';
  const full = raw.url || '';
  const thumb = raw.thumbnail || full;
  if (!id || !full) return null;

  return {
    id:        `openverse-${id}`,
    provider:  'openverse',
    thumb,
    full,
    width:     Number(raw.width) || 0,
    height:    Number(raw.height) || 0,
    alt:       raw.title || '',
    credit:    raw.creator || '',
    creditUrl: raw.creator_url || '',
    license:   raw.license || '',
    sourceUrl: raw.foreign_landing_url || '',
  };
}

/**
 * Build a user-facing error from a failed Openverse HTTP body.
 *
 * @param {number} status HTTP status.
 * @param {string} body   Raw response body.
 * @returns {string} Error message.
 */
export function messageFromFailedOpenverse(status, body) {
  const code = Number(status) || 0;
  const text = String(body || '');

  if (
    code === 403
    && /just a moment|cf-browser-verification|cloudflare/i.test(text)
  ) {
    return 'Openverse HTTP 403: Cloudflare is blocking this network from api.openverse.org.';
  }

  try {
    const data = JSON.parse(text);
    if (data && typeof data === 'object') {
      const detail = data.detail || data.error || data.message;
      if (typeof detail === 'string' && detail) {
        return `Openverse HTTP ${code}: ${detail}`;
      }
    }
  } catch {
    // Use stripped HTML / plain text below.
  }

  const plain = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);

  return `Openverse HTTP ${code}: ${plain || 'Empty response'}`;
}

/**
 * Whether the current provider filter should include a browser Openverse call.
 *
 * @param {string} providerFilter Active provider pill value.
 * @returns {boolean}
 */
export function shouldFetchOpenverse(providerFilter) {
  return !providerFilter || providerFilter === 'openverse';
}

/**
 * Client-side orientation filter (Openverse has no native orientation param).
 *
 * @param {object[]} results
 * @param {string}   orientation '' | 'landscape' | 'portrait' | 'square'
 * @returns {object[]}
 */
export function filterByOrientation(results, orientation) {
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
 * Mix Openverse into server results at ~1/5 share (four server, one Openverse).
 *
 * @param {unknown[]} serverResults
 * @param {unknown[]} openverseResults
 * @returns {unknown[]}
 */
export function weaveOpenverse(serverResults, openverseResults) {
  const server = Array.isArray(serverResults) ? serverResults : [];
  const extra  = Array.isArray(openverseResults) ? openverseResults : [];
  const out = [];
  let i = 0;
  let j = 0;

  while (i < server.length || j < extra.length) {
    for (let k = 0; k < 4 && i < server.length; k++) {
      out.push(server[i++]);
    }
    if (j < extra.length) {
      out.push(extra[j++]);
    }
  }

  return out;
}

/**
 * Combined pagination: another page exists if either source has more.
 *
 * @param {boolean} serverHasNext
 * @param {boolean} openverseHasNext
 * @returns {boolean}
 */
export function mergeHasNext(serverHasNext, openverseHasNext) {
  return Boolean(serverHasNext) || Boolean(openverseHasNext);
}

/**
 * Search Openverse from the browser.
 *
 * @param {object}   params
 * @param {string}   params.q
 * @param {number}   [params.page]
 * @param {number}   [params.pageSize]
 * @param {string}   [params.orientation]
 * @param {Function} [params.fetchImpl]
 * @returns {Promise<{ images: object[], hasNext: boolean, error: string }>}
 */
export async function searchOpenverse({
  q,
  page = 1,
  pageSize = OPENVERSE_ANON_PAGE_SIZE,
  orientation = '',
  fetchImpl = globalThis.fetch,
}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const size = capPageSize(pageSize);
  const url = new URL(OPENVERSE_ENDPOINT);

  url.searchParams.set('q', q || '');
  url.searchParams.set('page', String(pageNum));
  url.searchParams.set('page_size', String(size));

  try {
    const res = await fetchImpl(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    const text = await res.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch {
      return {
        images: [],
        hasNext: false,
        error: messageFromFailedOpenverse(res.status, text),
      };
    }

    if (res.status !== 200 || !data || !Array.isArray(data.results)) {
      return {
        images: [],
        hasNext: false,
        error: messageFromFailedOpenverse(res.status, text),
      };
    }

    const images = filterByOrientation(
      data.results.map(mapOpenverseItem).filter(Boolean),
      orientation
    );
    const pageCount = Number(data.page_count) || 0;
    const hasNext = pageCount > 0 ? pageNum < pageCount : images.length >= size;

    return { images, hasNext, error: '' };
  } catch (err) {
    return {
      images: [],
      hasNext: false,
      error: err?.message || 'Openverse search failed.',
    };
  }
}
