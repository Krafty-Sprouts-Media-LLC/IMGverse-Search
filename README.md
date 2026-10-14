# SISE — Stock image search engine

*Formerly IMGverse Search.*

Self-hosted stock image aggregator with two modes:

- **Search** — one search across Openverse, iNaturalist, Unsplash, Pexels and Pixabay, images served directly from each provider's CDN, with a click-order batch download.
- **Bulk keywords** — paste a keyword list (e.g. "can you freeze cooked salmon"); each keyword gets its own row with a cleaned search query, the best image is picked for you, and Download saves one file per keyword, named after the keyword. Only rows near where you are reading are searched, and each provider's rate limit is tracked so a paused provider never blocks the run.

Deployed as a single Dokploy Docker Compose stack. Same zero-stress pattern as KSM WPDokploystack.

---

## Stack Components

| Service | Description |
|---------|-------------|
| **nginx** | Reverse proxy — only container on `dokploy-network`. Traefik handles SSL. |
| **app** | Node.js/Express — search aggregator, image proxy, static file server |
| **redis** | Search result cache — 1 hr TTL, one entry per provider per query |

---

## How Images Work

```
User searches "monkey"
  → Browser fetches Openverse directly (avoids Cloudflare on the VPS IP)
  → Express fans out to Unsplash, Pexels, Pixabay, iNaturalist
  → Grid thumbnails load directly from provider CDNs (JPEG, WebP, AVIF — whatever the provider serves)
  → "Open full image" links directly to the provider's full-res CDN URL
  → Right-click → Save As → you get the file in the provider's native format
```

No format conversion. No proxy in the normal user flow. Images are exactly what Unsplash, Pexels, Pixabay, Openverse sources, etc. return from their APIs.

---

## Deploy on Dokploy

There are two ways. Both end with the same three containers (`nginx`, `app`, `redis`).

| | Option A: Template | Option B: Compose from Git |
|---|---|---|
| Builds on your server | No (pulls ready-made images) | Yes (a few minutes per deploy) |
| Needs a GitHub connection in Dokploy | No | Yes, or a public Git URL |
| Updates | Redeploy pulls the newest release | Redeploy rebuilds from `master` |
| Best for | New installs | Running your own changes |

Before you start, have these ready (all free, all optional — a provider without a key is skipped):

- Unsplash key: <https://unsplash.com/developers> (apply for **Production** to get 5,000 requests/hour instead of 50)
- Pexels key: <https://www.pexels.com/api/>
- Pixabay key: <https://pixabay.com/api/docs/>
- A domain or subdomain pointing at your Dokploy server's IP (an `A` record), e.g. `images.example.com`

Openverse and iNaturalist need no key.

### Option A: Template (recommended)

1. In Dokploy, open your **Project** and click **Create Service** → **Template**.
2. At the top of the template list, set **Base URL** to exactly:
   ```
   https://raw.githubusercontent.com/Krafty-Sprouts-Media-LLC/SISE/master
   ```
   (The branch is `master`, not `main`. With `main` the list comes back empty.)
3. Search for **SISE** and click **Create**. Dokploy creates a Compose service with a generated domain.
4. Open the new service's **Environment** tab. You'll see:
   ```env
   STACK_SLUG=<generated>
   SISE_VERSION=latest
   UNSPLASH_KEY=
   PEXELS_KEY=
   PIXABAY_KEY=
   ```
   Paste your keys after the `=` signs and click **Save**.
   - `STACK_SLUG` names the Redis volume (`<slug>_redis_data`). Change it to something short like `sise` **before the first deploy**, or leave it.
   - `SISE_VERSION` pins a release (e.g. `2.0.1`); `latest` follows new releases on each redeploy.
5. Open the **Domains** tab. Edit the generated domain (or add one) and set **Host** to your domain; leave **Service Name** `nginx`, **Path** `/`, **Container Port** `80`. Turn on **HTTPS** with the **Let's Encrypt** certificate.
6. Click **Deploy** and watch **Logs** until `nginx` and `app` report healthy (about a minute).
7. Open your domain. You should see SISE with the **Search** and **Bulk keywords** tabs.

### Option B: Compose from Git

1. In Dokploy, open your **Project** and click **Create Service** → **Compose** (not **Application** — an Application tries a single-container Nixpacks build and fails).
2. Give it a name (e.g. `sise`) and click **Create**.
3. In the service's **General** tab, choose the source:
   - **GitHub** (if your GitHub account is connected in Dokploy settings): repository **SISE**, branch **`master`**.
   - or **Git**: URL `https://github.com/Krafty-Sprouts-Media-LLC/SISE.git`, branch **`master`**.
   - **Compose Path**: `./docker-compose.yml`
   Click **Save**.
4. **Environment** tab — paste and fill in, then **Save**:
   ```env
   STACK_SLUG=sise
   UNSPLASH_KEY=
   PEXELS_KEY=
   PIXABAY_KEY=
   ```
   Set `STACK_SLUG` **before the first deploy**; it names the Redis volume (`sise_redis_data`). Existing installs keep whatever slug they already use.
