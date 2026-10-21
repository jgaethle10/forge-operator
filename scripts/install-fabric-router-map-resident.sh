#!/usr/bin/env bash
set -euo pipefail

GATEWAY=""
LAN_HOST=""
SCOPE="web"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="$(command -v node || true)"
RUN_USER="${SUDO_USER:-$USER}"
STATE_DIR="/var/lib/evercraft/router-map"

usage() {
  cat <<'EOF'
Usage:
  scripts/install-fabric-router-map-resident.sh --gateway 192.168.88.1 --host 192.168.88.5 [--scope web|dns|all]

Installs a resident systemd timer. Default scope is WEB ONLY:
  WAN 80/TCP  -> Chromebook 18080/TCP
  WAN 443/TCP -> Chromebook 8443/TCP

DNS scope is separate and opt-in. Existing valid mappings are read back
without unnecessary rewriting; owned finite leases are renewed at most once\nevery six hours (or before observed expiry); foreign or stale owners hold.
Use --scope dns only for a separately authorized DNS operator mission.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --gateway) GATEWAY="${2:-}"; shift 2 ;;
    --host) LAN_HOST="${2:-}"; shift 2 ;;
    --scope) SCOPE="${2:-}"; shift 2 ;;
    --repo-root) REPO_ROOT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ ! "$SCOPE" =~ ^(web|dns|all)$ ]]; then
  echo "ERROR: scope must be web, dns or all" >&2
  exit 2
fi
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
EVERCRAFT_ROUTER_SCOPE=$SCOPE
EVERCRAFT_ROUTER_REPO_ROOT=$REPO_ROOT
EVERCRAFT_ROUTER_NODE=$NODE_BIN
EOF
sudo chmod 0644 /etc/evercraft/router-map.env

echo "[2/4] Installing refresh helper..."
RUN_GROUP="$(id -gn "$RUN_USER")"
sudo install -d -o "$RUN_USER" -g "$RUN_GROUP" -m 0750 "$STATE_DIR"
sudo tee /usr/local/sbin/evercraft-refresh-router-map >/dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
source /etc/evercraft/router-map.env
STATE_DIR="/var/lib/evercraft/router-map"
mkdir -p "$STATE_DIR"
tmp="$(mktemp "$STATE_DIR/latest.XXXXXX")"
# Bound owned mapping renewal to once every six hours, not every 10-minute
# timer tick. Keep independent router control and public ingress receipts.
renew_marker="$STATE_DIR/last-owned-lease-renewal.$EVERCRAFT_ROUTER_LAN_HOST.${EVERCRAFT_ROUTER_SCOPE:-web}"
now="$(date +%s)"
last="$(stat -c %Y "$renew_marker" 2>/dev/null || true)"
renew_due=0
# First deployment must NOT immediately request AddPortMapping on already-
# correct mappings. Establish a successful baseline before timed renewals.
# Some consumer IGDs reject a duplicate AddPortMapping with UPnP 718/500.
if [[ -n "$last" ]]; then
  if [[ ! "$last" =~ ^[0-9]+$ ]] || (( now < last || now-last >= 21600 )); then
    renew_due=1
  fi
fi
set +e
"$EVERCRAFT_ROUTER_NODE" "$EVERCRAFT_ROUTER_REPO_ROOT/scripts/evercraft-public-edge-map.mjs" \
  --gateway "$EVERCRAFT_ROUTER_GATEWAY" --host "$EVERCRAFT_ROUTER_LAN_HOST" \
  --scope "${EVERCRAFT_ROUTER_SCOPE:-web}" --renew-owned "$renew_due" >"$tmp"
code=$?
set -e
chmod 0640 "$tmp"
mv "$tmp" "$STATE_DIR/latest.json"
if [[ "$code" -eq 0 ]] && { [[ ! -e "$renew_marker" ]] || [[ "$renew_due" -eq 1 ]] || grep -Eq '"renewed"[[:space:]]*:[[:space:]]*true' "$STATE_DIR/latest.json"; }; then
  tmp_marker="$(mktemp "$STATE_DIR/renewal.XXXXXX")"
  printf "%s\n" "$now" >"$tmp_marker"
  chmod 0640 "$tmp_marker"
  mv "$tmp_marker" "$renew_marker"
fi
exit "$code"
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
ReadWritePaths=$STATE_DIR
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
echo "Latest router-map receipt: $STATE_DIR/latest.json"
systemctl --no-pager --full status evercraft-router-map.timer | sed -n '1,12p'
