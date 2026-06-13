# =============================================================================
# app/Dockerfile
# IMGverse Search — Node.js application image.
# No build step. npm ci --production only. Starts with node src/server.js.
# Uses node:20-alpine for minimal size.
# sharp v0.33+ ships pre-built binaries — no vips compilation needed.
#
# @package IMGverse-Search
# @since   1.0.0
# =============================================================================

FROM node:20-alpine

# wget for Docker healthcheck
RUN apk add --no-cache wget

WORKDIR /app

# Install dependencies first — layer cache friendly.
# Re-runs only if package.json or package-lock.json change.
COPY package.json package-lock.json ./
RUN npm ci --production

# Copy application source and static public files
COPY src/ ./src/
COPY public/ ./public/

EXPOSE 3000

CMD ["node", "src/server.js"]
