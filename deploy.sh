#!/usr/bin/env bash
# deploy.sh — pull latest changes, rebuild frontend, reload pm2
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

echo "[deploy] pulling latest..."
git pull

echo "[deploy] installing backend deps..."
npm install --prefix backend --cache /tmp/npm-cache-wc

echo "[deploy] installing frontend deps..."
npm install --prefix frontend --cache /tmp/npm-cache-wc

echo "[deploy] building frontend..."
npm run build --prefix frontend

echo "[deploy] reloading pm2..."
pm2 reload pm2.config.cjs --update-env || pm2 start pm2.config.cjs

echo "[deploy] done."
pm2 list
