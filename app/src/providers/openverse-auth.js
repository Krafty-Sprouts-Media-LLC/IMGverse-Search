// =============================================================================
// src/providers/openverse-auth.js
// IMGverse Search — Openverse OAuth2 client-credentials token helper.
// Datacenter IPs (Hetzner, many VPS hosts) often get HTTP 403 from Cloudflare
// on anonymous requests. Registered OAuth apps receive Bearer tokens that
// bypass this block — unless Cloudflare blocks the token endpoint too.
//
// Register: POST https://api.openverse.org/v1/auth_tokens/register/
// Docs:     https://docs.openverse.org/api/reference/authentication_and_throttling.html
//
// @package IMGverse-Search
// @since   1.0.9
// =============================================================================

'use strict';

import fetch from 'node-fetch';

const TOKEN_URL = 'https://api.openverse.org/v1/auth_tokens/token/';
const UA = 'IMGverse-Search/1.0 (https://github.com/Krafty-Sprouts-Media-LLC/IMGverse-Search)';

/** @type {string|null} */
let cachedToken = null;

/** @type {number} */
let tokenExpiresAt = 0;

/** @type {boolean} Set when Cloudflare blocks this host entirely. */
let cloudflareBlocked = false;

/**
 * Whether Openverse is unreachable from this server (Cloudflare block).
 *
 * @returns {boolean}
 */
export function isOpenverseBlocked() {
  return cloudflareBlocked;
}

/**
 * Detect Cloudflare challenge pages returned instead of JSON.
 *
 * @param {string} body - Response body snippet.
 * @returns {boolean}
 */
function isCloudflareChallenge(body) {
  return body.includes('Just a moment') || body.includes('cf-browser-verification');
}

/**
 * Obtain a cached Openverse Bearer token when credentials are configured.
 *
 * @returns {Promise<string|null>} Access token, or null if credentials are unset.
 */
export async function getOpenverseToken() {
  if (cloudflareBlocked) return null;

  const clientId     = process.env.OPENVERSE_CLIENT_ID;
  const clientSecret = process.env.OPENVERSE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  try {
    const body = new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     clientId,
      client_secret: clientSecret,
    });

    const res = await fetch(TOKEN_URL, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':   UA,
        Accept:         'application/json',
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });

    const text = await res.text();

    if (!res.ok) {
      if (isCloudflareChallenge(text)) {
        cloudflareBlocked = true;
        console.error(
          '[IMGverse/openverse] Cloudflare is blocking ALL Openverse API traffic from this server IP '
          + '(including OAuth token requests). Openverse cannot run on this host — use Wikimedia, '
          + 'Unsplash, Pexels, or Pixabay instead. See docs/OPENVERSE-OAUTH.md.'
        );
        return null;
      }
      console.error(`[IMGverse/openverse] Token request failed HTTP ${res.status}: ${text.slice(0, 200)}`);
      return null;
    }

    const data = JSON.parse(text);
    cachedToken    = data.access_token;
    tokenExpiresAt = now + (data.expires_in || 3600) * 1000;
    return cachedToken;
  } catch (err) {
    console.error('[IMGverse/openverse] Token request failed:', err.message);
    return null;
  }
}
