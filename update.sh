#!/bin/sh
# Polls GitHub for new commits and redeploys via Docker if the remote has changed.
# Run via cron every 5 minutes:
#   */5 * * * * /path/to/worldcup26/update.sh >> /path/to/worldcup26/logs/update.log 2>&1

set -e

export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

git fetch origin main --quiet

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') new commit detected: $LOCAL -> $REMOTE"
git pull origin main --quiet

export COMMIT=$(git rev-parse --short HEAD)
docker compose up -d --build
docker compose restart caddy
echo "$(date '+%Y-%m-%d %H:%M:%S') deployed $COMMIT"
