// =============================================================================
// src/providers/openverse-auth.js
// IMGverse Search — Openverse OAuth2 client-credentials token helper.
// Datacenter IPs (Hetzner, many VPS hosts) often get HTTP 403 from Cloudflare
// on anonymous requests. Registered OAuth apps receive Bearer tokens that
// bypass this block.
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

/**
 * Obtain a cached Openverse Bearer token when credentials are configured.
 *
 * @returns {Promise<string|null>} Access token, or null if credentials are unset.
 */
export async function getOpenverseToken() {
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
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      console.error(`[IMGverse/openverse] Token request failed HTTP ${res.status}: ${detail}`);
      return null;
    }

    const data = await res.json();
    cachedToken    = data.access_token;
    tokenExpiresAt = now + (data.expires_in || 3600) * 1000;
    return cachedToken;
  } catch (err) {
    console.error('[IMGverse/openverse] Token request failed:', err.message);
    return null;
  }
}
