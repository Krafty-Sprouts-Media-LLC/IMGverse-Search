# Changelog

All notable changes to IMGverse Search will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
