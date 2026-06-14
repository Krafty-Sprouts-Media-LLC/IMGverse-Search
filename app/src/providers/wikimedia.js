// =============================================================================
// src/providers/wikimedia.js
// IMGverse Search — Wikimedia Commons provider adapter.
// Free, no API key. CC-licensed / public domain media.
// Docs: https://www.mediawiki.org/wiki/API:Search
//
// @package IMGverse-Search
// @since   1.0.15
// =============================================================================

'use strict';

import fetch from 'node-fetch';
import { normalize } from '../utils.js';

const API = 'https://commons.wikimedia.org/w/api.php';
const UA  = 'IMGverse-Search/1.0 (https://github.com/Krafty-Sprouts-Media-LLC/IMGverse-Search)';

/**
 * Search Wikimedia Commons for images matching the given query.
 *
 * @param {string} query - Search term.
 * @param {number} page  - Page number (1-indexed).
 * @returns {Promise<object[]>} Array of canonical ImageResult objects.
 */
export async function search(query, page = 1) {
  try {
    const perPage = 20;
    const params = new URLSearchParams({
      action:       'query',
      format:       'json',
      origin:       '*',
      generator:    'search',
      gsrsearch:    query,
      gsrnamespace: '6',
      gsrlimit:     String(perPage),
      gsroffset:    String((page - 1) * perPage),
      prop:         'imageinfo',
      iiprop:       'url|size|extmetadata|mime',
      iiurlwidth:   '640',
    });

    const res = await fetch(`${API}?${params}`, {
      headers: { 'User-Agent': UA },
      signal:  AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.error(`[IMGverse/wikimedia] API returned HTTP ${res.status} for q="${query}" page=${page}`);
      return [];
    }

    const data = await res.json();
    const pages = Object.values(data.query?.pages || {});

    return pages
      .map((item) => {
        const info = item.imageinfo?.[0];
        if (!info?.url) return null;

        const mime = info.mime || '';
        if (!mime.startsWith('image/') || mime === 'image/svg+xml') return null;

        const meta   = info.extmetadata || {};
        const artist = meta.Artist?.value?.replace(/<[^>]+>/g, '').trim() || '';
        const license = meta.LicenseShortName?.value || 'See Wikimedia Commons';

        return normalize({
          id:        String(item.pageid),
          provider:  'wikimedia',
          thumbUrl:  info.thumburl || info.url,
          fullUrl:   info.url,
          width:     info.width || info.thumbwidth || 0,
          height:    info.height || info.thumbheight || 0,
          alt:       item.title?.replace(/^File:/, '') || '',
          credit:    artist,
          creditUrl: info.descriptionurl || '',
          license,
          sourceUrl: info.descriptionurl || '',
        });
      })
      .filter(Boolean);
  } catch (err) {
    console.error(`[IMGverse/wikimedia] Search failed for q="${query}" page=${page}:`, err.message);
    return [];
  }
}
