#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/visionary}"
APP_PORT="${APP_PORT:-4001}"

echo "[1/7] Updating apt packages"
sudo apt-get update

echo "[2/7] Installing system dependencies"
sudo apt-get install -y \
  curl \
  git \
  ca-certificates \
  gnupg \
  nginx \
  build-essential

echo "[3/7] Installing Node.js 22.x"
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "[4/7] Installing PM2"
sudo npm install -g pm2

echo "[5/7] Creating application directory"
sudo mkdir -p "$APP_DIR"
sudo chown -R "$USER":"$USER" "$APP_DIR"

echo "[6/7] Installing project dependencies"
cd "$APP_DIR"
npm ci --include=dev
npx playwright install --with-deps chromium

echo "[7/7] Setup complete"
echo "Application directory: $APP_DIR"
echo "Expected worker port: $APP_PORT"
echo "Next steps:"
echo "  1. Copy .env.production.example to .env.production and fill variables"
echo "  2. Start PM2 with: pm2 start ecosystem.config.cjs"
echo "  3. Configure Nginx using deploy/vps/nginx-worker.conf"
