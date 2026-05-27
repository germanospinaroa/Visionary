#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/visionary}"
BRANCH="${BRANCH:-main}"

echo "[1/6] Switching to application directory"
cd "$APP_DIR"

echo "[2/6] Fetching latest code"
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

echo "[3/6] Installing dependencies"
npm ci --include=dev

echo "[4/6] Installing Playwright Chromium dependencies"
npx playwright install --with-deps chromium

echo "[5/6] Restarting PM2 worker service"
pm2 startOrRestart ecosystem.config.cjs

echo "[6/6] Persisting PM2 process list"
pm2 save

echo "Deployment completed."
pm2 status visionary-worker-service
