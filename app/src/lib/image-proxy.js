// =============================================================================
// lib/image-proxy.js
// IMGverse Search — Shared upstream image fetch, whitelist, and encode logic.
// Used by /proxy (inline display) and /download (named attachment).
//
// @package IMGverse-Search
// @since   1.0.26
// =============================================================================

'use strict';

import fetch from 'node-fetch';
import sharp from 'sharp';

export const ALLOWED_DOMAINS = new Set([
  'images.unsplash.com',
  'plus.unsplash.com',
  'images.pexels.com',
  'cdn.pixabay.com',
  'i.pixabay.com',
  'pixabay.com',
  'live.staticflickr.com',
  'farm1.staticflickr.com',
  'farm2.staticflickr.com',
  'farm3.staticflickr.com',
  'farm4.staticflickr.com',
  'farm5.staticflickr.com',
  'farm6.staticflickr.com',
  'farm7.staticflickr.com',
  'farm8.staticflickr.com',
  'farm9.staticflickr.com',
  'combo.staticflickr.com',
  'inaturalist-open-data.s3.amazonaws.com',
  'static.inaturalist.org',
  'inaturalist-open-data.s3.us-east-1.amazonaws.com',
  'api.openverse.org',
  'api.openverse.engineering',
  'openverse.org',
  'i0.wp.com',
  'i1.wp.com',
  'i2.wp.com',
  'i3.wp.com',
  'wordpress.com',
  'files.wordpress.com',
  'upload.wikimedia.org',
  'commons.wikimedia.org',
  'europeana.eu',
  'api.europeana.eu',
  'archive.org',
  'ia800501.us.archive.org',
  'ids.si.edu',
  'iiif.si.edu',
]);

export const MAX_SIZE_BYTES = (parseInt(process.env.PROXY_MAX_SIZE_MB, 10) || 20) * 1024 * 1024;
const UA = 'IMGverse-Search/1.0 (image proxy; +https://github.com/Krafty-Sprouts-Media-LLC/IMGverse-Search)';

/**
 * Normalize an output format query param.
 *
 * @param {string} [raw] - Requested format.
 * @returns {'jpeg'|'webp'|'png'} Supported output format.
 */
export function parseOutputFormat(raw) {
  const fmt = String(raw || 'jpg').toLowerCase();
  if (fmt === 'webp') return 'webp';
  if (fmt === 'png') return 'png';
  return 'jpeg';
}

/**
 * Sanitize a user-supplied download basename for Content-Disposition.
 *
 * @param {string} raw - Requested filename without extension.
 * @returns {string} Safe basename.
 */
export function sanitizeDownloadName(raw) {
  let name = String(raw || 'image').trim();
  name = name.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
  if (!name) name = 'image';
  if (name.length > 200) name = name.slice(0, 200);
  return name;
}

/**
 * File extension for an encoded output format.
 *
 * @param {'jpeg'|'webp'|'png'} format
 * @returns {string}
 */
export function formatExtension(format) {
  if (format === 'webp') return 'webp';
  if (format === 'png') return 'png';
  return 'jpg';
}

/**
 * Build a Content-Disposition attachment header with ASCII fallback + UTF-8 filename*.
 *
 * @param {string} basename - Sanitized basename without extension.
 * @param {string} ext - File extension without dot.
 * @returns {string}
 */
