# =============================================================================
# nginx/Dockerfile
# IMGverse Search — Nginx reverse proxy image.
# Mirrors KSM WPDokploystack nginx/Dockerfile pattern:
#   - Builds from nginx:alpine
#   - Uses envsubst for config templating
#   - Custom entrypoint processes template before starting nginx
#
# @package IMGverse-Search
# @since   1.0.0
# =============================================================================

FROM nginx:alpine

# Install envsubst (gettext) for config templating and wget for healthcheck
RUN apk add --no-cache gettext wget

# Copy config template and custom entrypoint
COPY default.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint-custom.sh
RUN chmod +x /docker-entrypoint-custom.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint-custom.sh"]
CMD ["nginx", "-g", "daemon off;"]
