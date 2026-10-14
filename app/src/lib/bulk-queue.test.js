// =============================================================================
// src/lib/bulk-queue.test.js
// SISE — Tests for the bulk keyword queue.
//
// @package SISE
// @since   2.0.0
// =============================================================================

'use strict';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CONCURRENCY, LOOKAHEAD, OPENVERSE_BACKOFF_MS, createBulkQueue } from '../../public/bulk-queue.js';

const img = (id, w = 1600, h = 900) => ({ id, full: `https://cdn.example/${id}.jpg`, width: w, height: h });
const tick = () => new Promise((r) => setImmediate(r));
async function settle() { for (let i = 0; i < 20; i++) await tick(); }

function harness({ results = (q) => [img(`${q}-1`), img(`${q}-2`)], status = () => ({}) } = {}) {
  const calls = [];
  const timers = [];
  let t = 0;
  const q = createBulkQueue({
    now: () => t,
    schedule: (fn, ms) => { const timer = { fn, at: t + ms, live: true }; timers.push(timer); return () => { timer.live = false; }; },
    search: async ({ query, orientation, providers }) => {
      calls.push({ query, orientation, providers });
      return { results: results(query, providers), providerStatus: status(query, providers) };
    },
  });
  const advance = async (ms) => {
    t += ms;
    for (const timer of timers) if (timer.live && timer.at <= t) { timer.live = false; timer.fn(); }
    await settle();
  };
  return { q, calls, advance };
}

const words = (n) => Array.from({ length: n }, (_, i) => `what to serve with dish${i}`);

