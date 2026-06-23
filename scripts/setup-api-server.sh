#!/usr/bin/env bash
# Bootstrap Divi Cloud Index API (Node + systemd + HTTPS via Caddy).
#
# Same Hetzner box as Typesense (recommended):
#   bash setup-api-server.sh cloud-index.diviengine.com /opt/divi-cloud-typesense
#
# Fresh VPS (installs its own Caddy in Docker — do not use if Typesense Caddy already owns :443):
#   bash setup-api-server.sh cloud-index.diviengine.com
#
# Before running:
#   1. DNS A record for DOMAIN -> this server's public IP (grey cloud OK for Let's Encrypt).
#   2. Copy production .env to /opt/divi-cloud-index-api/.env (see README).
#   3. If using private GitHub repo, clone the repo into /opt/divi-cloud-index-api first.
set -euo pipefail

DOMAIN="${1:-}"
TYPESENSE_CADDY_DIR="${2:-}"

if [[ -z "$DOMAIN" ]]; then
  echo "Usage: bash setup-api-server.sh cloud-index.diviengine.com [/opt/divi-cloud-typesense]"
  exit 1
fi

if [[ -z "$TYPESENSE_CADDY_DIR" && -d /opt/divi-cloud-typesense ]]; then
  TYPESENSE_CADDY_DIR="/opt/divi-cloud-typesense"
  echo "==> Detected Typesense install; will append Caddy site to ${TYPESENSE_CADDY_DIR}/Caddyfile"
fi

INSTALL_DIR="/opt/divi-cloud-index-api"
REPO_URL="${GIT_REPO_URL:-https://github.com/divi-engine/divi-cloud-index-api.git}"
SERVICE_NAME="divi-cloud-index-api"
NODE_MAJOR="${NODE_MAJOR:-20}"

export DEBIAN_FRONTEND=noninteractive

echo "==> System update + base packages"
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg git

echo "==> Node.js ${NODE_MAJOR}.x"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt "$NODE_MAJOR" ]]; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
fi
node -v
npm -v

echo "==> Application directory ${INSTALL_DIR}"
mkdir -p "$INSTALL_DIR"
if [[ ! -d "${INSTALL_DIR}/.git" && ! -f "${INSTALL_DIR}/package.json" ]]; then
  ENV_BACKUP=""
  if [[ -f "${INSTALL_DIR}/.env" ]]; then
    ENV_BACKUP="$(mktemp)"
    cp "${INSTALL_DIR}/.env" "$ENV_BACKUP"
  fi
  find "${INSTALL_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  if ! git clone "$REPO_URL" "$INSTALL_DIR"; then
    echo "ERROR: git clone failed (private repo?). Rsync the project from your PC, then re-run:"
    echo "  rsync -avz --exclude node_modules --exclude dist --exclude .git ./ root@SERVER:${INSTALL_DIR}/"
    exit 1
  fi
  if [[ -n "$ENV_BACKUP" ]]; then
    cp "$ENV_BACKUP" "${INSTALL_DIR}/.env"
    rm -f "$ENV_BACKUP"
  fi
elif [[ -f "${INSTALL_DIR}/package.json" && ! -d "${INSTALL_DIR}/.git" ]]; then
  echo "==> Using existing code in ${INSTALL_DIR} (rsync deploy, skipping git clone)"
fi

if [[ ! -f "${INSTALL_DIR}/.env" ]]; then
  echo ""
  echo "ERROR: Missing ${INSTALL_DIR}/.env"
  echo "Copy your production .env from your machine, then re-run this script."
  echo "Example (from your PC):"
  echo "  scp .env root@YOUR_SERVER:${INSTALL_DIR}/.env"
  exit 1
fi

echo "==> Build API"
cd "$INSTALL_DIR"
if [[ -d "${INSTALL_DIR}/.git" ]]; then
  git pull --ff-only || true
fi
npm ci
npm run build

echo "==> systemd service"
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Divi Cloud Index API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
# Use Node --env-file so passwords with $ or % are parsed correctly (systemd EnvironmentFile expands $).
ExecStart=/usr/bin/node --env-file=${INSTALL_DIR}/.env ${INSTALL_DIR}/dist/src/main.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}"

