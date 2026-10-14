# v2.0.0 Part 4: Bulk Keywords Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paste a keyword list → one row per keyword with a cleaned, editable query → images searched only near where you are reading → top image auto-picked → one file per keyword downloaded under the keyword's own name — without breaking provider rate limits, and always telling the user what is happening.

**Architecture:** Four pure, unit-tested browser modules carry the logic: `query-cleaner.js` (keyword → query), `image-shape.js` additions (`isSmall`, `autoPick`), `search-client.js` addition `searchSources()` (any subset of server providers + optional Openverse, reporting per-provider status including Openverse 429), and `bulk-queue.js` (rows, look-ahead window, concurrency, pending providers, top-ups, persistence snapshot; injected `search` and clock). `bulk-mode.js` is the DOM layer (render, keyboard, status line, provider budget polling, download) and is verified in the browser.

**Tech Stack:** Vanilla ES modules, `node:test`. Reuses `download-queue.js`, `safe-storage.js`, `imageKey` from `search-client.js`, `/api/providers/status` from Part 1.

**Spec:** [`docs/superpowers/specs/2026-10-14-sise-bulk-keywords-design.md`](../specs/2026-10-14-sise-bulk-keywords-design.md) §3, §4, §5.1, §5.4–§5.6, §10. Prototype: `demo-bulk-keywords.html`.

## Global Constraints

- Query cleaner rules verbatim from spec §3 (prefixes, cut phrases, fillers, empty → original keyword).
- Look-ahead **10 rows** from the reading position (max of active row and first visible row); at most **2 rows in flight**; rows outside the window are not searched.
- Auto-pick: first result matching the run's orientation with long edge **≥ 1000px**; else the first result; `null` when no results.
- Orientation choices `''|landscape|portrait|square`, default **landscape**; changing it re-queues all non-skipped rows.
- Hard cap **1,000** keywords per run.
- Pending providers: a server provider whose `providerStatus` is `paused`, or `openverse` when Openverse answered **429**. A row with pending providers is not "Needs review"; its status reads `waiting on <names>`. Openverse 429 pauses Openverse for **60 s**, then pending rows are topped up automatically. Server providers are topped up when `/api/providers/status` (polled every **15 s** while rows remain) shows them `ok`. Top-ups append new images (deduped) and keep the user's pick.
- Needs review = not skipped and (`state === 'empty'` with no pending providers, or `state === 'error'`).
- Download: every picked, non-skipped row via `downloadImage(img, keyword, size)` → filename is **the keyword as written** (server sanitizes), same 700 ms queue, failures listed with **Retry N failed**.
- Persistence (session storage via `safe-storage.js`, key `imgverse:bulk`; renamed in Part 5): keywords, per-row query overrides, picks by `imageKey`, skipped flags, orientation, reading position. Images are not stored; rows re-search near the reading position after reload (Redis cache makes that cheap).
- UI copy and look follow the prototype and Part 3 tokens; no emoji; status text is plain sentences.
- New files `@since 2.0.0`; never change existing `@since`; logs `[IMGverse/bulk]`.
- Commits on `release/v2.0.0`; no push/tag/merge.
- Ruling (planning): `bulk-mode.js` (DOM) is specified by behaviour and acceptance checks rather than full code here; all logic it relies on is in the unit-tested modules. Verified in the browser at 1280px and 375px.
- Ruling (planning): the 590-keyword snapshot fixture is generated from the implementation once, spot-checked against the spec's examples and the prototype run, then committed as a regression guard.

## Review Focus

1. **100+ keywords pasted** → only rows within 10 of the reading position are searched; scrolling/`J` widens the window; request count stays proportional to rows reached. Unit test (queue) + browser count.
2. **Openverse 429 mid-run** → rows keep server images, show `waiting on Openverse`, are topped up after 60 s without user action, picks unchanged. Unit test.
3. **Edit a row's query and press Enter** → only that row re-searches; its old pick is replaced by the new auto-pick; other rows untouched. Unit test + browser.
4. **Reload mid-run** → keywords, query edits, picks, skips, orientation and position come back; picks re-attach by image key when that image is still in the results. Unit test (snapshot/restore) + browser.
5. **A keyword whose query finds nothing** → row lands in Needs review with Retry and Skip; it is never auto-downloaded. Unit test + browser.