5. **Domains** tab → **Add Domain**:

   | Field | Value |
   |-------|-------|
   | **Service Name** | `nginx` |
   | **Host** | your domain, e.g. `images.example.com` |
   | **Path** | `/` |
   | **Container Port** | `80` |
   | **HTTPS** | On, certificate **Let's Encrypt** |

   Only `nginx` gets a domain — `app` and `redis` are internal.
6. Back in **General**, click **Deploy**. The first build takes a few minutes; follow it in **Deployments** / **Logs**.
7. Open your domain.

### Check it works

- `https://<your-domain>/healthz` returns `ok`.
- `https://<your-domain>/api/providers/status` lists every provider that has a key (iNaturalist is always there).
- Search for `cat` in the **Search** tab; images from each configured provider appear.

### Troubleshooting

| Symptom | Fix |
|---|---|
| Template list empty after setting Base URL | The URL must end in `/SISE/master` (no trailing slash, `master` not `main`). |
| Template deploy fails pulling `ghcr.io/krafty-sprouts-media-llc/sise-…` | The images are published by the **Build and Push Docker Images** workflow on each release; the repo owner must set both packages to **public** on GitHub (Package settings → Change visibility). |
| `404` / "Bad Gateway" on the domain | The domain must point at **Service Name `nginx`, port `80`**. Check `nginx` and `app` are healthy in **Logs**. |
| A provider never shows results | Its key is missing or wrong — check `/api/providers/status` and the `app` logs (`[SISE/<provider>]` lines). |
| Option B fails with a Nixpacks error | The service was created as **Application**; create it as **Compose**. |

---

## Environment Variables

All variables are documented in [`.env.example`](.env.example).

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STACK_SLUG` | Yes | `imgverse` | Short prefix for Docker volume names |
| `UNSPLASH_KEY` | No | — | Unsplash API key (free at unsplash.com/developers) |
| `PEXELS_KEY` | No | — | Pexels API key (free at pexels.com/api) |
| `PIXABAY_KEY` | No | — | Pixabay API key (free at pixabay.com/api) |
| `FLICKR_KEY` | No | — | Flickr API key (free at flickr.com/services/apps/create) |
| `OPENVERSE_CLIENT_ID` | No | — | Unused by the UI (browser search). Kept for the unused server adapter. |
| `OPENVERSE_CLIENT_SECRET` | No | — | Unused by the UI (browser search). Kept for the unused server adapter. |
| `PROXY_MAX_SIZE_MB` | No | `20` | Maximum proxied image size in MB |
| `REDIS_MAXMEMORY` | No | `256mb` | Redis memory cap |

> **Openverse** is searched from the **browser** so Cloudflare cannot block the VPS. OAuth is not required for this app. Guide for other server-side projects: **[docs/OPENVERSE-OAUTH.md](docs/OPENVERSE-OAUTH.md)**. **iNaturalist** needs no key.

### Openverse on VPS (Cloudflare 403)

Search Openverse from the user's browser, not from Node. See **[docs/OPENVERSE-OAUTH.md](docs/OPENVERSE-OAUTH.md)** if you still need server-side OAuth for another project.

---

## Provider Notes

| Provider | Key Required | Free Limit | Notes |
|----------|-------------|------------|-------|
| Openverse | No (browser search) | Anonymous `page_size` max 20 | Searched from the browser; VPS IP is not used |
| Wikimedia | No | Unlimited | CC/public domain; no key; best Openverse alternative on VPS |
| Flickr | Yes (free) | Rate limited | CC-licensed photos only — key at flickr.com/services/apps/create |
| iNaturalist | No | Unlimited | Nature & wildlife photography |
| Pixabay | Yes (free) | 100 req/hr | Register at pixabay.com/api |
| Unsplash | Yes (free) | 50 req/hr | Register at unsplash.com/developers |
| Pexels | Yes (free) | 200 req/hr | Register at pexels.com/api |

---

## Local Development

```bash
# 1. Clone and enter the project
git clone https://github.com/Krafty-Sprouts-Media-LLC/SISE.git
cd SISE

# 2. Copy and fill in your env file
cp .env.example .env

# 3. Start the full stack
docker compose up --build

# 4. Open in browser
open http://localhost
```

---

## Running Tests

Unit tests (no Docker needed):

```bash
cd app && npm test
```

Full-stack smoke test:

```bash
bash tests/smoke-test.sh
```

Verifies:
- All containers healthy
- `/healthz` returns 200
- `/api/search?q=cat` returns valid JSON with `providerStatus`
- `/api/providers/status` lists provider budgets
- `/proxy` returns a JPEG image

---

## Future Additions

- Shutterstock / Adobe Stock / Getty adapters (paid keys)
- User accounts + saved collections
- Bunny CDN as proxy cache layer
- WordPress plugin to insert SISE images directly into posts

---

*SISE — built for speed, deployed like WordPress.*
