#!/usr/bin/env bash
# Runs ON the server. Usage: deploy.sh <image-tag>
# Pulls the new images first (the running version is untouched while this happens, and only changed layers download),
# swaps the containers, waits for the new version's health check, and rolls back to the previous version on failure.
set -euo pipefail
cd /opt/sahaj
TAG="${1:?usage: deploy.sh <tag>}"
NS="$(cat .namespace)"
PREV="$(cat .current 2>/dev/null || true)"
compose() { API_IMAGE="$NS/sahaj-api:$1" WEB_IMAGE="$NS/sahaj-web:$1" docker compose -f docker-compose.prod.yml "${@:2}"; }

for img in "$NS/sahaj-api:$TAG" "$NS/sahaj-web:$TAG"; do
  docker image inspect "$img" >/dev/null 2>&1 || { echo ">> pulling $img"; docker pull -q "$img" >/dev/null; }
done
echo ">> starting $TAG"
if compose "$TAG" up -d --remove-orphans --wait --wait-timeout 120; then
  echo "$TAG" > .current
  [ -n "$PREV" ] && echo "$PREV" > .previous
  # keep the current and previous versions (for instant rollback), drop everything older
  for repo in sahaj-api sahaj-web; do
    docker images "$NS/$repo" --format '{{.Tag}}' | grep -vxF -e "$TAG" -e "${PREV:-none}" | xargs -r -I{} docker rmi "$NS/$repo:{}" >/dev/null 2>&1 || true
  done
  docker image prune -f >/dev/null 2>&1 || true
  echo ">> deployed $TAG"
else
  echo "!! $TAG failed its health check" >&2
  compose "$TAG" logs --tail 60 api >&2 || true
  if [ -n "$PREV" ]; then echo ">> rolling back to $PREV" >&2; compose "$PREV" up -d --remove-orphans --wait --wait-timeout 120 || true; fi
  exit 1
fi
