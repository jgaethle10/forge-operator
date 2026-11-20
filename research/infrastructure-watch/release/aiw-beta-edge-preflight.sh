#!/usr/bin/env bash
# Read-only audit of the ACTUAL Evercraft Fabric-owned edge before AIW publication.
# This never changes Caddy, DNS, the Fabric resident, symlinks or production files.
set -euo pipefail
echo '=== AIW PUBLIC BETA | OWNED EDGE PREFLIGHT (READ ONLY) ==='
CONFIG=/etc/evercraft/Caddyfile
HOST_ENV=/etc/evercraft/public-edge.env
RELEASE_ROOT=/srv/evercraft/infrastructure-watch

for name in evercraft-fabric.service evercraft-public-edge.service; do
  state="$(systemctl is-active "$name" 2>/dev/null || true)"
  printf '%s=%s\n' "$name" "$state"
done

if [[ -f "$HOST_ENV" ]]; then
  domain="$(awk -F= '$1=="EVERCRAFT_PUBLIC_HOST"{print substr($0,index($0,"=")+1)}' "$HOST_ENV" | tail -1)"
  case "$domain" in
    fabric.systemiacommandcenters.com) echo 'owned_fabric_domain=expected' ;;
    *) echo 'owned_fabric_domain=UNVERIFIED; STOP before publication' ;;
  esac
else
  echo 'owned_fabric_domain=missing; STOP before publication'
fi

if [[ -r "$CONFIG" ]]; then
  echo "live_caddy_exists=true"
  if grep -Eq 'reverse_proxy[[:space:]]+127\.0\.0\.1:8787' "$CONFIG"; then
    echo 'fabric_reverse_proxy=present'
  else
    echo 'fabric_reverse_proxy=not_found_in_main_file; inspect imported routes'
  fi
  if grep -Fq '/infrastructure-watch' "$CONFIG"; then
    echo 'aiw_route=ALREADY_PRESENT; review existing owner before modification'
  else
    echo 'aiw_route=not_installed_in_main_file'
  fi
  if command -v caddy >/dev/null 2>&1; then
    # Caddy variables resolve with the existing public-edge env on an approved node.
    # Parse only the two public non-secret edge fields. Never evaluate a
    # machine configuration file as a shell script in a read-only audit.
    acme_email=""
    if [[ -r "$HOST_ENV" ]]; then
      acme_email="$(awk -F= '$1=="EVERCRAFT_ACME_EMAIL"{print substr($0,index($0,"=")+1)}' "$HOST_ENV" | tail -1)"
    fi
    if env EVERCRAFT_PUBLIC_HOST="${domain:-}" EVERCRAFT_ACME_EMAIL="$acme_email" caddy validate --config "$CONFIG" --adapter caddyfile >/dev/null 2>&1; then
      echo 'caddy_config_validation=PASS'
    else
      echo 'caddy_config_validation=BLOCKED'
    fi
  else
    echo 'caddy_binary=MISSING'
  fi
else
  echo 'live_caddy_exists=UNREADABLE_OR_MISSING'
fi

if [[ -L "$RELEASE_ROOT/current" ]]; then
  echo 'aiw_current_release=existing_symlink; preserve and review'
elif [[ -e "$RELEASE_ROOT/current" ]]; then
  echo 'aiw_current_release=existing_non_symlink; STOP before publication'
else
  echo 'aiw_current_release=not_installed'
fi

if curl -fsS --max-time 3 http://127.0.0.1:8787/health >/dev/null; then
  echo 'fabric_local_http_health=PASS'
else
  echo 'fabric_local_http_health=NOT_READY'
fi
echo 'external_https=NOT_PROVEN_BY_THIS_LOCAL_AUDIT'
echo 'publication_mutation=NONE'
echo 'NEXT: verify clean release archive, stage under /srv/evercraft, inspect route before Caddy change.'
