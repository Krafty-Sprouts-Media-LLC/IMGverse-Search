// =============================================================================
// src/lib/search-all.test.js
// IMGverse Search — Tests for budget-aware, per-provider-cached search.
//
// @package IMGverse-Search
// @since   2.0.0
// =============================================================================

'use strict';

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createSearchAll, snapshotConfigured } from '../providers/index.js';
import { createRateBudget } from './rate-budget.js';
import { search as pexelsAdapter } from '../providers/pexels.js';

const HOUR = 3_600_000;

function memCache() {
  const map = new Map();
  return {
    map,
    get: async (k) => (map.has(k) ? map.get(k) : null),
    set: async (k, v) => { map.set(k, v); },
  };
}

const img = (provider, id, width = 1200, height = 800) => ({
  id: `${provider}-${id}`,
  provider,
  thumb: `https://cdn.example/${provider}/${id}.jpg`,
  full: `https://cdn.example/${provider}/${id}-full.jpg`,
  width,
  height,
});

function fakeProvider(name, images, { nativeOrientation = true, onCall } = {}) {
  const calls = [];
  return {
    name,
    nativeOrientation,
    calls,
    search: async (query, page, orientation, options) => {
      calls.push({ query, page, orientation });
      if (onCall) return onCall(options);
      return images;
    },
  };
}

function budgetFor(names, limit = 5) {
  const limits = Object.fromEntries(names.map((n) => [n, { limit, windowMs: HOUR, per: 'hour' }]));
  return createRateBudget({ limits, now: () => 1_000_000 });
}

let originalWarn;
let originalError;
beforeEach(() => {
  originalWarn = console.warn;
  originalError = console.error;
  console.warn = () => {};
  console.error = () => {};
});
afterEach(() => {
  console.warn = originalWarn;
  console.error = originalError;
});

