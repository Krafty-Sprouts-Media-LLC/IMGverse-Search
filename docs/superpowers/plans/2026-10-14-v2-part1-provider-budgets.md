# v2.0.0 Part 1: Provider Rate Budgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The server counts every provider call against that provider's limit, skips providers that are paused, caches each provider's results separately, and tells the browser which providers are paused (`providerStatus` on `/api/search`, plus `GET /api/providers/status`).

**Architecture:** A pure, clock-injected `createRateBudget()` in `app/src/lib/rate-budget.js` holds per-provider counters and pause windows. Provider adapters gain an optional `{ onResponse, fetchImpl }` argument so the aggregator can feed response status and rate-limit headers into the budget (and so adapters become testable). `app/src/providers/index.js` exposes a dependency-injected `createSearchAll({ providers, budget, cache })`; the default `searchAll` wires in the real adapters, the budget singleton and Redis. The `/api/search` route stops caching whole responses.

**Tech Stack:** Node 20+, Express 4, ES modules, `node-fetch` (adapters), `ioredis` via `app/src/cache.js`, `node:test` + `node:assert/strict` (`cd app && npm test`; runs `src/lib/*.test.js`). Global `Headers` is available in Node 20+.

**Spec:** [`docs/superpowers/specs/2026-10-14-sise-bulk-keywords-design.md`](../specs/2026-10-14-sise-bulk-keywords-design.md) §5.2, §5.3 and §11 step 2. Part 1 of 5 for `v2.0.0`; ships only with the `v2.0.0` release (no CHANGELOG/version bump in this part).

## Global Constraints

- Read `AGENTS.md`. KISS / YAGNI / DRY. No silent failures: log with `[IMGverse/...]` prefixes (the SISE rename to `[SISE/...]` is Part 5, not now).
- New files: WordPress-style header with `@package IMGverse-Search` and `@since   2.0.0`. Never change existing `@since` tags.
- Default limits (env-overridable as `<PROVIDER>_RATE_LIMIT`, e.g. `PEXELS_RATE_LIMIT=200`):
  - pexels 200 per hour
  - unsplash 5000 per hour
  - pixabay 100 per minute
  - inaturalist 60 per minute
- Header rules:
  - Unsplash and Pixabay rate-limit headers describe the same window we count, so `X-Ratelimit-Limit` / `X-Ratelimit-Remaining` override the local count.
  - Pixabay `X-RateLimit-Reset` is seconds until reset.
  - Pexels headers are **monthly** (`X-Ratelimit-Reset` = Unix timestamp of the monthly roll-over); they update `monthRemaining` only. The hourly window stays counted locally.
