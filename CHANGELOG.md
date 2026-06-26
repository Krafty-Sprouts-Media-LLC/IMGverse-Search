# Changelog

All notable changes to IMGverse Search will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
