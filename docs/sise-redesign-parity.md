# SISE redesign — Search mode parity checklist

Every behaviour of the live Search page (`app/public/index.html`, `app/public/app.js`
as of v1.0.35) that the redesigned Search tab must keep. The redesign is not done
until each box is ticked and verified in the browser.

Source of truth for each item is listed so nothing is ported from memory.

## Search

- [ ] Search box; submitting a **new** term resets to page 1 (`startNewSearch`)
- [ ] Provider pills: All Providers, Openverse, Unsplash, Pexels, iNaturalist, Pixabay; changing re-runs the current query (`filterPills`)
- [ ] Orientation pills: Any, Landscape, Portrait, Square, with shape icons; changing re-runs the current query (`orientPills`)
- [ ] Server search (`/api/search` with `q`, `page`, `providers`, `orientation`) runs in parallel with browser-side Openverse (`fetchPage`)
- [ ] Openverse woven in at ~1 in 5 (`weaveOpenverse`), duplicates removed (`dedupeClientResults`)
- [ ] Stale responses ignored when a newer search started (`searchToken`)
- [ ] Openverse errors logged with `[IMGverse/openverse]` (prefix becomes `[SISE/...]` after rename)
- [ ] Loader while fetching; empty state with message when nothing found (`showEmptyState`)

## Pagination

- [ ] Previous / Next buttons, disabled at page 1 / when no next page (`updatePagination`)
- [ ] "Page N" label and "X images on this page" count
- [ ] Next page exists if server **or** Openverse has more (`mergeHasNext`)
- [ ] Changing page or filters does **not** clear the batch queue

## Result cards

- [ ] Masonry grid, aspect ratio reserved from width/height to avoid layout jump
- [ ] Provider badge on each card
- [ ] Photographer credit linked to `creditUrl`
- [ ] "Open full image" link to the provider's full-size file (new tab)
- [ ] "Opened" state: pin + button label after open or right-click Save As, remembered for the session and matched across pages by URL (`markImageOpened`, `imageKey`)

## Batch download (click-order flow)

- [ ] Collapsible panel (`batch-toggle`, `aria-expanded`)
- [ ] Filenames textarea, one per line; persisted in sessionStorage
- [ ] Counters: "N keywords", "N images selected", and "N remaining" / "All keywords assigned" / "Ready to download"
- [ ] Batch mode toggle; clicking a card selects it in order, shows order badge and filename preview (`syncBatchCardUI`)
- [ ] Clicking a selected card deselects it
- [ ] Selection capped at keyword count, with messages "Paste keywords first" / "All keywords assigned…" (`toggleBatchSelection`)
- [ ] Grid dims unselected cards when at cap (`grid--batch-full`)
- [ ] Download size: Web (max 1920px) / Full resolution
- [ ] Clear selection button
- [ ] Download queue button, enabled only when selections == keywords; shows "Downloading N of M: name"; 700 ms gap between files
- [ ] Downloads go through `/api/proxy` (JPEG conversion, IPTC caption "Photo by Name / Provider", no URLs)
- [ ] Failed downloads listed by name with reason; "Retry N failed" button (`renderBatchFailures`, `retryFailedDownloads`)
- [ ] Finish message (`formatBatchFinishMessage`)
- [ ] A **new search term** clears the queue; page/filter changes do not (`resetBatchQueue`)
- [ ] Selections, keywords and query restored after reload (`loadBatchState`)

## Rename (IMGverse → SISE) side effects to handle

- [ ] sessionStorage keys `imgverse:*` (opened, legacy saved, batch keywords/selections/query): migrate old keys on first load like `LEGACY_SAVED_STORAGE_KEY` does, so users don't lose state
- [ ] Log prefixes `[IMGverse/...]` and the AGENTS.md convention
- [ ] Redis cache key prefix `imgverse:search:` (old keys just expire after 1h)
- [ ] Provider `User-Agent` strings, page `<title>`, meta description, favicon, `meta.json`, README, repo and deploy names

## Known bugs to fix during the port (found 14/10/2026)

Found during the v2.0.0 Part 2 browser check (present on master too; code moved unchanged):

- [x] Clicking a provider/orientation pill (or paging) while a search is still loading leaves the grid empty: `fetchPage()` returns early on `isLoading`, then the in-flight result is discarded as stale by `searchToken`. Fix: let the newer request run and drop the older one (token check only), instead of the `isLoading` early return.
- [x] After a reload, re-running the same search term wipes the restored batch queue: `BATCH_QUERY_KEY` is written but never read, so `currentQuery` is `''` and `startNewSearch` treats the term as new. Fix: restore `currentQuery` (and the search box) from `BATCH_QUERY_KEY` in `loadBatchState()`, or compare against the stored query.

Found earlier:

- [ ] iNaturalist width/height hard-coded to 0, so the orientation filter lets every iNaturalist image through (`app/src/providers/inaturalist.js`; API has `original_dimensions`)
- [ ] sessionStorage writes are unguarded (`persistOpenedKeys`, `persistBatchKeywords`, `persistBatchSelections`, `resetBatchQueue` in `app/public/app.js`); when storage is blocked they throw and break the click handler. Wrap all storage access like `loadOpenedKeys` already does. (The demo crashed on exactly this before it was guarded.)
- [ ] Openverse ignores its native `aspect_ratio=wide|tall|square` filter and drops results client-side instead (`app/public/openverse-client.js`)
