#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=""
RUN_USER=""
CADENCE="2min"
STATE_DIR="/var/lib/evercraft/network-observer"

usage() {
  cat <<'EOF'
Usage:
  sudo scripts/install-fabric-network-observer.sh \
    --repo-root /home/user/forge-operator \
    --user user \
    [--cadence 2min]

Installs a read-only resident observer for the Evercraft node network boundary.

The observer records:
  - Linux interfaces and default routes
  - listening TCP/UDP ports
  - Evercraft Fabric / TLS edge service state
  - router-map timer state and configured gateway/LAN target
  - loopback Fabric health
  - hostname-aware local TLS health
  - an explicit ChromeOS/Crostini host-boundary marker

It does not create port mappings, toggle ChromeOS forwarding, modify firewall
rules, open listeners, or claim public reachability. External reachability still
belongs to the independent Fabric external canary.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-root) REPO_ROOT="${2:-}"; shift 2 ;;
    --user) RUN_USER="${2:-}"; shift 2 ;;
    --cadence) CADENCE="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: run this installer as root (normally with sudo)" >&2
  exit 2
fi
if [[ -z "$REPO_ROOT" || ! -f "$REPO_ROOT/systemia/compute/network-observer.mjs" ]]; then
  echo "ERROR: --repo-root must point to Forge Operator with network-observer.mjs" >&2
  exit 2
fi
if [[ -z "$RUN_USER" ]]; then
  RUN_USER="$(stat -c '%U' "$REPO_ROOT")"
fi
if ! id "$RUN_USER" >/dev/null 2>&1; then
  echo "ERROR: --user is not a local account" >&2
  exit 2
fi
if [[ ! "$CADENCE" =~ ^[1-9][0-9]*(s|min|h)$ ]]; then
  echo "ERROR: cadence must look like 30s, 2min, or 1h" >&2
  exit 2
fi

REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"
NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "ERROR: node is required" >&2
  exit 2
fi

RUN_GROUP="$(id -gn "$RUN_USER")"
install -d -o "$RUN_USER" -g "$RUN_GROUP" -m 0750 "$STATE_DIR"

cat >/etc/systemd/system/evercraft-network-observer.service <<EOF
[Unit]
Description=Evercraft read-only node network observer
After=network-online.target evercraft-fabric.service evercraft-public-edge.service
Wants=network-online.target

[Service]
Type=oneshot
User=$RUN_USER
Group=$RUN_GROUP
WorkingDirectory=$REPO_ROOT
ExecStart=$NODE_BIN $REPO_ROOT/systemia/compute/network-observer.mjs --out $STATE_DIR/latest.json --history $STATE_DIR/history.jsonl --quiet
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=$STATE_DIR
TimeoutStartSec=25s
EOF

cat >/etc/systemd/system/evercraft-network-observer.timer <<EOF
[Unit]
Description=Refresh Evercraft read-only node network observation

[Timer]
OnBootSec=25s
OnUnitActiveSec=$CADENCE
Persistent=true
Unit=evercraft-network-observer.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now evercraft-network-observer.timer
systemctl start evercraft-network-observer.service

echo "Evercraft network observer installed."
systemctl --no-pager --full status evercraft-network-observer.timer | sed -n '1,12p'
echo
echo "Latest receipt: $STATE_DIR/latest.json"
