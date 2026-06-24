#!/bin/sh
# Polls GitHub for new commits and redeploys if the remote has changed.
# Run via cron every 5 minutes:
#   */5 * * * * /path/to/worldcup/update.sh >> /path/to/worldcup/logs/update.log 2>&1

set -e

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
COMMIT=$(git rev-parse --short HEAD) docker compose up -d --build
echo "$(date '+%Y-%m-%d %H:%M:%S') deployed $COMMIT"
