// =============================================================================
// src/providers/unsplash.js
// SISE — Unsplash provider adapter.
// Requires UNSPLASH_KEY env var. Free tier: 50 req/hour.
// AVIF/WebP/JPEG — served natively from the provider CDN (no conversion).
// Docs: https://unsplash.com/documentation
//
// @package SISE
// @since   1.0.0
// =============================================================================

'use strict';

import fetch from 'node-fetch';
import { normalize } from '../utils.js';

const BASE = 'https://api.unsplash.com/search/photos';

// Unsplash API guidelines: every link back to Unsplash carries the app name.
const UTM = { utm_source: 'sise', utm_medium: 'referral' };

// Only this exact endpoint shape is ever called with our key (see trackDownload).
const DOWNLOAD_PATH = /^\/photos\/[A-Za-z0-9_-]+\/download$/;

/** Add Unsplash's required referral params to a link. */
function withUtm(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    for (const [k, v] of Object.entries(UTM)) parsed.searchParams.set(k, v);
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Tell Unsplash a photo was downloaded (required by their API guidelines).
 * `downloadLocation` arrives from the browser, so only an https
 * api.unsplash.com /photos/<id>/download URL is ever requested — anything else
 * would let a caller aim our API key at another host.
 *
 * @param {string} downloadLocation - `links.download_location` from the search result.
 * @param {object} [options]        - { fetchImpl }
 * @returns {Promise<boolean>} True when Unsplash accepted the ping.
 */
export async function trackDownload(downloadLocation, { fetchImpl = fetch } = {}) {
  if (!process.env.UNSPLASH_KEY) return false;

  let url;
  try {
    url = new URL(downloadLocation);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'api.unsplash.com' || !DOWNLOAD_PATH.test(url.pathname)) {
    return false;
  }

  try {
    const res = await fetchImpl(url, {
      headers: { Authorization: `Client-ID ${process.env.UNSPLASH_KEY}`, 'Accept-Version': 'v1' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error(`[SISE/unsplash] download tracking HTTP ${res.status} for ${url.pathname}`);
    return res.ok;
  } catch (err) {
    console.error(`[SISE/unsplash] download tracking failed for ${url.pathname}:`, err.message);
    return false;
  }
}

/**
 * Search Unsplash for images matching the given query.
 * Returns empty array if UNSPLASH_KEY is not set.
 *
 * @param {string} query       - Search term.
 * @param {number} page        - Page number (1-indexed).
 * @param {string} orientation - '' | 'landscape' | 'portrait' | 'square'
 * @param {object} [options]   - { onResponse(res), onError(err), fetchImpl } — used by the rate budget and tests.
 * @returns {Promise<object[]>} Array of canonical ImageResult objects.
 */
export async function search(query, page = 1, orientation = '', { onResponse, onError, fetchImpl = fetch } = {}) {
  if (!process.env.UNSPLASH_KEY) return [];

  try {
    // Unsplash uses 'squarish' for square; map our canonical value
    const orientMap = { landscape: 'landscape', portrait: 'portrait', square: 'squarish' };
    const params = new URLSearchParams({ query, page, per_page: 20 });
    if (orientation && orientMap[orientation]) params.set('orientation', orientMap[orientation]);
    const res = await fetchImpl(`${BASE}?${params}`, {
      headers: {
        Authorization: `Client-ID ${process.env.UNSPLASH_KEY}`,
        'Accept-Version': 'v1',
      },
      signal: AbortSignal.timeout(8000),
    });
    onResponse?.(res);

    if (!res.ok) {
      console.error(`[SISE/unsplash] HTTP ${res.status} for q="${query}"`);
      return [];
    }

    const data = await res.json();
    return (data.results || []).map((item) =>
      normalize({
        id:        item.id,
        provider:  'unsplash',
        thumbUrl:  item.urls.regular,   // 1080px — right-click Save As gives a full usable image
        fullUrl:   item.urls.full,       // max resolution for the "Open full image" button
        width:     item.width,
        height:    item.height,
        alt:       item.alt_description || item.description || '',
        credit:    item.user?.name || '',
        creditUrl: withUtm(item.user?.links?.html),
        license:   'Unsplash License',
        sourceUrl: withUtm(item.links?.html),
        downloadLocation: item.links?.download_location || '',
      })
    );
  } catch (err) {
    console.error(`[SISE/unsplash] search failed for q="${query}":`, err.message);
    onError?.(err);
    return [];
  }
}
