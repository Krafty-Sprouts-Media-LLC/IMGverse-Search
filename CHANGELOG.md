# Changelog

All notable changes to IMGverse Search will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
