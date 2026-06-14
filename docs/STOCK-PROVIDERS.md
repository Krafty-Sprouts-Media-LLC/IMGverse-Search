<!-- docs/STOCK-PROVIDERS.md — Stock image provider reference for IMGverse Search -->
# Stock Image Providers

Current and candidate providers for IMGverse Search.

## Active in IMGverse Search

| Provider | API key | Notes |
|----------|---------|-------|
| **Unsplash** | `UNSPLASH_KEY` | High-quality photos, 50 req/hr free |
| **Pexels** | `PEXELS_KEY` | Large library, 200 req/hr free |
| **Pixabay** | `PIXABAY_KEY` | 100 req/hr free |
| **Wikimedia Commons** | None | CC/public domain, huge archive — **added v1.0.15** |
| **iNaturalist** | None | Nature & wildlife only |
| **Openverse** | OAuth on VPS | CC content; **blocked on some hosts by Cloudflare** — see [OPENVERSE-OAUTH.md](OPENVERSE-OAUTH.md) |

## Good candidates to add next

| Provider | API key | Free tier | Fit |
|----------|---------|-----------|-----|
| **NASA Images** | None | Unlimited | Space, science, public domain |
| **Flickr** | Yes (free) | Rate limited | Huge CC library (overlaps Openverse) |
| **Smithsonian Open Access** | None | Unlimited | Museum / cultural images |
| **Europeana** | Yes (free) | Rate limited | European cultural heritage |
| **Freepik** | Yes | Limited free | More vectors/PSD than photos |
| **Giphy** | Yes | Rate limited | GIFs only — not stock photos |
| **Shutterstock / Adobe Stock / Getty** | Yes | Paid commercial | Not suitable for free aggregator |

## Openverse on VPS (your current issue)

Your logs show Cloudflare returning **"Just a moment..."** on the **OAuth token endpoint** — not just search. That means:

- OAuth credentials are correct and verified
- Cloudflare is blocking **all** `api.openverse.org` traffic from your server IP
- **No code fix** — Openverse cannot run on that host until Openverse/Cloudflare whitelist your IP ([GitHub #5478](https://github.com/WordPress/openverse/issues/5478))

**Workaround:** Use **Wikimedia Commons** (similar CC content, no Cloudflare block) plus Unsplash/Pexels/Pixabay.

## Adding a new provider

1. Create `app/src/providers/{name}.js` implementing `search(query, page, orientation?)`.
2. Register in `app/src/providers/index.js`.
3. Add filter pill in `app/public/index.html`.
4. Add CDN domains to `app/src/routes/proxy.js` whitelist if proxy is used.
5. Update this doc and `CHANGELOG.md`.
