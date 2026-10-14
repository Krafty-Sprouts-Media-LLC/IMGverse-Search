/**
 * Shared image shape / orientation rules.
 *
 * Used by the server (providers/index.js) and the browser
 * (openverse-client.js) so both sides agree on what "landscape",
 * "portrait" and "square" mean. Browser-safe: no Node imports.
 *
 * @package SISE
 * @since   1.0.36
 */

'use strict';

export const LANDSCAPE_MIN_RATIO = 1.15;
export const PORTRAIT_MAX_RATIO = 0.87;

const ORIENTATIONS = new Set(['landscape', 'portrait', 'square']);

/**
 * Classify an image by its width / height ratio.
 *
 * @param {number} width
 * @param {number} height
 * @returns {''|'landscape'|'portrait'|'square'} Empty string when size is unknown.
 */
export function shapeOf(width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (!w || !h) return '';
  const ratio = w / h;
  if (ratio > LANDSCAPE_MIN_RATIO) return 'landscape';
  if (ratio < PORTRAIT_MAX_RATIO) return 'portrait';
  return 'square';
}

/**
 * Whether an image fits the requested orientation.
 * Unknown sizes and unknown orientation values always match.
 *
 * @param {{ width?: number, height?: number }} img
 * @param {string} orientation '' | 'landscape' | 'portrait' | 'square'
 * @returns {boolean}
 */
export function matchesOrientation(img, orientation) {
  if (!ORIENTATIONS.has(orientation)) return true;
  const shape = shapeOf(img?.width, img?.height);
  return !shape || shape === orientation;
}

/**
 * Keep only results that fit the requested orientation.
 *
 * @param {object[]} results
 * @param {string}   orientation
 * @returns {object[]}
 */
export function filterByOrientation(results, orientation) {
  if (!orientation) return results;
  return results.filter((img) => matchesOrientation(img, orientation));
}

/** Images shorter than this on their long edge are flagged and skipped by auto-pick. */
export const MIN_LONG_EDGE = 1000;

/**
 * @param {{ width?: number, height?: number }} img
 * @returns {boolean} True only when the size is known and below MIN_LONG_EDGE.
 */
export function isSmall(img) {
  const w = Number(img?.width) || 0;
  const h = Number(img?.height) || 0;
  return Boolean(w && h) && Math.max(w, h) < MIN_LONG_EDGE;
}

/**
 * Index of the image to pre-select: first of the requested shape that is
 * big enough; otherwise the first image; null when there are none.
 *
 * @param {object[]} images
 * @param {string}   orientation
 * @returns {number|null}
 */
export function autoPick(images, orientation) {
  if (!images.length) return null;
  const i = images.findIndex((img) => {
    const shape = shapeOf(img.width, img.height);
    return (!orientation || shape === orientation) && !isSmall(img);
  });
  return i === -1 ? 0 : i;
}
