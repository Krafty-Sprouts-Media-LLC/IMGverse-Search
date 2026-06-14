// =============================================================================
// src/utils.js
// IMGverse Search — Shared utility functions.
// Provides URL encoding helpers and the canonical ImageResult normalizer
// so every provider adapter returns a consistent object shape.
//
// @package IMGverse-Search
// @since   1.0.0
// =============================================================================

'use strict';

/**
 * Pexels/Unsplash CDNs use content negotiation: modern browsers send
 * Accept: image/avif and get AVIF back even when the URL ends in .jpeg.
 * Windows then shows AVIF on Save As. Provider-supported fix: fm=jpg param.
 *
 * @param {string} url - Provider CDN URL.
 * @returns {string}   - URL with JPEG format param where applicable.
 */
export function ensureJpegUrl(url) {
  if (!url) return url;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname;

    if (host.includes('pexels.com') || host.includes('unsplash.com')) {
      if (!parsed.searchParams.has('fm')) {
        parsed.searchParams.set('fm', 'jpg');
      }
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Build a proxied URL pointing to our /proxy endpoint.
 * Used for the "Open full image" flow only — grid thumbnails load direct CDN URLs.
 *
 * @param {string} rawUrl    - Original provider image URL.
 * @param {string} [fmt]     - Output format hint ('jpg' or 'webp'). Default 'jpg'.
 * @returns {string}         - Internal proxy URL e.g. /proxy?url=...&fmt=jpg
 */
export function proxyUrl(rawUrl, fmt = 'jpg') {
  return `/proxy?url=${encodeURIComponent(rawUrl)}&fmt=${fmt}`;
}

/**
 * Shuffle an array in-place using Fisher-Yates algorithm.
 * Used to interleave results from multiple providers rather than batching them.
 *
 * @template T
 * @param {T[]} arr - Array to shuffle.
 * @returns {T[]}   - The same array, shuffled.
 */
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Round-robin interleave multiple arrays.
 * Preserves each array's internal order (relevance ranking) while
 * mixing sources so results don't appear in provider blocks.
 *
 * Example: interleave([[A1,A2],[B1,B2],[C1]]) → [A1,B1,C1,A2,B2]
 *
 * @param {Array[]} groups - Array of arrays to interleave.
 * @returns {Array}        - Interleaved flat array.
 */
export function interleave(groups) {
  const result  = [];
  const maxLen  = Math.max(0, ...groups.map((g) => g.length));
  for (let i = 0; i < maxLen; i++) {
    for (const group of groups) {
      if (i < group.length) result.push(group[i]);
    }
  }
  return result;
}

/**
 * Stable dedupe key for the same image across providers or pages.
 * Uses hostname + pathname so query params (fm=jpg etc.) do not matter.
 *
 * @param {object} image - Canonical ImageResult.
 * @returns {string}
 */
export function dedupeKey(image) {
  const raw = image.full || image.thumb || '';
  try {
    const parsed = new URL(raw);
    return `${parsed.hostname}${parsed.pathname}`.toLowerCase();
  } catch {
    return image.id || '';
  }
}

/**
 * Remove duplicate images (same CDN file or same id).
 *
 * @param {object[]} results - Interleaved search results.
 * @returns {object[]}
 */
export function dedupeResults(results) {
  const seen = new Set();
  return results.filter((img) => {
    const key = dedupeKey(img);
    if (!key || seen.has(key) || seen.has(img.id)) return false;
    seen.add(key);
    seen.add(img.id);
    return true;
  });
}

/**
 * Normalize a raw provider result into the canonical ImageResult shape.
 * Every provider adapter MUST call this before returning results.
 *
 * Canonical ImageResult shape:
 * {
 *   id:         string  — "<provider>-<originalId>"
 *   provider:   string  — lowercase provider name
 *   thumb:      string  — direct CDN URL (JPEG on Pexels/Unsplash via fm=jpg)
 *   full:       string  — direct CDN full-res URL (JPEG on Pexels/Unsplash via fm=jpg)
 *   width:      number
 *   height:     number
 *   alt:        string  — accessible description
 *   credit:     string  — photographer/author name
 *   creditUrl:  string  — link to author profile
 *   license:    string  — licence name
 *   sourceUrl:  string  — link to original image page
 * }
 *
 * @param {object} fields - Raw fields from the provider.
 * @returns {object}      - Canonical ImageResult object.
 */
export function normalize({
  id,
  provider,
  thumbUrl,
  fullUrl,
  width = 0,
  height = 0,
  alt = '',
  credit = '',
  creditUrl = '',
  license = '',
  sourceUrl = '',
}) {
  return {
    id:        `${provider}-${id}`,
    provider,
    thumb:     ensureJpegUrl(thumbUrl),
    full:      ensureJpegUrl(fullUrl),
    width,
    height,
    alt,
    credit,
    creditUrl,
    license,
    sourceUrl,
  };
}
