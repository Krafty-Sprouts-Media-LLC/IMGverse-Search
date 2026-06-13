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

const MAX_SIZE_BYTES = (parseInt(process.env.PROXY_MAX_SIZE_MB, 10) || 20) * 1024 * 1024;

/**
 * GET /proxy
 *
 * Query params:
 *   url  {string}  URL-encoded image URL from a provider CDN (required)
 *   fmt  {string}  Output format: 'jpg' (default) or 'webp'
 *
 * The key behaviours:
 *  - Validates domain against whitelist (security)
 *  - Forces HTTPS upstream
 *  - Converts any format (AVIF, WebP, PNG…) to JPEG via sharp
 *  - Sets Content-Type: image/jpeg — NO Content-Disposition
 *  - This makes the browser display the raw image in the tab,
 *    enabling right-click → "Save image as" with any custom name.
 */
router.get('/', async (req, res) => {
  const rawUrl = req.query.url;

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
    const upstream = await fetch(parsed.toString(), {
      headers: {
        'User-Agent': 'IMGverse-Search/1.0 (image proxy)',
        'Accept':     'image/*',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!upstream.ok) {
      return res.status(upstream.status).send('Upstream fetch failed.');
    }

    // Reject files that are too large
    const contentLength = parseInt(upstream.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_SIZE_BYTES) {
      return res.status(413).send('Image too large.');
    }

    const buffer = await upstream.arrayBuffer();

    // Convert to JPEG via sharp (handles AVIF → JPEG automatically)
    const jpeg = await sharp(Buffer.from(buffer))
      .jpeg({ quality: 88, progressive: true })
      .toBuffer();

    // Stream back to the browser.
    // NO Content-Disposition header — this is what makes the browser
    // display the image natively in the tab rather than triggering a download.
    res.set({
      'Content-Type':  'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
      'Content-Length': jpeg.length,
    });

    return res.send(jpeg);

  } catch (err) {
    console.error('[IMGverse/proxy] Error:', err.message);
    return res.status(500).send('Proxy error.');
  }
});

export default router;
