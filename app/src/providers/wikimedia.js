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
 * Resolve the original full-resolution Commons file URL (never a /thumb/ scaled URL).
 *
 * @param {object} info  - imageinfo[0] from the API.
 * @param {string} title - Page title e.g. "File:Example.jpg".
 * @returns {string}
 */
function originalCommonsUrl(info, title) {
  const direct = info.url || '';
  if (direct.includes('upload.wikimedia.org') && !direct.includes('/thumb/')) {
    return direct;
  }

  if (info.thumburl) {
    const match = info.thumburl.match(
      /^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/)thumb\/([0-9a-f]\/[0-9a-f]{2}\/)([^/]+)\/\d+px-[^/]+$/
    );
    if (match) {
      return `${match[1]}${match[2]}${match[3]}`;
    }
  }

  const fileName = (title || '').replace(/^File:/, '').trim().replace(/ /g, '_');
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}`;
}

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
      iiprop:       'url|size|thumburl|extmetadata|mime',
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

        const fullUrl  = originalCommonsUrl(info, item.title);
        const thumbUrl = info.thumburl || fullUrl;

        return normalize({
          id:        String(item.pageid),
          provider:  'wikimedia',
          thumbUrl,
          fullUrl,
          width:     info.width || 0,
          height:    info.height || 0,
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
