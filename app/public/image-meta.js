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
