# Changelog

All notable changes to SISE (formerly IMGverse Search) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.2] - 16/10/2026

### Fixed
- **Wikimedia Commons licence is now shown and kept in the file.** Most Commons files are CC BY or CC BY-SA, which require naming the licence, but the licence appeared neither on the card nor in the downloaded file (the 2.1.0 notes said it did; that was wrong). The card now reads *Photo by <author> · CC BY-SA 4.0*, and the file's caption reads *Photo by <author> / Wikimedia Commons (CC BY-SA 4.0)*. Other providers' captions are unchanged. A Commons file with no licence name simply omits it.

## [2.1.1] - 15/10/2026

### Fixed
- **Wikimedia images looked soft in the grid and in the Bulk keywords preview.** They used 330 px thumbnails; they now use 960 px ones (about 150–190 KB each). Downloads were never affected: they always use the original file, resized to at most 1920 px in Web mode and untouched in Full mode, and are never enlarged.

## [2.1.0] - 15/10/2026

### Added
- **Wikimedia Commons is now a search provider** (Search and Bulk keywords), with no API key. Commons only hosts free-licence and public-domain files; the licence (for example "CC BY-SA 4.0") and the author, when Commons has one, show on the card and go into the downloaded file's caption. Some files have no author listed, so those cards show the licence only. Commons has a **Wikimedia** filter pill in Search and appears in the Bulk tab's provider list.
- Long Commons author fields (some authors paste a paragraph of licence instructions there) are shortened to 100 characters on the card and in the file caption; the linked Commons page has the full attribution text.
- Wikimedia requests are capped at 60 a minute (`WIKIMEDIA_RATE_LIMIT` to change it), and a Commons outage now shows as an error or pause for that provider instead of looking like "no results".

### Fixed
- The smoke test's `/proxy` image check used a Commons thumbnail URL that doesn't exist (HTTP 400), so it always failed. It now uses a real original file.

## [2.0.4] - 14/10/2026

### Fixed
- **Unsplash credit was cut off on Search cards.** "Photo by <name> on Unsplash" was forced onto one line with an ellipsis, so long names hid "on Unsplash". The credit now wraps and always shows in full.

## [2.0.3] - 14/10/2026

### Added
- **Unsplash API guidelines (needed to apply for Production).** Unsplash links now carry `utm_source=sise&utm_medium=referral`; the Search card credit reads *Photo by <name> on Unsplash* with both parts linked; and when an Unsplash image is downloaded (either tab) the server reports it to Unsplash through the photo's `download_location`. Only `https://api.unsplash.com/photos/<id>/download` is ever requested, so the browser cannot point our API key at another host.

### Fixed
- **"Paused · resets in 47:19" was a guess.** When Unsplash reported 0 requests left it sends no reset time, so we blocked the provider for a full hour from our own window start. We now pause for 5 minutes, then let one request through: if Unsplash still says 0 left (or returns 429) it pauses again; if not, searching resumes. Pixabay without a reset time behaves the same; Pexels (monthly quota) is unchanged.
- **Unsplash default limit** is now 50/hour (a Demo key) instead of 5000, so the budget shown before the first call is right. Unsplash's own header still wins, so a Production key shows 1000. README corrected (Production is 1,000/hour, not 5,000).

## [2.0.2] - 14/10/2026

