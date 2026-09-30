#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CADENCE="5min"

usage() {
  cat <<'EOF'
Usage:
  scripts/install-fabric-self-update.sh [--repo-root /path/to/forge-operator] [--cadence 5min]

Installs a root-owned systemd timer that safely fast-forwards the owned
Evercraft Fabric edge from the authorized Forge Operator main branch.
No inbound admin port, SSH exposure, arbitrary shell webhook, or secret
transport is created.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-root) REPO_ROOT="${2:-}"; shift 2 ;;
    --cadence) CADENCE="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"
if [[ ! -d "$REPO_ROOT/.git" || ! -f "$REPO_ROOT/scripts/update-fabric-owned-edge.sh" ]]; then
  echo "ERROR: valid Forge Operator checkout required" >&2
  exit 2
fi
if [[ ! "$CADENCE" =~ ^[1-9][0-9]*(s|min|h)$ ]]; then
  echo "ERROR: cadence must look like 30s, 5min, or 1h" >&2
  exit 2
fi

sudo tee /etc/systemd/system/evercraft-fabric-update.service >/dev/null <<EOF
[Unit]
Description=Evercraft Fabric verified source update
After=network-online.target evercraft-fabric.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/bin/bash $REPO_ROOT/scripts/update-fabric-owned-edge.sh --repo-root $REPO_ROOT
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=read-only
EOF

sudo tee /etc/systemd/system/evercraft-fabric-update.timer >/dev/null <<EOF
[Unit]
Description=Keep Evercraft Fabric aligned with verified Forge main

[Timer]
OnBootSec=45s
OnUnitActiveSec=$CADENCE
Persistent=true
Unit=evercraft-fabric-update.service

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now evercraft-fabric-update.timer
sudo systemctl start evercraft-fabric-update.service

echo "Evercraft Fabric self-update installed."
systemctl --no-pager --full status evercraft-fabric-update.timer | sed -n '1,12p'
