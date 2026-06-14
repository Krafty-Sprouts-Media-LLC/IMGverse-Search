# IMGverse Search

Self-hosted stock image aggregator. One search across Openverse, iNaturalist, Unsplash, Pexels, and Pixabay — images served directly from each provider's CDN in their native format.

Deployed as a single Dokploy Docker Compose stack. Same zero-stress pattern as KSM WPDokploystack.

---

## Stack Components

| Service | Description |
|---------|-------------|
| **nginx** | Reverse proxy — only container on `dokploy-network`. Traefik handles SSL. |
| **app** | Node.js/Express — search aggregator, image proxy, static file server |
| **redis** | Search result cache — 1hr TTL per query key |

---

## How Images Work

```
User searches "monkey"
  → Express fans out to all APIs at once
  → Grid thumbnails load directly from provider CDNs (JPEG, WebP, AVIF — whatever the provider serves)
  → "Open full image" links directly to the provider's full-res CDN URL
  → Right-click → Save As → you get the file in the provider's native format
```

No format conversion. No proxy in the normal user flow. Images are exactly what Unsplash, Pexels, Pixabay, etc. return from their APIs.

---

## Quick Start (Dokploy)

### Option A: Manual Compose Deploy

1. In Dokploy → your Project → **Create Service** → **Docker Compose**
   > ⚠️ **Critical:** Choose **Docker Compose**, NOT "Application". Choosing "Application" will trigger a Nixpacks build and fail because this is a multi-container compose stack.
2. Select your GitHub account and the **IMGverse-Search** repository
3. Branch: `master` · Build Path: `/` (repo root — leave as default)
4. Go to **Environment** tab and add:
   ```env
   STACK_SLUG=imgverse
   UNSPLASH_KEY=your_unsplash_key
   PEXELS_KEY=your_pexels_key
   PIXABAY_KEY=your_pixabay_key
   OPENVERSE_CLIENT_ID=your_openverse_client_id
   OPENVERSE_CLIENT_SECRET=your_openverse_client_secret
   ```
   > Use a short `STACK_SLUG` (e.g. `imgverse`) **before the first deploy** so volumes are named `imgverse_redis_data` not a long Dokploy-generated name.
5. Click **Deploy**

### Option B: One-Click Template Deploy

1. In Dokploy → **Projects** → **Create Service** → **Template**
2. Set the **Base URL** to:
   ```
   https://raw.githubusercontent.com/Krafty-Sprouts-Media-LLC/IMGverse-Search/main
   ```
3. Find **IMGverse Search** and click **Create**
4. Add your API keys in the **Environment** tab
5. Click **Deploy**

---

## Post-Deploy Setup

### Configure Domains

Go to the **Domains** tab and click **Add Domain**. Fill in the dialog as follows:

| Field | Value |
|-------|-------|
| **Service Name** | `nginx` |
| **Host** | `images.yourdomain.com` (your actual domain) |
| **Path** | `/` |
| **Internal Path** | `/` |
| **Container Port** | `80` |

> **Important:** Service Name must be `nginx` — that is the only container on the public `dokploy-network`. The `app` and `redis` containers are internal only and should never be given a public domain.

Traefik will auto-provision an SSL certificate. No SSH required.

---

## Environment Variables

All variables are documented in [`.env.example`](.env.example).

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STACK_SLUG` | Yes | `imgverse` | Short prefix for Docker volume names |
| `UNSPLASH_KEY` | No | — | Unsplash API key (free at unsplash.com/developers) |
| `PEXELS_KEY` | No | — | Pexels API key (free at pexels.com/api) |
| `PIXABAY_KEY` | No | — | Pixabay API key (free at pixabay.com/api) |
| `OPENVERSE_CLIENT_ID` | No* | — | Openverse OAuth client ID — *required on many VPS/datacenter hosts |
| `OPENVERSE_CLIENT_SECRET` | No* | — | Openverse OAuth client secret |
| `PROXY_MAX_SIZE_MB` | No | `20` | Maximum proxied image size in MB |
| `REDIS_MAXMEMORY` | No | `256mb` | Redis memory cap |

> **Openverse** on VPS hosts requires OAuth (HTTP 403 otherwise). Full guide: **[docs/OPENVERSE-OAUTH.md](docs/OPENVERSE-OAUTH.md)**. **iNaturalist** needs no key.

### Openverse OAuth (403 fix on VPS)

See **[docs/OPENVERSE-OAUTH.md](docs/OPENVERSE-OAUTH.md)** — register, verify email, get token, code examples (Node, Python, curl, PowerShell), troubleshooting. Copy to any project hitting Openverse 403.

---

## Provider Notes

| Provider | Key Required | Free Limit | Notes |
|----------|-------------|------------|-------|
| Openverse | OAuth on VPS | Unlimited | Often **blocked entirely** by Cloudflare on VPS — use Wikimedia instead |
| Wikimedia | No | Unlimited | CC/public domain; no key; best Openverse alternative on VPS |
| iNaturalist | No | Unlimited | Nature & wildlife photography |
| Pixabay | Yes (free) | 100 req/hr | Register at pixabay.com/api |
| Unsplash | Yes (free) | 50 req/hr | Register at unsplash.com/developers |
| Pexels | Yes (free) | 200 req/hr | Register at pexels.com/api |

---

## Local Development

```bash
# 1. Clone and enter the project
git clone https://github.com/Krafty-Sprouts-Media-LLC/IMGverse-Search.git
cd IMGverse-Search

# 2. Copy and fill in your env file
cp .env.example .env

# 3. Start the full stack
docker compose up --build

# 4. Open in browser
open http://localhost
```

---

## Running Tests

```bash
bash tests/smoke-test.sh
```

Verifies:
- All containers healthy
- `/healthz` returns 200
- `/api/search?q=cat` returns valid JSON
- `/proxy` returns a JPEG image

---

## Future Additions

- Shutterstock / Adobe Stock / Getty adapters (paid keys)
- User accounts + saved collections
- Bunny CDN as proxy cache layer
- WordPress plugin to insert IMGverse images directly into posts

---

*IMGverse Search — built for speed, deployed like WordPress.*
