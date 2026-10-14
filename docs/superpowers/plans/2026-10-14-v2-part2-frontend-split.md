# v2.0.0 Part 2: Frontend Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 680-line `app/public/app.js` into focused modules with **no visible or behavioural change**, so the Bulk tab (Part 4) can reuse search and download logic.

**Architecture:** Two new pure, tested browser modules: `search-client.js` (one function that searches the server and Openverse together and merges them — spec §4.3 "one shared merge function used by both tabs") and `download-queue.js` (named downloads through `/download`, sequential with a 700 ms gap, failures collected for retry). The remaining DOM code moves verbatim into `search-mode.js` behind `initSearchMode()`. `app.js` becomes the shell that calls it (Part 3 adds tabs there).

**Tech Stack:** Vanilla ES modules served as static files, `node:test` (`cd app && npm test` runs `src/lib/*.test.js`, which import browser modules via `../../public/...`). Node 20+ provides `fetch`, `Headers`, `Blob`, `URL.createObjectURL`.

**Spec:** [`docs/superpowers/specs/2026-10-14-sise-bulk-keywords-design.md`](../specs/2026-10-14-sise-bulk-keywords-design.md) §2, §4.3, §6, §11 step 3. Parity checklist: [`docs/sise-redesign-parity.md`](../../sise-redesign-parity.md).

## Global Constraints

- **No behaviour change.** Every item in the parity checklist's Search, Pagination, Result cards and Batch download sections must work exactly as before.
- New files: WordPress-style header, `@package IMGverse-Search`, `@since   2.0.0`. Never change existing `@since` tags.
- Log prefixes `[IMGverse/...]`. No silent failures.
- Cache-busting: every new or changed browser module is imported with `?v=2.0.0`; `index.html` loads `app.js?v=2.0.0`. Unchanged modules keep their current suffix, and a module is never imported under two different suffixes (that would load it twice). `batch-helpers.js` stays `?v=1.0.34`; `safe-storage.js` stays `?v=1.0.36`.
- Commits on branch `release/v2.0.0`; no push/tag/merge.

## Review Focus

1. **Provider pill = Openverse** → no `/api/search` request at all (only the browser Openverse call). Test in Task 1.
2. **Server search fails (HTTP 500 / network)** → Openverse results still show; the error is logged, not thrown. Test in Task 1.
3. **One download fails mid-queue** → the rest still download, in order, with the 700 ms gap, and the failure carries the server's message for the retry list. Test in Task 2.
4. **New search term while batch selections exist** → queue still clears (moved code must keep `resetBatchQueue` wiring). Browser check in Task 3.
5. **Stale cached `app.js` after deploy** → `index.html` points at `app.js?v=2.0.0`, and the moved modules carry `?v=2.0.0`. Grep in Task 3.

---

### Task 1: Shared search client (`search-client.js`)

**Files:**
- Create: `app/public/search-client.js`
- Create: `app/src/lib/search-client.test.js`
- Modify: `app/public/app.js` (use it; delete the moved functions)

**Interfaces:**
- Consumes: `searchOpenverse`, `shouldFetchOpenverse`, `weaveOpenverse`, `mergeHasNext` from `openverse-client.js`.
- Produces (`app/public/search-client.js`):
  - `imageKey(img) → string` (host + path of `full`/`thumb`, lower-cased; falls back to `img.id`)
  - `dedupeClientResults(results) → results`
  - `fetchServerSearch({ q, page, provider, orientation, fetchImpl }) → Promise<{ results, hasNext, providerStatus }>` (throws on non-OK)
  - `searchAllSources({ q, page = 1, provider = '', orientation = '', fetchImpl, openverse }) → Promise<{ results, hasNext, openverseError, providerStatus }>` (never throws for a server failure)

- [ ] **Step 1: Write the failing test**

Create `app/src/lib/search-client.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test`
Expected: FAIL, cannot find `public/search-client.js`.

- [ ] **Step 3: Write the implementation**

Create `app/public/search-client.js`:

