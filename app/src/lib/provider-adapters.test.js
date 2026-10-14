// =============================================================================
// src/lib/provider-adapters.test.js
// SISE — Tests for provider adapter response reporting.
//
// @package SISE
// @since   2.0.0
// =============================================================================

'use strict';

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { search as unsplash } from '../providers/unsplash.js';
import { search as pexels } from '../providers/pexels.js';
import { search as pixabay } from '../providers/pixabay.js';
import { search as inaturalist } from '../providers/inaturalist.js';

function fakeFetch(body, { status = 200, headers = {} } = {}) {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(headers),
      json: async () => body,
    };
  };
  fn.calls = calls;
  return fn;
}

let errors;
let originalError;
const savedEnv = {};
beforeEach(() => {
  errors = [];
  originalError = console.error;
  console.error = (...args) => { errors.push(args.map(String).join(' ')); };
  for (const k of ['UNSPLASH_KEY', 'PEXELS_KEY', 'PIXABAY_KEY']) {
    savedEnv[k] = process.env[k];
    process.env[k] = 'test-key';
  }
});
afterEach(() => {
  console.error = originalError;
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('provider adapters', () => {
  it('pexels hands the response to onResponse and maps photos', async () => {
    const fetchImpl = fakeFetch({ photos: [{
      id: 7, width: 1600, height: 900, alt: 'Salmon', photographer: 'Ann', photographer_url: 'https://p/ann', url: 'https://p/7',
      src: { large2x: 'https://images.pexels.com/7-l.jpeg', original: 'https://images.pexels.com/7.jpeg' },
    }] }, { headers: { 'X-Ratelimit-Remaining': '19999' } });
    const seen = [];
    const images = await pexels('salmon', 1, 'landscape', { fetchImpl, onResponse: (res) => seen.push(res) });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].headers.get('x-ratelimit-remaining'), '19999');
    assert.equal(images.length, 1);
    assert.equal(images[0].id, 'pexels-7');
    assert.equal(images[0].width, 1600);
    assert.match(fetchImpl.calls[0], /orientation=landscape/);
  });

  it('unsplash maps square to squarish and reports the response', async () => {
    const fetchImpl = fakeFetch({ results: [] });
    let reported = 0;
    await unsplash('corn', 1, 'square', { fetchImpl, onResponse: () => { reported += 1; } });
    assert.equal(reported, 1);
    assert.match(fetchImpl.calls[0], /orientation=squarish/);
  });

  it('pixabay logs and returns [] on a non-OK response, still reporting it', async () => {
    const fetchImpl = fakeFetch({}, { status: 429 });
    let status = 0;
    const images = await pixabay('kiwi', 1, '', { fetchImpl, onResponse: (res) => { status = res.status; } });
    assert.deepEqual(images, []);
    assert.equal(status, 429);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^\[SISE\/pixabay\] HTTP 429 for q="kiwi"/);
  });

  it('logs and returns [] when fetch throws', async () => {
    const fetchImpl = async () => { throw new Error('socket hang up'); };
    const images = await pexels('rice', 1, '', { fetchImpl });
    assert.deepEqual(images, []);
    assert.match(errors[0], /^\[SISE\/pexels\] search failed for q="rice": socket hang up/);
  });

  it('inaturalist reports the response and ignores orientation', async () => {
    const fetchImpl = fakeFetch({ results: [] });
    let reported = 0;
    await inaturalist('heron', 1, 'portrait', { fetchImpl, onResponse: () => { reported += 1; } });
    assert.equal(reported, 1);
    assert.doesNotMatch(fetchImpl.calls[0], /orientation/);
  });

  it('skips the request entirely when the API key is missing', async () => {
    delete process.env.UNSPLASH_KEY;
    const fetchImpl = fakeFetch({ results: [] });
    assert.deepEqual(await unsplash('corn', 1, '', { fetchImpl }), []);
    assert.equal(fetchImpl.calls.length, 0);
  });
});
