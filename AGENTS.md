<!-- AGENTS.md — IMGverse Search agent instructions -->
# AGENTS.md

Instructions for AI agents and contributors working on **IMGverse Search**.

## Versioning and releases (required)

**Every change that ships must be versioned, tagged, and pushed.**

1. **Update `CHANGELOG.md`**
   - Add a new `[x.y.z]` section at the top (never edit old version sections).
   - Use today's date in `dd/MM/yyyy` format.
   - Describe what changed and why.

2. **Bump the version** in `meta.json` to match the changelog entry.

3. **Build / verify** before tagging:
   - Run smoke tests when possible: `bash tests/smoke-test.sh`
   - Confirm the app starts and search/proxy routes respond.

4. **Commit** the changelog and version bump (only when the user asks for a commit).

5. **Tag and push the release** (required for every release):
   ```bash
   git tag vX.Y.Z
   git push origin master
   git push origin vX.Y.Z
   ```
   - Tag format: `v*.*.*` (e.g. `v1.0.8`).
   - Pushing the tag triggers `.github/workflows/release.yml`, which creates a GitHub Release from the matching `CHANGELOG.md` section.

6. **Redeploy** the stack after pushing so production runs the tagged version.

## Project conventions

- **KISS / YAGNI / DRY** — smallest correct change; no speculative features.
- **WordPress-style file headers** on new or substantially edited source files.
- **No silent failures** — provider and proxy errors must log with `[IMGverse/...]` prefixes.
- **No mock data in production code** — use real provider APIs.
- **Do not modify `@since` tags** when editing existing code.

## Key paths

| Path | Purpose |
|------|---------|
| `app/src/providers/` | Provider adapters (iNaturalist, Unsplash, Pexels, Pixabay; Openverse server adapter unused on blocked hosts) |
| `app/src/routes/search.js` | Search API + Redis cache (not Openverse) |
| `app/src/routes/proxy.js` | Image proxy whitelist and JPEG conversion |
| `app/public/openverse-client.js` | Browser Openverse search (avoids Cloudflare on VPS IPs) |
| `app/public/app.js` | Frontend search UI |
| `CHANGELOG.md` | Release notes (source for GitHub Releases) |
| `meta.json` | Stack metadata and current version |

## Provider notes

- **Openverse:** search from the **browser** (`app/public/openverse-client.js`). Do not call Openverse from Node on typical VPS hosts — Cloudflare returns "Just a moment..." even on the OAuth token endpoint. OAuth guide for other projects: [`docs/OPENVERSE-OAUTH.md`](docs/OPENVERSE-OAUTH.md).
- **Unsplash, Pexels, Pixabay** require keys in `.env`.
- Openverse failures previously produced **no log lines** because errors were swallowed in the adapter; always log provider errors when touching that code.
