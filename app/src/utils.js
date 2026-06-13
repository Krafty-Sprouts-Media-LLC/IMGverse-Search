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
 * Build a proxied URL pointing to our /proxy endpoint.
 * This rewrites ALL provider image URLs so they go through our server,
 * which solves CORS, AVIF→JPEG conversion, and the right-click Save-As flow.
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
 * Normalize a raw provider result into the canonical ImageResult shape.
 * Every provider adapter MUST call this before returning results.
 *
 * Canonical ImageResult shape:
 * {
 *   id:         string  — "<provider>-<originalId>"
 *   provider:   string  — lowercase provider name
 *   thumb:      string  — proxied thumbnail URL  (/proxy?url=...&fmt=jpg)
 *   full:       string  — proxied full-res URL    (/proxy?url=...&fmt=jpg)
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
    thumb:     proxyUrl(thumbUrl),
    full:      proxyUrl(fullUrl),
    width,
    height,
    alt,
    credit,
    creditUrl,
    license,
    sourceUrl,
  };
}
