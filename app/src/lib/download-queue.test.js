// =============================================================================
// src/lib/download-queue.test.js
// IMGverse Search — Tests for the sequential named-download queue.
//
// @package IMGverse-Search
// @since   2.0.0
// =============================================================================

'use strict';

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOWNLOAD_GAP_MS,
  buildDownloadParams,
  downloadImage,
  runDownloadQueue,
} from '../../public/download-queue.js';

let originalError;
beforeEach(() => { originalError = console.error; console.error = () => {}; });
afterEach(() => { console.error = originalError; });

const img = { full: 'https://images.pexels.com/1.jpg', credit: 'Ann', provider: 'pexels', license: 'Pexels License', sourceUrl: 'https://pexels.com/1' };

describe('buildDownloadParams', () => {
  it('carries url, name, size and credit fields', () => {
    const p = buildDownloadParams(img, 'what to serve with tri tip', 'full');
    assert.equal(p.get('url'), img.full);
    assert.equal(p.get('name'), 'what to serve with tri tip');
    assert.equal(p.get('size'), 'full');
    assert.equal(p.get('credit'), 'Ann');
    assert.equal(p.get('provider'), 'pexels');
    assert.equal(p.get('license'), 'Pexels License');
    assert.equal(p.get('sourceUrl'), 'https://pexels.com/1');
  });
  it('defaults to web size and omits missing credit fields', () => {
    const p = buildDownloadParams({ full: 'https://x/1.jpg' }, 'a');
    assert.equal(p.get('size'), 'web');
    assert.equal(p.has('credit'), false);
  });
});

describe('runDownloadQueue', () => {
  it('downloads in order with a gap between files and keeps going after a failure', async () => {
    const order = [];
    const sleeps = [];
    const progress = [];
    const failures = await runDownloadQueue(
      [{ img, name: 'a' }, { img, name: 'b' }, { img, name: 'c' }],
      {
        download: async (_img, name) => { order.push(name); if (name === 'b') throw new Error('HTTP 403'); },
        onProgress: (p) => progress.push(`${p.index + 1}/${p.total} ${p.name}`),
        sleep: async (ms) => { sleeps.push(ms); },
      },
    );
    assert.deepEqual(order, ['a', 'b', 'c']);
    assert.deepEqual(sleeps, [DOWNLOAD_GAP_MS, DOWNLOAD_GAP_MS]);
    assert.deepEqual(progress, ['1/3 a', '2/3 b', '3/3 c']);
    assert.deepEqual(failures.map((f) => [f.name, f.error]), [['b', 'HTTP 403']]);
    assert.equal(failures[0].img, img);
  });
  it('returns no failures for an empty queue', async () => {
    assert.deepEqual(await runDownloadQueue([], { download: async () => {} }), []);
  });
});

describe('downloadImage', () => {
  it('throws the server message on a failed download', async () => {
    const fetchImpl = async () => ({ ok: false, status: 502, text: async () => 'Upstream HTTP 403' });
    await assert.rejects(() => downloadImage(img, 'a', 'web', { fetchImpl, doc: {} }), /403/);
  });
  it('saves the file under the keyword name', async () => {
    let clicked = null;
    const anchor = { click() { clicked = this.download; }, remove() {} };
    const doc = { createElement: () => anchor, body: { appendChild() {} } };
    let requested = '';
    const fetchImpl = async (url) => { requested = String(url); return { ok: true, blob: async () => new Blob(['x']) }; };
    await downloadImage(img, 'can you freeze kiwi', 'web', { fetchImpl, doc });
    assert.equal(clicked, 'can you freeze kiwi.jpg');
    assert.match(requested, /^\/download\?/);
    assert.equal(new URL(requested, 'http://x').searchParams.get('name'), 'can you freeze kiwi');
  });
});
