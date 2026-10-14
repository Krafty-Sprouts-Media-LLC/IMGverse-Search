// =============================================================================
// src/routes/proxy.js
// SISE — GET /proxy image proxy route.
// Fetches images from provider CDNs server-side, converts via sharp,
// streams with no Content-Disposition so the browser displays the raw image
// in a new tab for right-click Save-As.
//
// @package SISE
// @since   1.0.0
// =============================================================================

'use strict';

import { Router } from 'express';
import { fetchProviderImage, parseOutputFormat } from '../lib/image-proxy.js';

const router = Router();

/**
 * GET /proxy
 *
 * Query params:
 *   url  {string}  URL-encoded image URL from a provider CDN (required)
 *   fmt  {string}  Output format: 'jpg' | 'jpeg' | 'webp' | 'png' (default 'jpg')
 */
router.get('/', async (req, res) => {
  const format = parseOutputFormat(req.query.fmt);

  try {
    const { body, contentType, hostname } = await fetchProviderImage(req.query.url, format);

    res.set({
      'Content-Type':  contentType,
      'Cache-Control': 'public, max-age=86400',
      'Content-Length': body.length,
    });

    return res.send(body);

  } catch (err) {
    if (err.status) {
      if (err.status >= 500 || err.status === 403) {
        console.error(`[SISE/proxy] ${err.message} for ${err.hostname || 'unknown host'}`);
      }
      return res.status(err.status).send(err.message);
    }

    const detail = err.message || err.cause?.message || err.cause?.code || err.code || String(err);
    console.error('[SISE/proxy] Error: request failed, reason:', detail);
    return res.status(500).send('Proxy error.');
  }
});

export default router;
