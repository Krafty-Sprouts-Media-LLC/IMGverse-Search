// =============================================================================
// src/providers/wikimedia.js
// SISE — Wikimedia Commons provider adapter.
// Free, no API key. CC-licensed / public domain media (Commons only hosts free files).
// Licence and author come from Commons' own metadata; the author can be missing.
// Docs: https://www.mediawiki.org/wiki/API:Search
//
// @package SISE
// @since   1.0.15
// =============================================================================

'use strict';

import fetch from 'node-fetch';
import { normalize } from '../utils.js';

const API = 'https://commons.wikimedia.org/w/api.php';
const UA  = 'SISE/2.0 (https://github.com/Krafty-Sprouts-Media-LLC/SISE)';

/**
 * Strip a Commons /thumb/ scaled URL back to the original upload URL.
 *
 * @param {string} thumbUrl - e.g. .../thumb/a/ab/File.jpg/960px-File.jpg
 * @returns {string|null}
 */
function originalFromThumbUrl(thumbUrl) {
  if (!thumbUrl || !thumbUrl.includes('/thumb/')) return null;

  const match = thumbUrl.match(
    /^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/)thumb\/(.+\/)([^/]+)\/\d+px-[^/]+$/
  );
  if (!match) return null;

  return `${match[1]}${match[2]}${match[3]}`;
}

/**
 * Resolve the original full-resolution Commons file URL (never a scaled /thumb/ URL).
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

  const fromThumb = originalFromThumbUrl(info.thumburl);
  if (fromThumb) return fromThumb;

  const fileName = (title || '').replace(/^File:/, '').trim().replace(/ /g, '_');
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}`;
}

const CREDIT_MAX = 60;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decode the few HTML entities Commons leaves in its metadata (&amp;, &#39; ...). */
function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function tidy(html) {
  return decodeEntities(String(html || '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

/**
 * The author to credit from a Commons Artist field (HTML).
 *
 * Authors often wrap their name in a paragraph of licence instructions, so a
 * link to their Commons user page (its text is the clean username) wins over
 * the text around it. Otherwise the plain text is used, cut on a word boundary
 * past 60 characters; the Commons page we link to (creditUrl) carries the full
 * attribution text.
 *
 * @param {string} [html]
 * @returns {string}
 */
function cleanArtist(html) {
  const raw = String(html || '');
  const userLink = raw.match(/<a\s[^>]*href="[^"]*\/wiki\/User:[^"]*"[^>]*>([^<]+)<\/a>/i);
  const text = tidy(userLink ? userLink[1] : raw).replace(/^user:\s*/i, '');
  if (text.length <= CREDIT_MAX) return text;

  const cut = text.slice(0, CREDIT_MAX - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Search Wikimedia Commons for images matching the given query.
 *
 * @param {string} query       - Search term.
 * @param {number} page        - Page number (1-indexed).
 * @param {string} orientation - Ignored: Commons has no orientation filter (filtered after the search).
 * @param {object} [options]   - { onResponse(res), onError(err), fetchImpl } — used by the rate budget and tests.
 * @returns {Promise<object[]>} Array of canonical ImageResult objects.
 */
export async function search(query, page = 1, orientation = '', { onResponse, onError, fetchImpl = fetch } = {}) {
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
      iiurlwidth:   '960', // a size Commons serves; 330 looked soft on screen
    });

    const res = await fetchImpl(`${API}?${params}`, {
      headers: { 'User-Agent': UA },
      signal:  AbortSignal.timeout(15_000),
    });
    onResponse?.(res);

    if (!res.ok) {
      console.error(`[SISE/wikimedia] API returned HTTP ${res.status} for q="${query}" page=${page}`);
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

        const meta    = info.extmetadata || {};
        const artist  = cleanArtist(meta.Artist?.value);
        const license = meta.LicenseShortName?.value || '';

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
    console.error(`[SISE/wikimedia] Search failed for q="${query}" page=${page}:`, err.message);
    onError?.(err);
    return [];
  }
}
