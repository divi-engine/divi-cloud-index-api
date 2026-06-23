#!/usr/bin/env bash
# Bootstrap Typesense + Caddy (HTTPS) on Ubuntu/Debian (Hetzner).
# Run as root after SSH works: bash setup-typesense-server.sh cloud-catalog.diviengine.com
set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "Usage: bash setup-typesense-server.sh cloud-catalog.diviengine.com"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo "==> System update + base packages"
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq ca-certificates curl gnupg ufw fail2ban unattended-upgrades

echo "==> Docker"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
systemctl enable --now docker

echo "==> Firewall (SSH + HTTP/S only)"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Typesense admin key"
INSTALL_DIR="/opt/divi-cloud-typesense"
mkdir -p "$INSTALL_DIR/data"
if [[ ! -f "$INSTALL_DIR/admin-api-key" ]]; then
  openssl rand -hex 32 > "$INSTALL_DIR/admin-api-key"
  chmod 600 "$INSTALL_DIR/admin-api-key"
fi
ADMIN_KEY="$(cat "$INSTALL_DIR/admin-api-key")"

echo "==> Docker Compose stack"
cat > "$INSTALL_DIR/docker-compose.yml" <<EOF
services:
  typesense:
    image: typesense/typesense:27.1
    restart: unless-stopped
    network_mode: host
    volumes:
      - ${INSTALL_DIR}/data:/data
    command: >
      --data-dir /data
      --api-key=${ADMIN_KEY}
      --api-address=127.0.0.1
      --api-port=8108
      --enable-cors

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    network_mode: host
    volumes:
      - ${INSTALL_DIR}/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config

volumes:
  caddy_data:
  caddy_config:
EOF

cat > "$INSTALL_DIR/Caddyfile" <<EOF
${DOMAIN} {
	encode gzip
	reverse_proxy 127.0.0.1:8108
}
EOF

cd "$INSTALL_DIR"
docker compose pull
docker compose up -d

echo "==> Waiting for Typesense health (local)"
for i in $(seq 1 30); do
  if curl -sf -H "X-TYPESENSE-API-KEY: ${ADMIN_KEY}" "http://127.0.0.1:8108/health" >/dev/null; then
    break
  fi
  sleep 2
done
curl -sf -H "X-TYPESENSE-API-KEY: ${ADMIN_KEY}" "http://127.0.0.1:8108/health" || {
  echo "Typesense did not become healthy. Check: docker compose -f ${INSTALL_DIR}/docker-compose.yml logs"
  exit 1
}

cat > "$INSTALL_DIR/README.txt" <<EOF
Divi Cloud Index — Typesense server
Domain: https://${DOMAIN}
Admin API key file: ${INSTALL_DIR}/admin-api-key

Put in divi-cloud-index-api .env:
  TYPESENSE_HOST=${DOMAIN}
  TYPESENSE_PORT=443
  TYPESENSE_PROTOCOL=https
  TYPESENSE_ADMIN_API_KEY=<contents of admin-api-key>

Put in customer wp-config.php (server-side):
  define( 'DAF_CLOUD_TYPESENSE_HOST', '${DOMAIN}' );
  define( 'DAF_CLOUD_TYPESENSE_PORT', 443 );
  define( 'DAF_CLOUD_TYPESENSE_PROTOCOL', 'https' );

DNS: A record ${DOMAIN} -> this server's public IP before running this script.
EOF

echo ""
echo "=============================================="
echo "Done."
echo "HTTPS: https://${DOMAIN}/health  (needs Typesense API key header)"
echo "Admin key saved to: ${INSTALL_DIR}/admin-api-key"
echo "See: ${INSTALL_DIR}/README.txt"
echo "=============================================="
