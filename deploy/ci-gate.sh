#!/usr/bin/env bash
# Forced command for the CI deploy key (see authorized_keys). The key can do ONLY these things, never open a shell:
#   sync-config      read a tar.gz on stdin containing docker-compose.prod.yml and deploy.sh
#   deploy <tag>     run deploy.sh for an image tag
#   rollback         redeploy the previous version
#   status           show running containers
set -euo pipefail
cd /opt/sahaj
read -r -a args <<<"${SSH_ORIGINAL_COMMAND:-}"
case "${args[0]:-}" in
  sync-config) tar -xzf - --no-same-owner --no-same-permissions docker-compose.prod.yml deploy.sh && chmod 0755 deploy.sh ;;
  deploy)
    tag="${args[1]:-}"
    [[ "$tag" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]] || { echo "bad tag" >&2; exit 2; }
    exec ./deploy.sh "$tag" ;;
  rollback)
    prev="$(cat .previous 2>/dev/null || true)"; [ -n "$prev" ] || { echo "no previous version recorded" >&2; exit 1; }
    exec ./deploy.sh "$prev" ;;
  status) docker ps --filter name=sahaj- --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'; echo "current: $(cat .current 2>/dev/null) previous: $(cat .previous 2>/dev/null)" ;;
  *) echo "command not allowed" >&2; exit 126 ;;
esac
