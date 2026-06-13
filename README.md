# IMGverse Search

Self-hosted stock image aggregator. One search across Openverse, iNaturalist, Unsplash, Pexels, and Pixabay — with a built-in image proxy that enables right-click **Save As** with any custom filename, directly from the browser.

Deployed as a single Dokploy Docker Compose stack. Same zero-stress pattern as KSM WPDokploystack.

---

## Stack Components

| Service | Description |
|---------|-------------|
| **nginx** | Reverse proxy — only container on `dokploy-network`. Traefik handles SSL. |
| **app** | Node.js/Express — search aggregator, image proxy, static file server |
| **redis** | Search result cache — 1hr TTL per query key |

---

## How the Right-Click Save Works

```
User searches "monkey"
  → Express fans out to all APIs at once (Promise.all)
  → Results return with image URLs rewritten to /proxy?url=...
  → User clicks "Open full image" → opens /proxy URL in new tab
  → /proxy fetches image from provider, converts to JPEG via sharp
  → Browser displays raw JPEG → right-click → Save image as → done
```

The `/proxy` route sets `Content-Type: image/jpeg` with **no** `Content-Disposition` header. This forces the browser to display the image natively rather than triggering a download dialog — enabling right-click → Save As with any filename you choose.

---

## Quick Start (Dokploy)

### Option A: Manual Compose Deploy

1. Create a new **Compose** service in Dokploy
2. Point to: `https://github.com/Krafty-Sprouts-Media-LLC/IMGverse-Search`
3. Set Compose Path: `./docker-compose.yml`
4. Go to **Environment** tab and add:
   ```env
   STACK_SLUG=imgverse
   UNSPLASH_KEY=your_unsplash_key
   PEXELS_KEY=your_pexels_key
   PIXABAY_KEY=your_pixabay_key
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

Go to the **Domains** tab and add:

| Service | Domain Example |
|---------|---------------|
| **nginx** | `images.yourdomain.com` |

Traefik auto-provisions SSL. No SSH required.

---

## Environment Variables

All variables are documented in [`.env.example`](.env.example).

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STACK_SLUG` | Yes | `imgverse` | Short prefix for Docker volume names |
| `UNSPLASH_KEY` | No | — | Unsplash API key (free at unsplash.com/developers) |
| `PEXELS_KEY` | No | — | Pexels API key (free at pexels.com/api) |
| `PIXABAY_KEY` | No | — | Pixabay API key (free at pixabay.com/api) |
| `PROXY_MAX_SIZE_MB` | No | `20` | Maximum proxied image size in MB |
| `REDIS_MAXMEMORY` | No | `256mb` | Redis memory cap |

> **Openverse** and **iNaturalist** need no API keys — they work out of the box.

---

## Provider Notes

| Provider | Key Required | Free Limit | Notes |
|----------|-------------|------------|-------|
| Openverse | No | Unlimited | CC-licensed; includes Flickr content |
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
