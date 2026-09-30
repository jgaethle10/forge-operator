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
The public internet must route WAN 80 -> Chromebook 8080 and WAN 443 -> Chromebook 8443.
ChromeOS Linux port forwarding must expose TCP 8080 and 8443 to the LAN.
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

echo "[1/7] Installing Caddy from Debian packages..."
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y caddy curl ca-certificates

echo "[2/7] Creating Evercraft edge configuration..."
sudo install -d -m 0755 /etc/evercraft
sudo tee /etc/evercraft/fabric.env >/dev/null <<EOF
EVERCRAFT_OPENAI_CHALLENGE_TOKEN=
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

echo "[3/7] Installing resident Evercraft Fabric service..."
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

echo "[4/7] Installing resident TLS edge service..."
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

echo "[5/7] Installing safe OpenAI challenge-token helper..."
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
printf 'EVERCRAFT_OPENAI_CHALLENGE_TOKEN=%s\n' "$TOKEN" > "$TMP"
chmod 0600 "$TMP"
sudo install -o root -g root -m 0600 "$TMP" /etc/evercraft/fabric.env
rm -f "$TMP"
sudo systemctl restart evercraft-fabric.service
echo "OpenAI challenge token installed and Evercraft Fabric restarted."
EOF
sudo chmod 0755 /usr/local/sbin/evercraft-set-openai-challenge

echo "[6/7] Enabling services..."
sudo systemctl daemon-reload
sudo systemctl enable --now evercraft-fabric.service
sudo systemctl enable --now evercraft-public-edge.service

echo "[7/7] Local checks..."
curl -fsS "http://127.0.0.1:$FABRIC_PORT/health" >/tmp/evercraft-fabric-health.json
sudo /usr/bin/caddy validate --config /etc/evercraft/Caddyfile --adapter caddyfile >/dev/null

cat <<EOF

Evercraft owned public edge is installed.

LOCAL FABRIC:
  http://127.0.0.1:$FABRIC_PORT/mcp

PUBLIC TARGET:
  https://$DOMAIN/mcp

NOW COMPLETE THESE TWO NETWORK STEPS:
  1. ChromeOS Settings -> Developers -> Linux -> Port forwarding
     Add TCP $HTTP_PORT and TCP $HTTPS_PORT.
  2. Router port forwarding
     WAN TCP 80  -> Chromebook LAN IP:$HTTP_PORT
     WAN TCP 443 -> Chromebook LAN IP:$HTTPS_PORT

DNS:
  Point $DOMAIN to your router's public IPv4 address.

Then verify from a device NOT on your home Wi-Fi:
  https://$DOMAIN/health

For OpenAI domain verification, run:
  sudo evercraft-set-openai-challenge

Do not paste the OpenAI verification token into chat.
EOF