```js
/**
 * Shared search client: one call searches the server providers and
 * Openverse (browser-side) together and merges the results. Used by the
 * Search tab and, from Part 4, the Bulk keywords tab.
 *
 * @package IMGverse-Search
 * @since   2.0.0
 */

'use strict';

import {
  mergeHasNext,
  searchOpenverse,
  shouldFetchOpenverse,
  weaveOpenverse,
} from './openverse-client.js?v=2.0.0';

/**
 * Stable key for the same image across pages (matches server dedupe logic).
 *
 * @param {object} img
 * @returns {string}
 */
export function imageKey(img) {
  const raw = img.full || img.thumb || '';
  try {
    const parsed = new URL(raw);
    return `${parsed.hostname}${parsed.pathname}`.toLowerCase();
  } catch {
    return img.id || '';
  }
}

/**
 * @param {object[]} results
 * @returns {object[]} Results without repeated images.
 */
export function dedupeClientResults(results) {
  const seen = new Set();
  return results.filter((img) => {
    const key = imageKey(img);
    if (!key || seen.has(key) || seen.has(img.id)) return false;
    seen.add(key);
    if (img.id) seen.add(img.id);
    return true;
  });
}

/**
 * Search the server providers via /api/search.
 *
 * @returns {Promise<{ results: object[], hasNext: boolean, providerStatus: object }>}
 */
export async function fetchServerSearch({ q, page = 1, provider = '', orientation = '', fetchImpl = globalThis.fetch }) {
  const params = new URLSearchParams({ q, page: String(page) });
  if (provider)    params.set('providers',   provider);
  if (orientation) params.set('orientation', orientation);

  const res  = await fetchImpl(`/api/search?${params}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Search failed');

  return {
    results:        Array.isArray(data.results) ? data.results : [],
    hasNext:        Boolean(data.hasNext),
    providerStatus: data.providerStatus || {},
  };
}

/**
 * Search the server and Openverse together; never throws for a server failure.
 *
 * @param {object}   params
 * @param {string}   params.q
 * @param {number}   [params.page]
 * @param {string}   [params.provider]    '' (all) | 'openverse' | a server provider
 * @param {string}   [params.orientation]
 * @param {Function} [params.fetchImpl]
 * @param {Function} [params.openverse]   Injected for tests; defaults to searchOpenverse.
 * @returns {Promise<{ results: object[], hasNext: boolean, openverseError: string, providerStatus: object }>}
 */
