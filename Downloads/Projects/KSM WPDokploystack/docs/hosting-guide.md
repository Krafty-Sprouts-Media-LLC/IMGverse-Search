# Easily Host WordPress Sites Using Dokploy with Redis and Nginx

> **Original Article:** [Easily Host WordPress Sites Using Dokploy with Redis and Nginx](https://itsmereal.com/easily-host-wordpress-sites-using-dokploy-with-redis-and-nginx/)
> **Original Author:** Al-Mamun Talukder ([@almamunreal](https://twitter.com/almamunreal)) — Full-Stack Developer, Minimalist Designer, Tech Enthusiast. Founder of [Omnixima](https://itsmereal.com).
> **Published:** December 19, 2025 | **Adapted for KSM WPDokploystack use**

---

## Introduction

This guide is adapted from Al-Mamun Talukder's excellent article on hosting WordPress on Dokploy. The original author switched from Coolify (a Docker-based server management tool) to Dokploy, and to replicate the same production performance — featuring Redis caching, Nginx reverse proxying, and PHP-FPM — he created a custom Docker Compose stack specifically optimized for Dokploy.

This documentation captures those steps and supplements them with additional details for our KSM WPDokploystack deployment.

---

## What Is Dokploy?

Dokploy is an open-source PaaS (Platform as a Service) solution that simplifies deploying and managing Docker-based applications on your own VPS. It supports Docker Compose services, provides a web dashboard, handles domains and SSL, and integrates with GitHub for automated deployments.

---

## Step 1 — Setting Up Dokploy

If Dokploy is not yet installed on your VPS, run the following command as root or a user with `sudo` access:

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

> **Note:** Make sure the VPS is freshly provisioned for best results. Mixed installations (existing Docker, Nginx, etc.) can cause conflicts.

After the script finishes, open your browser and navigate to:

```
http://<your-vps-ip>:3000
```

This opens the Dokploy setup page where you can create the administrative account.

### Useful References

- **Official Dokploy Installation Docs:** https://docs.dokploy.com/docs/core/installation
- **YouTube Setup Guide:** https://www.youtube.com/watch?v=_FErnBwMpj8 — Covers initial Dokploy configuration, enabling SSL, and setting up a custom domain for the Dokploy dashboard itself.

---

## Step 2 — Understanding the WordPress Stack

Rather than using Dokploy's built-in official WordPress template (which can surface issues in long-term use), this stack uses a production-ready, custom Docker Compose configuration.

### Stack Components

| Service            | Description                                              |
|--------------------|----------------------------------------------------------|
| **WordPress**      | PHP 8.3 FPM with Redis extension, OPcache, and WP-CLI  |
| **Nginx**          | Optimized reverse proxy with caching and security headers|
| **MariaDB 10.6**   | Database server with health checks                       |
| **Redis**          | Object caching for improved performance                  |
| **phpMyAdmin**     | Database administration interface                        |
| **Plugin Installer** | Automatically installs Redis Object Cache plugin        |

The stack is available at: **https://github.com/Krafty-Sprouts-Media-LLC/WPDokploystack**

---

## Step 3 — Deploying WordPress on Dokploy

### Option A: One-Click Template Deploy (Recommended)

1. In the Dokploy dashboard, navigate to **Projects**.
2. Create a new Project or open an existing one.
3. Click **Create Service**.
4. Choose **Template**.
5. Set the **Base URL** to:
   ```
   https://raw.githubusercontent.com/Krafty-Sprouts-Media-LLC/WPDokploystack/main
   ```
6. Find and select **"WordPress + Redis Stack"**.
7. Click **Create** and then **Confirm**.
8. Click **Deploy** once the service is created.

### Option B: Manual Compose Deploy

1. Create a new **Compose** service in Dokploy.
2. Point to: `https://github.com/Krafty-Sprouts-Media-LLC/WPDokploystack`
3. Set Compose Path: `./docker-compose.yml`
4. Go to the **Environment** tab and add:
   ```env
   MYSQL_ROOT_PASSWORD=YourSecureRootPass123!
   MYSQL_PASSWORD=YourSecureDbPass456!
   WORDPRESS_DB_PASSWORD=YourSecureDbPass456!
   ```
5. Click **Deploy**.

---

## Step 4 — Post-Deploy Configuration

These steps apply after either deployment option.

### 4a. Configure Domains

Go to the **Domains** tab in your Compose service and add:

| Domain                        | Service     | Port |
|-------------------------------|-------------|------|
| `yourdomain.com`              | nginx       | 80   |
| `pma.yourdomain.com` (optional) | phpmyadmin | 80  |

After adding domains, return to the **General** tab and click **Reload**.

> SSL is handled automatically by Dokploy via Let's Encrypt once the domain is pointed correctly.

**phpMyAdmin credentials:**

| Username    | Password              |
|-------------|-----------------------|
| `wordpress` | Your `MYSQL_PASSWORD` |

### 4b. Activate Redis Object Cache

1. Log in to WordPress admin at `yourdomain.com/wp-admin`.
2. Go to **Plugins → Installed Plugins**.
3. Activate **Redis Object Cache** (pre-installed by the stack).
4. Go to **Settings → Redis**.
5. Click **Enable Object Cache**.

Once enabled, WordPress will use Redis for object caching, significantly reducing database load and improving page load times.

---

## Environment Variable Reference

### Database Configuration

| Variable                  | Default     | Description                      |
|---------------------------|-------------|----------------------------------|
| `MYSQL_ROOT_PASSWORD`     | —           | **Required.** MariaDB root password |
| `MYSQL_DATABASE`          | `wordpress` | Database name                    |
| `MYSQL_USER`              | `wordpress` | Database user                    |
| `MYSQL_PASSWORD`          | —           | **Required.** Database password  |
| `WORDPRESS_DB_HOST`       | `db`        | Database host                    |
| `WORDPRESS_DB_USER`       | `wordpress` | WordPress database user          |
| `WORDPRESS_DB_PASSWORD`   | —           | **Required.** WordPress DB password |
| `WORDPRESS_DB_NAME`       | `wordpress` | WordPress database name          |

### PHP Settings

| Variable                      | Default | Description                    |
|-------------------------------|---------|--------------------------------|
| `PHP_UPLOAD_MAX_FILESIZE`     | `256M`  | Maximum upload file size       |
| `PHP_POST_MAX_SIZE`           | `256M`  | Maximum POST data size         |
| `PHP_MEMORY_LIMIT`            | `256M`  | PHP memory limit               |
| `PHP_MAX_EXECUTION_TIME`      | `300`   | Script timeout in seconds      |
| `PHP_MAX_INPUT_TIME`          | `300`   | Input parsing timeout          |
| `PHP_MAX_INPUT_VARS`          | `3000`  | Maximum input variables        |

### OPcache Settings

| Variable                   | Default | Description                              |
|----------------------------|---------|------------------------------------------|
| `PHP_OPCACHE_MEMORY`       | `128`   | OPcache memory in MB                     |
| `PHP_OPCACHE_MAX_FILES`    | `4000`  | Maximum cached files                     |
| `PHP_OPCACHE_VALIDATE`     | `0`     | Validate timestamps (0=off for production)|

### Nginx Settings

| Variable                     | Default | Description                  |
|------------------------------|---------|------------------------------|
| `NGINX_CLIENT_MAX_BODY_SIZE` | `256M`  | Maximum upload size in Nginx |

### Redis Settings

| Variable                  | Default         | Description          |
|---------------------------|-----------------|----------------------|
| `REDIS_MAXMEMORY`         | `256mb`         | Redis maximum memory |
| `REDIS_MAXMEMORY_POLICY`  | `allkeys-lru`   | Eviction policy      |

### Resource Limits

| Variable                  | Default | Description               |
|---------------------------|---------|---------------------------|
| `NGINX_CPU_LIMIT`         | `0.5`   | Nginx CPU limit            |
| `NGINX_MEMORY_LIMIT`      | `256M`  | Nginx memory limit         |
| `WORDPRESS_CPU_LIMIT`     | `1.0`   | WordPress CPU limit        |
| `WORDPRESS_MEMORY_LIMIT`  | `1G`    | WordPress memory limit     |
| `DB_CPU_LIMIT`            | `1.0`   | MariaDB CPU limit          |
| `DB_MEMORY_LIMIT`         | `1G`    | MariaDB memory limit       |
| `REDIS_CPU_LIMIT`         | `0.5`   | Redis CPU limit            |
| `REDIS_MEMORY_LIMIT`      | `512M`  | Redis memory limit         |
| `PHPMYADMIN_CPU_LIMIT`    | `0.5`   | phpMyAdmin CPU limit       |
| `PHPMYADMIN_MEMORY_LIMIT` | `256M`  | phpMyAdmin memory limit    |

---

## Updating Settings After Deployment

All PHP, Nginx, Redis, and resource settings can be changed **without rebuilding** the images:

1. Go to your Compose service in Dokploy.
2. Navigate to the **Environment** tab.
3. Update the desired variables.
4. Click **Redeploy**.

The containers will restart with the new settings applied.

---

## Using WP-CLI

WP-CLI is pre-installed in the WordPress container. To use it:

```bash
# Access the WordPress container
docker exec -it <wordpress-container-name> bash

# Run WP-CLI commands
wp plugin list
wp cache flush
wp core update
wp cron event run --due-now
```

---

## Troubleshooting

### WordPress Not Loading

1. Check if all containers are running in Dokploy (look for green status).
2. Verify database credentials match between services.
3. Check container logs for errors via Dokploy's Logs tab.

### Upload Size Issues

Ensure both PHP and Nginx limits are set to the same value:

```env
PHP_UPLOAD_MAX_FILESIZE=512M
PHP_POST_MAX_SIZE=512M
NGINX_CLIENT_MAX_BODY_SIZE=512M
```

### Redis Not Connecting

1. Verify the Redis container is healthy in Dokploy.
2. Activate the **Redis Object Cache** plugin in WordPress admin.
3. Go to **Settings → Redis** and click **Enable Object Cache**.
4. If still failing, check Redis settings in `wp-config.php` (auto-configured by this stack):
   ```php
   define('WP_REDIS_HOST', 'redis');
   define('WP_REDIS_PORT', 6379);
   define('WP_CACHE', true);
   ```

---

## Related Documentation

- [File Browser Setup](./filebrowser-setup.md) — Access WordPress files via a browser-based file manager
- [SFTP Setup](./sftp-setup.md) — Access WordPress files via SFTP
- [VS Code Remote Setup](./vscode-remote-setup.md) — Edit WordPress files directly in VS Code

---

## Credits

This guide is adapted from an article by **Al-Mamun Talukder** published on [itsmereal.com](https://itsmereal.com).

> **Original Article:** [Easily Host WordPress Sites Using Dokploy with Redis and Nginx](https://itsmereal.com/easily-host-wordpress-sites-using-dokploy-with-redis-and-nginx/)
> © Al-Mamun Talukder — shared with attribution under the spirit of open knowledge. All credit for the original concept, Docker Compose stack design, and article content belongs to the original author.
