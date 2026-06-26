// =============================================================================
// lib/attribution.js
// IMGverse Search — Build attribution captions and embed IPTC Caption on downloads.
//
// Caption format (IPTC Caption-Abstract only — no Description field):
//   Photo by {credit} on {Provider} — {license} — {sourceUrl}
//
// @package IMGverse-Search
// @since   1.0.27
// =============================================================================

'use strict';

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
 *
 * @param {object} fields
 * @param {string} [fields.credit]
 * @param {string} [fields.provider]
 * @param {string} [fields.license]
 * @param {string} [fields.sourceUrl]
 * @returns {string}
 */
export function buildAttributionCaption({
  credit = '',
  provider = '',
  license = '',
  sourceUrl = '',
} = {}) {
  const providerLabel = formatProviderName(provider);
  const author = String(credit || '').trim();
  const lic = String(license || '').trim();
  const source = String(sourceUrl || '').trim();

  let caption = '';

  if (author) {
    caption = `Photo by ${author}`;
    if (providerLabel) caption += ` on ${providerLabel}`;
  } else if (providerLabel) {
    caption = `Image from ${providerLabel}`;
  }

  if (lic) {
    caption = caption ? `${caption} — ${lic}` : lic;
  }

  if (source) {
    caption = caption ? `${caption} — ${source}` : source;
  }

  return caption.trim();
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

  const tmpPath = join(tmpdir(), `imgverse-${randomBytes(8).toString('hex')}.jpg`);

  try {
    await writeFile(tmpPath, jpegBuffer);

    await exiftool.write(tmpPath, {
      'Caption-Abstract': caption.slice(0, CAPTION_MAX),
    }, ['-overwrite_original', '-ImageDescription=', '-Description=']);

    return await readFile(tmpPath);
  } catch (err) {
    console.error('[IMGverse/attribution] Failed to embed IPTC caption:', err.message);
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
