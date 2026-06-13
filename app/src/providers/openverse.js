// =============================================================================
// src/providers/openverse.js
// IMGverse Search — Openverse provider adapter.
// Free API; OAuth credentials recommended on VPS/datacenter hosts (Cloudflare
// returns HTTP 403 to anonymous requests from many datacenter IP ranges).
// Docs: https://api.openverse.org/v1/
//
// @package IMGverse-Search
// @since   1.0.0
// =============================================================================

'use strict';

import fetch from 'node-fetch';
import { normalize } from '../utils.js';
import { getOpenverseToken } from './openverse-auth.js';

const BASE = 'https://api.openverse.org/v1/images/';
const UA   = 'IMGverse-Search/1.0 (https://github.com/Krafty-Sprouts-Media-LLC/IMGverse-Search)';

/**
 * Build request headers, attaching OAuth Bearer token when configured.
 *
 * @returns {Promise<Record<string, string>>}
 */
async function buildHeaders() {
  const headers = {
    'User-Agent': UA,
    'Accept':     'application/json',
  };

  const token = await getOpenverseToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Log actionable guidance when Openverse rejects a request.
 *
 * @param {number} status - HTTP status code.
 */
function logAccessDenied(status) {
  const hasCreds = Boolean(process.env.OPENVERSE_CLIENT_ID && process.env.OPENVERSE_CLIENT_SECRET);

  if (status === 403 && !hasCreds) {
    console.error(
      '[IMGverse/openverse] HTTP 403 — anonymous API access is blocked from this server IP '
      + '(common on Hetzner/VPS hosts). Register a free OAuth app at '
      + 'https://api.openverse.org/v1/auth_tokens/register/ then set OPENVERSE_CLIENT_ID '
      + 'and OPENVERSE_CLIENT_SECRET in your environment.'
    );
    return;
  }

  if (status === 403 && hasCreds) {
    console.error(
      '[IMGverse/openverse] HTTP 403 with OAuth credentials — verify the app email at '
      + 'https://api.openverse.org/v1/auth_tokens/register/ and confirm the client ID/secret.'
    );
    return;
  }

  console.error(`[IMGverse/openverse] API returned HTTP ${status}`);
}

/**
 * Search Openverse for images matching the given query.
 *
 * @param {string} query - Search term.
 * @param {number} page  - Page number (1-indexed).
 * @returns {Promise<object[]>} Array of canonical ImageResult objects.
 */
export async function search(query, page = 1) {
  try {
    const params = new URLSearchParams({ q: query, page, page_size: 20 });
    const res = await fetch(`${BASE}?${params}`, {
      headers: await buildHeaders(),
      signal:  AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      logAccessDenied(res.status);
      console.error(`[IMGverse/openverse] Request failed for q="${query}" page=${page}`);
      return [];
    }

    const data = await res.json();
    return (data.results || []).map((item) =>
      normalize({
        id:         item.id,
        provider:   'openverse',
        thumbUrl:   item.thumbnail || item.url,
        fullUrl:    item.url,
        width:      item.width || 0,
        height:     item.height || 0,
        alt:        item.title || '',
        credit:     item.creator || '',
        creditUrl:  item.creator_url || '',
        license:    item.license || '',
        sourceUrl:  item.foreign_landing_url || '',
      })
    );
  } catch (err) {
    console.error(`[IMGverse/openverse] Search failed for q="${query}" page=${page}:`, err.message);
    return [];
  }
}
