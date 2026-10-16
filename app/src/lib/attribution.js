// =============================================================================
// lib/attribution.js
// SISE — Build attribution captions and embed IPTC Caption on downloads.
//
// Caption format (IPTC Caption-Abstract only — no Description, no URL, no license dump):
//   Photo by {credit} / {Provider}
//
// @package SISE
// @since   1.0.27
// =============================================================================

'use strict';

import { LICENCE_PROVIDERS } from '../../public/image-meta.js';

import { randomBytes } from 'node:crypto';
import { unlink, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exiftool } from 'exiftool-vendored';

const PROVIDER_LABELS = {
  unsplash:    'Unsplash',
  pexels:      'Pexels',
  pixabay:     'Pixabay',
  inaturalist: 'iNaturalist',
  openverse:   'Openverse',
  wikimedia:   'Wikimedia Commons',
  flickr:      'Flickr',
};

const CAPTION_MAX = 2000;
const CREDIT_MAX = 80;

/**
 * @param {string} provider
 * @returns {string}
 */
export function formatProviderName(provider) {
  const key = String(provider || '').trim().toLowerCase();
  if (!key) return '';
  if (PROVIDER_LABELS[key]) return PROVIDER_LABELS[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Build a single-line attribution string for IPTC Caption-Abstract.
 * Matches IMGVerse WordPress: Photo by {creator} / {source}.
 * Never includes a photo URL or license dump — WordPress copies IPTC Caption
 * into the attachment caption / figcaption. The exception is the providers in
 * LICENCE_PROVIDERS (Wikimedia Commons, iNaturalist, Openverse): their files are
 * mostly CC BY / BY-SA, which require naming the licence, so its short name is
 * appended: "... / Wikimedia Commons (CC BY-SA 4.0)". A credit over 80
 * characters is cut short so a paragraph in the author field can't flood the file.
 *
 * @param {object} fields
 * @param {string} [fields.credit]
 * @param {string} [fields.provider]
 * @param {string} [fields.license]  Only used for Wikimedia Commons.
 * @returns {string}
 */
export function buildAttributionCaption({
  credit = '',
  provider = '',
  license = '',
} = {}) {
  const licenceName = LICENCE_PROVIDERS.has(String(provider).trim().toLowerCase()) ? String(license || '').trim() : '';
  const providerLabel = [formatProviderName(provider), licenceName && `(${licenceName})`].filter(Boolean).join(' ');
  const full = String(credit || '').replace(/\s+/g, ' ').trim();
  const author = full.length > CREDIT_MAX ? `${full.slice(0, CREDIT_MAX - 1).trimEnd()}…` : full;

  if (author && providerLabel) {
    return `Photo by ${author} / ${providerLabel}`;
  }
  if (author) {
    return `Photo by ${author}`;
  }
  if (providerLabel) {
    return `Image from ${providerLabel}`;
  }

  return '';
}

/**
 * Embed IPTC Caption-Abstract in a JPEG buffer. Strips Description / ImageDescription.
 *
 * @param {Buffer} jpegBuffer
 * @param {object} fields
 * @returns {Promise<Buffer>}
 */
export async function embedAttributionInJpeg(jpegBuffer, fields) {
  const caption = buildAttributionCaption(fields);
  if (!caption) return jpegBuffer;

  const tmpPath = join(tmpdir(), `sise-${randomBytes(8).toString('hex')}.jpg`);

  try {
    await writeFile(tmpPath, jpegBuffer);

    await exiftool.write(tmpPath, {
      'Caption-Abstract': caption.slice(0, CAPTION_MAX),
    }, ['-overwrite_original', '-ImageDescription=', '-Description=']);

    return await readFile(tmpPath);
  } catch (err) {
    console.error('[SISE/attribution] Failed to embed IPTC caption:', err.message);
    return jpegBuffer;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

/** Release the exiftool child process (call on server shutdown). */
export async function shutdownExiftool() {
  await exiftool.end();
}

/**
 * Parse optional attribution query params on GET /download.
 *
 * @param {object} query - Express req.query
 * @returns {object|null}
 */
export function parseAttributionFromQuery(query) {
  const credit = String(query.credit || '').trim();
  const provider = String(query.provider || '').trim();
  const license = String(query.license || '').trim();
  const sourceUrl = String(query.sourceUrl || '').trim();

  if (!credit && !provider && !license && !sourceUrl) return null;

  return { credit, provider, license, sourceUrl };
}
