// =============================================================================
// src/lib/search-client.test.js
// IMGverse Search — Tests for the shared server + Openverse search client.
//
// @package IMGverse-Search
// @since   2.0.0
// =============================================================================

'use strict';

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  dedupeClientResults,
  imageKey,
  searchAllSources,
  searchSources,
} from '../../public/search-client.js';

const server = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({
  id: `pexels-${i}`, provider: 'pexels', thumb: `https://images.pexels.com/${i}-t.jpg`, full: `https://images.pexels.com/${i}.jpg`, width: 1200, height: 800, ...extra,
}));
const ovRaw = (n) => Array.from({ length: n }, (_, i) => ({
  id: `ov${i}`, url: `https://live.staticflickr.com/${i}.jpg`, thumbnail: `https://api.openverse.org/${i}/thumb`, width: 1024, height: 683,
}));

function fakeFetch({ serverStatus = 200, serverBody = { results: server(4), hasNext: true, providerStatus: { pexels: { status: 'ok' } } }, ovBody = { results: ovRaw(1), page_count: 1 } } = {}) {
  const calls = [];
  const fn = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.startsWith('/api/search')) {
      return { ok: serverStatus < 400, status: serverStatus, json: async () => serverBody };
    }
    return { status: 200, text: async () => JSON.stringify(ovBody) };
  };
  fn.calls = calls;
  return fn;
}

let errors;
let originalError;
beforeEach(() => {
  errors = [];
  originalError = console.error;
  console.error = (...a) => { errors.push(a.map(String).join(' ')); };
});
afterEach(() => { console.error = originalError; });

describe('imageKey', () => {
  it('uses host and path, lower-cased, ignoring query strings', () => {
    assert.equal(imageKey({ full: 'https://Images.Pexels.com/A.jpg?fm=jpg' }), 'images.pexels.com/a.jpg');
  });
  it('falls back to the id when there is no usable URL', () => {
    assert.equal(imageKey({ id: 'x-1', full: 'not a url' }), 'x-1');
  });
});

describe('dedupeClientResults', () => {
  it('drops the same image returned twice', () => {
    const a = { id: 'a', full: 'https://cdn.example/1.jpg' };
    const b = { id: 'b', full: 'https://cdn.example/1.jpg?w=200' };
    assert.deepEqual(dedupeClientResults([a, b]).map((r) => r.id), ['a']);
  });
});

describe('searchSources', () => {
  it('limits the server search to the chosen providers', async () => {
    const fetchImpl = fakeFetch();
    await searchSources({ q: 'salmon', serverProviders: ['pexels', 'pixabay'], openverse: false, fetchImpl });
    assert.equal(fetchImpl.calls.length, 1);
    assert.equal(new URL(fetchImpl.calls[0], 'http://x').searchParams.get('providers'), 'pexels,pixabay');
  });

  it('skips the server when no server provider is chosen', async () => {
    const fetchImpl = fakeFetch();
    const out = await searchSources({ q: 'salmon', serverProviders: [], openverse: true, fetchImpl });
    assert.equal(fetchImpl.calls.some((u) => u.startsWith('/api/search')), false);
    assert.deepEqual(out.providerStatus, { openverse: { status: 'ok' } });
  });

  it('reports Openverse as paused on HTTP 429 and keeps server results', async () => {
    const fetchImpl = async (url) => (String(url).startsWith('/api/search')
      ? { ok: true, status: 200, json: async () => ({ results: server(2), hasNext: false, providerStatus: { pexels: { status: 'ok' } } }) }
      : { status: 429, text: async () => '{"detail":"throttled"}' });
    const out = await searchSources({ q: 'salmon', fetchImpl });
    assert.equal(out.openverseStatus, 429);
    assert.deepEqual(out.providerStatus.openverse, { status: 'paused' });
    assert.equal(out.results.length, 2);
  });

  it('reports a server failure without throwing', async () => {
    const fetchImpl = fakeFetch({ serverStatus: 500, serverBody: { error: 'boom' } });
    const out = await searchSources({ q: 'salmon', fetchImpl });
    assert.equal(out.serverError, 'boom');
  });
});

describe('searchAllSources', () => {
  it('searches server and Openverse, weaving one Openverse result per four', async () => {
    const fetchImpl = fakeFetch();
    const out = await searchAllSources({ q: 'salmon', page: 2, orientation: 'landscape', fetchImpl });
    assert.deepEqual(out.results.map((r) => r.provider), ['pexels', 'pexels', 'pexels', 'pexels', 'openverse']);
    assert.equal(out.hasNext, true);
    assert.deepEqual(out.providerStatus, { pexels: { status: 'ok' } });
    const serverUrl = new URL(fetchImpl.calls.find((u) => u.startsWith('/api/search')), 'http://x');
    assert.equal(serverUrl.searchParams.get('q'), 'salmon');
    assert.equal(serverUrl.searchParams.get('page'), '2');
    assert.equal(serverUrl.searchParams.get('orientation'), 'landscape');
    assert.equal(serverUrl.searchParams.has('providers'), false);
  });

  it('skips the server entirely when the Openverse pill is chosen', async () => {
    const fetchImpl = fakeFetch();
    const out = await searchAllSources({ q: 'salmon', provider: 'openverse', fetchImpl });
    assert.equal(fetchImpl.calls.some((u) => u.startsWith('/api/search')), false);
    assert.deepEqual(out.results.map((r) => r.provider), ['openverse']);
  });

  it('skips Openverse and passes the provider when a server pill is chosen', async () => {
    const fetchImpl = fakeFetch();
    await searchAllSources({ q: 'salmon', provider: 'pexels', fetchImpl });
    assert.equal(fetchImpl.calls.length, 1);
    assert.equal(new URL(fetchImpl.calls[0], 'http://x').searchParams.get('providers'), 'pexels');
  });

  it('keeps Openverse results and logs when the server search fails', async () => {
    const fetchImpl = fakeFetch({ serverStatus: 500, serverBody: { error: 'boom' } });
    const out = await searchAllSources({ q: 'salmon', fetchImpl });
    assert.deepEqual(out.results.map((r) => r.provider), ['openverse']);
    assert.ok(errors.some((e) => e.startsWith('[IMGverse/search]') && e.includes('boom')));
  });

  it('reports the Openverse error without throwing', async () => {
    const fetchImpl = async (url) => (String(url).startsWith('/api/search')
      ? { ok: true, status: 200, json: async () => ({ results: [], hasNext: false }) }
      : { status: 403, text: async () => '<html>Just a moment...</html>' });
    const out = await searchAllSources({ q: 'salmon', fetchImpl });
    assert.match(out.openverseError, /Cloudflare/);
    assert.deepEqual(out.results, []);
  });
});