### Added
- **Bulk keywords: unselect an image.** Click the selected image again (or press `X`) to leave a keyword without an image; it won't be downloaded. Late results from a paused provider don't re-select it, and it stays unselected after a reload. (#6)
- **Bulk keywords: clear counts.** "15 of 20 selected · 3 downloaded" next to the Download button, and a **Not selected** filter. (#6)
- **Bulk keywords: downloads are tracked.** Each saved row shows **Downloaded** (kept across reloads); the button becomes **Download N new** so earlier files aren't saved twice (a separate **Re-download all** is there if you want it); changing a downloaded row's image makes it new again. The finish message says how many keywords have no image, with a button to show them. (#7)
- **Bulk keywords: which provider and what the image is.** Every thumbnail shows its provider, hovering shows the provider's title, photographer and size, and each row shows the selected image as *Selected: "Title" · Photographer · Provider*. (#2, #3)
- **Bulk keywords: large preview.** **Preview** on a row, double-click a thumbnail, or press `Space`: the image large (Openverse uses its full file), with title, photographer, provider, size and shape; `←` `→` browse, `Enter` selects / unselects, `Esc` closes. (#4)

### Fixed
- **Downloads no longer fail with "502 Bad Gateway" after a few images.** The image library kept about 70 MB of memory after every download, so the app was killed for running out of memory after 3–4 large images and nginx showed its own 502 page for the next keywords while it restarted. Its cache is now off (each image is only processed once, so it never helped); 16 downloads in a row now stay at about 80 MB between images. (#9)
- Bulk keywords: `←` `→` now scroll the thumbnail strip so the selected image stays in view, revealing more images when you move past the last one, and never unselect at either end. (#5)

### Changed
- README: `/healthz` answers `healthy`; the environment table lists every optional setting (download size and quality, rate-limit overrides, `SISE_VERSION`) and which old variables are unused.

## [2.0.1] - 14/10/2026

### Fixed
- **The Dokploy template (Create Service → Template → Base URL) now works.** It never could before: Dokploy reads `blueprints/<id>/docker-compose.yml` and `template.toml`, which did not exist, and the documented Base URL used the `main` branch while the repository uses `master`. Added `blueprints/sise/` (compose file that pulls prebuilt images, `template.toml` with the API key fields ready to fill in, logo) and set the template id to `sise`. Base URL: `https://raw.githubusercontent.com/Krafty-Sprouts-Media-LLC/SISE/master`.
- **Prebuilt images are actually published.** The image workflow only ran on a `main` branch that does not exist, so no images were ever built. It now runs on every release tag and on `master`, and publishes `ghcr.io/krafty-sprouts-media-llc/sise-app` and `sise-nginx` (`latest` and the version number).

### Changed
- README deploy guide rewritten: both options step by step with the exact field values, where to get each API key, how to check the deploy, and a troubleshooting table.
- Repository links and provider User-Agent contact URLs point at the renamed repository (`Krafty-Sprouts-Media-LLC/SISE`).

### Deployment notes
- Existing deployments created as "Compose from Git" keep working unchanged (they still build from the repository root `docker-compose.yml`).
- After this release's image build finishes, set the two GHCR packages (`sise-app`, `sise-nginx`) to **public** once, so Dokploy can pull them without credentials.

## [2.0.0] - 14/10/2026

### Added
- **Bulk keywords tab.** Paste a keyword list ("can you freeze cooked salmon", "what to serve with tri tip"…) and get one row per keyword with a cleaned, editable search query, the best image pre-picked (right shape, at least 1000px), and **Download** saves one file per keyword named after the keyword (`what to serve with tri tip.jpg`). Up to 1,000 keywords per run.
  - Only rows within 10 of where you are reading are searched (2 at a time), so provider limits are not spent on rows you never reach.
  - Needs review / Picked / Skipped filters, Retry and Skip for rows with no results, "+N more" images, keyboard shortcuts (J/K rows, 1–9 pick, ←/→ change, S skip, E edit query), Pause / Resume.
  - Shape and pixel size on every thumbnail; images under 1000px flagged.
  - Progress, provider budgets and pauses are shown as they happen ("Pexels limit reached, back in 0:41. Other providers keep filling rows."); rows waiting on a paused provider are filled in automatically when it resumes.
  - The run survives a reload: keywords, query edits, picks, skips, orientation and position come back.
- **Provider rate budgets on the server.** Every call to Pexels (200/hour), Unsplash (5,000/hour), Pixabay (100/minute) and iNaturalist (60/minute) is counted; provider rate-limit headers and HTTP 429 pause a provider instead of hammering it. Limits are overridable with `<PROVIDER>_RATE_LIMIT`. New `GET /api/providers/status`; `/api/search` now returns `providerStatus`.
- Openverse rate limits (HTTP 429) are detected in the browser: Openverse rests for 60 seconds and rows are topped up afterwards.

### Changed
- **Renamed to SISE (Stock image search engine).** New name in the UI, page title, logs (`[SISE/...]`, was `[IMGverse/...]`), cache keys and User-Agent. Saved browser state (batch queue, Opened marks) moves over automatically on first load.
- **Redesigned interface**: Search and Bulk keywords tabs (deep-linkable as `#search` / `#bulk`, Back button works), sidebar + results layout, calmer colours with the brand pink for actions and selection, keyboard-friendly tabs and filters, readable on phones.
- Search results are cached per provider (1 hour), so a paused or failing provider is never cached as "no images".
- Batch downloads read the Web / Full size choice once when the download starts (it used to be read per file).
- Every provider result is also checked against the chosen orientation, which fixes Pixabay "Square" returning all shapes.
- Providers without an API key are skipped entirely (no wasted budget, not listed in the UI).

### Fixed
- Clicking a provider or orientation filter while a search was loading left the results empty.
- After a reload, searching the same term again wiped the restored batch queue.
- Filenames pasted into the batch panel before the first search were wiped by that search.
- Provider failures (HTTP errors, timeouts) were reported as "no results"; they are now reported as errors and logged.
- Screen readers now announce the "Open full image" link on result cards; white text on the brand colour meets 4.5:1 contrast.

### Deployment notes
- No configuration changes are required. Deployment identifiers were kept on purpose: GHCR image names (`…/imgverse-search`), the Redis volume default (`imgverse_redis_data` / `STACK_SLUG=imgverse`), `meta.json` `id` and GitHub URLs. Rename the GitHub repository first if you want those to change too.
- Old whole-response search cache keys (`imgverse:search:*`) simply expire within an hour.

## [1.0.36] - 14/10/2026

### Fixed
- **Orientation filter now works for iNaturalist.** Photo sizes were hard-coded to 0×0, so portrait and landscape filters let every iNaturalist image through; sizes now come from the API's `original_dimensions`
- **Openverse orientation returns full pages.** Openverse's own `aspect_ratio` filter (wide / tall / square) is now used instead of fetching everything and throwing most results away; our ratio check stays as a safety net
- Batch selections and "Opened" marks no longer break the page when the browser blocks session storage (private mode, blocked site data, full quota); a single `[IMGverse/storage]` warning is logged instead
- iNaturalist failures are now logged instead of silently returning no results

### Changed
- Landscape / portrait / square rules live in one shared module (`app/public/image-shape.js`) used by both the server and the browser

## [1.0.35] - 19/09/2026

### Changed
- Batch IPTC Caption is now **`Photo by {name} / {Provider}`** — no photo URL and no license dump, so WordPress does not paste `https://unsplash.com/photos/...` into figcaptions

## [1.0.34] - 05/09/2026

### Fixed
- Batch download names each failed file in the panel (with the server error) and adds **Retry failed** so you can re-download only those images instead of hunting the console

## [1.0.33] - 01/09/2026

### Added
- **Openverse** search from the browser (`app/public/openverse-client.js`) so Cloudflare cannot challenge the VPS IP with a "Just a moment..." page — same approach as Gutenberg and the IMGVerse WordPress plugin
- Openverse filter pill restored; All Providers weaves ~1 Openverse result per 4 server results
- Unit tests for Openverse client helpers (`npm test` in `app/`)

### Changed
- Server-side Openverse stays out of `/api/search` on blocked hosts; proxy/download still fetch full-size files from origin CDNs (Flickr, Wikimedia, etc.)

## [1.0.32] - 26/06/2026

### Fixed
- Starting a **new search term** clears the batch queue (keywords, selections, and saved batch state). Pagination and provider/orientation filters on the same query still keep your batch progress.

## [1.0.31] - 26/06/2026

### Fixed
- Batch mode stops accepting new image selections once you reach your keyword count; excess selections are trimmed if you delete keywords from the list

## [1.0.30] - 26/06/2026

### Added
- Batch panel **keyword counter** (`16 keywords`) plus **remaining** count (`8 remaining`) and **Ready to download** when counts match
- Keywords and image selections persist across **pagination** and in `sessionStorage` for the tab session

### Changed
- Batch UI copy uses **keywords** instead of filenames; hint explains cross-page selection

## [1.0.29] - 26/06/2026

### Added
- Batch download **size selector**: **Web** (default — server resizes to max 1920px wide, JPEG quality 82) vs **Full resolution** (provider original dimensions)
- Env vars `DOWNLOAD_MAX_WIDTH` (default `1920`) and `DOWNLOAD_JPEG_QUALITY` (default `82`) for `/download` when `size=web`

## [1.0.28] - 26/06/2026

### Fixed
- Batch download attribution now writes **IPTC Caption-Abstract** only (the Caption field) via `exiftool-vendored` — explicitly clears EXIF/XMP **Description** (`ImageDescription`, `dc:description`) so credits do not land in the wrong metadata field

## [1.0.27] - 26/06/2026

### Added
- Batch **Download queue** embeds photographer attribution in each JPEG — format: `Photo by {credit} on {Provider} — {license} — {sourceUrl}`

## [1.0.26] - 26/06/2026

### Added
- **Batch download** — paste filenames (one per line), enable batch mode, click images in order, then **Download queue** saves full-resolution JPEGs sequentially with your custom names via new `GET /download` route
- Shared `lib/image-proxy.js` for `/proxy` and `/download` (whitelist, fetch, sharp encode)

## [1.0.25] - 26/06/2026

### Fixed
- **Stale CSS/JS after deploy** — nginx was caching `style.css` and `app.js` with `Cache-Control: public, immutable` and a 7-day expiry, so the v1.0.23 pointer-events fix and v1.0.24 label rename never reached browsers that had already loaded the old files.
  - Nginx now sends `Cache-Control: no-cache, must-revalidate` for all `.js` and `.css` responses — browsers always revalidate against ETag/Last-Modified, getting the newest file immediately after a deploy.
  - Binary assets (images, fonts, icons) retain the 7-day immutable cache (unchanged filenames make this safe).
  - `index.html` links `style.css?v=1.0.25` and `app.js?v=1.0.25` — an additional version query string guarantees a cache-miss even in edge cases where no-cache is not honoured (some CDN/proxy layers).

## [1.0.24] - 26/06/2026

### Changed
- Renamed the session indicator from **Saved** to **Opened** — it marks images you opened or right-clicked this tab session, not files saved to disk (`sessionStorage` key migrates from `imgverse:saved` automatically)

## [1.0.23] - 26/06/2026

### Fixed
- Grid thumbnails accept right-click again (Save image as / Open image in new tab). The hover overlay was capturing all pointer events on top of the `<img>`; overlay is now click-through except for the Open button and credit link.

## [1.0.22] - 14/06/2026

### Added
- **Saved this session** indicator on images you open or right-click to save — persisted in `sessionStorage` across pagination and new searches until you close the tab

## [1.0.21] - 14/06/2026

### Fixed
- iNaturalist provider now caps results at 20 images per page. Previously each observation could contain multiple photos, causing the provider to return 60–100+ images and blowing past the intended 4-providers × 20 = ~80 results-per-page limit.

## [1.0.20] - 14/06/2026

### Added
- SVG favicon (`app/public/favicon.svg`) matching the brand gradient and logo icon, linked in `index.html`

## [1.0.19] - 14/06/2026

### Removed
- **Wikimedia Commons** provider entirely: removed from the active provider aggregator so it no longer appears in search results, and removed the filter pill plus all frontend copy references from the UI

## [1.0.18] - 14/06/2026

### Added
- **Pagination** replaces infinite scroll — Previous/Next pages, ~20 results per provider per page, grid replaces on each page (no duplicate append)

### Changed
- Removed **Openverse** and **Flickr** from active providers and filter bar (Openverse blocked on VPS; Flickr requires Pro)
- Wikimedia: grid thumbs use 320px; full image URL always resolves to original upload file (never 960px thumb)

### Removed
- Infinite scroll sentinel and client-side scroll dedupe state

## [1.0.17] - 14/06/2026

### Fixed
- Wikimedia: "Open full image" now uses the original Commons file URL (not the 640px grid thumbnail); dimensions shown are full file size

## [1.0.16] - 14/06/2026

### Added
- **Flickr** provider — CC-licensed photos only; requires `FLICKR_KEY` (free at flickr.com/services/apps/create)
- Flickr filter pill in UI; `combo.staticflickr.com` added to proxy whitelist

## [1.0.15] - 14/06/2026

### Added
- **Wikimedia Commons** provider — free, no API key, CC/public domain (Openverse alternative when Cloudflare blocks your host)
- `docs/STOCK-PROVIDERS.md` — active providers and candidates (NASA, Flickr, Smithsonian, etc.)

### Fixed
- Duplicate images: server-side URL dedupe after interleave + client dedupe by CDN pathname (same photo from multiple providers)
- Infinite scroll: page fetch lock + search token prevents duplicate/stale page appends
- Openverse: detect Cloudflare **total block** on OAuth token endpoint; skip further requests and log clear message (not a credentials issue)

## [1.0.14] - 13/06/2026

### Fixed
- Pexels/Unsplash URLs now append `fm=jpg` — fixes Windows Save As showing AVIF when the URL ends in `.jpeg` (CDN content negotiation, not a wrong extension)
- Proxy: requests `Accept: image/jpeg` when output format is JPEG

## [1.0.13] - 13/06/2026

### Added
- `docs/OPENVERSE-OAUTH.md` — reusable guide for Openverse OAuth registration, email verification, token flow, and fixing HTTP 403 on VPS/cloud hosts

## [1.0.12] - 13/06/2026

### Changed
- **Direct provider URLs everywhere** — thumbnails and "Open full image" now link straight to each provider's CDN; no conversion, no format picker, no proxy in the normal flow
- Removed "Save as: JPG / WebP / PNG" UI — you get whatever format the provider serves (JPEG, WebP, AVIF, PNG, etc.)

## [1.0.11] - 13/06/2026

### Added
- Save format selector: **JPG / WebP / PNG** pills — "Open full image" proxy now honours `fmt=jpg|jpeg|webp|png`
- API: `fullRaw` field on each result for client-side format URL building

### Fixed
- Proxy `fmt` query param was documented but ignored — all saves were forced to JPEG

## [1.0.10] - 13/06/2026

### Fixed
- Grid thumbnails now load **directly from provider CDNs** instead of through `/proxy` — fixes mass proxy failures on VPS hosts and cuts server load
- Proxy: prefer IPv4 (`dns.setDefaultResultOrder('ipv4first')`) — fixes silent fetch failures on Docker hosts with broken IPv6
- Proxy: provider-specific Referer headers, richer Accept header, and one automatic retry on transient network errors

### Changed
- `/proxy` is now used only for the **Open full image** save flow; grid `<img>` tags use direct CDN URLs

## [1.0.9] - 13/06/2026

### Added
- Openverse OAuth2 support via `OPENVERSE_CLIENT_ID` / `OPENVERSE_CLIENT_SECRET` — fixes HTTP 403 from Cloudflare on VPS/datacenter IPs (Hetzner, etc.)
- `openverse-auth.js` — client-credentials token helper with in-memory cache and auto-refresh
- README: step-by-step Openverse OAuth registration guide

### Fixed
- Openverse: descriptive User-Agent and actionable 403 log message when OAuth credentials are missing
- Proxy: log full failure reason when `err.message` is empty (ETIMEDOUT, ENOTFOUND, etc.)

## [1.0.8] - 13/06/2026

### Added
- `AGENTS.md` — agent/contributor instructions; **tag every version/release and push the tag** to trigger GitHub Releases
- Provider logging: Openverse HTTP/network failures now emit `[IMGverse/openverse]` lines; aggregator logs zero-result and rejected providers

### Fixed
- Openverse: increased API timeout from 8s to 15s (matches proxy) — slow upstream responses no longer fail silently
- Search cache: empty result sets are no longer cached for 1 hour — prevents stale "no results" after transient provider outages

## [1.0.7] - 13/06/2026

### Added
- `interleave()` utility: round-robin interleaves results from each provider, preserving each provider's internal relevance order instead of random shuffle

### Fixed
- Client-side deduplication: `seenIds` Set tracks rendered image IDs across infinite scroll pages — same image can no longer reappear on subsequent pages
- `seenIds` resets on every new search/filter change so stale IDs don't bleed across searches

## [1.0.6] - 13/06/2026

### Added
- Orientation filter: Landscape / Portrait / Square pills added below provider filter bar
- Unsplash, Pexels, Pixabay: orientation passed natively to each provider API
- Openverse, iNaturalist: client-side aspect-ratio filter (w/h ratio thresholds) applied after fetch
- Orientation included in Redis cache key so filtered results cache independently

## [1.0.5] - 13/06/2026

### Fixed
- Pixabay: switched `thumbUrl` from `webformatURL` (640px max) to `largeImageURL` (1280px) — `webformatURL` is Pixabay's web-preview size, not a full image

## [1.0.4] - 13/06/2026

### Fixed
- iNaturalist: changed `thumbUrl` from `medium` (500px) to `large` (1024px) — right-click Save As now gives a proper full-size image
- Openverse: added `api.openverse.org` to proxy whitelist — Openverse migrated from `api.openverse.engineering` to `api.openverse.org`, breaking all thumbnail proxying (root cause of "no results")

## [1.0.3] - 13/06/2026

### Fixed
- Pixabay images completely broken: `pixabay.com` was accidentally removed from proxy whitelist in v1.0.2 when switching to `webformatURL`. Re-added.

## [1.0.2] - 13/06/2026

### Fixed
- Proxy whitelist massively expanded: added all Flickr farm domains, iNaturalist S3 variants, WordPress/wp.com CDNs, Wikimedia Commons, Europeana, Internet Archive, Smithsonian — fixing blank results from Openverse
- Pixabay: changed `thumbUrl` from `previewURL` (tiny) to `webformatURL` (640px) — fixing proxy domain mismatch and tiny saves
- Unsplash: changed `thumbUrl` from `urls.small` (400px) to `urls.regular` (1080px) — right-click Save As now gives a full usable image
- Pexels: changed `thumbUrl` from `src.medium` to `src.large` (940px) — right-click saves a bigger image

## [1.0.1] - 13/06/2026

### Fixed
- README: Expanded Domain setup section with full field-by-field instructions (Service Name, Host, Path, Container Port)
- README: Added critical warning that service type must be **Docker Compose** not Application to prevent Nixpacks build failure
- README: Clarified Build Path (`/`) and Branch (`master`) in Manual Compose Deploy steps

## [1.0.0] - 13/06/2026

### Added
- Initial release of IMGverse Search
- Express/Node.js application with zero build step
- Image proxy route (`/proxy`) with AVIF→JPEG conversion via sharp
- Provider domain whitelist for proxy security
- Search aggregator fanning out to all providers via `Promise.all`
- Provider adapters: Openverse (no key), iNaturalist (no key), Unsplash, Pexels, Pixabay
- Redis search result cache with 1-hour TTL
- Vanilla JS frontend with CSS columns masonry grid
- Provider filter pills (All / Openverse / Unsplash / Pexels / iNaturalist / Pixabay)
- IntersectionObserver infinite scroll
- Right-click native image saving via proxied JPEG URLs
- Nginx reverse proxy with Traefik/Dokploy integration (mirrors KSM WPDokploystack pattern)
- `dokploy-network` external network + `internal` bridge network isolation
- `STACK_SLUG` named Docker volumes
- Docker healthchecks on all services
- Resource limits on all services
- GitHub Actions: build-images, release, smoke-test workflows
- Integration smoke test script (tests/smoke-test.sh)
- `template.toml` for one-click Dokploy template deploy
- `meta.json` stack metadata
