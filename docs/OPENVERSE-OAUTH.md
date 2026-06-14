<!-- docs/OPENVERSE-OAUTH.md — Openverse OAuth setup guide for server/VPS deployments -->
# Openverse OAuth Setup Guide

Use this guide when **Openverse API calls return HTTP 403** from a server, VPS, or cloud host (Hetzner, Dokploy, Railway, Render, etc.). Anonymous requests from datacenter IP ranges are often blocked by Cloudflare. **OAuth fixes it.**

Works for any project — Node, Python, PHP, curl, etc.

---

## Why you get 403

| Environment | Anonymous API call | OAuth API call |
|-------------|-------------------|----------------|
| Your laptop / home IP | Usually works | Works |
| VPS / cloud / Docker | Often **403** | Works |

Symptoms:

- `HTTP 403` on `GET https://api.openverse.org/v1/images/?q=...`
- Empty results with no useful error (if your app swallows failures)
- Works locally but fails after deploy

Root cause: Openverse sits behind Cloudflare. Many datacenter IPs are blocked for unauthenticated traffic. Registering an OAuth app and sending a **Bearer token** usually bypasses the block.

### Total Cloudflare block (OAuth also fails)

If logs show **"Just a moment..."** HTML on the **token** endpoint (`/v1/auth_tokens/token/`), Cloudflare is blocking **all** Openverse traffic from your server IP — OAuth cannot fix this. Use Wikimedia Commons or contact Openverse to whitelist your IP ([issue #5478](https://github.com/WordPress/openverse/issues/5478)).

Official reference: [Authentication and Throttling](https://docs.openverse.org/api/reference/authentication_and_throttling.html)

---

## Quick reference

| Step | Method | URL |
|------|--------|-----|
| 1. Register | `POST` | `https://api.openverse.org/v1/auth_tokens/register/` |
| 2. Verify | `GET` | Link sent to your email |
| 3. Get token | `POST` | `https://api.openverse.org/v1/auth_tokens/token/` |
| 4. Search | `GET` | `https://api.openverse.org/v1/images/?q=...` + `Authorization: Bearer ...` |

---

## Step 1 — Register your application

Send a JSON body with a unique app name, description, and your email.

### curl (Linux / macOS / Git Bash)

```bash
curl -X POST "https://api.openverse.org/v1/auth_tokens/register/" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Project Name",
    "description": "Brief description of what your app does with the Openverse API",
    "email": "you@example.com"
  }'
```

### PowerShell (Windows)

```powershell
$body = @{
  name        = "My Project Name"
  description = "Brief description of what your app does with the Openverse API"
  email       = "you@example.com"
} | ConvertTo-Json

Invoke-RestMethod -Method POST `
  -Uri "https://api.openverse.org/v1/auth_tokens/register/" `
  -ContentType "application/json" `
  -Body $body
```

### Postman

- **Method:** `POST`
- **URL:** `https://api.openverse.org/v1/auth_tokens/register/`
- **Headers:** `Content-Type: application/json`
- **Body (raw JSON):**

```json
{
  "name": "My Project Name",
  "description": "Brief description of what your app does with the Openverse API",
  "email": "you@example.com"
}
```

### Success response (`201 Created`)

```json
{
  "client_id": "YOUR_CLIENT_ID",
  "client_secret": "YOUR_CLIENT_SECRET",
  "name": "My Project Name",
  "msg": "Check your email for a verification link."
}
```

**Save `client_id` and `client_secret` immediately.** Store them in your secrets manager or `.env` — never commit them to git.

---

## Step 2 — Verify your email (required)

1. Check the inbox for the email you registered with.
2. Open the verification link from Openverse. It looks like:

   ```
   GET https://api.openverse.org/v1/auth_tokens/verify/{token}/
   ```

3. Confirm you see a success message:

   ```json
   {
     "msg": "Successfully verified email. Your OAuth2 credentials are now active."
   }
   ```

Unverified apps may fail or behave inconsistently. Always complete this step.

---

## Step 3 — Get an access token

Exchange your client credentials for a Bearer token using the **client credentials** grant.

### curl

```bash
curl -X POST "https://api.openverse.org/v1/auth_tokens/token/" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET"
```

### PowerShell

```powershell
$body = @{
  grant_type    = "client_credentials"
  client_id     = "YOUR_CLIENT_ID"
  client_secret = "YOUR_CLIENT_SECRET"
}

Invoke-RestMethod -Method POST `
  -Uri "https://api.openverse.org/v1/auth_tokens/token/" `
  -ContentType "application/x-www-form-urlencoded" `
  -Body $body
```

### Success response (`200 OK`)

```json
{
  "access_token": "l6zX0OBDFU7ehCfFCisTKiaJj8QMwR",
  "expires_in": 43200,
  "token_type": "Bearer",
  "scope": "read write"
}
```

- **`expires_in`:** seconds until the token expires (typically **43200** = 12 hours).
- **Refresh:** request a new token before expiry; cache it in memory or Redis.

---

## Step 4 — Call the API with the token

Add the Bearer token to every Openverse API request:

```http
GET /v1/images/?q=cat&page=1&page_size=20 HTTP/1.1
Host: api.openverse.org
Authorization: Bearer YOUR_ACCESS_TOKEN
User-Agent: YourApp/1.0 (you@example.com)
Accept: application/json
```

### curl example

```bash
curl "https://api.openverse.org/v1/images/?q=cat&page=1&page_size=5" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "User-Agent: YourApp/1.0" \
  -H "Accept: application/json"
```

### Node.js example

```javascript
const CLIENT_ID     = process.env.OPENVERSE_CLIENT_ID;
const CLIENT_SECRET = process.env.OPENVERSE_CLIENT_SECRET;

let cachedToken = null;
let tokenExpiresAt = 0;

async function getOpenverseToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const res = await fetch('https://api.openverse.org/v1/auth_tokens/token/', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });

  if (!res.ok) throw new Error(`Token failed: ${res.status}`);

  const data = await res.json();
  cachedToken    = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

async function searchOpenverse(query) {
  const token = await getOpenverseToken();
  const params = new URLSearchParams({ q: query, page: 1, page_size: 20 });

  const res = await fetch(`https://api.openverse.org/v1/images/?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent':  'YourApp/1.0',
      Accept:        'application/json',
    },
  });

  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}
```

### Python example

```python
import os
import time
import requests

CLIENT_ID     = os.environ["OPENVERSE_CLIENT_ID"]
CLIENT_SECRET = os.environ["OPENVERSE_CLIENT_SECRET"]

_token = None
_expires_at = 0

def get_token():
    global _token, _expires_at
    if _token and time.time() < _expires_at - 60:
        return _token

    r = requests.post(
        "https://api.openverse.org/v1/auth_tokens/token/",
        data={
            "grant_type": "client_credentials",
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
        },
        timeout=15,
    )
    r.raise_for_status()
    data = r.json()
    _token = data["access_token"]
    _expires_at = time.time() + data["expires_in"]
    return _token

def search_openverse(query):
    token = get_token()
    r = requests.get(
        "https://api.openverse.org/v1/images/",
        params={"q": query, "page": 1, "page_size": 20},
        headers={
            "Authorization": f"Bearer {token}",
            "User-Agent": "YourApp/1.0",
            "Accept": "application/json",
        },
        timeout=15,
    )
    r.raise_for_status()
    return r.json()
```

---

## Environment variables (recommended)

```env
OPENVERSE_CLIENT_ID=your_client_id
OPENVERSE_CLIENT_SECRET=your_client_secret
```

| Platform | Where to set |
|----------|--------------|
| Local dev | `.env` (gitignored) |
| Dokploy | Service → Environment tab |
| Docker Compose | `env_file: .env` or `environment:` block |
| GitHub Actions | Repository secrets |
| Railway / Render | Project environment variables |

**Never** commit `client_secret` to git.

---

## Troubleshooting

| Error | Likely cause | Fix |
|-------|--------------|-----|
| Token response is HTML **"Just a moment..."** | Cloudflare total block on your server IP | **No code fix** — use Wikimedia Commons; ask Openverse to whitelist IP |
| `403` on `/v1/images/` without token | Datacenter IP blocked | Register OAuth and send Bearer token |
| `403` with token | Email not verified | Click verification link in email |
| `401` on `/v1/auth_tokens/token/` | Wrong `client_id` or `client_secret` | Re-copy from registration response |
| `401` on `/v1/images/` with token | Expired token | Request a new token |
| Works locally, fails on VPS | Anonymous calls OK at home, blocked on server | OAuth required on server only |
| Empty results, no error | App swallows API failures | Log HTTP status; check for 403 |

### Test token + search in one shot (PowerShell)

```powershell
$creds = Invoke-RestMethod -Method POST `
  -Uri "https://api.openverse.org/v1/auth_tokens/token/" `
  -ContentType "application/x-www-form-urlencoded" `
  -Body @{
    grant_type    = "client_credentials"
    client_id     = $env:OPENVERSE_CLIENT_ID
    client_secret = $env:OPENVERSE_CLIENT_SECRET
  }

Invoke-RestMethod `
  -Uri "https://api.openverse.org/v1/images/?q=cat&page_size=3" `
  -Headers @{ Authorization = "Bearer $($creds.access_token)" }
```

---

## Rate limits

Authenticated apps get the **standard** tier — higher limits than anonymous traffic. See [Authentication and Throttling](https://docs.openverse.org/api/reference/authentication_and_throttling.html).

Response headers include rate-limit info, e.g.:

- `X-RateLimit-Limit-anon_burst`
- `X-RateLimit-Available-anon_burst`

---

## IMGverse Search — project-specific notes

This repo implements OAuth in:

- `app/src/providers/openverse-auth.js` — token cache + refresh
- `app/src/providers/openverse.js` — search with Bearer header

Registered app: **IMGverse Search** (`kingsleyfelix9@gmail.com`) — verified and active.

---

## Links

- API base: https://api.openverse.org/v1/
- Register: https://api.openverse.org/v1/auth_tokens/register/
- Token: https://api.openverse.org/v1/auth_tokens/token/
- Docs: https://docs.openverse.org/api/reference/authentication_and_throttling.html
- GitHub issue (Hetzner/VPS 403): https://github.com/WordPress/openverse/issues/5478
