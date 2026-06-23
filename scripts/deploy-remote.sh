#!/usr/bin/env bash
# Run ON the production server after code sync (GitHub Actions publish branch or manual rsync).
# Rebuilds TypeScript and restarts systemd — does not overwrite .env on the server.
#
#   REMOTE_DIR=/opt/divi-cloud-index-api bash scripts/deploy-remote.sh

set -euo pipefail

REMOTE_DIR="${REMOTE_DIR:-/opt/divi-cloud-index-api}"
SERVICE_NAME="divi-cloud-index-api"

cd "${REMOTE_DIR}"

if [[ ! -f .env ]]; then
  echo "Missing ${REMOTE_DIR}/.env — create it on the server (never commit secrets)." >&2
  exit 1
fi

if command -v sed >/dev/null 2>&1; then
  sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true
fi
chmod +x scripts/*.sh 2>/dev/null || true

echo "==> npm ci"
npm ci

echo "==> npm run build"
npm run build

echo "==> systemctl restart ${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

sleep 2
curl -sf "http://127.0.0.1:8787/health"
echo ""
echo "Updated and restarted ${SERVICE_NAME}."
