// =============================================================================
// src/routes/download.js
// IMGverse Search — GET /download named image attachment route.
// Same whitelist and encode pipeline as /proxy, but sets Content-Disposition
// so the browser saves with the requested filename (batch queue downloads).
//
// @package IMGverse-Search
// @since   1.0.26
// =============================================================================

'use strict';

import { Router } from 'express';
import {
  attachmentDisposition,
  fetchProviderImage,
  formatExtension,
  parseDownloadEncodeOptions,
  parseOutputFormat,
  sanitizeDownloadName,
} from '../lib/image-proxy.js';
import { parseAttributionFromQuery } from '../lib/attribution.js';

const router = Router();

/**
 * GET /download
 *
 * Query params:
 *   url   {string}  URL-encoded provider image URL (required)
 *   name       {string}  Download basename without extension (required)
 *   fmt        {string}  Output format: 'jpg' | 'jpeg' | 'webp' | 'png' (default 'jpg')
 *   credit     {string}  Photographer / author (optional, IPTC Caption)
 *   provider   {string}  Provider id e.g. unsplash (optional)
 *   license    {string}  Licence name (optional)
 *   sourceUrl  {string}  Link to original image page (optional)
 *   size       {string}  `web` (default, max width resize) | `full` (provider original dimensions)
 */
router.get('/', async (req, res) => {
  const format = parseOutputFormat(req.query.fmt);
  const basename = sanitizeDownloadName(req.query.name);
  const attribution = parseAttributionFromQuery(req.query);
  const encode = parseDownloadEncodeOptions(req.query);

  if (!req.query.name || !String(req.query.name).trim()) {
    return res.status(400).send('Missing name parameter.');
  }

  try {
    const { body, contentType } = await fetchProviderImage(req.query.url, format, {
      attribution,
      encode,
    });
    const ext = formatExtension(format);

    res.set({
      'Content-Type':        contentType,
      'Content-Disposition': attachmentDisposition(basename, ext),
      'Content-Length':      body.length,
      'Cache-Control':       'private, no-store',
    });

    return res.send(body);

  } catch (err) {
    if (err.status) {
      if (err.status >= 500 || err.status === 403) {
        console.error(`[IMGverse/download] ${err.message} for ${err.hostname || 'unknown host'}`);
      }
      return res.status(err.status).send(err.message);
    }

    const detail = err.message || err.cause?.message || err.cause?.code || err.code || String(err);
    console.error('[IMGverse/download] Error: request failed, reason:', detail);
    return res.status(500).send('Download error.');
  }
});

export default router;