describe('createSearchAll', () => {
  it('merges providers and reports them ok', async () => {
    const a = fakeProvider('pexels', [img('pexels', 1)]);
    const b = fakeProvider('pixabay', [img('pixabay', 1)]);
    const searchAll = createSearchAll({ providers: [a, b], budget: budgetFor(['pexels', 'pixabay']), cache: memCache() });
    const { results, providerStatus } = await searchAll('salmon');
    assert.deepEqual(results.map((r) => r.id).sort(), ['pexels-1', 'pixabay-1']);
    assert.deepEqual(providerStatus, { pexels: { status: 'ok' }, pixabay: { status: 'ok' } });
  });

  it('caches each non-empty provider group and serves it without calling again', async () => {
    const a = fakeProvider('pexels', [img('pexels', 1)]);
    const cache = memCache();
    const budget = budgetFor(['pexels']);
    const searchAll = createSearchAll({ providers: [a], budget, cache });
    await searchAll('salmon', 2, [], 'landscape');
    assert.ok(cache.map.has('imgverse:search:pexels:salmon:2:landscape'));
    const second = await searchAll('salmon', 2, [], 'landscape');
    assert.equal(a.calls.length, 1);
    assert.deepEqual(second.providerStatus.pexels, { status: 'ok', cached: true });
    assert.equal(budget.snapshot().pexels.remaining, 4);
  });

  it('skips a paused provider, reports resumeAt, and keeps the others', async () => {
    const a = fakeProvider('pexels', [img('pexels', 1)]);
    const b = fakeProvider('pixabay', [img('pixabay', 1)]);
    const budget = budgetFor(['pexels', 'pixabay'], 1);
    budget.recordCall('pexels');
    const searchAll = createSearchAll({ providers: [a, b], budget, cache: memCache() });
    const { results, providerStatus } = await searchAll('salmon');
    assert.equal(a.calls.length, 0);
    assert.deepEqual(results.map((r) => r.id), ['pixabay-1']);
    assert.deepEqual(providerStatus.pexels, { status: 'paused', resumeAt: new Date(1_000_000 + HOUR).toISOString() });
    assert.deepEqual(providerStatus.pixabay, { status: 'ok' });
  });

  it('serves a cached group even while the provider is paused', async () => {
    const a = fakeProvider('pexels', [img('pexels', 1)]);
    const cache = memCache();
    const budget = budgetFor(['pexels'], 1);
    const searchAll = createSearchAll({ providers: [a], budget, cache });
    await searchAll('salmon');
    const again = await searchAll('salmon');
    assert.deepEqual(again.results.map((r) => r.id), ['pexels-1']);
    assert.deepEqual(again.providerStatus.pexels, { status: 'ok', cached: true });
  });

  it('marks a throwing provider as error, caches nothing for it, and keeps the others', async () => {
    const bad = fakeProvider('pexels', [], { onCall: () => { throw new Error('boom'); } });
    const good = fakeProvider('pixabay', [img('pixabay', 1)]);
    const cache = memCache();
    const searchAll = createSearchAll({ providers: [bad, good], budget: budgetFor(['pexels', 'pixabay']), cache });
    const { results, providerStatus } = await searchAll('salmon');
    assert.deepEqual(providerStatus.pexels, { status: 'error' });
    assert.deepEqual(results.map((r) => r.id), ['pixabay-1']);
    assert.equal([...cache.map.keys()].some((k) => k.includes(':pexels:')), false);
  });

  it('does not cache empty groups', async () => {
    const a = fakeProvider('pexels', []);
    const cache = memCache();
    const searchAll = createSearchAll({ providers: [a], budget: budgetFor(['pexels']), cache });
    await searchAll('nothing');
    assert.equal(cache.map.size, 0);
  });

  it('reports paused when the call itself hits a 429', async () => {
    const a = fakeProvider('pexels', [], {
      onCall: (options) => {
        options.onResponse({ status: 429, headers: new Headers() });
        return [];
      },
    });
    const searchAll = createSearchAll({ providers: [a], budget: budgetFor(['pexels']), cache: memCache() });
    const { providerStatus } = await searchAll('salmon');
    assert.equal(providerStatus.pexels.status, 'paused');
    assert.equal(providerStatus.pexels.resumeAt, new Date(1_000_000 + HOUR).toISOString());
  });

  it('sends orientation only to native providers and filters every group', async () => {
    const native = fakeProvider('pixabay', [img('pixabay', 'wide', 1600, 900), img('pixabay', 'box', 1000, 1000)]);
    const plain = fakeProvider('inaturalist', [img('inaturalist', 'tall', 600, 900), img('inaturalist', 'box', 900, 900)], { nativeOrientation: false });
    const searchAll = createSearchAll({ providers: [native, plain], budget: budgetFor(['pixabay', 'inaturalist']), cache: memCache() });
    const { results } = await searchAll('crab', 1, [], 'square');
    assert.equal(native.calls[0].orientation, 'square');
    assert.equal(plain.calls[0].orientation, '');
    assert.deepEqual(results.map((r) => r.id).sort(), ['inaturalist-box', 'pixabay-box']);
  });

  it('reports error when the provider answers with an HTTP error status', async () => {
    const a = fakeProvider('pexels', [], {
      onCall: (options) => {
        options.onResponse({ status: 500, headers: new Headers() });
        return [];
      },
    });
    const searchAll = createSearchAll({ providers: [a], budget: budgetFor(['pexels']), cache: memCache() });
    const { providerStatus } = await searchAll('salmon');
    assert.deepEqual(providerStatus.pexels, { status: 'error' });
  });

  it('reports error when the adapter reports a failure without throwing', async () => {
    const a = fakeProvider('pexels', [], {
      onCall: (options) => {
        options.onError?.(new Error('timeout'));
        return [];
      },
    });
    const searchAll = createSearchAll({ providers: [a], budget: budgetFor(['pexels']), cache: memCache() });
    const { providerStatus } = await searchAll('salmon');
    assert.deepEqual(providerStatus.pexels, { status: 'error' });
  });

  it('reports a real adapter HTTP 500 as error end to end', async () => {
    const saved = process.env.PEXELS_KEY;
    process.env.PEXELS_KEY = 'test-key';
    try {
      const fetchImpl = async () => ({ ok: false, status: 500, headers: new Headers(), json: async () => ({}) });
      const real = {
        name: 'pexels',
        nativeOrientation: true,
        search: (q, page, orientation, options) => pexelsAdapter(q, page, orientation, { ...options, fetchImpl }),
      };
      const searchAll = createSearchAll({ providers: [real], budget: budgetFor(['pexels']), cache: memCache() });
      const { providerStatus } = await searchAll('salmon');
      assert.deepEqual(providerStatus.pexels, { status: 'error' });
    } finally {
      if (saved === undefined) delete process.env.PEXELS_KEY;
      else process.env.PEXELS_KEY = saved;
    }
  });

  it('skips unconfigured providers without spending budget or reporting them', async () => {
    const a = fakeProvider('pexels', [img('pexels', 1)]);
    a.configured = () => false;
    const b = fakeProvider('pixabay', [img('pixabay', 1)]);
    const budget = budgetFor(['pexels', 'pixabay']);
    const searchAll = createSearchAll({ providers: [a, b], budget, cache: memCache() });
    const { results, providerStatus } = await searchAll('salmon');
    assert.equal(a.calls.length, 0);
    assert.deepEqual(Object.keys(providerStatus), ['pixabay']);
    assert.deepEqual(results.map((r) => r.id), ['pixabay-1']);
    assert.equal(budget.snapshot().pexels.remaining, 5);
  });

  it('honours the provider filter', async () => {
    const a = fakeProvider('pexels', [img('pexels', 1)]);
    const b = fakeProvider('pixabay', [img('pixabay', 1)]);
    const searchAll = createSearchAll({ providers: [a, b], budget: budgetFor(['pexels', 'pixabay']), cache: memCache() });
    const { providerStatus } = await searchAll('salmon', 1, ['pixabay']);
    assert.equal(a.calls.length, 0);
    assert.deepEqual(Object.keys(providerStatus), ['pixabay']);
  });
});

describe('snapshotConfigured', () => {
  it('lists only configured providers', () => {
    const budget = budgetFor(['pexels', 'pixabay']);
    const providers = [
      { name: 'pexels', configured: () => false },
      { name: 'pixabay' },
    ];
    assert.deepEqual(Object.keys(snapshotConfigured(budget, providers)), ['pixabay']);
  });
});
