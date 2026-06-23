#!/usr/bin/env bash
# Pull latest code, rebuild, restart API. Run on the server as root (manual / SSH).
# GitHub Actions uses scripts/deploy-remote.sh after rsync instead of git pull.
set -euo pipefail

INSTALL_DIR="/opt/divi-cloud-index-api"

cd "$INSTALL_DIR"
git pull --ff-only
REMOTE_DIR="$INSTALL_DIR" bash "${INSTALL_DIR}/scripts/deploy-remote.sh"