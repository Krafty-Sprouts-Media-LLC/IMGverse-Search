/**
 * Human-readable image metadata: provider names and the provider's own
 * text (title/description) plus photographer, for labels and tooltips.
 *
 * @package SISE
 * @since   2.0.2
 */

'use strict';

export const PROVIDER_NAMES = Object.freeze({
  openverse:   'Openverse',
  unsplash:    'Unsplash',
  pexels:      'Pexels',
  pixabay:     'Pixabay',
  inaturalist: 'iNaturalist',
  wikimedia:   'Wikimedia',
  flickr:      'Flickr',
});

/**
 * @param {string} provider
 * @returns {string} Display name, e.g. 'iNaturalist'.
 */
export function providerName(provider) {
  const key = String(provider || '');
  if (!key) return 'Unknown provider';
  return PROVIDER_NAMES[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Providers whose images carry a per-image Creative Commons licence that has
 * to be named (CC BY / BY-SA ...). Their licence is shown on the card and in
 * the downloaded file's caption; the stock providers' own licences need neither.
 */
export const LICENCE_PROVIDERS = new Set(['wikimedia', 'inaturalist', 'openverse']);

/**
 * Write a licence code as people read it: ('by-sa', '4.0') → "CC BY-SA 4.0",
 * 'cc-by-nc' → "CC BY-NC", 'cc0' → "CC0".
 *
 * @param {string} [code]    e.g. 'by-sa' (Openverse), 'cc-by-nc' (iNaturalist).
 * @param {string} [version] e.g. '4.0' (Openverse only).
 * @returns {string} Empty when the code is blank, generic ('cc') or unknown.
 */
export function formatLicence(code, version = '') {
  const norm = String(code || '').trim().toLowerCase().replace(/^cc[-_ ]?/, '');
  if (norm === '0' || norm === 'zero') return 'CC0';
  if (String(code || '').trim().toLowerCase() === 'pdm') return 'Public Domain Mark';
  if (!/^by(-nc)?(-sa|-nd)?$/.test(norm)) return '';
  return `CC ${norm.toUpperCase()}${version ? ` ${String(version).trim()}` : ''}`;
}

/**
 * The provider's title/description for an image, tidied.
 *
 * @param {{ alt?: string }} img
 * @returns {string} Empty when the provider sent none.
 */
export function imageTitle(img) {
  return String(img?.alt || '').replace(/\s+/g, ' ').trim();
}

/**
 * One line: “Title” · Photographer · Provider (missing parts left out).
 *
 * @param {{ alt?: string, credit?: string, provider?: string }} img
 * @returns {string}
 */
export function describeImage(img) {
  const title = imageTitle(img);
  const credit = String(img?.credit || '').trim();
  return [title ? `“${title}”` : '', credit, providerName(img?.provider)].filter(Boolean).join(' · ');
}
