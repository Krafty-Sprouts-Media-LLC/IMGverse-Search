#!/bin/sh
# =============================================================================
# nginx/docker-entrypoint.sh
# IMGverse Search — Nginx entrypoint.
# Processes the config template with envsubst before starting nginx.
# Mirrors KSM WPDokploystack nginx/docker-entrypoint.sh pattern.
#
# @package IMGverse-Search
# @since   1.0.0
# =============================================================================

set -e

echo "Nginx configuration:"
echo "  upstream app: app:3000"

# Process the template and generate the actual nginx config
envsubst '' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

echo "Nginx configuration generated successfully"

# Execute the main command (nginx)
exec "$@"
