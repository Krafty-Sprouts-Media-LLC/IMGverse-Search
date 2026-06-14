// =============================================================================
// src/routes/proxy.js
// IMGverse Search — GET /proxy image proxy route.
// The core feature: fetches images from provider CDNs server-side,
// converts to JPEG via sharp (fixes AVIF), streams with no Content-Disposition
// so the browser displays the raw image in a new tab for right-click Save-As.
//
// @package IMGverse-Search
// @since   1.0.0
// =============================================================================

'use strict';

import { Router } from 'express';
import fetch from 'node-fetch';
import sharp from 'sharp';

const router = Router();

// ---------------------------------------------------------------------------
// Whitelist of allowed upstream CDN domains.
// Prevents the proxy from being used as an open relay.
// ---------------------------------------------------------------------------
const ALLOWED_DOMAINS = new Set([
  // Unsplash
  'images.unsplash.com',
  'plus.unsplash.com',

  // Pexels
  'images.pexels.com',

  // Pixabay — webformatURL uses pixabay.com, large images use cdn.pixabay.com
  'cdn.pixabay.com',
  'i.pixabay.com',
  'pixabay.com',

  // Flickr (served via Openverse and directly)
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

  // iNaturalist
  'inaturalist-open-data.s3.amazonaws.com',
  'static.inaturalist.org',
  'inaturalist-open-data.s3.us-east-1.amazonaws.com',

  // Openverse / WordPress media CDN
  // Thumbnails served from api.openverse.org/v1/images/{id}/thumb/ (redirects to actual CDN)
  'api.openverse.org',            // current domain (was api.openverse.engineering — now changed)
  'api.openverse.engineering',    // legacy — keep for older cached URLs
  'openverse.org',
  'i0.wp.com',
  'i1.wp.com',
  'i2.wp.com',
  'i3.wp.com',
  'wordpress.com',
  'files.wordpress.com',

  // Wikimedia / Wikipedia (large Openverse source)
  'upload.wikimedia.org',
  'commons.wikimedia.org',

  // Europeana (Openverse aggregates from here)
  'europeana.eu',
  'api.europeana.eu',

  // Internet Archive (CC-licensed content)
  'archive.org',
  'ia800501.us.archive.org',

  // Smithsonian Open Access
  'ids.si.edu',
  'iiif.si.edu',
]);

/**
 * Normalize an output format query param.
 *
 * @param {string} [raw] - Requested format.
 * @returns {'jpeg'|'webp'|'png'} Supported output format.
 */
function parseOutputFormat(raw) {
  const fmt = String(raw || 'jpg').toLowerCase();
  if (fmt === 'webp') return 'webp';
  if (fmt === 'png') return 'png';
  return 'jpeg'; // jpg and jpeg are equivalent
}

/**
 * Convert upstream bytes to the requested output format.
 *
 * @param {Buffer} buffer - Raw upstream image bytes.
 * @param {'jpeg'|'webp'|'png'} format - Target format.
 * @returns {Promise<{ body: Buffer, contentType: string }>}
 */
async function encodeImage(buffer, format) {
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

const MAX_SIZE_BYTES = (parseInt(process.env.PROXY_MAX_SIZE_MB, 10) || 20) * 1024 * 1024;
const UA = 'IMGverse-Search/1.0 (image proxy; +https://github.com/Krafty-Sprouts-Media-LLC/IMGverse-Search)';

/**
 * Build upstream request headers. Some CDNs reject bare server fetches.
 *
 * @param {URL} parsed - Parsed upstream image URL.
 * @returns {Record<string, string>}
 */
function upstreamHeaders(parsed, format = 'jpeg') {
  const headers = {
    'User-Agent':      UA,
    'Accept-Language': 'en-US,en;q=0.9',
  };

  // Request JPEG from Pexels/Unsplash when converting to jpeg — avoids AVIF upstream
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
 * @param {URL}    parsed - Parsed upstream image URL.
 * @param {number} tries  - Maximum attempts.
 * @returns {Promise<import('node-fetch').Response>}
 */
async function fetchUpstream(parsed, tries = 2, format = 'jpeg') {
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
 * GET /proxy
 *
 * Query params:
 *   url  {string}  URL-encoded image URL from a provider CDN (required)
 *   fmt  {string}  Output format: 'jpg' | 'jpeg' | 'webp' | 'png' (default 'jpg')
 *
 * The key behaviours:
 *  - Validates domain against whitelist (security)
 *  - Forces HTTPS upstream
 *  - Converts any upstream format (AVIF, WebP, PNG…) to the requested output format
 *  - Sets image/* Content-Type with NO Content-Disposition
 *  - This makes the browser display the raw image in the tab,
 *    enabling right-click → "Save image as" with any custom name.
 */
router.get('/', async (req, res) => {
  const rawUrl = req.query.url;
  const format = parseOutputFormat(req.query.fmt);

  if (!rawUrl) {
    return res.status(400).send('Missing url parameter.');
  }

  let parsed;
  try {
    parsed = new URL(decodeURIComponent(rawUrl));
  } catch {
    return res.status(400).send('Invalid URL.');
  }

  // Force HTTPS only
  if (parsed.protocol !== 'https:') {
    return res.status(400).send('Only HTTPS URLs are allowed.');
  }

  // Domain whitelist check
  if (!ALLOWED_DOMAINS.has(parsed.hostname)) {
    return res.status(403).send(`Domain not allowed: ${parsed.hostname}`);
  }

  try {
    const upstream = await fetchUpstream(parsed, 2, format);

    if (!upstream.ok) {
      console.error(`[IMGverse/proxy] Upstream HTTP ${upstream.status} for ${parsed.hostname}`);
      return res.status(upstream.status).send('Upstream fetch failed.');
    }

    // Reject files that are too large
    const contentLength = parseInt(upstream.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_SIZE_BYTES) {
      return res.status(413).send('Image too large.');
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    const { body, contentType } = await encodeImage(buffer, format);

    // Stream back to the browser.
    // NO Content-Disposition header — this is what makes the browser
    // display the image natively in the tab rather than triggering a download.
    res.set({
      'Content-Type':  contentType,
      'Cache-Control': 'public, max-age=86400',
      'Content-Length': body.length,
    });

    return res.send(body);

  } catch (err) {
    const detail = err.message || err.cause?.message || err.cause?.code || err.code || String(err);
    console.error('[IMGverse/proxy] Error: request to', parsed.toString(), 'failed, reason:', detail);
    return res.status(500).send('Proxy error.');
  }
});

export default router;