export function attachmentDisposition(basename, ext) {
  const asciiFallback = `${basename.replace(/[^\x20-\x7E]/g, '_')}.${ext}`;
  const encoded = encodeURIComponent(`${basename}.${ext}`);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

/**
 * Convert upstream bytes to the requested output format.
 *
 * @param {Buffer} buffer - Raw upstream image bytes.
 * @param {'jpeg'|'webp'|'png'} format - Target format.
 * @returns {Promise<{ body: Buffer, contentType: string }>}
 */
export async function encodeImage(buffer, format) {
  const image = sharp(buffer);

  if (format === 'webp') {
    const body = await image.webp({ quality: 88 }).toBuffer();
    return { body, contentType: 'image/webp' };
  }

  if (format === 'png') {
    const body = await image.png({ compressionLevel: 8 }).toBuffer();
    return { body, contentType: 'image/png' };
  }

  const body = await image.jpeg({ quality: 88, progressive: true }).toBuffer();
  return { body, contentType: 'image/jpeg' };
}

/**
 * Build upstream request headers. Some CDNs reject bare server fetches.
 *
 * @param {URL} parsed - Parsed upstream image URL.
 * @param {'jpeg'|'webp'|'png'} format
 * @returns {Record<string, string>}
 */
export function upstreamHeaders(parsed, format = 'jpeg') {
  const headers = {
    'User-Agent':      UA,
    'Accept-Language': 'en-US,en;q=0.9',
  };

  if (format === 'jpeg') {
    headers.Accept = 'image/jpeg';
  } else {
    headers.Accept = 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8';
  }

  if (parsed.hostname.includes('unsplash')) {
    headers.Referer = 'https://unsplash.com/';
  } else if (parsed.hostname.includes('pexels')) {
    headers.Referer = 'https://www.pexels.com/';
  } else if (parsed.hostname.includes('pixabay')) {
    headers.Referer = 'https://pixabay.com/';
  }

  return headers;
}

/**
 * Fetch an upstream image with one automatic retry on transient network errors.
 *
 * @param {URL} parsed
 * @param {number} tries
 * @param {'jpeg'|'webp'|'png'} format
 * @returns {Promise<import('node-fetch').Response>}
 */
export async function fetchUpstream(parsed, tries = 2, format = 'jpeg') {
  let lastErr;

  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fetch(parsed.toString(), {
        headers:  upstreamHeaders(parsed, format),
        redirect: 'follow',
        signal:   AbortSignal.timeout(15_000),
      });
    } catch (err) {
      lastErr = err;
      if (attempt < tries) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }
  }

  throw lastErr;
}

/**
 * Parse and validate a whitelisted HTTPS image URL.
 *
 * @param {string} rawUrl - URL-encoded or plain upstream URL.
 * @returns {URL}
 */
export function parseImageUrl(rawUrl) {
  if (!rawUrl) {
    const err = new Error('Missing url parameter.');
    err.status = 400;
    throw err;
  }

  let parsed;
  try {
    parsed = new URL(decodeURIComponent(rawUrl));
  } catch {
    const err = new Error('Invalid URL.');
    err.status = 400;
    throw err;
  }

  if (parsed.protocol !== 'https:') {
    const err = new Error('Only HTTPS URLs are allowed.');
    err.status = 400;
    throw err;
  }

  if (!ALLOWED_DOMAINS.has(parsed.hostname)) {
    const err = new Error(`Domain not allowed: ${parsed.hostname}`);
    err.status = 403;
    throw err;
  }

  return parsed;
}

/**
 * Fetch, validate size, and encode an upstream provider image.
 *
 * @param {string} rawUrl
 * @param {'jpeg'|'webp'|'png'} [format='jpeg']
 * @returns {Promise<{ body: Buffer, contentType: string, hostname: string }>}
 */
export async function fetchProviderImage(rawUrl, format = 'jpeg') {
  const parsed = parseImageUrl(rawUrl);
  const upstream = await fetchUpstream(parsed, 2, format);

  if (!upstream.ok) {
    const err = new Error(`Upstream HTTP ${upstream.status}`);
    err.status = upstream.status;
    err.hostname = parsed.hostname;
    throw err;
  }

  const contentLength = parseInt(upstream.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_SIZE_BYTES) {
    const err = new Error('Image too large.');
    err.status = 413;
    throw err;
  }

  const buffer = Buffer.from(await upstream.arrayBuffer());
  const { body, contentType } = await encodeImage(buffer, format);

  return { body, contentType, hostname: parsed.hostname };
}
