# Changelog

All notable changes to **KSM WPDokploystack** will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/).

Upstream project: [itsmereal/dokploy-wp](https://github.com/itsmereal/dokploy-wp) by [Al-Mamun Talukder](https://itsmereal.com)

---

## [1.1.0] - 04/06/2026

### Added
- `docs/hosting-guide.md` — Comprehensive hosting guide adapted from the original article by Al-Mamun Talukder at [itsmereal.com](https://itsmereal.com/easily-host-wordpress-sites-using-dokploy-with-redis-and-nginx/), with full attribution and expanded reference tables.

### Changed
- `meta.json` — Updated `github` and `docs` links to point to the new **Krafty-Sprouts-Media-LLC/WPDokploystack** repository. Added `upstream` link referencing the original `itsmereal/dokploy-wp` source for attribution.
- Bumped version from `1.0.0` to `1.1.0`.

---

## [1.0.0] - Initial Import

### Added
- Initial import from [itsmereal/dokploy-wp](https://github.com/itsmereal/dokploy-wp) by Al-Mamun Talukder.
- Production-ready Docker Compose stack for WordPress on Dokploy.
- Services: WordPress (PHP 8.3 FPM), Nginx, MariaDB 10.6, Redis, phpMyAdmin, Plugin Installer.
- Dokploy one-click template (`template.toml`, `meta.json`).
- Existing docs: `filebrowser-setup.md`, `sftp-setup.md`, `vscode-remote-setup.md`.
- GitHub Actions workflows.
