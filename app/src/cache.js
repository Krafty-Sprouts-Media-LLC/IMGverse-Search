// =============================================================================
// src/cache.js
// IMGverse Search — Redis cache wrapper (ioredis).
// Provides get/set with TTL. Used by the search route to avoid redundant
// provider API calls within the 1-hour window.
//
// @package IMGverse-Search
// @since   1.0.0
// =============================================================================

'use strict';

import Redis from 'ioredis';

const client = new Redis(process.env.REDIS_URL || 'redis://redis:6379', {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false,
});

client.on('error', (err) => {
  console.warn('[IMGverse/cache] Redis error (search will run uncached):', err.message);
});

/**
 * Retrieve a cached value by key.
 *
 * @param {string} key - Cache key.
 * @returns {Promise<any|null>} Parsed value or null on miss/error.
 */
export async function get(key) {
  try {
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Store a value in the cache with a TTL.
 *
 * @param {string} key          - Cache key.
 * @param {any}    value        - Value to store (will be JSON-serialised).
 * @param {number} ttlSeconds   - Time-to-live in seconds (default 3600).
 * @returns {Promise<void>}
 */
export async function set(key, value, ttlSeconds = 3600) {
  try {
    await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // Non-fatal — search still works without cache
  }
}
