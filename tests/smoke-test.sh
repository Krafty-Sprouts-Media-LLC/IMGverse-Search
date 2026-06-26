#!/bin/bash
# =============================================================================
# tests/smoke-test.sh
# IMGverse Search — Integration smoke test.
# Brings up the full stack and verifies:
#   - All containers healthy (nginx, app, redis)
#   - /healthz returns 200 from nginx
#   - /api/search?q=cat returns JSON results
#   - /proxy?url=... returns a JPEG image
#
# Usage (from repo root):
#   bash tests/smoke-test.sh
#   bash tests/smoke-test.sh --keep   # leave stack running after test
#
# @package IMGverse-Search
# @since   1.0.0
# =============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="docker compose -f ${ROOT_DIR}/docker-compose.yml -f ${ROOT_DIR}/tests/compose.override.yml --env-file ${ROOT_DIR}/tests/smoke-test.env"
KEEP_STACK=false
TEST_HTTP_PORT="${TEST_HTTP_PORT:-18081}"
BASE_URL="http://127.0.0.1:${TEST_HTTP_PORT}"

if [ "${1:-}" = "--keep" ]; then
    KEEP_STACK=true
fi

pass() { echo "[PASS] $*"; }
fail() { echo "[FAIL] $*"; exit 1; }
info() { echo "[INFO] $*"; }

cleanup() {
    if [ "${KEEP_STACK}" = true ]; then
        info "Keeping stack running (--keep). Base URL: ${BASE_URL}"
        return 0
    fi
    info "Tearing down test stack..."
    ${COMPOSE} down -v --remove-orphans 2>/dev/null || true
}

trap cleanup EXIT

info "Creating dokploy-network if missing..."
docker network inspect dokploy-network >/dev/null 2>&1 || docker network create dokploy-network

info "Building and starting stack..."
export TEST_HTTP_PORT
${COMPOSE} up -d --build

info "Waiting for app container to be healthy..."
for i in $(seq 1 40); do
    if ${COMPOSE} ps app 2>/dev/null | grep -q "(healthy)"; then
        pass "App container healthy"
        break
    fi
    if [ "$i" -eq 40 ]; then
        ${COMPOSE} logs app
        fail "App container did not become healthy in time"
    fi
    sleep 5
done

info "Waiting for nginx container to be healthy..."
for i in $(seq 1 20); do
    if ${COMPOSE} ps nginx 2>/dev/null | grep -q "(healthy)"; then
        pass "Nginx container healthy"
        break
    fi
    if [ "$i" -eq 20 ]; then
        fail "Nginx container did not become healthy in time"
    fi
    sleep 3
done

info "Testing /healthz endpoint..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/healthz")
[ "${HTTP_CODE}" = "200" ] || fail "/healthz returned ${HTTP_CODE}, expected 200"
pass "/healthz returned 200"

info "Testing /api/search?q=cat returns JSON..."
SEARCH_RESPONSE=$(curl -s "${BASE_URL}/api/search?q=cat")
echo "${SEARCH_RESPONSE}" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'results' in d" \
    || fail "/api/search did not return valid JSON with results key"
pass "/api/search returns valid JSON"

info "Testing /proxy with an Openverse image URL..."
# Use a known stable public JPEG from a whitelisted domain for the proxy test
TEST_IMG_URL=$(echo -n "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/320px-Cat03.jpg" | python3 -c "import sys,urllib.parse; print(urllib.parse.quote(sys.stdin.read()))")
CONTENT_TYPE=$(curl -s -o /dev/null -w "%{content_type}" "${BASE_URL}/proxy?url=${TEST_IMG_URL}")
echo "${CONTENT_TYPE}" | grep -q "image/jpeg" || fail "/proxy did not return image/jpeg, got: ${CONTENT_TYPE}"
pass "/proxy returned image/jpeg"

info "Testing /download with Content-Disposition..."
DOWNLOAD_HEADERS=$(curl -s -D - -o /dev/null "${BASE_URL}/download?url=${TEST_IMG_URL}&name=smoke-test-cat")
echo "${DOWNLOAD_HEADERS}" | grep -qi "content-disposition: attachment" \
    || fail "/download did not return Content-Disposition: attachment"
echo "${DOWNLOAD_HEADERS}" | grep -qi "image/jpeg" \
    || fail "/download did not return image/jpeg"
pass "/download returned attachment JPEG"

echo ""
echo "=============================================="
echo "  ALL SMOKE TESTS PASSED"
echo "  Stack URL: ${BASE_URL}"
echo "=============================================="
