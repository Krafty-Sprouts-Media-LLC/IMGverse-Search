// =============================================================================
// src/lib/rate-budget.js
// SISE — Per-provider rate budgets.
// Counts calls per provider per window, honours provider rate-limit headers
// and 429 responses, and reports which providers are paused. In memory:
// the stack runs a single app process (see v2.0.0 Part 1 plan ruling).
//
// @package SISE
// @since   2.0.0
// =============================================================================

'use strict';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// Unsplash/Pixabay-style providers that report no reset time: we can only guess
// when quota returns, so pause briefly and probe instead of blocking a full window.
const PROBE_MS = 5 * MINUTE;

export const DEFAULT_LIMITS = Object.freeze({
  pexels:      Object.freeze({ limit: 200,  windowMs: HOUR,   per: 'hour' }),
  unsplash:    Object.freeze({ limit: 50,   windowMs: HOUR,   per: 'hour' }), // Demo; Production is 1000 (header wins)
  pixabay:     Object.freeze({ limit: 100,  windowMs: MINUTE, per: 'minute' }),
  inaturalist: Object.freeze({ limit: 60,   windowMs: MINUTE, per: 'minute' }),
});

// Providers whose rate-limit headers describe the same window we count.
// (Pexels' headers are monthly and handled separately.)
const HEADERS_MATCH_WINDOW = new Set(['unsplash', 'pixabay']);

/**
 * Apply `<PROVIDER>_RATE_LIMIT` env overrides to the default limits.
 *
 * @param {object} [env]
 * @param {object} [base]
 * @returns {object} Limits keyed by provider name.
 */
export function limitsFromEnv(env = process.env, base = DEFAULT_LIMITS) {
  const out = {};
  for (const [name, cfg] of Object.entries(base)) {
    const raw = Number(env[`${name.toUpperCase()}_RATE_LIMIT`]);
    out[name] = { ...cfg, limit: raw > 0 ? Math.floor(raw) : cfg.limit };
  }
  return out;
}

function headerNumber(headers, key) {
  const value = headers?.get?.(key);
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Create a rate budget.
 *
 * @param {object}   [options]
 * @param {object}   [options.limits] Limits keyed by provider name.
 * @param {Function} [options.now]    Clock in ms (injected for tests).
 */
export function createRateBudget({ limits = DEFAULT_LIMITS, now = () => Date.now() } = {}) {
  const state = new Map();

  function entry(name) {
    const cfg = limits[name];
    const t = now();
    let s = state.get(name);
    if (!s) {
      s = { windowStart: t, used: 0, limit: cfg.limit, pausedUntil: 0, monthRemaining: null };
      state.set(name, s);
    }
    if (t - s.windowStart >= cfg.windowMs) {
      s.windowStart = t;
      s.used = 0;
    }
    return s;
  }

  function canCall(name) {
    if (!limits[name]) return { ok: true };
    const s = entry(name);
    if (s.pausedUntil > now()) return { ok: false, resumeAt: s.pausedUntil };
    if (s.pausedUntil) {
      // A pause just ended: let one probe through. Its response headers decide
      // whether we are really out of quota (observe() re-pauses if so).
      s.pausedUntil = 0;
      s.used = Math.min(s.used, s.limit - 1);
    }
    if (s.used >= s.limit) return { ok: false, resumeAt: s.windowStart + limits[name].windowMs };
    return { ok: true };
  }

  function recordCall(name) {
    if (limits[name]) entry(name).used += 1;
  }

  function observe(name, status, headers) {
    const cfg = limits[name];
    if (!cfg) return;
    const s = entry(name);
    const t = now();
    const remaining = headerNumber(headers, 'x-ratelimit-remaining');
    const headerLimit = headerNumber(headers, 'x-ratelimit-limit');
    const reset = headerNumber(headers, 'x-ratelimit-reset');
    const retryAfter = headerNumber(headers, 'retry-after');
    let resetAt = null;

    if (name === 'pexels') {
      // Monthly quota: Reset is the Unix timestamp of the monthly roll-over.
      if (remaining != null) s.monthRemaining = remaining;
      if (reset != null) resetAt = reset * 1000;
      if (remaining === 0 && resetAt) s.pausedUntil = Math.max(s.pausedUntil, resetAt);
    } else if (HEADERS_MATCH_WINDOW.has(name)) {
      if (headerLimit != null && headerLimit > 0) s.limit = headerLimit;
      if (remaining != null) s.used = Math.max(0, s.limit - remaining);
      if (reset != null) resetAt = t + reset * 1000; // Pixabay: seconds until reset
      if (remaining === 0) {
        s.pausedUntil = Math.max(s.pausedUntil, resetAt ?? t + Math.min(PROBE_MS, cfg.windowMs));
      }
    }

    if (status === 429) {
      const until = retryAfter != null
        ? t + retryAfter * 1000
        : (resetAt ?? (HEADERS_MATCH_WINDOW.has(name)
          ? t + Math.min(PROBE_MS, cfg.windowMs)
          : s.windowStart + cfg.windowMs));
      s.pausedUntil = Math.max(s.pausedUntil, until);
      console.warn(`[SISE/budget] ${name} returned 429, paused until ${new Date(s.pausedUntil).toISOString()}`);
    }
  }

  function snapshot() {
    const out = {};
    for (const [name, cfg] of Object.entries(limits)) {
      const s = entry(name);
      const gate = canCall(name);
      out[name] = {
        limit: s.limit,
        remaining: Math.max(0, s.limit - s.used),
        per: cfg.per,
        status: gate.ok ? 'ok' : 'paused',
        resumeAt: gate.ok ? null : new Date(gate.resumeAt).toISOString(),
        ...(s.monthRemaining != null ? { monthRemaining: s.monthRemaining } : {}),
      };
    }
    return out;
  }

  return { canCall, recordCall, observe, snapshot };
}
