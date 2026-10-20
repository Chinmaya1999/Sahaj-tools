#!/usr/bin/env bash
# Runs ON the server. Usage: deploy.sh <image-tag>
# Pulls first (no downtime), swaps containers only when the images are local, waits for health, rolls back on failure.
set -euo pipefail
cd /opt/sahaj
TAG="${1:?usage: deploy.sh <tag>}"
NS="$(cat .namespace)"
PREV="$(cat .current 2>/dev/null || true)"
compose() { API_IMAGE="$NS/sahaj-api:$1" WEB_IMAGE="$NS/sahaj-web:$1" docker compose -f docker-compose.prod.yml "${@:2}"; }

echo ">> pulling $TAG"
compose "$TAG" pull --quiet
echo ">> starting $TAG"
if compose "$TAG" up -d --remove-orphans --wait --wait-timeout 120; then
  echo "$TAG" > .current
  [ -n "$PREV" ] && echo "$PREV" > .previous
  docker image prune -af --filter "until=72h" >/dev/null 2>&1 || true
  echo ">> deployed $TAG"
else
  echo "!! $TAG failed its health check" >&2
  compose "$TAG" logs --tail 60 api >&2 || true
  if [ -n "$PREV" ]; then echo ">> rolling back to $PREV" >&2; compose "$PREV" up -d --remove-orphans --wait --wait-timeout 120 || true; fi
  exit 1
fi
