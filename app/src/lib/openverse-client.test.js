// =============================================================================
// src/lib/openverse-client.test.js
// IMGverse Search — Tests for browser-side Openverse search helpers.
//
// @package IMGverse-Search
// @since   1.0.33
// =============================================================================

'use strict';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  capPageSize,
  filterByOrientation,
  mapOpenverseItem,
  messageFromFailedOpenverse,
  mergeHasNext,
  searchOpenverse,
  shouldFetchOpenverse,
  weaveOpenverse,
} from '../../public/openverse-client.js';

describe('capPageSize', () => {
  it('caps anonymous page size at 20', () => {
    assert.equal(capPageSize(50), 20);
    assert.equal(capPageSize(20), 20);
    assert.equal(capPageSize(10), 10);
    assert.equal(capPageSize(0), 1);
    assert.equal(capPageSize(-3), 1);
  });
});

describe('mapOpenverseItem', () => {
  it('maps an Openverse result to the canonical ImageResult shape', () => {
    const mapped = mapOpenverseItem({
      id: 'abc',
      title: 'Birds',
      url: 'https://example.com/full.jpg',
      thumbnail: 'https://example.com/thumb.jpg',
      creator: 'Ann',
      creator_url: 'https://example.com/ann',
      license: 'by',
      foreign_landing_url: 'https://flickr.com/photo',
      width: 1024,
      height: 768,
    });

    assert.equal(mapped.id, 'openverse-abc');
    assert.equal(mapped.provider, 'openverse');
    assert.equal(mapped.thumb, 'https://example.com/thumb.jpg');
    assert.equal(mapped.full, 'https://example.com/full.jpg');
    assert.equal(mapped.alt, 'Birds');
    assert.equal(mapped.credit, 'Ann');
    assert.equal(mapped.creditUrl, 'https://example.com/ann');
    assert.equal(mapped.license, 'by');
    assert.equal(mapped.sourceUrl, 'https://flickr.com/photo');
    assert.equal(mapped.width, 1024);
    assert.equal(mapped.height, 768);
  });

  it('returns null for invalid items', () => {
    assert.equal(mapOpenverseItem(null), null);
    assert.equal(mapOpenverseItem({}), null);
  });
});

describe('messageFromFailedOpenverse', () => {
  it('explains Cloudflare HTML challenges', () => {
    const msg = messageFromFailedOpenverse(
      403,
      '<html>Just a moment...*{box-sizing:border-box}</html>'
    );
    assert.match(msg, /Cloudflare/i);
  });
});

describe('shouldFetchOpenverse', () => {
  it('fetches for all-providers and the openverse filter only', () => {
    assert.equal(shouldFetchOpenverse(''), true);
    assert.equal(shouldFetchOpenverse('openverse'), true);
    assert.equal(shouldFetchOpenverse('pexels'), false);
  });
});

describe('weaveOpenverse', () => {
  it('inserts one Openverse result after every four server results', () => {
    const server = ['s1', 's2', 's3', 's4', 's5'];
    const openverse = ['o1', 'o2'];
    assert.deepEqual(weaveOpenverse(server, openverse), ['s1', 's2', 's3', 's4', 'o1', 's5', 'o2']);
  });
});

describe('mergeHasNext', () => {
  it('is true if either source has another page', () => {
    assert.equal(mergeHasNext(false, true), true);
    assert.equal(mergeHasNext(true, false), true);
    assert.equal(mergeHasNext(false, false), false);
  });
});

describe('filterByOrientation', () => {
  it('keeps landscape images when that filter is set', () => {
    const results = [
      { id: 'wide', width: 1200, height: 800 },
      { id: 'tall', width: 600, height: 900 },
    ];
    const filtered = filterByOrientation(results, 'landscape');
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 'wide');
  });
});

describe('searchOpenverse', () => {
  it('searches Openverse and maps results', async () => {
    const fetchImpl = async (url) => {
      assert.match(String(url), /q=sunset/);
      assert.match(String(url), /page_size=20/);
      return {
        status: 200,
        text: async () => JSON.stringify({
          result_count: 1,
          page_count: 3,
          results: [{
            id: 'abc',
            title: 'Sunset',
            url: 'https://example.com/full.jpg',
            thumbnail: 'https://example.com/thumb.jpg',
            creator: 'Ann',
            width: 10,
            height: 20,
          }],
        }),
      };
    };

    const result = await searchOpenverse({ q: 'sunset', page: 1, fetchImpl });
    assert.equal(result.images.length, 1);
    assert.equal(result.images[0].id, 'openverse-abc');
    assert.equal(result.hasNext, true);
    assert.equal(result.error, '');
  });

  it('returns a Cloudflare error instead of throwing', async () => {
    const fetchImpl = async () => ({
      status: 403,
      text: async () => '<html>Just a moment...</html>',
    });

    const result = await searchOpenverse({ q: 'cat', fetchImpl });
    assert.equal(result.images.length, 0);
    assert.equal(result.hasNext, false);
    assert.match(result.error, /Cloudflare/i);
  });
});