echo "==> Waiting for local health"
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:8787/health" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
curl -sf "http://127.0.0.1:8787/health" || {
  echo "API did not become healthy. Check: journalctl -u ${SERVICE_NAME} -n 50 --no-pager"
  exit 1
}

configure_caddy_shared() {
  local caddy_dir="$1"
  local caddyfile="${caddy_dir}/Caddyfile"
  if [[ ! -f "$caddyfile" ]]; then
    echo "ERROR: Caddyfile not found at ${caddyfile}"
    exit 1
  fi
  if grep -q "^${DOMAIN} {" "$caddyfile" 2>/dev/null; then
    echo "==> Caddy site ${DOMAIN} already in ${caddyfile}"
  else
    echo "==> Appending ${DOMAIN} to ${caddyfile}"
    cat >> "$caddyfile" <<EOF

${DOMAIN} {
	encode gzip
	reverse_proxy 127.0.0.1:8787
}
EOF
  fi
  cd "$caddy_dir"
  docker compose restart caddy
}

configure_caddy_standalone() {
  echo "==> Standalone Caddy (Docker) for ${DOMAIN}"
  apt-get install -y -qq docker.io docker-compose-plugin 2>/dev/null || true
  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: Docker required for standalone Caddy. Install Docker or pass Typesense Caddy dir as 2nd arg."
    exit 1
  fi
  systemctl enable --now docker
  local caddy_dir="/opt/divi-cloud-index-api-caddy"
  mkdir -p "$caddy_dir"
  cat > "${caddy_dir}/docker-compose.yml" <<'EOF'
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
volumes:
  caddy_data:
  caddy_config:
EOF
  cat > "${caddy_dir}/Caddyfile" <<EOF
${DOMAIN} {
	encode gzip
	reverse_proxy 127.0.0.1:8787
}
EOF
  cd "$caddy_dir"
  docker compose pull
  docker compose up -d
}

if [[ -n "$TYPESENSE_CADDY_DIR" ]]; then
  configure_caddy_shared "$TYPESENSE_CADDY_DIR"
else
  configure_caddy_standalone
fi

echo "==> Cron (cleanup daily 03:15 UTC, usage weekly Sun 04:00 UTC)"
CRON_FILE="/etc/cron.d/${SERVICE_NAME}"
cat > "$CRON_FILE" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 3 * * * root cd ${INSTALL_DIR} && /usr/bin/node --env-file=${INSTALL_DIR}/.env ${INSTALL_DIR}/dist/src/jobs/cleanup.js >> /var/log/${SERVICE_NAME}-cleanup.log 2>&1
0 4 * * 0 root cd ${INSTALL_DIR} && /usr/bin/node --env-file=${INSTALL_DIR}/.env ${INSTALL_DIR}/dist/src/jobs/usage.js >> /var/log/${SERVICE_NAME}-usage.log 2>&1
EOF
chmod 644 "$CRON_FILE"

cat > "${INSTALL_DIR}/README-SERVER.txt" <<EOF
Divi Cloud Index API
HTTPS: https://${DOMAIN}/health
Service: systemctl status ${SERVICE_NAME}
Logs: journalctl -u ${SERVICE_NAME} -f

Update after git push:
  bash ${INSTALL_DIR}/scripts/deploy-api-update.sh

Stripe webhook (production):
  POST https://${DOMAIN}/v1/stripe/webhook

WordPress wp-config.php:
  define( 'DAF_CLOUD_INDEX_API_URL', 'https://${DOMAIN}' );
  define( 'DAF_CLOUD_INDEX_API_SIGNING_KEY', '<same as PLUGIN_HMAC_SECRET>' );
EOF

echo ""
echo "=============================================="
echo "Done."
echo "Local:  curl -s http://127.0.0.1:8787/health"
echo "Public: curl -s https://${DOMAIN}/health"
echo "See: ${INSTALL_DIR}/README-SERVER.txt"
echo "=============================================="