describe('bulk queue', () => {
  it('cleans queries and only searches rows inside the look-ahead window', async () => {
    const { q, calls } = harness();
    q.load(words(40), { orientation: 'landscape' });
    await settle();
    assert.equal(q.rows[0].query, 'dish0');
    assert.equal(calls.length, LOOKAHEAD + 1);
    assert.equal(q.rows[LOOKAHEAD + 1].state, 'queued');
    assert.equal(q.inWindow(LOOKAHEAD + 1), false);
    q.setReadPos(15);
    await settle();
    assert.equal(calls.length, 26);
  });

  it('never runs more than two searches at once', async () => {
    let inFlight = 0;
    let peak = 0;
    const q = createBulkQueue({
      search: async () => { inFlight++; peak = Math.max(peak, inFlight); await tick(); inFlight--; return { results: [img('a')], providerStatus: {} }; },
    });
    q.load(words(8), { orientation: '' });
    await settle();
    assert.equal(peak, CONCURRENCY);
  });

  it('auto-picks and marks empty rows for review', async () => {
    const { q } = harness({ results: (query) => (query === 'dish1' ? [] : [img('s', 800, 500), img('w')]) });
    q.load(words(2), { orientation: 'landscape' });
    await settle();
    assert.equal(q.rows[0].pick, 1);
    assert.equal(q.rows[1].state, 'empty');
    assert.deepEqual(q.counts(), {
      all: 2, done: 2, picked: 1, review: 1, skipped: 0, waiting: 0, notSelected: 1, downloaded: 0, toDownload: 1,
    });
  });

  it('re-searches one edited row and replaces its pick', async () => {
    const { q, calls } = harness();
    q.load(words(3), { orientation: '' });
    await settle();
    q.pick(1, 1);
    q.setQuery(1, 'braised lamb');
    await settle();
    assert.equal(calls.at(-1).query, 'braised lamb');
    assert.equal(calls.length, 4);
    assert.equal(q.rows[1].pick, 0);
    assert.equal(q.rows[1].edited, true);
    assert.equal(q.rows[0].images[0].id, 'dish0-1');
  });

  it('keeps server images and waits on Openverse after a 429, then tops up by itself', async () => {
    const { q, calls, advance } = harness({
      results: (query, providers) => (providers?.[0] === 'openverse' ? [img(`${query}-ov`)] : [img(`${query}-1`)]),
      status: (query, providers) => (providers ? { openverse: { status: 'ok' } } : { pexels: { status: 'ok' }, openverse: { status: 'paused' } }),
    });
    q.load(words(2), { orientation: '' });
    await settle();
    assert.deepEqual(q.rows[0].pending, ['openverse']);
    assert.equal(q.rows[0].state, 'done');
    assert.equal(q.counts().waiting, 2);
    assert.equal(q.counts().review, 0);
    assert.equal(q.rows[0].pick, 0);
    await advance(OPENVERSE_BACKOFF_MS);
    assert.ok(calls.some((c) => c.providers?.[0] === 'openverse'));
    assert.deepEqual(q.rows[0].pending, []);
    assert.deepEqual(q.rows[0].images.map((i) => i.id), ['dish0-1', 'dish0-ov']);
    assert.equal(q.rows[0].pick, 0);
  });

  it('tops up rows waiting on a paused server provider when asked', async () => {
    let paused = true;
    const { q } = harness({
      results: (query, providers) => (providers?.[0] === 'pexels' ? [img(`${query}-px`)] : (paused ? [] : [img(`${query}-1`)])),
      status: (query, providers) => (providers ? { pexels: { status: 'ok' } } : { pexels: { status: paused ? 'paused' : 'ok' } }),
    });
    q.load(words(1), { orientation: '' });
    await settle();
    assert.equal(q.rows[0].state, 'empty');
    assert.deepEqual(q.rows[0].pending, ['pexels']);
    assert.equal(q.counts().review, 0);
    paused = false;
    q.topUp('pexels');
    await settle();
    assert.equal(q.rows[0].state, 'done');
    assert.equal(q.rows[0].pick, 0);
    assert.deepEqual(q.rows[0].pending, []);
  });

  it('pauses and resumes', async () => {
    const { q, calls } = harness();
    q.load(words(5), { orientation: '' });
    q.pause();
    await settle();
    const before = calls.length;
    q.setReadPos(3);
    await settle();
    assert.equal(calls.length, before);
    q.resume();
    await settle();
    assert.equal(calls.length, 5);
  });

  it('re-queues everything when the orientation changes', async () => {
    const { q, calls } = harness();
    q.load(words(3), { orientation: '' });
    await settle();
    q.toggleSkip(2);
    q.setOrientation('portrait');
    await settle();
    assert.equal(calls.length, 5);
    assert.equal(calls.at(-1).orientation, 'portrait');
  });

  it('snapshots and restores edits, picks by image key, skips and position', async () => {
    const { q } = harness();
    q.load(words(3), { orientation: 'square' });
    await settle();
    q.setQuery(0, 'lamb shank');
    await settle();
    q.pick(0, 1);
    q.toggleSkip(2);
    q.setReadPos(1);
    const saved = JSON.parse(JSON.stringify(q.snapshot()));

    const again = harness();
    again.q.load(saved.keywords, { orientation: saved.orientation, saved });
    await settle();
    assert.equal(again.q.rows[0].query, 'lamb shank');
    assert.equal(again.q.rows[0].pick, 1);
    assert.equal(again.q.rows[2].skipped, true);
    assert.equal(again.q.readPos, 1);
    assert.equal(again.calls[0].orientation, 'square');
  });

  it('lists picked, non-skipped rows for download under the keyword name', async () => {
    const { q } = harness({ results: (query) => (query === 'dish1' ? [] : [img(`${query}-1`)]) });
    q.load(words(3), { orientation: '' });
    await settle();
    q.toggleSkip(2);
    assert.deepEqual(q.downloadList().map((d) => [d.name, d.img.id]), [['what to serve with dish0', 'dish0-1']]);
  });

  it('stops an Openverse top-up as soon as Openverse answers 429 again', async () => {
    let ovPaused = true;
    const { q, calls, advance } = harness({
      results: (query, providers) => (providers ? [] : [img(`${query}-1`)]),
      status: (query, providers) => (providers
        ? { openverse: { status: ovPaused ? 'paused' : 'ok' } }
        : { openverse: { status: 'paused' } }),
    });
    q.load(words(3), { orientation: '' });
    await settle();
    await advance(OPENVERSE_BACKOFF_MS);
    assert.equal(calls.filter((c) => c.providers?.[0] === 'openverse').length, 1);
    assert.ok(q.openverseResumeAt > 0);
    ovPaused = false;
    await advance(OPENVERSE_BACKOFF_MS);
    assert.equal(q.counts().waiting, 0);
  });

  it('tops up Openverse on resume when the rest ended while paused', async () => {
    const { q, calls, advance } = harness({
      results: (query, providers) => (providers ? [img(`${query}-ov`)] : [img(`${query}-1`)]),
      status: (query, providers) => (providers ? { openverse: { status: 'ok' } } : { openverse: { status: 'paused' } }),
    });
    q.load(words(1), { orientation: '' });
    await settle();
    q.pause();
    await advance(OPENVERSE_BACKOFF_MS);
    assert.equal(calls.filter((c) => c.providers).length, 0);
    q.resume();
    await settle();
    assert.deepEqual(q.rows[0].pending, []);
  });

  it('shows a failed search as an error, not as "no results"', async () => {
    const q = createBulkQueue({ search: async () => ({ results: [], providerStatus: {}, error: 'HTTP 500' }) });
    q.load(words(1), { orientation: '' });
    await settle();
    assert.equal(q.rows[0].state, 'error');
    assert.equal(q.rows[0].error, 'HTTP 500');
    assert.equal(q.counts().review, 1);
  });

  it('searches the rows nearest the reading position first after a restore', async () => {
    const { q, calls } = harness();
    q.load(words(40), { orientation: '', saved: { readPos: 20, rows: [] } });
    await settle();
    assert.deepEqual(calls.slice(0, 2).map((c) => c.query), ['dish20', 'dish21']);
  });

  it('keeps at most two searches in flight when rows are re-queued mid-search', async () => {
    let inFlight = 0;
    let peak = 0;
    const q = createBulkQueue({
      search: async () => {
        inFlight++; peak = Math.max(peak, inFlight);
        await tick(); await tick();
        inFlight--;
        return { results: [img('a')], providerStatus: {} };
      },
    });
    q.load(words(6), { orientation: '' });
    q.setQuery(0, 'new one');
    q.setOrientation('portrait');
    await settle();
    assert.ok(peak <= CONCURRENCY, `peak ${peak}`);
  });

  it('ignores late results from a previous run', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    let first = true;
    const q = createBulkQueue({
      search: async ({ query }) => {
        if (first) { first = false; await gate; return { results: [img('old')], providerStatus: { openverse: { status: 'paused' } } }; }
        return { results: [img(query)], providerStatus: {} };
      },
    });
    q.load(['old keyword'], { orientation: '' });
    q.load(['new keyword'], { orientation: '' });
    release();
    await settle();
    assert.equal(q.rows.length, 1);
    assert.equal(q.rows[0].images[0].id, 'new keyword');
    assert.equal(q.openverseResumeAt, 0);
  });

  it('does not top up a provider the user switched off, and can drop it', async () => {
    const { q, calls } = harness({
      results: (query, providers) => (providers ? [img('px')] : []),
      status: (query, providers) => (providers ? { pexels: { status: 'ok' } } : { pexels: { status: 'paused' } }),
    });
    q.canTopUp = (p) => p !== 'pexels';
    q.load(words(1), { orientation: '' });
    await settle();
    q.topUp('pexels');
    await settle();
    assert.equal(calls.filter((c) => c.providers).length, 0);
    q.dropPending('pexels');
    assert.deepEqual(q.rows[0].pending, []);
    assert.equal(q.counts().review, 1);
  });

  it('unselects when the selected image is picked again, and can clear a pick', async () => {
    const { q } = harness();
    q.load(words(2), { orientation: '' });
    await settle();
    assert.equal(q.rows[0].pick, 0);
    q.pick(0, 0);
    assert.equal(q.rows[0].pick, null);
    assert.equal(q.rows[0].state, 'done');
    assert.equal(q.counts().review, 0);
    assert.equal(q.counts().notSelected, 1);
    q.pick(0, 1);
    assert.equal(q.rows[0].pick, 1);
    q.clearPick(1);
    assert.equal(q.rows[1].pick, null);
    assert.deepEqual(q.downloadList().map((d) => d.name), ['what to serve with dish0']);
  });

  it('keeps an unselected row empty when a late top-up adds images', async () => {
    const { q, advance } = harness({
      results: (query, providers) => (providers ? [img(`${query}-ov`)] : [img(`${query}-1`)]),
      status: (query, providers) => (providers ? { openverse: { status: 'ok' } } : { openverse: { status: 'paused' } }),
    });
    q.load(words(1), { orientation: '' });
    await settle();
    q.clearPick(0);
    await advance(OPENVERSE_BACKOFF_MS);
    assert.equal(q.rows[0].images.length, 2);
    assert.equal(q.rows[0].pick, null);
  });

  it('remembers an unselected row across a reload', async () => {
    const { q } = harness();
    q.load(words(1), { orientation: '' });
    await settle();
    q.clearPick(0);
    const saved = JSON.parse(JSON.stringify(q.snapshot()));
    const again = harness();
    again.q.load(saved.keywords, { orientation: '', saved });
    await settle();
    assert.equal(again.q.rows[0].pick, null);
  });

  it('auto-picks again when an unselected row is searched afresh', async () => {
    const { q } = harness();
    q.load(words(1), { orientation: '' });
    await settle();
    q.clearPick(0);
    q.setQuery(0, 'lamb shank');
    await settle();
    assert.equal(q.rows[0].pick, 0);
  });

  it('tracks downloaded rows and offers only new picks next time', async () => {
    const { q } = harness();
    q.load(words(3), { orientation: '' });
    await settle();
    const first = q.downloadList();
    assert.equal(first.length, 3);
    first.slice(0, 2).forEach((d) => q.markDownloaded(d.row, d.img));
    assert.equal(q.isDownloaded(0), true);
    assert.deepEqual(q.downloadList().map((d) => d.row), [2]);
    assert.equal(q.downloadList({ onlyNew: false }).length, 3);
    assert.deepEqual(
      [q.counts().downloaded, q.counts().toDownload, q.counts().picked],
      [2, 1, 3],
    );
    q.pick(1, 1);
    assert.equal(q.isDownloaded(1), false);
    assert.deepEqual(q.downloadList().map((d) => d.row), [1, 2]);
  });

  it('remembers downloads across a reload', async () => {
    const { q } = harness();
    q.load(words(2), { orientation: '' });
    await settle();
    const [d] = q.downloadList();
    q.markDownloaded(d.row, d.img);
    const saved = JSON.parse(JSON.stringify(q.snapshot()));
    const again = harness();
    again.q.load(saved.keywords, { orientation: '', saved });
    await settle();
    assert.equal(again.q.isDownloaded(0), true);
    assert.deepEqual(again.q.downloadList().map((x) => x.row), [1]);
  });

  it('dedupes and caps the keyword list', () => {
    const { q } = harness();
    q.load([' a ', 'a', '', ...words(1200)], { orientation: '' });
    assert.equal(q.rows.length, 1000);
    assert.equal(q.rows[0].keyword, 'a');
  });
});
