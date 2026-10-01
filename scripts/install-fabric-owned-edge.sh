#!/usr/bin/env bash
set -euo pipefail

DOMAIN=""
ACME_EMAIL=""
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FABRIC_PORT="8787"
HTTP_PORT="18080"
HTTPS_PORT="8443"

usage() {
  cat <<'EOF'
Usage:
  scripts/install-fabric-owned-edge.sh --domain fabric.example.com --email ops@example.com

Installs a Chromebook/Crostini-friendly public HTTPS edge for Evercraft Fabric.
The public internet must route WAN 80 -> Chromebook 18080 and WAN 443 -> Chromebook 8443.
ChromeOS Linux port forwarding must expose TCP 18080 and 8443 to the LAN.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --email) ACME_EMAIL="${2:-}"; shift 2 ;;
    --repo-root) REPO_ROOT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$DOMAIN" || ! "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ || "$DOMAIN" != *.* ]]; then
  echo "ERROR: --domain must be a valid hostname, e.g. fabric.example.com" >&2
  exit 2
fi
if [[ -z "$ACME_EMAIL" || "$ACME_EMAIL" != *@*.* ]]; then
  echo "ERROR: --email must be a valid contact email for ACME certificate notices" >&2
  exit 2
fi
if [[ ! -f "$REPO_ROOT/systemia/mcp/fabric-local-runtime.mjs" ]]; then
  echo "ERROR: Evercraft repo not found at $REPO_ROOT" >&2
  exit 2
fi
if ! command -v node >/dev/null 2>&1; then echo "ERROR: node is required" >&2; exit 2; fi
if ! command -v systemctl >/dev/null 2>&1; then echo "ERROR: systemd/systemctl is required" >&2; exit 2; fi
if ! command -v sudo >/dev/null 2>&1; then echo "ERROR: sudo is required" >&2; exit 2; fi

NODE_BIN="$(command -v node)"
RUN_USER="${SUDO_USER:-$USER}"
RUN_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)"
if [[ -z "$RUN_HOME" ]]; then
  echo "ERROR: could not resolve home directory for $RUN_USER" >&2
  exit 2
fi
NODE_RECEIPT="$RUN_HOME/.local/state/evercraft/organism/compute/nodeseed-receipt.json"
ALLOCATOR_TOKEN_FILE="$RUN_HOME/.local/state/evercraft/organism/.secrets/allocator-token"

echo "[1/9] Installing Caddy from Debian packages..."
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y caddy curl ca-certificates

echo "[2/9] Creating Evercraft edge configuration..."
sudo install -d -m 0755 /etc/evercraft
sudo tee /etc/evercraft/fabric.env >/dev/null <<EOF
EVERCRAFT_OPENAI_CHALLENGE_TOKEN=
EVERCRAFT_EDGE_NODE_RECEIPT=$NODE_RECEIPT
EVERCRAFT_EDGE_ALLOCATOR_TOKEN_FILE=$ALLOCATOR_TOKEN_FILE
EOF
sudo chmod 0600 /etc/evercraft/fabric.env

sudo tee /etc/evercraft/public-edge.env >/dev/null <<EOF
EVERCRAFT_PUBLIC_HOST=$DOMAIN
EVERCRAFT_ACME_EMAIL=$ACME_EMAIL
EOF
sudo chmod 0644 /etc/evercraft/public-edge.env

sudo tee /etc/evercraft/Caddyfile >/dev/null <<'EOF'
{
  http_port 18080
  https_port 8443
  email {$EVERCRAFT_ACME_EMAIL}
  admin off
}

{$EVERCRAFT_PUBLIC_HOST} {
  reverse_proxy 127.0.0.1:8787
  header {
    X-Content-Type-Options "nosniff"
    Referrer-Policy "no-referrer"
    Permissions-Policy "geolocation=(), microphone=(), camera=()"
    -Server
  }
  log {
    output file /var/log/caddy/evercraft-fabric-access.log
    format json
  }
}
EOF

echo "[3/9] Installing resident Evercraft Fabric service..."
sudo tee /etc/systemd/system/evercraft-fabric.service >/dev/null <<EOF
[Unit]
Description=Evercraft Fabric MCP
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$REPO_ROOT
EnvironmentFile=/etc/evercraft/fabric.env
ExecStart=$NODE_BIN $REPO_ROOT/systemia/mcp/fabric-local-runtime.mjs --host 127.0.0.1 --port $FABRIC_PORT
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only