- HTTP 429 pauses the provider until `Retry-After` (seconds) if present, else the known reset time, else the end of the current window, and logs `[IMGverse/budget] <name> returned 429, paused until <ISO time>`.
- Cache: one entry per provider, key `imgverse:search:<provider>:<q>:<page>:<orientation>`, TTL 3600 s, only non-empty groups are cached. A cached group is served even when the provider is paused (it costs no quota).
- Every provider group passes through `filterByOrientation` from `public/image-shape.js` (safety net; fixes Pixabay "square", which Pixabay can't filter natively). `nativeOrientation` only decides whether the orientation is sent to the provider.
- `providerStatus` entry shapes: `{ status: 'ok' }`, `{ status: 'ok', cached: true }`, `{ status: 'paused', resumeAt: '<ISO>' }`, `{ status: 'error' }`.
- `GET /api/providers/status` returns `{ <provider>: { limit, remaining, per, status, resumeAt, monthRemaining? } }`.
- Ruling carried from planning (deviates from spec §5.2 "Redis-backed"): budgets are **in memory** in the single app process. The stack runs one app container; after a restart the first over-limit call gets a 429, which pauses the provider anyway. Persisting to Redis is YAGNI until there are several app replicas.
- Commits: allowed on branch `release/v2.0.0`. Never push, tag, merge or switch branches.

## Review Focus

1. **Pexels 429 arrives without rate headers** (Pexels only sends them on 2xx) → pause until the end of the current hour window, then allow calls again. Test in Task 1.
2. **A provider's real limit differs from our default** (an Unsplash demo key is 50/hour, not 5000) → the header limit wins, so we pause at 50, not 5000. Test in Task 1.
3. **One provider paused, others fine** → the response still contains the other providers' images, and `providerStatus` names the paused one with `resumeAt`. Test in Task 3.
4. **A provider throws or returns HTTP 500** → its status is `error`, nothing is cached for it, and the other providers are unaffected. Tests in Tasks 2 and 3.
5. **Square orientation on a provider without a native square filter** (Pixabay) → non-square images are dropped by the safety-net filter. Test in Task 3.

---

### Task 1: Rate budget module

**Files:**
- Create: `app/src/lib/rate-budget.js`
- Create: `app/src/lib/rate-budget.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (`app/src/lib/rate-budget.js`):
  - `DEFAULT_LIMITS: { [provider]: { limit: number, windowMs: number, per: 'hour'|'minute' } }`
  - `limitsFromEnv(env?: object, base?: object) → same shape as DEFAULT_LIMITS`
  - `createRateBudget({ limits?, now? }) → { canCall(name) → { ok: true } | { ok: false, resumeAt: number /* ms epoch */ }, recordCall(name) → void, observe(name, status: number, headers: Headers|undefined) → void, snapshot() → { [name]: { limit, remaining, per, status: 'ok'|'paused', resumeAt: string|null, monthRemaining?: number } } }`
  - Names not in `limits` are always allowed and never counted.

- [ ] **Step 1: Write the failing test**

Create `app/src/lib/rate-budget.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test`
Expected: FAIL, `Cannot find module '.../src/lib/rate-budget.js'`.

- [ ] **Step 3: Write the implementation**

Create `app/src/lib/rate-budget.js`:

```js
// =============================================================================
// src/lib/rate-budget.js
// IMGverse Search — Per-provider rate budgets.
// Counts calls per provider per window, honours provider rate-limit headers
// and 429 responses, and reports which providers are paused. In memory:
// the stack runs a single app process (see v2.0.0 Part 1 plan ruling).
//
// @package IMGverse-Search
// @since   2.0.0
// =============================================================================

'use strict';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const DEFAULT_LIMITS = Object.freeze({
  pexels:      Object.freeze({ limit: 200,  windowMs: HOUR,   per: 'hour' }),
  unsplash:    Object.freeze({ limit: 5000, windowMs: HOUR,   per: 'hour' }),
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
        s.pausedUntil = Math.max(s.pausedUntil, resetAt ?? s.windowStart + cfg.windowMs);
      }
    }

    if (status === 429) {
      const until = retryAfter != null
        ? t + retryAfter * 1000
        : (resetAt ?? s.windowStart + cfg.windowMs);
      s.pausedUntil = Math.max(s.pausedUntil, until);
      console.warn(`[IMGverse/budget] ${name} returned 429, paused until ${new Date(s.pausedUntil).toISOString()}`);
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm test`
Expected: PASS, 54 tests (42 existing + 12 new), 0 fail, no `[IMGverse/budget]` lines printed (the tests stub `console.warn`).

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/rate-budget.js app/src/lib/rate-budget.test.js
git commit -m "feat: add per-provider rate budgets" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Adapters report responses and stop failing silently

**Files:**
- Modify: `app/src/providers/unsplash.js`, `app/src/providers/pexels.js`, `app/src/providers/pixabay.js`, `app/src/providers/inaturalist.js` (the `search` function in each)
- Create: `app/src/lib/provider-adapters.test.js`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: every adapter has the signature `search(query, page = 1, orientation = '', { onResponse, fetchImpl = fetch } = {})` and calls `onResponse?.(res)` right after the HTTP response arrives (before checking `res.ok`). iNaturalist accepts and ignores `orientation` (named `_orientation`). Non-OK responses log `[IMGverse/<provider>] HTTP <status> for q="<query>"`; exceptions log `[IMGverse/<provider>] search failed for q="<query>": <message>`. Return values (arrays of ImageResult) are unchanged.

- [ ] **Step 1: Write the failing test**

Create `app/src/lib/provider-adapters.test.js`:

```js
// =============================================================================
// src/lib/provider-adapters.test.js
// IMGverse Search — Tests for provider adapter response reporting.
//
// @package IMGverse-Search
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
    assert.match(errors[0], /^\[IMGverse\/pixabay\] HTTP 429 for q="kiwi"/);
  });

  it('logs and returns [] when fetch throws', async () => {
    const fetchImpl = async () => { throw new Error('socket hang up'); };
    const images = await pexels('rice', 1, '', { fetchImpl });
    assert.deepEqual(images, []);
    assert.match(errors[0], /^\[IMGverse\/pexels\] search failed for q="rice": socket hang up/);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test`
Expected: FAIL. Adapters ignore the 4th argument, so they call the real network instead of `fetchImpl` and `onResponse` is never called (assertions on `seen.length` / `reported` fail; failures may include network errors).

- [ ] **Step 3: Change each adapter**

Apply these exact edits in **each** of `unsplash.js`, `pexels.js`, `pixabay.js` (replace `<name>` with `unsplash` / `pexels` / `pixabay`):

1. Signature: `export async function search(query, page = 1, orientation = '') {` →
   ```js
   export async function search(query, page = 1, orientation = '', { onResponse, fetchImpl = fetch } = {}) {
   ```
2. The request: change `const res = await fetch(` to `const res = await fetchImpl(`, and directly after that statement's closing `});` add:
   ```js
       onResponse?.(res);
   ```
3. Replace `    if (!res.ok) return [];` with:
   ```js
       if (!res.ok) {
         console.error(`[IMGverse/<name>] HTTP ${res.status} for q="${query}"`);
         return [];
       }
   ```
4. Replace the final
   ```js
     } catch {
       return [];
     }
   ```
   with:
   ```js
     } catch (err) {
       console.error(`[IMGverse/<name>] search failed for q="${query}":`, err.message);
       return [];
     }
   ```

Add a JSDoc line for the new parameter in each adapter's comment block, below the `@param {string} orientation` line:

```js
 * @param {object}   [options]            - { onResponse(res), fetchImpl } — used by the rate budget and tests.
```

In `inaturalist.js` (Task 3 of v1.0.36 already added its logging):

1. Signature: `export async function search(query, page = 1) {` →
   ```js
   export async function search(query, page = 1, _orientation = '', { onResponse, fetchImpl = fetch } = {}) {
   ```
   (iNaturalist has no orientation filter; the aggregator filters its results.)
2. `const res = await fetch(` → `const res = await fetchImpl(`, and add `    onResponse?.(res);` directly after that statement's closing `});`.
3. Add the same `@param {object} [options]` JSDoc line.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm test`
Expected: PASS, 60 tests, 0 fail, no stray log lines (tests stub `console.error`).

- [ ] **Step 5: Commit**

```bash
git add app/src/providers/unsplash.js app/src/providers/pexels.js app/src/providers/pixabay.js app/src/providers/inaturalist.js app/src/lib/provider-adapters.test.js
git commit -m "feat: adapters report responses for rate budgets and log failures" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Budget-aware search with per-provider cache, `providerStatus`, and status route

**Files:**
- Modify: `app/src/providers/index.js` (replace `searchAll` with `createSearchAll` + default wiring; update header comment)
- Modify: `app/src/routes/search.js` (drop whole-response cache; return `providerStatus`; update header comment)
- Create: `app/src/routes/providers.js`
- Modify: `app/src/server.js` (mount `/api/providers`)
- Modify: `tests/smoke-test.sh` (two new checks after the `/api/search` check)
- Create: `app/src/lib/search-all.test.js`

**Interfaces:**
- Consumes: `createRateBudget`, `limitsFromEnv` (Task 1); adapter signature `search(query, page, orientation, { onResponse })` (Task 2); `filterByOrientation` from `public/image-shape.js`; `get`, `set` from `src/cache.js`; `interleave`, `dedupeResults` from `src/utils.js`.
- Produces:
  - `createSearchAll({ providers: Array<{ name, search, nativeOrientation }>, budget, cache: { get, set }, ttlSeconds = 3600 }) → searchAll`
  - `searchAll(query, page = 1, filter = [], orientation = '') → Promise<{ results: ImageResult[], providerStatus: { [name]: ProviderStatus } }>`
  - `budget` (the process-wide rate budget) exported from `providers/index.js`
  - `RESULTS_PER_PROVIDER` stays exported.
  - `GET /api/search` JSON: `{ total, page, orientation, results, hasNext, providerStatus }`
  - `GET /api/providers/status` JSON: `budget.snapshot()`

- [ ] **Step 1: Write the failing test**

Create `app/src/lib/search-all.test.js`:

```js
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
import { createSearchAll } from '../providers/index.js';
import { createRateBudget } from './rate-budget.js';

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

  it('honours the provider filter', async () => {
    const a = fakeProvider('pexels', [img('pexels', 1)]);
    const b = fakeProvider('pixabay', [img('pixabay', 1)]);
    const searchAll = createSearchAll({ providers: [a, b], budget: budgetFor(['pexels', 'pixabay']), cache: memCache() });
    const { providerStatus } = await searchAll('salmon', 1, ['pixabay']);
    assert.equal(a.calls.length, 0);
    assert.deepEqual(Object.keys(providerStatus), ['pixabay']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test`
Expected: FAIL, `createSearchAll` is not exported from `providers/index.js`.

- [ ] **Step 3: Replace the aggregator**

In `app/src/providers/index.js`:

Replace the header block's description lines (everything between the `// src/providers/index.js` line and the `// @package` line) with:

```js
// IMGverse Search — Provider aggregator (Search Controller).
// Fans out to all active providers simultaneously, then interleaves results
// round-robin to preserve each provider's relevance ranking.
//
// Per provider: serve the Redis-cached group if present; otherwise ask the
// rate budget (src/lib/rate-budget.js) whether the provider may be called,
// call it, feed the response into the budget, filter by orientation, and
// cache non-empty groups for an hour. Paused/failed providers are reported
// in `providerStatus` so the UI can say so.
//
// Orientation: providers with native support (Unsplash, Pexels, Pixabay)
// receive the param; every group is also filtered with the shared rules in
// public/image-shape.js (Pixabay has no native "square").
```

Replace the imports and everything after them (the `NATIVE_ORIENTATION` constant and the whole old `searchAll` function) so the file body below the header and `'use strict';` is:

```js
import { search as inaturalist } from './inaturalist.js';
import { search as unsplash    } from './unsplash.js';
import { search as pexels      } from './pexels.js';
import { search as pixabay     } from './pixabay.js';
import { interleave, dedupeResults } from '../utils.js';
import { filterByOrientation } from '../../public/image-shape.js';
import { get as cacheGet, set as cacheSet } from '../cache.js';
import { createRateBudget, limitsFromEnv } from '../lib/rate-budget.js';

/** Each provider returns up to this many results per page. */
export const RESULTS_PER_PROVIDER = 20;

const CACHE_PREFIX = 'imgverse:search';

/**
 * Build a search function over the given providers.
 *
 * @param {object}   deps
 * @param {Array<{ name: string, search: Function, nativeOrientation: boolean }>} deps.providers
 * @param {object}   deps.budget      From createRateBudget().
 * @param {{ get: Function, set: Function }} deps.cache
 * @param {number}   [deps.ttlSeconds]
 * @returns {Function} searchAll(query, page, filter, orientation)
 */
export function createSearchAll({ providers, budget, cache, ttlSeconds = 3600 }) {
  /**
   * @param {string}   query
   * @param {number}   [page]
   * @param {string[]} [filter]      Provider whitelist.
   * @param {string}   [orientation] '' | 'landscape' | 'portrait' | 'square'
   * @returns {Promise<{ results: object[], providerStatus: object }>}
   */
  return async function searchAll(query, page = 1, filter = [], orientation = '') {
    const active = filter.length
      ? providers.filter((p) => filter.includes(p.name))
      : providers;
    const providerStatus = {};

    const groups = await Promise.all(active.map(async (p) => {
      const key = `${CACHE_PREFIX}:${p.name}:${query}:${page}:${orientation}`;

      const cached = await cache.get(key);
      if (Array.isArray(cached)) {
        providerStatus[p.name] = { status: 'ok', cached: true };
        return cached;
      }

      const gate = budget.canCall(p.name);
      if (!gate.ok) {
        const resumeAt = new Date(gate.resumeAt).toISOString();
        providerStatus[p.name] = { status: 'paused', resumeAt };
        console.warn(`[IMGverse/budget] ${p.name} paused until ${resumeAt}, skipped for q="${query}"`);
        return [];
      }

      budget.recordCall(p.name);
      let group;
      try {
        group = await p.search(query, page, p.nativeOrientation ? orientation : '', {
          onResponse: (res) => budget.observe(p.name, res.status, res.headers),
        });
      } catch (err) {
        console.error(`[IMGverse/providers] ${p.name} rejected for q="${query}":`, err?.message || err);
        providerStatus[p.name] = { status: 'error' };
        return [];
      }

      group = filterByOrientation(Array.isArray(group) ? group : [], orientation);

      if (group.length > 0) {
        await cache.set(key, group, ttlSeconds);
        providerStatus[p.name] = { status: 'ok' };
        return group;
      }

      const after = budget.canCall(p.name);
      providerStatus[p.name] = after.ok
        ? { status: 'ok' }
        : { status: 'paused', resumeAt: new Date(after.resumeAt).toISOString() };
      console.warn(`[IMGverse/providers] ${p.name} returned 0 results for q="${query}" page=${page}`);
      return group;
    }));

    return {
      results: dedupeResults(interleave(groups)),
      providerStatus,
    };
  };
}

/** Process-wide rate budget, shared by every search and /api/providers/status. */
export const budget = createRateBudget({ limits: limitsFromEnv() });

const PROVIDERS = [
  { name: 'inaturalist', search: inaturalist, nativeOrientation: false },
  { name: 'unsplash',    search: unsplash,    nativeOrientation: true  },
  { name: 'pexels',      search: pexels,      nativeOrientation: true  },
  { name: 'pixabay',     search: pixabay,     nativeOrientation: true  },
];

export const searchAll = createSearchAll({
  providers: PROVIDERS,
  budget,
  cache: { get: cacheGet, set: cacheSet },
});
```

- [ ] **Step 4: Update the search route**

In `app/src/routes/search.js`:

Replace the header description lines

```js
// Checks Redis cache first, then fans out to all providers via searchAll.
// Caches results for 1 hour to respect provider rate limits.
```

with

```js
// Fans out to all providers via searchAll, which caches per provider and
// applies rate budgets; the response reports each provider's status.
```

Delete the line `import { get, set } from '../cache.js';`.

Replace everything from `  const cacheKey = ` through `  return res.json(payload);` with:

```js
  const { results, providerStatus } = await searchAll(q, page, providers, orientation);

  return res.json({
    total:   results.length,
    page,
    orientation,
    results,
    hasNext: results.length >= 10,
    providerStatus,
  });
```

- [ ] **Step 5: Add the status route and mount it**

Create `app/src/routes/providers.js`:

```js
// =============================================================================
// src/routes/providers.js
// IMGverse Search — GET /api/providers/status: per-provider rate budgets.
// Used by the UI to show requests left and paused providers.
//
// @package IMGverse-Search
// @since   2.0.0
// =============================================================================

'use strict';

import { Router } from 'express';
import { budget } from '../providers/index.js';

const router = Router();

router.get('/status', (_req, res) => {
  res.json(budget.snapshot());
});

export default router;
```

In `app/src/server.js`, add after `import downloadRouter from './routes/download.js';`:

```js
import providersRouter from './routes/providers.js';
```

and after `app.use('/api/search', searchRouter);`:

```js
app.use('/api/providers', providersRouter);
```

- [ ] **Step 6: Extend the smoke test**

In `tests/smoke-test.sh`, directly after the line `pass "/api/search returns valid JSON"`, add:

```bash
echo "${SEARCH_RESPONSE}" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'providerStatus' in d" \
    || fail "/api/search response has no providerStatus"
pass "/api/search includes providerStatus"

info "Testing /api/providers/status..."
STATUS_RESPONSE=$(curl -s "${BASE_URL}/api/providers/status")
echo "${STATUS_RESPONSE}" | python3 -c "import sys,json; d=json.load(sys.stdin); assert all(k in d for k in ('pexels','unsplash','pixabay','inaturalist'))" \
    || fail "/api/providers/status is missing providers"
pass "/api/providers/status lists provider budgets"
```

- [ ] **Step 7: Run tests and check the server starts**

Run: `cd app && npm test`
Expected: PASS, 69 tests, 0 fail, output pristine.

Run: `cd app && node -e "import('./src/providers/index.js').then(m => console.log(typeof m.searchAll, typeof m.budget.snapshot)).then(() => process.exit(0))"`
Expected: `function function`

Run: `grep -rn "searchAll(" app/src --include=*.js | grep -v test`
Expected: only `providers/index.js` (definition) and `routes/search.js` (destructured call). Any other caller must be updated to the `{ results, providerStatus }` return shape.

- [ ] **Step 8: Commit**

```bash
git add app/src/providers/index.js app/src/routes/search.js app/src/routes/providers.js app/src/server.js tests/smoke-test.sh app/src/lib/search-all.test.js
git commit -m "feat: budget-aware search with per-provider cache and provider status" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
