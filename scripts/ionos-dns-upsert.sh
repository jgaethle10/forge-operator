#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 6 ]]; then
  cat >&2 <<'EOF'
Usage:
  scripts/ionos-dns-upsert.sh --zone example.com --name host.example.com --content 203.0.113.10 [--ttl 3600]
EOF
  exit 2
fi

if [[ -z "${IONOS_API_KEY:-}" ]]; then
  read -r -s -p "IONOS API key (prefix.secret): " IONOS_API_KEY
  echo
  export IONOS_API_KEY
  trap 'unset IONOS_API_KEY' EXIT
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$SCRIPT_DIR/ionos-dns-upsert.mjs" "$@"