[Install]
WantedBy=multi-user.target
EOF

echo "[4/9] Installing resident TLS edge service..."
sudo systemctl disable --now caddy.service >/dev/null 2>&1 || true
sudo tee /etc/systemd/system/evercraft-public-edge.service >/dev/null <<'EOF'
[Unit]
Description=Evercraft Fabric public HTTPS edge
After=network-online.target evercraft-fabric.service
Wants=network-online.target
Requires=evercraft-fabric.service

[Service]
Type=simple
User=caddy
Group=caddy
EnvironmentFile=/etc/evercraft/public-edge.env
ExecStart=/usr/bin/caddy run --environ --config /etc/evercraft/Caddyfile --adapter caddyfile
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF

echo "[5/9] Installing safe OpenAI challenge-token helper..."
sudo tee /usr/local/sbin/evercraft-set-openai-challenge >/dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
read -r -s -p "Paste OpenAI domain verification token: " TOKEN
echo
if [[ -z "$TOKEN" || ! "$TOKEN" =~ ^[A-Za-z0-9_-]{16,512}$ ]]; then
  echo "ERROR: token format rejected" >&2
  exit 2
fi
TMP="$(mktemp)"
sudo awk -F= '$1 != "EVERCRAFT_OPENAI_CHALLENGE_TOKEN" {print}' /etc/evercraft/fabric.env > "$TMP"
printf 'EVERCRAFT_OPENAI_CHALLENGE_TOKEN=%s\n' "$TOKEN" >> "$TMP"
chmod 0600 "$TMP"
sudo install -o root -g root -m 0600 "$TMP" /etc/evercraft/fabric.env
rm -f "$TMP"
sudo systemctl restart evercraft-fabric.service
echo "OpenAI challenge token installed and Evercraft Fabric restarted."
EOF
sudo chmod 0755 /usr/local/sbin/evercraft-set-openai-challenge

echo "[6/9] Enabling services..."
sudo systemctl daemon-reload
sudo systemctl enable --now evercraft-fabric.service
sudo systemctl enable --now evercraft-public-edge.service

echo "[7/9] Installing fail-closed Fabric self-update heartbeat..."
bash "$REPO_ROOT/scripts/install-fabric-self-update.sh" --repo-root "$REPO_ROOT" --cadence 5min

echo "[8/9] Installing read-only node network observer..."
sudo bash "$REPO_ROOT/scripts/install-fabric-network-observer.sh" \
  --repo-root "$REPO_ROOT" \
  --user "$RUN_USER" \
  --cadence 2min

echo "[9/9] Local checks..."
curl -fsS "http://127.0.0.1:$FABRIC_PORT/health" >/tmp/evercraft-fabric-health.json
sudo bash -c '
  set -a
  . /etc/evercraft/public-edge.env
  set +a
  /usr/bin/caddy validate --config /etc/evercraft/Caddyfile --adapter caddyfile
' >/dev/null

cat <<EOF

Evercraft owned public edge is installed.

LOCAL FABRIC:
  http://127.0.0.1:$FABRIC_PORT/mcp

PUBLIC TARGET:
  https://$DOMAIN/mcp

NETWORK BOUNDARIES:
  1. ChromeOS Settings -> Developers -> Linux -> Port forwarding
     Add/enable TCP $HTTP_PORT and TCP $HTTPS_PORT.
     ChromeOS may require these host-level forwards to be re-enabled after reboot.
  2. Router ingress
     WAN TCP 80  -> Chromebook LAN IP:$HTTP_PORT
     WAN TCP 443 -> Chromebook LAN IP:$HTTPS_PORT
     On compatible routers, automate this with:
       sudo bash scripts/install-fabric-router-map-resident.sh --gateway <router-ip> --host <chromebook-lan-ip>

OBSERVABILITY:
  evercraft-network-observer.timer records the Linux/Crostini side every 2 minutes.
  It deliberately reports ChromeOS host forwarding as an external trust boundary
  rather than pretending the guest can verify or toggle it.

DNS:
  Point $DOMAIN to your router's public IPv4 address.

Then verify from a device NOT on your home Wi-Fi:
  https://$DOMAIN/health

For OpenAI domain verification, run:
  sudo evercraft-set-openai-challenge

Do not paste the OpenAI verification token into chat.
EOF