export async function searchAllSources({
  q,
  page = 1,
  provider = '',
  orientation = '',
  fetchImpl = globalThis.fetch,
  openverse = searchOpenverse,
}) {
  const wantServer    = provider !== 'openverse';
  const wantOpenverse = shouldFetchOpenverse(provider);

  const serverPromise = wantServer
    ? fetchServerSearch({ q, page, provider, orientation, fetchImpl }).catch((err) => {
      console.error('[IMGverse/search]', err.message);
      return { results: [], hasNext: false, providerStatus: {} };
    })
    : Promise.resolve({ results: [], hasNext: false, providerStatus: {} });

  const openversePromise = wantOpenverse
    ? openverse({ q, page, orientation, fetchImpl })
    : Promise.resolve({ images: [], hasNext: false, error: '' });

  const [server, ov] = await Promise.all([serverPromise, openversePromise]);

  if (ov.error) console.error('[IMGverse/openverse]', ov.error);

  return {
    results:        dedupeClientResults(weaveOpenverse(server.results, ov.images)),
    hasNext:        mergeHasNext(server.hasNext, ov.hasNext),
    openverseError: ov.error || '',
    providerStatus: server.providerStatus,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm test`
Expected: PASS, 82 tests (74 + 8), 0 fail, output pristine.

- [ ] **Step 5: Use it in `app.js`**

In `app/public/app.js`:
1. Replace the `openverse-client.js?v=1.0.36` import block with:
   ```js
   import { imageKey, searchAllSources } from './search-client.js?v=2.0.0';
   ```
2. Delete the functions `imageKey`, `fetchServerSearch` and `dedupeClientResults`.
3. In `fetchPage()`, replace everything from `const wantOpenverse = shouldFetchOpenverse(currentProvider);` through `hasNextPage = mergeHasNext(server.hasNext, openverse.hasNext);` with:
   ```js
           const { results, hasNext, openverseError } = await searchAllSources({
               q:           currentQuery,
               page:        currentPage,
               provider:    currentProvider,
               orientation: currentOrientation,
           });

           if (token !== searchToken) return;

           hasNextPage = hasNext;
   ```
   and in the empty-state branch replace `currentProvider === 'openverse' && openverse.error ? openverse.error : undefined` with `currentProvider === 'openverse' && openverseError ? openverseError : undefined`.

Run: `grep -n "openverse\.\|shouldFetchOpenverse\|weaveOpenverse\|mergeHasNext\|fetchServerSearch" app/public/app.js`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add app/public/search-client.js app/src/lib/search-client.test.js app/public/app.js
git commit -m "refactor: shared search client for server and Openverse results" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Download queue (`download-queue.js`)

**Files:**
- Create: `app/public/download-queue.js`
- Create: `app/src/lib/download-queue.test.js`
- Modify: `app/public/app.js` (use it; delete the moved functions)

**Interfaces:**
- Consumes: `messageFromDownloadResponse` from `batch-helpers.js?v=1.0.34` (same suffix `app.js` already uses).
- Produces (`app/public/download-queue.js`):
  - `DOWNLOAD_GAP_MS = 700`
  - `buildDownloadParams(img, name, size = 'web') → URLSearchParams` (`url`, `name`, `size`, plus `credit`/`provider`/`license`/`sourceUrl` when present)
  - `downloadImage(img, name, size, { fetchImpl, doc }) → Promise<void>` (throws `Error(messageFromDownloadResponse(...))` on non-OK)
  - `runDownloadQueue(queue: {img, name}[], { download, onProgress, gapMs, sleep }) → Promise<{ img, name, error }[]>` (failures; never throws)

- [ ] **Step 1: Write the failing test**

Create `app/src/lib/download-queue.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test`
Expected: FAIL, cannot find `public/download-queue.js`.

- [ ] **Step 3: Write the implementation**

Create `app/public/download-queue.js`:

```js
/**
 * Named downloads through /download, one at a time.
 * Shared by the Search tab's batch panel and the Bulk keywords tab.
 *
 * @package IMGverse-Search
 * @since   2.0.0
 */

'use strict';

import { messageFromDownloadResponse } from './batch-helpers.js?v=1.0.34';

/** Pause between files so browsers don't block a burst of downloads. */
export const DOWNLOAD_GAP_MS = 700;

/**
 * @param {object} img
 * @param {string} name   Filename without extension (the keyword).
 * @param {'web'|'full'} [size]
 * @returns {URLSearchParams}
 */
export function buildDownloadParams(img, name, size = 'web') {
  const params = new URLSearchParams({ url: img.full, name, size });
  if (img.credit)    params.set('credit', img.credit);
  if (img.provider)  params.set('provider', img.provider);
  if (img.license)   params.set('license', img.license);
  if (img.sourceUrl) params.set('sourceUrl', img.sourceUrl);
  return params;
}

/**
 * Fetch one named image from /download and save it.
 *
 * @throws {Error} With the server's message when the download fails.
 */
export async function downloadImage(img, name, size, { fetchImpl = globalThis.fetch, doc = globalThis.document } = {}) {
  const res = await fetchImpl(`/download?${buildDownloadParams(img, name, size)}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(messageFromDownloadResponse(res.status, body));
  }

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = blobUrl;
  anchor.download = `${name}.jpg`;
  doc.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(blobUrl);
}

/**
 * Download every item in order; failures are collected, never thrown.
 *
 * @param {{ img: object, name: string }[]} queue
 * @param {object}   options
 * @param {Function} options.download    (img, name) => Promise<void>
 * @param {Function} [options.onProgress] ({ index, total, name }) => void
 * @param {number}   [options.gapMs]
 * @param {Function} [options.sleep]
 * @returns {Promise<{ img: object, name: string, error: string }[]>}
 */
export async function runDownloadQueue(queue, {
  download,
  onProgress = () => {},
  gapMs = DOWNLOAD_GAP_MS,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const failures = [];
  const total = queue.length;

  for (let i = 0; i < total; i++) {
    const { img, name } = queue[i];
    onProgress({ index: i, total, name });

    try {
      await download(img, name);
    } catch (err) {
      const error = err?.message || 'Download failed';
      failures.push({ img, name, error });
      console.error('[IMGverse/batch]', name, error);
    }

    if (i < total - 1) await sleep(gapMs);
  }

  return failures;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm test`
Expected: PASS, 88 tests, 0 fail, output pristine.

- [ ] **Step 5: Use it in `app.js`**

In `app/public/app.js`:
1. Change the batch-helpers import to only `formatBatchFailureLine, formatBatchFinishMessage` (still `?v=1.0.34`), and add:
   ```js
   import { downloadImage, runDownloadQueue } from './download-queue.js?v=2.0.0';
   ```
2. Delete `sleep`, `buildDownloadParams` and `downloadBatchItem`.
3. Replace the `for` loop and the `const nextFailures = []; const total = queue.length;` lines in `runBatchQueue` with:
   ```js
       const total = queue.length;
       const size = getBatchDownloadSize();
       const nextFailures = await runDownloadQueue(queue, {
           download:   (img, name) => downloadImage(img, name, size),
           onProgress: ({ index, name }) => {
               batchStatus.textContent = `Downloading ${index + 1} of ${total}: ${name}`;
           },
       });
   ```
   (The rest of `runBatchQueue` — `batchDownloading = false;` … `updateBatchPanel();` — is unchanged and still uses `total` and `nextFailures`.)
4. Fix the stray JSDoc above `getBatchDownloadSize` (`/** @param {object} img @param {string} name */` → `/** @returns {'web'|'full'} */`).

Run: `grep -n "downloadBatchItem\|buildDownloadParams\|function sleep\|messageFromDownloadResponse" app/public/app.js`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add app/public/download-queue.js app/src/lib/download-queue.test.js app/public/app.js
git commit -m "refactor: shared download queue for named batch downloads" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `search-mode.js` + thin `app.js` shell, verified against the parity checklist

**Files:**
- Create: `app/public/search-mode.js`
- Modify: `app/public/app.js` (becomes the shell)
- Modify: `app/public/index.html` (`app.js?v=1.0.36` → `app.js?v=2.0.0`)

**Interfaces:**
- Consumes: everything `app.js` currently imports (after Tasks 1–2).
- Produces: `initSearchMode() → void` — wires the existing Search page exactly as before (event listeners, `loadBatchState()`), callable once. Part 3 calls it from the tabbed shell.

- [ ] **Step 1: Move the code**

Create `app/public/search-mode.js` with this header:

```js
/**
 * Search tab: one search term across all providers, filters, pagination,
 * result cards ("Open full image", Opened marks) and the click-order batch
 * download panel. Moved unchanged from app.js (v2.0.0 Part 2).
 *
 * @package IMGverse-Search
 * @since   2.0.0
 */

'use strict';
```

then, below it, move from `app.js` **verbatim**: all `import` statements, all top-level `const`/`let` declarations, and all functions. Wrap every top-level statement that *runs* at load time — the `addEventListener` registrations, the `filterPills.forEach(...)` / `orientPills.forEach(...)` blocks and the final `loadBatchState();` — in:

```js
let initialised = false;

/** Wire the Search tab. Safe to call once; later calls do nothing. */
export function initSearchMode() {
    if (initialised) return;
    initialised = true;

    // …the moved listener registrations and loadBatchState(); in their original order…
}
```

Keep the DOM lookups (`document.getElementById(...)`) at module top level as they are today: `app.js` is loaded with `type="module"` at the end of `<body>`, so the elements exist when the module evaluates.

- [ ] **Step 2: Make `app.js` the shell**

Replace the whole content of `app/public/app.js` with:

```js
/* =============================================================================
 * app.js
 * IMGverse Search — Vanilla JS frontend entry point.
 * Boots the Search tab (Part 3 adds the tabbed shell and Bulk keywords).
 *
 * @package IMGverse-Search
 * @since   1.0.0
 * ============================================================================= */

'use strict';

import { initSearchMode } from './search-mode.js?v=2.0.0';

initSearchMode();
```

In `app/public/index.html` change `/app.js?v=1.0.36` to `/app.js?v=2.0.0`.

- [ ] **Step 3: Static checks**

Run: `cd app && npm test`
Expected: PASS, 88 tests, 0 fail.

Run: `node --input-type=module --check < app/public/search-mode.js && node --input-type=module --check < app/public/app.js && echo syntax-ok`
Expected: `syntax-ok`

Run: `grep -rhn "from './[a-z-]*\.js?v=[0-9.]*'" app/public/*.js | sed -E "s/.*from '\.\/([a-z-]+\.js)\?v=([0-9.]+)'.*/\1 \2/" | sort -u`
Expected: each module listed with exactly one version — `batch-helpers.js 1.0.34`, `download-queue.js 2.0.0`, `image-shape.js 1.0.36`, `openverse-client.js 2.0.0`, `safe-storage.js 1.0.36`, `search-client.js 2.0.0`, `search-mode.js 2.0.0`.

- [ ] **Step 4: Browser parity check**

Start the app (`node app/src/server.js` from the repo root) and open `http://localhost:3000`. Walk the parity checklist's **Search, Pagination, Result cards and Batch download** sections, at minimum:

1. Search `ferret` → cards appear; provider badge, credit and "Open full image" on hover; console clean.
2. Provider pill **Openverse** → only Openverse cards; Network shows no `/api/search` request. Back to **All Providers**.
3. Orientation **Portrait** → only tall cards; query re-runs.
4. **Next** → "Page 2", count text, Previous enabled; **Previous** back.
5. "Open full image" on a card → "Opened" pin + label; still there after paging back.
6. Batch: open panel, paste 2 filenames, counters show "2 keywords / 0 images selected / 2 remaining"; batch mode on; click 3 cards → third refused with the "All keywords assigned" message; order badges + filename previews; grid dims others; reload → selections and keywords restored.
7. Change page / orientation → selections kept. New search term `otter` → queue cleared.
8. Select 2 images, **Download queue** → 2 files saved as `<filename>.jpg`, status "Downloading 1 of 2: …" then finish message.

Record any deviation as a bug and fix it (TDD where testable) before committing.

- [ ] **Step 5: Commit**

```bash
git add app/public/search-mode.js app/public/app.js app/public/index.html
git commit -m "refactor: move Search page logic into search-mode.js behind a thin app.js shell" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
