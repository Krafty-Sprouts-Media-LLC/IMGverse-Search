# SISE: Bulk keyword mode, redesign and rename — design spec

| | |
|---|---|
| Date | 14/10/2026 |
| Status | Approved 14/10/2026 |
| Prototype | `demo-bulk-keywords.html` (throwaway, uncommitted) |
| Parity checklist | [`docs/sise-redesign-parity.md`](../../sise-redesign-parity.md) |
| Target release | `v1.0.36` (bug fixes, §11 step 1), then `v2.0.0` (everything else) |

## 1. Goal

Turn a list of article keywords (hundreds at a time, e.g. "can you freeze cooked salmon", "what to serve with tri tip") into **one downloaded image per keyword, named after the keyword**, without AI and without hitting provider rate limits.

At the same time:

- redesign the whole UI into a two-tab shell, **Search** (today's flow, unchanged behaviour) and **Bulk keywords** (new);
- rename the product from **IMGverse Search** to **SISE** (tagline "Stock image search engine").

### Success criteria

1. Pasting 590 keywords and reviewing them never causes a provider ban, and a paused provider never blocks the user: other providers keep filling rows.
2. Every keyword's downloaded file is named after that keyword, and the pairing is impossible to get wrong (no click-order dependence).
3. Every item in the parity checklist works in the new Search tab.
4. The user always knows what the system is doing: searching, caught up, paused by them, or waiting on a named provider with a countdown.

### Agreed during brainstorming (with the user)

- Rule-based query cleaning, no AI.
- One row per keyword; the **top result is auto-picked**, the user fixes bad ones.
- Bulk mode is a **separate tab**; the existing click-order batch flow stays as is.
- Orientation applies to the whole bulk run, default **Wide/Landscape**.
- Images under **1000px** on the long edge are flagged and skipped by auto-pick (Openverse mostly serves Flickr's 1024px copies).
- Unsplash runs on a **production key (5,000/hour)**. Pexels (200/hour, 20,000/month) is the real bottleneck.
- Rename to **SISE** ships together with the redesign so users see one change.

### Out of scope

- AI query rewriting or AI image ranking.
- A server-side background job that searches the whole list unattended.
- Accounts, auth, Openverse OAuth (Openverse stays browser-side and anonymous).
- Dark mode (the app is light-only today; not requested).
- Renaming the GitHub repository and the production domain. Those are outward-facing actions the user performs; this spec lists them as manual steps (§9).

## 2. Architecture overview

```
Browser (single page, two tabs)
├── shell.js ............ tabs (#search / #bulk in URL hash), shared header
├── search-mode.js ...... today's Search page logic, moved out of app.js unchanged in behaviour
├── bulk-mode.js ........ bulk rows, look-ahead queue, keyboard, run status UI
├── query-cleaner.js .... pure: keyword → search query            (new, unit-tested)
├── image-shape.js ...... pure: shapeOf / matchesOrientation / isSmall / autoPick (new, unit-tested; also imported by the server)
├── download-queue.js ... shared sequential downloader + failures/retry (extracted from app.js)
├── safe-storage.js ..... try/catch sessionStorage wrapper + imgverse:* → sise:* migration
├── openverse-client.js . browser Openverse search (+ native aspect_ratio, + 429 back-off)
└── batch-helpers.js .... unchanged

Server (Express)
├── GET /api/search ............ unchanged contract + additive `providerStatus` field
├── GET /api/providers/status .. NEW: per-provider budget snapshot for the sidebar
├── lib/rate-budget.js ......... NEW: Redis-backed per-provider counters + pause windows
├── providers/index.js ......... skips paused providers, records usage, per-provider cache
├── /download, /proxy .......... unchanged (bulk reuses /download)
```

Why this shape (alternatives considered):

- **Client-driven queue, server-side counting (chosen).** The browser decides *what* to search (only rows near the user), the server decides *whether* each provider may be called. Counting in Redis means two tabs or a re-run share one budget. Small change to the server; no job runner.
- *Server job queue* (rejected): the server would search the whole list in the background. Needs job storage, progress polling and cancellation, and it spends quota on rows the user never reaches. YAGNI for one user reviewing at human speed.
- *Pure client-side budgets* (rejected): each tab would believe it has the full quota; a reload resets the counters.

## 3. Query cleaner (`app/public/query-cleaner.js`)

Pure function `cleanQuery(keyword) → string`, plus `PREFIXES`, `CUTS`, `FILLERS` exported for tests. Rules exactly as validated in the prototype against all 590 keywords in the user's list (1 defect found and fixed):

1. Lower-case, collapse whitespace.
2. Strip one leading template: `can (you|i|we) (re)freeze`, `how (to|do you|long can you) freeze`, `is it (ok|safe) to freeze`, `what (to serve|goes|to eat|sides go) with`, `traditional`.
3. Cut at the earliest qualifier: ` for `, ` without `, ` in the `, ` in its `, ` in a `, ` in `, ` with the `, ` with `, ` to drink`, ` after `, ` from a `, ` made with `, ` on it`, ` later`.
4. Repeatedly strip leading fillers: `a`, `an`, `the`, `an unopened pack of`, `unopened`, `a whole`, `leftover`, `opened`, `homemade`, `pack of`, `N-day-old`.
5. If the result is empty, fall back to the original keyword.

Examples (test fixtures): `can you freeze bananas for dogs → bananas`, `can you freeze an unopened pack of hot dogs → hot dogs`, `what to serve with tri tip → tri tip`, `traditional ramadan breakfast in albania → ramadan breakfast`, `can you freeze 2-day-old rice → rice`.

The cleaned query is a **default**. Every row shows it in an editable field; editing and pressing Enter re-searches that row only.

## 4. Bulk keywords tab

### 4.1 Layout

Left sidebar: keywords textarea with count, Load sample / Clear, provider list with an on/off checkbox per provider plus its budget status (§5.6), Orientation (Any / Wide / Tall / Square, default Wide), Download size (Web 1920px / Full), primary **Search N keywords** button, progress bar.

Main: sticky toolbar with filters **All / Needs review / Picked / Skipped** (with counts), keyboard hints, **Download N** button, and the run status line (§5.3). Below it, one row per keyword.

Row anatomy: index, keyword (the filename source), editable cleaned query, status badge ("20 results", "No results", "waiting on Pexels"), filename preview, Skip/Restore; then a horizontal strip of 6 thumbnails with "+N more" (reveals the rest of the already-fetched results, no new request). Each thumbnail shows its index, a shape icon and real pixel size; under-1000px sizes are amber.

### 4.2 Behaviour

- Pressing **Search** creates rows; it does not search them all (§5.1). Pasting alone does nothing.
- **Auto-pick:** the first result that matches the chosen orientation and is ≥ 1000px on its long edge; if none qualifies, the first result. Shared `autoPick()` in `image-shape.js`.
- Click a thumbnail to change the pick; keyboard: `J`/`K` or arrows move rows, `1`–`9` pick, `←`/`→` change pick, `S` skip/restore, `E` edit query.
- **Needs review** = not skipped and (no results, or a non-rate-limit error). Rows with errors show Retry and Skip.
- Changing orientation re-queues all non-skipped rows (served from cache where available).
- Hard cap: 1,000 keywords per run (DOM size); the count shows "(first 1,000 used)" above that.

### 4.3 Results per row

Each row calls the existing `GET /api/search?q=…&orientation=…&providers=…` (the server providers ticked in the sidebar) **and**, if ticked, browser Openverse, then merges them the same way the Search tab does (`weaveOpenverse`, `dedupeClientResults`). One shared merge function is used by both tabs.

### 4.4 Download

- **Download N** downloads every picked, non-skipped row through the existing `/download` route via the shared `download-queue.js` (same 700ms gap, same per-file failure list and **Retry N failed**, same IPTC credit, same size option).
- **Filename = the keyword as written**, sanitized by the existing `sanitizeDownloadName` (e.g. `what to serve with tri tip.jpg`, spaces kept), exactly like today's batch mode. Decided by the user on 14/10/2026; the prototype's slug style (`what-to-serve-with-tri-tip.jpg`) is not used. The row's filename preview shows this same name.

### 4.5 Persistence

Stored in session storage via `safe-storage.js` (`sise:bulk`): keywords, per-row query overrides, picks (by stable image key), skipped flags, orientation, reading position. Image results are not stored; after reload, rows near the reading position are re-searched (served from the Redis cache, so no quota cost within the hour).

## 5. Rate limits

### 5.1 Search-as-you-review (client)

- Rows are searched only when within **10 rows of the reading position**. Reading position = max(active row, first row visible in the viewport).
- At most **2 rows in flight**.
- Rows outside the window show "Not searched yet. Starts when you are within 10 rows."
- Effect measured in the prototype: 100 pasted keywords → 11 requests; moving 15 rows down → 26.

### 5.2 Provider budgets (server, `app/src/lib/rate-budget.js`)

Redis keys `sise:budget:{provider}` hold `{ used, windowStart, pausedUntil }`. Configured windows (env-overridable, defaults from provider docs):

| Provider | Default limit | Window |
|---|---|---|
| Pexels | 200 (also 20,000/month) | hour |
| Unsplash | 5,000 | hour |
| Pixabay | 100 | minute |
| iNaturalist | 60 | minute (courtesy limit; their guidance is ~1 req/sec) |

Rules:

1. Before calling a provider, `searchAll` asks `rateBudget.canCall(provider)`. Paused or exhausted → skip it and report `{ status: 'paused', resumeAt }`.
2. After each call, record usage. When a provider sends rate-limit headers for the same window we track (Unsplash: hourly `X-Ratelimit-Remaining`; Pixabay: `X-RateLimit-Remaining` / `X-RateLimit-Reset`), they **override** the local estimate. Pexels' headers report the **monthly** quota (and only on 2xx responses), so they update the monthly counter while the hourly window stays counted locally.
3. A `429` pauses the provider until its reset time (from headers) or the end of the window, and logs `[SISE/budget] pexels 429, paused until 14:05`.
4. If Redis is down, budgets degrade to in-memory counters (logged once), never to "no limits".

`GET /api/search` gains an additive field:

```json
"providerStatus": {
  "pexels":   { "status": "paused", "resumeAt": "2026-10-14T14:05:00Z" },
  "unsplash": { "status": "ok" },
  "pixabay":  { "status": "ok" }
}
```

`GET /api/providers/status` returns `{ provider: { limit, remaining, per, status, resumeAt } }` for the sidebar; the client polls it every 15s while a bulk run is active.

### 5.3 Per-provider cache (fixes a correctness gap)

Today the whole `/api/search` response is cached for an hour under one key. If Pexels was paused, that cached response would pin "no Pexels images" for an hour. Change the cache to **one entry per provider**: `sise:search:{provider}:{q}:{page}:{orientation}`. `searchAll` assembles the response from cached groups plus live calls for the rest. This also makes top-ups cheap: when Pexels resumes, rows only re-request Pexels.

### 5.4 Top-up of rows that missed a provider

Rows record `pending` providers from `providerStatus`. When `/api/providers/status` shows a provider back to `ok`, rows with that provider pending (nearest the reading position first) re-request `?providers=pexels`, merge the new images after the existing ones, and keep the user's pick. The demo verified the flow with a simulated Pexels reset.

### 5.5 Openverse (browser)

Openverse publishes no limit and the browser can't read its headers (CORS), so: on `429`, pause Openverse for 60 seconds, put the row back in the queue (not "failed"), and show the countdown. Uses the native `aspect_ratio` filter (§7).

### 5.6 What the user sees

- **Run status line** (toolbar): `Searching` / `Caught up` / `Paused by you` / `Waiting for Openverse` / `All searched`, then `26 of 100 searched · the next 74 start when you scroll within 10 rows`, then any provider notes (`Pexels hourly limit reached, back in 1:11. Other providers keep filling rows.`), and a **Pause / Resume** button.
- **Sidebar provider list:** remaining/limit per provider with a meter, `Paused · resets in m:ss` in amber when paused.
- **Row badge:** `waiting on Pexels` until the top-up lands.

## 6. Search tab (port of today's page)

Behaviour is unchanged. The code moves from `app.js` into `search-mode.js`, restyled to the new design. **Every item in [`docs/sise-redesign-parity.md`](../../sise-redesign-parity.md) must be verified in the browser before release.** The prototype's Search tab already demonstrates each control (provider and orientation pills, pagination with counts, provider badge, credit, Open full image + Opened pin, the full batch panel with cap messages, order badges and filename previews, dimming at cap, size option, clear, download, failures and retry, new term clears the queue).

## 7. Bug fixes included (found while prototyping)

1. **iNaturalist orientation does nothing.** `inaturalist.js` hard-codes `width: 0, height: 0`, and `filterByOrientation` lets unknown sizes through. Map `photo.original_dimensions`.
2. **Openverse ignores its native shape filter.** Send `aspect_ratio=wide|tall|square` and keep the client-side ratio check as a safety net (verified: Openverse "tall" returned 3 near-square images out of 20).
3. **Unguarded session-storage writes** in `app.js` throw when storage is blocked and break batch clicks. All storage goes through `safe-storage.js`.
4. Shape thresholds (1.15 / 0.87) are duplicated in `providers/index.js` and `openverse-client.js`; both import `image-shape.js` instead.

(1) and (2) are also offered as a standalone fix task; whichever lands first, the other skips it.

## 8. Visual design

- Product register: light, dense, calm. Brand pink `#FF3366` (as OKLCH tokens) only for picks, primary buttons and selection, with no gradients. Plus Jakarta Sans for UI, JetBrains Mono for queries, filenames and sizes.
- Tokens on `:root`; neutrals lightly tinted toward the brand hue; amber for warnings, green for OK.
- Sidebar + main layout; collapses to one column under 860px with no horizontal page scroll (verified in the prototype at 375px).
- Motion 150–250ms, state changes only; `prefers-reduced-motion` respected.
- Loading placeholders, not spinners; empty states that explain the next step.

## 9. Rename IMGverse → SISE

In code (part of this release):

- UI name, `<title>`, meta description, favicon wording, header tagline "Stock image search engine".
- `meta.json` (`id: sise`, `name: SISE`), `app/package.json` name, README, AGENTS.md (log prefix convention becomes `[SISE/...]`), file headers (`@package SISE`; existing `@since` tags untouched), docker-compose service labels if they show the name.
- Log prefixes `[IMGverse/...]` → `[SISE/...]`.
- Redis prefix `imgverse:` → `sise:` (old keys expire within an hour, no migration).
- Session storage: `safe-storage.js` migrates any `imgverse:*` key to `sise:*` on first load and deletes the old one, the same way `LEGACY_SAVED_STORAGE_KEY` is handled today, so in-progress batches and Opened marks survive.
- Provider `User-Agent` → `SISE/2.0`.

Manual steps for the user (not done by the agent): rename the GitHub repo (GitHub redirects the old URL), update the production domain/DNS if it contains the old name, update the Dokploy app name.

## 10. Testing

Unit tests (`node --test`, same pattern as `batch-helpers.test.js`):

- `query-cleaner.test.js`: the fixtures in §3, plus a snapshot of all 590 keywords from the user's list checked into `app/src/lib/fixtures/keywords.txt` with expected queries.
- `image-shape.test.js`: thresholds at the boundaries (1.15, 0.87), unknown sizes, `isSmall` at 999/1000, `autoPick` preferring shape + size and falling back to the first result.
- `rate-budget.test.js`: window roll-over, header override, 429 pause and resume, Redis-down fallback (fake clock, in-memory Redis stub).
- `providers.test.js`: iNaturalist maps `original_dimensions`; Openverse sends `aspect_ratio`; paused providers are skipped and reported in `providerStatus`; per-provider cache keys.
- `safe-storage.test.js`: throwing storage, `imgverse:*` → `sise:*` migration.

Smoke test (`tests/smoke-test.sh`): add `/api/providers/status` (200, JSON with known providers) and assert `/api/search` includes `providerStatus`.

Browser verification before release: every box in the parity checklist; a bulk run with 100 keywords checking the request count, pause/resume, top-up, review filter, keyboard and download with one forced failure + retry; 375px width.

## 11. Delivery plan

The release ships as one user-visible change, built in this order (each step leaves the app working):

1. Fixes: `image-shape.js`, iNaturalist dimensions, Openverse `aspect_ratio`, `safe-storage.js` (could ship alone as `v1.0.36`).
2. Server: `rate-budget.js`, per-provider cache, `providerStatus`, `/api/providers/status`.
3. Frontend refactor with no visual change: split `app.js` into `search-mode.js` + `download-queue.js` + `shell.js`; parity checklist passes.
4. Redesign shell and Search tab styling.
5. `query-cleaner.js` + Bulk tab.
6. Rename to SISE.
7. CHANGELOG `[2.0.0]`, `meta.json` 2.0.0, smoke test, tag `v2.0.0`, push, redeploy (per AGENTS.md, when the user asks).

## 12. Open questions

1. ~~Filename style for bulk downloads~~ **Resolved 14/10/2026:** keep today's convention, keyword as written with spaces (§4.4).
2. ~~Ship the bug fixes early~~ **Resolved 14/10/2026:** delivery step 1 (§11) ships on its own as `v1.0.36`.