---

### Task 1: Query cleaner (`query-cleaner.js`)

**Files:** Create `app/public/query-cleaner.js`, `app/src/lib/query-cleaner.test.js`, `app/src/lib/fixtures/keywords.txt` (the user's 590 keywords, one per line), `app/src/lib/fixtures/keywords.expected.tsv` (generated in Step 5).

**Interfaces:** Produces `cleanQuery(keyword: string) → string`, plus exported `PREFIXES`, `CUTS`, `FILLERS`.

- [ ] **Step 1: Failing test** — `app/src/lib/query-cleaner.test.js`:

```js
// =============================================================================
// src/lib/query-cleaner.test.js
// IMGverse Search — Tests for keyword → image search query cleaning.
//
// @package IMGverse-Search
// @since   2.0.0
// =============================================================================

'use strict';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanQuery } from '../../public/query-cleaner.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('cleanQuery', () => {
  it('strips the question templates', () => {
    assert.equal(cleanQuery('can you freeze cooked salmon'), 'cooked salmon');
    assert.equal(cleanQuery('how to freeze corn'), 'corn');
    assert.equal(cleanQuery('what to serve with tri tip'), 'tri tip');
    assert.equal(cleanQuery('traditional finnish breakfast'), 'finnish breakfast');
  });

  it('cuts at qualifier phrases', () => {
    assert.equal(cleanQuery('can you freeze bananas for dogs'), 'bananas');
    assert.equal(cleanQuery('can you freeze soup in mason jars'), 'soup');
    assert.equal(cleanQuery('can you freeze red wine to drink later'), 'red wine');
    assert.equal(cleanQuery('traditional ramadan breakfast in albania'), 'ramadan breakfast');
    assert.equal(cleanQuery('can you freeze pasta with sauce on it'), 'pasta');
  });

  it('drops leading fillers', () => {
    assert.equal(cleanQuery('can you freeze an unopened pack of hot dogs'), 'hot dogs');
    assert.equal(cleanQuery('can you freeze 2-day-old rice'), 'rice');
    assert.equal(cleanQuery('can you freeze leftover alfredo sauce from a jar'), 'alfredo sauce');
  });

  it('normalises case and spacing, and falls back to the keyword when nothing is left', () => {
    assert.equal(cleanQuery('  What To Serve With   Osso Buco '), 'osso buco');
    assert.equal(cleanQuery('can you freeze '), 'can you freeze');
    assert.equal(cleanQuery('mukimo'), 'mukimo');
  });

  it('matches the reviewed snapshot for all 590 keywords', () => {
    const expected = fixture('keywords.expected.tsv').trim().split('\n').map((l) => l.split('\t'));
    const keywords = fixture('keywords.txt').trim().split('\n');
    assert.equal(keywords.length, 590);
    assert.equal(expected.length, 590);
    for (const [keyword, query] of expected) assert.equal(cleanQuery(keyword), query, keyword);
  });
});
```

- [ ] **Step 2: Fixture** — write `app/src/lib/fixtures/keywords.txt` from `C:\Users\kings\Downloads\keywords.md` (strip the `- ` bullets and the heading; 590 lines). Run `cd app && npm test` → FAIL (module not found).
- [ ] **Step 3: Implement** `app/public/query-cleaner.js`:

```js
/**
 * Keyword → image search query. Article keywords ("can you freeze cooked
 * salmon") contain question words that stock providers would match
 * literally; this keeps the subject ("cooked salmon"). Rule-based, no AI.
 *
 * @package IMGverse-Search
 * @since   2.0.0
 */

'use strict';

export const PREFIXES = [
  /^can (you|i|we) (re)?freeze /,
  /^how (to|do you|long can you) freeze /,
  /^is it (ok|safe) to freeze /,
  /^what (to serve|goes|to eat|sides go) with /,
  /^traditional /,
];

export const CUTS = [
  ' for ', ' without ', ' in the ', ' in its ', ' in a ', ' in ', ' with the ',
  ' with ', ' to drink', ' after ', ' from a ', ' made with ', ' on it', ' later',
];

export const FILLERS = /^(a |an |the |an unopened pack of |unopened |a whole |leftover |opened |homemade |pack of |\d+-day-old )/;

/**
 * @param {string} keyword
 * @returns {string} The search query (never empty for a non-empty keyword).
 */
export function cleanQuery(keyword) {
  const original = String(keyword || '').trim();
  let q = original.toLowerCase().replace(/\s+/g, ' ');

  for (const re of PREFIXES) q = q.replace(re, '');

  const padded = ` ${q} `;
  let cut = padded.length;
  for (const phrase of CUTS) {
    const i = padded.indexOf(phrase, 1);
    if (i > 0 && i < cut) cut = i;
  }
  q = padded.slice(0, cut).trim();

  let prev;
  do {
    prev = q;
    q = q.replace(FILLERS, '');
  } while (q !== prev);

  return q.trim() || original;
}
```

- [ ] **Step 4:** Run the four example tests → PASS (snapshot still fails: fixture missing).
- [ ] **Step 5: Snapshot** — generate `keywords.expected.tsv` (`keyword<TAB>query` per line) by running `cleanQuery` over `keywords.txt`; spot-check against the examples above and the prototype's run (no line may contain `pack of`, `for `, ` in `, or an empty query). Run `cd app && npm test` → PASS (96 tests).
- [ ] **Step 6: Commit** `feat: rule-based keyword to search query cleaner`.

---

### Task 2: Auto-pick helpers (`image-shape.js`)

**Files:** Modify `app/public/image-shape.js`, `app/src/lib/image-shape.test.js`.

**Interfaces:** Produces `MIN_LONG_EDGE = 1000`, `isSmall(img) → boolean` (true only when both sizes are known and the long edge < 1000), `autoPick(images, orientation) → number|null`.

- [ ] **Step 1: Failing tests** — append to `image-shape.test.js` (add `MIN_LONG_EDGE, autoPick, isSmall` to the import):

```js
describe('isSmall', () => {
  it('flags images whose long edge is under 1000px', () => {
    assert.equal(MIN_LONG_EDGE, 1000);
    assert.equal(isSmall({ width: 999, height: 600 }), true);
    assert.equal(isSmall({ width: 600, height: 1000 }), false);
    assert.equal(isSmall({ width: 1024, height: 683 }), false);
  });
  it('never flags images of unknown size', () => {
    assert.equal(isSmall({ width: 0, height: 0 }), false);
    assert.equal(isSmall({}), false);
  });
});

describe('autoPick', () => {
  const small = { width: 800, height: 500 };
  const tall = { width: 1000, height: 1600 };
  const wide = { width: 1600, height: 900 };
  it('prefers the first image of the right shape that is big enough', () => {
    assert.equal(autoPick([small, tall, wide], 'landscape'), 2);
  });
  it('accepts any shape when no orientation is set', () => {
    assert.equal(autoPick([small, tall, wide], ''), 1);
  });
  it('falls back to the first image when none qualifies', () => {
    assert.equal(autoPick([small, tall], 'square'), 0);
  });
  it('returns null for no images', () => {
    assert.equal(autoPick([], 'landscape'), null);
  });
});
```

- [ ] **Step 2:** `npm test` → FAIL (exports missing).
- [ ] **Step 3: Implement** — append to `image-shape.js`:

```js
/** Images shorter than this on their long edge are flagged and skipped by auto-pick. */
export const MIN_LONG_EDGE = 1000;

/**
 * @param {{ width?: number, height?: number }} img
 * @returns {boolean} True only when the size is known and below MIN_LONG_EDGE.
 */
export function isSmall(img) {
  const w = Number(img?.width) || 0;
  const h = Number(img?.height) || 0;
  return Boolean(w && h) && Math.max(w, h) < MIN_LONG_EDGE;
}

/**
 * Index of the image to pre-select: first of the requested shape that is
 * big enough; otherwise the first image; null when there are none.
 *
 * @param {object[]} images
 * @param {string}   orientation
 * @returns {number|null}
 */
export function autoPick(images, orientation) {
  if (!images.length) return null;
  const i = images.findIndex((img) => {
    const shape = shapeOf(img.width, img.height);
    return (!orientation || shape === orientation) && !isSmall(img);
  });
  return i === -1 ? 0 : i;
}
```

- [ ] **Step 4:** `npm test` → PASS (102). **Step 5: Commit** `feat: auto-pick helpers for bulk keywords`.

---

### Task 3: Multi-provider search with status (`search-client.js`, `openverse-client.js`)

**Files:** Modify `app/public/openverse-client.js`, `app/public/search-client.js`, `app/src/lib/openverse-client.test.js`, `app/src/lib/search-client.test.js`.

**Interfaces:**
- `searchOpenverse(...)` results gain `status: number` (HTTP status; `0` when the request itself failed).
- New `searchSources({ q, page = 1, orientation = '', serverProviders = null, openverse = true, fetchImpl, openverseSearch }) → { results, hasNext, providerStatus, openverseStatus, openverseError, serverError }`. `serverProviders`: `null` = all configured server providers, `[]` = none (skip the server), `['pexels', …]` = those only. `providerStatus` is the server's map plus `openverse: { status: 'ok' | 'paused' | 'error' }` when Openverse was asked (`paused` on HTTP 429).
- `searchAllSources` keeps its contract and delegates to `searchSources`.

- [ ] **Step 1: Failing tests** — append to `openverse-client.test.js`:

```js
describe('searchOpenverse status', () => {
  it('reports the HTTP status of a rate-limited request', async () => {
    const fetchImpl = async () => ({ status: 429, text: async () => '{"detail":"Request was throttled."}' });
    const out = await searchOpenverse({ q: 'cat', fetchImpl });
    assert.equal(out.status, 429);
    assert.match(out.error, /429/);
  });
  it('reports 200 on success and 0 when the request fails outright', async () => {
    const ok = await searchOpenverse({ q: 'cat', fetchImpl: async () => ({ status: 200, text: async () => '{"results":[],"page_count":0}' }) });
    assert.equal(ok.status, 200);
    const down = await searchOpenverse({ q: 'cat', fetchImpl: async () => { throw new Error('offline'); } });
    assert.equal(down.status, 0);
  });
});
```

and to `search-client.test.js` (add `searchSources` to the import):

```js
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
```

- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3: Implement.** In `openverse-client.js` add `status: res.status` to both failure returns, `status: 200` to the success return, and `status: 0` to the `catch` return; document `status` in the JSDoc `@returns`. In `search-client.js` add `searchSources` and make `searchAllSources` delegate:

```js
/**
 * Search any subset of providers. Never throws; failures are reported.
 *
 * @param {object}   params
 * @param {string}   params.q
 * @param {number}   [params.page]
 * @param {string}   [params.orientation]
 * @param {string[]|null} [params.serverProviders] null = all, [] = none.
 * @param {boolean}  [params.openverse]
 * @param {Function} [params.fetchImpl]
 * @param {Function} [params.openverseSearch] Injected for tests.
 */
export async function searchSources({
  q,
  page = 1,
  orientation = '',
  serverProviders = null,
  openverse = true,
  fetchImpl = globalThis.fetch,
  openverseSearch = searchOpenverse,
}) {
  const wantServer = serverProviders === null || serverProviders.length > 0;
  let serverError = '';

  const serverPromise = wantServer
    ? fetchServerSearch({ q, page, provider: (serverProviders || []).join(','), orientation, fetchImpl })
      .catch((err) => {
        serverError = err.message;
        console.error('[IMGverse/search]', err.message);
        return { results: [], hasNext: false, providerStatus: {} };
      })
    : Promise.resolve({ results: [], hasNext: false, providerStatus: {} });

  const openversePromise = openverse
    ? openverseSearch({ q, page, orientation, fetchImpl })
    : Promise.resolve(null);

  const [server, ov] = await Promise.all([serverPromise, openversePromise]);
  const providerStatus = { ...server.providerStatus };

  if (ov) {
    if (ov.error) console.error('[IMGverse/openverse]', ov.error);
    providerStatus.openverse = { status: ov.status === 429 ? 'paused' : (ov.error ? 'error' : 'ok') };
  }

  return {
    results:         dedupeClientResults(weaveOpenverse(server.results, ov ? ov.images : [])),
    hasNext:         mergeHasNext(server.hasNext, ov ? ov.hasNext : false),
    providerStatus,
    openverseStatus: ov ? ov.status : null,
    openverseError:  ov ? ov.error || '' : '',
    serverError,
  };
}
```

and replace the body of `searchAllSources` with:

```js
  const out = await searchSources({
    q,
    page,
    orientation,
    serverProviders: provider === 'openverse' ? [] : (provider ? [provider] : null),
    openverse: shouldFetchOpenverse(provider),
    fetchImpl,
    openverseSearch: openverse,
  });
  const { openverse: _ov, ...providerStatus } = out.providerStatus;
  return {
    results:        out.results,
    hasNext:        out.hasNext,
    openverseError: out.openverseError,
    providerStatus,
  };
```

- [ ] **Step 4:** `npm test` → PASS (108; the earlier `searchAllSources` tests must still pass unchanged). **Step 5: Commit** `feat: search any provider subset and report Openverse rate limits`.

---

### Task 4: Bulk queue (`bulk-queue.js`)

**Files:** Create `app/public/bulk-queue.js`, `app/src/lib/bulk-queue.test.js`.

**Interfaces (all consumed by Task 5):**

```
LOOKAHEAD = 10, CONCURRENCY = 2, OPENVERSE_BACKOFF_MS = 60_000, MAX_KEYWORDS = 1000
createBulkQueue({ search, now?, schedule?, onChange? }) → queue
  search({ query, orientation, providers: string[]|null }) → Promise<{ results, providerStatus }>
      providers null = everything the user enabled; ['pexels'] / ['openverse'] = top-up of one provider
  schedule(fn, ms) → cancel()           (defaults to setTimeout/clearTimeout)
queue.load(keywords: string[], { orientation, saved? })   — rows from keywords (deduped trimmed, max 1000)
queue.rows                             — [{ keyword, query, state, images, pick, skipped, pending, error, edited }]
queue.setReadPos(i) / queue.readPos
queue.setOrientation(o)                — re-queues all non-skipped rows
queue.setQuery(i, query)               — edit + re-search that row
queue.retry(i)                         — re-search a row
queue.pick(i, j) / queue.toggleSkip(i)
queue.pause() / queue.resume() / queue.paused
queue.topUp(provider)                  — re-search rows pending that provider, merging images
queue.counts() → { all, done, picked, review, skipped, waiting }
queue.inWindow(i) → boolean
queue.snapshot() → JSON-safe state for persistence
queue.downloadList() → [{ img, name }] for picked, non-skipped rows (name = keyword)
```

Row states: `queued | loading | done | empty | error`. `pending` = provider names awaiting top-up. `openverse` 429 (providerStatus.openverse.status === 'paused') pauses Openverse for 60 s, after which `topUp('openverse')` runs by itself.

- [ ] **Step 1: Failing test** — `app/src/lib/bulk-queue.test.js`:

```js
// =============================================================================
// src/lib/bulk-queue.test.js
// IMGverse Search — Tests for the bulk keyword queue.
//
// @package IMGverse-Search
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
    assert.deepEqual(q.counts(), { all: 2, done: 2, picked: 1, review: 1, skipped: 0, waiting: 0 });
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
    q.pick(0, 0);
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

  it('dedupes and caps the keyword list', () => {
    const { q } = harness();
    q.load([' a ', 'a', '', ...words(1200)], { orientation: '' });
    assert.equal(q.rows.length, 1000);
    assert.equal(q.rows[0].keyword, 'a');
  });
});
```

- [ ] **Step 2:** `npm test` → FAIL (module missing).
- [ ] **Step 3: Implement** `app/public/bulk-queue.js` to the interface above: rows built with `cleanQuery`; `pump()` starts `queued`, non-skipped rows with `inWindow(i)` while fewer than `CONCURRENCY` are `loading` and not `paused`; a row search calls `search({ query, orientation, providers: null })`, sets `images`, `pending` (names whose status is `paused`), `state` (`done` with images, else `empty`; `error` + message if `search` throws), and `pick` (`savedPickKey` match via `imageKey` if restoring, else `autoPick`); Openverse `paused` sets a single `schedule(..., OPENVERSE_BACKOFF_MS)` that calls `topUp('openverse')`; `topUp(p)` re-searches each non-skipped row whose `pending` contains `p` with `providers: [p]`, appends deduped images, removes `p` from `pending`, keeps an existing pick or auto-picks if none; every mutation calls `onChange()` and then `pump()`. `snapshot()` → `{ keywords, orientation, readPos, rows: [{ query if edited, pickKey, skipped }] }`. Log unexpected search exceptions as `[IMGverse/bulk]`.
- [ ] **Step 4:** `npm test` → PASS (119). **Step 5: Commit** `feat: bulk keyword queue with look-ahead, pending providers and top-ups`.

---

### Task 5: Bulk keywords tab UI (`bulk-mode.js`, markup, styles)

**Files:** Create `app/public/bulk-mode.js`; modify `app/public/index.html` (replace the Bulk placeholder), `app/public/style.css` (bulk rows/toolbar/status), `app/public/app.js` (`initBulkMode()`).

**Behaviour (acceptance):**
- Sidebar: Keywords textarea with count (and "first 1,000 used" above the cap); Providers list with a checkbox per provider (Openverse always listed; server providers listed from `/api/providers/status`, i.e. only configured ones) showing `remaining / limit per hour|minute` with a meter and `Paused · resets in m:ss` when paused; Orientation (Any / Wide / Tall / Square, default Wide) with the "under 1000px, skipped by auto-pick" legend; Download size (Web 1920px / Full); primary **Search N keywords**; progress bar and "x of y searched".
- Toolbar (sticky): filters All / Needs review / Picked / Skipped with counts; keyboard hint; **Download N**; run status line: state (`Searching` / `Caught up` / `Paused by you` / `All searched`), `x of y searched · the next n start when you scroll within 10 rows`, provider notes (`Pexels hourly limit reached, back in m:ss. Other providers keep filling rows.` / `Openverse asked us to slow down, retrying in m:ss.`), **Pause / Resume**.
- Rows: index, keyword (h3), editable mono query (Enter re-searches that row), status badge (`20 results` / `No results` / `waiting on Pexels, Openverse` / `Searching…` / `Queued`), filename preview `<keyword>.jpg`, Skip/Restore; strip of up to 6 thumbnails (more via "+N more", no request) each with index, shape icon and `W×H` (amber when small); picked thumbnail ringed with a check; skeletons inside the window, "Not searched yet. Starts when you are within 10 rows." outside; Needs-review rows show Retry and Skip.
- Keyboard (ignored while typing): `J`/`↓` next row, `K`/`↑` previous, `1`–`9` pick, `←`/`→` change pick, `S` skip, `E` edit query. Scrolling updates the reading position.
- Status polling: `GET /api/providers/status` every 15 s while any row is queued/loading/pending; when a provider is `ok` and rows are pending it, call `queue.topUp(name)`; countdowns tick every second.
- Download: `runDownloadQueue(queue.downloadList(), { download: (img, name) => downloadImage(img, name, size) })`, status text, failures list + **Retry N failed** — same as the Search tab.
- Persistence: save `queue.snapshot()` + textarea to `imgverse:bulk` (throttled to once per second, `safe-storage.js`); restore on load (no auto-download, searches resume near the saved position).
- Accessibility: rows are `<article>`s with `aria-label` = keyword; thumbnails are `<button aria-pressed>` with descriptive labels; status line `aria-live="polite"`; focus ring on everything focusable.

- [ ] **Step 1:** Implement markup, styles and `bulk-mode.js` against the acceptance list. `npm test` stays green; syntax-check new/changed modules; version suffixes `?v=2.0.0`.
- [ ] **Step 2: Browser verification** (localhost; record in the ledger): paste the 24 sample keywords from the prototype → rows, cleaned queries, auto-picks, sizes; paste 100 keywords → search request count ≈ rows in window (count `/api/search` calls), scroll/`J` widens it; edit a query + Enter re-searches only that row; a nonsense query → Needs review with Retry/Skip; keyboard shortcuts; orientation change re-queues; reload restores edits/picks/skips/position; Download (intercept saves) names files `<keyword>.jpg` with one forced failure → Retry; 375px no horizontal scroll; console clean.
- [ ] **Step 3: Commit** `feat: Bulk keywords tab`.
