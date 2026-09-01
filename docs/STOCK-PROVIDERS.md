<!-- docs/STOCK-PROVIDERS.md — Stock image provider reference for IMGverse Search -->
# Stock Image Providers

Current and candidate providers for IMGverse Search.

## Active in IMGverse Search

| Provider | API key | Notes |
|----------|---------|-------|
| **Unsplash** | `UNSPLASH_KEY` | High-quality photos, 50 req/hr free |
| **Pexels** | `PEXELS_KEY` | Large library, 200 req/hr free |
| **Pixabay** | `PIXABAY_KEY` | 100 req/hr free |
| **Wikimedia Commons** | None | CC/public domain, huge archive |
| **Flickr** | `FLICKR_KEY` | CC-licensed photos only |
| **iNaturalist** | None | Nature & wildlife only |
| **Openverse** | None (browser search) | CC content; searched from the **user's browser** so Cloudflare cannot challenge the VPS IP |

## Good candidates to add next

| Provider | API key | Free tier | Fit |
|----------|---------|-----------|-----|
| **NASA Images** | None | Unlimited | Space, science, public domain |
| **Smithsonian Open Access** | None | Unlimited | Museum / cultural images |
| **Europeana** | Yes (free) | Rate limited | European cultural heritage |
| **Freepik** | Yes | Limited free | More vectors/PSD than photos |
| **Giphy** | Yes | Rate limited | GIFs only — not stock photos |
| **Shutterstock / Adobe Stock / Getty** | Yes | Paid commercial | Not suitable for free aggregator |

## Openverse on VPS

Cloudflare challenges datacenter IPs with a **"Just a moment..."** page — including the OAuth token endpoint. OAuth cannot fix a total IP block.

**Fix used in this app:** search Openverse from the browser (`app/public/openverse-client.js`). Gutenberg does the same (`Access-Control-Allow-Origin: *`). Full-size files are Flickr/Wikimedia/etc., so `/proxy` and `/download` stay on the server.

Do **not** add Openverse back to `searchAll()` on a blocked host. Cap anonymous `page_size` at **20**. Never put OAuth secrets in the browser.

## Adding a new provider

1. Create `app/src/providers/{name}.js` implementing `search(query, page, orientation?)`.
2. Register in `app/src/providers/index.js`.
3. Add filter pill in `app/public/index.html`.
4. Add CDN domains to `app/src/routes/proxy.js` whitelist if proxy is used.
5. Update this doc and `CHANGELOG.md`.
