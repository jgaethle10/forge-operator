#!/usr/bin/env bash
set -euo pipefail

GATEWAY=""
LAN_HOST=""
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="$(command -v node || true)"
RUN_USER="${SUDO_USER:-$USER}"

usage() {
  cat <<'EOF'
Usage:
  scripts/install-fabric-router-map-resident.sh --gateway 192.168.88.1 --host 192.168.88.3

Installs a resident systemd timer that reasserts the two Evercraft Fabric UPnP mappings:
  WAN 80  -> Chromebook 18080
  WAN 443 -> Chromebook 8443

The router-map helper remains hard-scoped to those two mappings.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --gateway) GATEWAY="${2:-}"; shift 2 ;;
    --host) LAN_HOST="${2:-}"; shift 2 ;;
    --repo-root) REPO_ROOT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$GATEWAY" || -z "$LAN_HOST" ]]; then
  echo "ERROR: --gateway and --host are required" >&2
  exit 2
fi
if [[ ! -f "$REPO_ROOT/scripts/evercraft-public-edge-map.mjs" ]]; then
  echo "ERROR: router mapper not found under $REPO_ROOT" >&2
  exit 2
fi
if [[ -z "$NODE_BIN" ]]; then
  echo "ERROR: node is required" >&2
  exit 2
fi

echo "[1/4] Installing router-map configuration..."
sudo install -d -m 0755 /etc/evercraft
sudo tee /etc/evercraft/router-map.env >/dev/null <<EOF
EVERCRAFT_ROUTER_GATEWAY=$GATEWAY
EVERCRAFT_ROUTER_LAN_HOST=$LAN_HOST
EVERCRAFT_ROUTER_REPO_ROOT=$REPO_ROOT
EVERCRAFT_ROUTER_NODE=$NODE_BIN
EOF
sudo chmod 0644 /etc/evercraft/router-map.env

echo "[2/4] Installing refresh helper..."
sudo tee /usr/local/sbin/evercraft-refresh-router-map >/dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
source /etc/evercraft/router-map.env
exec "$EVERCRAFT_ROUTER_NODE"   "$EVERCRAFT_ROUTER_REPO_ROOT/scripts/evercraft-public-edge-map.mjs"   --gateway "$EVERCRAFT_ROUTER_GATEWAY"   --host "$EVERCRAFT_ROUTER_LAN_HOST"
EOF
sudo chmod 0755 /usr/local/sbin/evercraft-refresh-router-map

echo "[3/4] Installing resident systemd service + timer..."
sudo tee /etc/systemd/system/evercraft-router-map.service >/dev/null <<EOF
[Unit]
Description=Evercraft Fabric router map refresh
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=$RUN_USER
ExecStart=/usr/local/sbin/evercraft-refresh-router-map
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
EOF

sudo tee /etc/systemd/system/evercraft-router-map.timer >/dev/null <<'EOF'
[Unit]
Description=Refresh Evercraft Fabric router mappings

[Timer]
OnBootSec=30s
OnUnitActiveSec=10min
Persistent=true
Unit=evercraft-router-map.service

[Install]
WantedBy=timers.target
EOF

echo "[4/4] Enabling timer and refreshing mappings now..."
sudo systemctl daemon-reload
sudo systemctl enable --now evercraft-router-map.timer
sudo systemctl start evercraft-router-map.service

echo
echo "Resident router-map refresh is active."
systemctl --no-pager --full status evercraft-router-map.timer | sed -n '1,12p'
