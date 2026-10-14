// =============================================================================
// src/lib/rate-budget.test.js
// IMGverse Search — Tests for per-provider rate budgets.
//
// @package IMGverse-Search
// @since   2.0.0
// =============================================================================

'use strict';

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LIMITS,
  createRateBudget,
  limitsFromEnv,
} from './rate-budget.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

let warnCalls;
let originalWarn;
beforeEach(() => {
  warnCalls = [];
  originalWarn = console.warn;
  console.warn = (...args) => { warnCalls.push(args); };
});
afterEach(() => {
  console.warn = originalWarn;
});

describe('DEFAULT_LIMITS', () => {
  it('matches the documented provider limits', () => {
    assert.deepEqual(DEFAULT_LIMITS.pexels,      { limit: 200,  windowMs: HOUR,   per: 'hour' });
    assert.deepEqual(DEFAULT_LIMITS.unsplash,    { limit: 5000, windowMs: HOUR,   per: 'hour' });
    assert.deepEqual(DEFAULT_LIMITS.pixabay,     { limit: 100,  windowMs: MINUTE, per: 'minute' });
    assert.deepEqual(DEFAULT_LIMITS.inaturalist, { limit: 60,   windowMs: MINUTE, per: 'minute' });
  });
});

describe('limitsFromEnv', () => {
  it('overrides a limit from <PROVIDER>_RATE_LIMIT and ignores junk', () => {
    const limits = limitsFromEnv({ PEXELS_RATE_LIMIT: '50', UNSPLASH_RATE_LIMIT: 'lots', PIXABAY_RATE_LIMIT: '-3' });
    assert.equal(limits.pexels.limit, 50);
    assert.equal(limits.pexels.windowMs, HOUR);
    assert.equal(limits.unsplash.limit, 5000);
    assert.equal(limits.pixabay.limit, 100);
  });
});

describe('createRateBudget counting', () => {
  const limits = { pexels: { limit: 2, windowMs: HOUR, per: 'hour' } };

  it('allows calls until the limit, then pauses until the window ends', () => {
    const c = clock();
    const b = createRateBudget({ limits, now: c.now });
    assert.deepEqual(b.canCall('pexels'), { ok: true });
    b.recordCall('pexels');
    b.recordCall('pexels');
    const gate = b.canCall('pexels');
    assert.equal(gate.ok, false);
    assert.equal(gate.resumeAt, 1_000_000 + HOUR);
  });

  it('starts a fresh window once the old one has passed', () => {
    const c = clock();
    const b = createRateBudget({ limits, now: c.now });
    b.recordCall('pexels');
    b.recordCall('pexels');
    c.advance(HOUR);
    assert.deepEqual(b.canCall('pexels'), { ok: true });
    assert.equal(b.snapshot().pexels.remaining, 2);
  });

  it('never limits unknown providers', () => {
    const b = createRateBudget({ limits, now: clock().now });
    for (let i = 0; i < 10; i++) b.recordCall('flickr');
    assert.deepEqual(b.canCall('flickr'), { ok: true });
  });
});

describe('createRateBudget 429 handling', () => {
  const limits = { pexels: { limit: 200, windowMs: HOUR, per: 'hour' } };

  it('pauses until the window ends when a 429 has no rate headers', () => {
    const c = clock();
    const b = createRateBudget({ limits, now: c.now });
    b.recordCall('pexels');
    c.advance(10 * MINUTE);
    b.observe('pexels', 429, new Headers());
    const gate = b.canCall('pexels');
    assert.equal(gate.ok, false);
    assert.equal(gate.resumeAt, 1_000_000 + HOUR);
    assert.equal(warnCalls.length, 1);
    assert.match(String(warnCalls[0][0]), /^\[IMGverse\/budget\] pexels returned 429, paused until /);
    c.advance(50 * MINUTE);
    assert.deepEqual(b.canCall('pexels'), { ok: true });
  });

  it('uses Retry-After seconds when present', () => {
    const c = clock();
    const b = createRateBudget({ limits, now: c.now });
    b.observe('pexels', 429, new Headers({ 'Retry-After': '30' }));
    assert.equal(b.canCall('pexels').resumeAt, 1_000_000 + 30_000);
  });
});

describe('createRateBudget headers', () => {
  it('lets Unsplash headers override the configured limit and count', () => {
    const c = clock();
    const b = createRateBudget({ limits: { unsplash: { limit: 5000, windowMs: HOUR, per: 'hour' } }, now: c.now });
    b.recordCall('unsplash');
    b.observe('unsplash', 200, new Headers({ 'X-Ratelimit-Limit': '50', 'X-Ratelimit-Remaining': '3' }));
    const snap = b.snapshot().unsplash;
    assert.equal(snap.limit, 50);
    assert.equal(snap.remaining, 3);
    b.observe('unsplash', 200, new Headers({ 'X-Ratelimit-Limit': '50', 'X-Ratelimit-Remaining': '0' }));
    const gate = b.canCall('unsplash');
    assert.equal(gate.ok, false);
    assert.equal(gate.resumeAt, 1_000_000 + HOUR);
  });

  it('pauses Pixabay until its reset seconds when remaining hits 0', () => {
    const c = clock();
    const b = createRateBudget({ limits: { pixabay: { limit: 100, windowMs: MINUTE, per: 'minute' } }, now: c.now });
    b.observe('pixabay', 200, new Headers({ 'X-RateLimit-Limit': '100', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '12' }));
    assert.equal(b.canCall('pixabay').resumeAt, 1_000_000 + 12_000);
  });

  it('treats Pexels headers as monthly and keeps counting the hour locally', () => {
    const c = clock();
    const b = createRateBudget({ limits: { pexels: { limit: 200, windowMs: HOUR, per: 'hour' } }, now: c.now });
    b.recordCall('pexels');
    b.observe('pexels', 200, new Headers({ 'X-Ratelimit-Limit': '20000', 'X-Ratelimit-Remaining': '19950', 'X-Ratelimit-Reset': '2000000' }));
    const snap = b.snapshot().pexels;
    assert.equal(snap.limit, 200);
    assert.equal(snap.remaining, 199);
    assert.equal(snap.monthRemaining, 19950);
  });

  it('pauses Pexels until the monthly reset when the month is used up', () => {
    const c = clock();
    const b = createRateBudget({ limits: { pexels: { limit: 200, windowMs: HOUR, per: 'hour' } }, now: c.now });
    b.observe('pexels', 200, new Headers({ 'X-Ratelimit-Remaining': '0', 'X-Ratelimit-Reset': '5000' }));
    assert.equal(b.canCall('pexels').resumeAt, 5_000_000);
  });
});

describe('snapshot', () => {
  it('reports every configured provider with status and resume time', () => {
    const c = clock();
    const b = createRateBudget({ limits: { pexels: { limit: 1, windowMs: HOUR, per: 'hour' }, pixabay: { limit: 100, windowMs: MINUTE, per: 'minute' } }, now: c.now });
    b.recordCall('pexels');
    const snap = b.snapshot();
    assert.deepEqual(Object.keys(snap).sort(), ['pexels', 'pixabay']);
    assert.equal(snap.pexels.status, 'paused');
    assert.equal(snap.pexels.resumeAt, new Date(1_000_000 + HOUR).toISOString());
    assert.equal(snap.pexels.per, 'hour');
    assert.deepEqual(snap.pixabay, { limit: 100, remaining: 100, per: 'minute', status: 'ok', resumeAt: null });
  });
});
