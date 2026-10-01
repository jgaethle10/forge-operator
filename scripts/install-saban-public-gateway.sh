#!/usr/bin/env bash
set -euo pipefail

DOMAIN=""
ACME_EMAIL=""
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BROKER_PORT="8794"
BRIDGE_PORT="8795"
PUBLIC_BROKER_PORT="9443"
COMMISSIONING_MS="300000"

usage() {
  cat <<'EOF'
Usage:
  scripts/install-saban-public-gateway.sh --domain fabric.example.com --email ops@example.com

Installs a dedicated Evercraft/Saban public gateway on an ordinary Linux host.
The gateway terminates public TLS itself, receives the Chromebook only through an
outbound Evercraft capacity session, and removes ChromeOS Linux port forwarding
from the public request path.

The installer:
  - runs the Saban gateway appliance as a resident service
  - runs Caddy on 80/443 for the public Fabric origin
  - keeps the broker LAN/hairpin-only during commissioning
  - publishes the broker to all sources on trusted TLS at TCP 9443 only after one device is pinned
  - maps WAN 80/443/9443 while Caddy/firewall deny nonlocal broker traffic until authorization
  - opens a five-minute, single-device local commissioning window
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --email) ACME_EMAIL="${2:-}"; shift 2 ;;
    --repo-root) REPO_ROOT="${2:-}"; shift 2 ;;
    --broker-port) BROKER_PORT="${2:-}"; shift 2 ;;
    --bridge-port) BRIDGE_PORT="${2:-}"; shift 2 ;;
    --public-broker-port) PUBLIC_BROKER_PORT="${2:-}"; shift 2 ;;
    --commissioning-ms) COMMISSIONING_MS="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$DOMAIN" || ! "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ || "$DOMAIN" != *.* ]]; then
  echo "ERROR: --domain must be a valid hostname" >&2
  exit 2
fi
if [[ -z "$ACME_EMAIL" || "$ACME_EMAIL" != *@*.* ]]; then
  echo "ERROR: --email must be a valid ACME contact email" >&2
  exit 2
fi
if [[ ! -f "$REPO_ROOT/systemia/saban/public-gateway-appliance.mjs" ]]; then
  echo "ERROR: Evercraft gateway runtime not found under $REPO_ROOT" >&2
  exit 2
fi
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js 22+ is required on the gateway host" >&2
  exit 2
fi
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if (( NODE_MAJOR < 22 )); then
  echo "ERROR: Node.js 22+ is required; found $(node --version)" >&2
  exit 2
fi
for tool in sudo systemctl ip awk; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "ERROR: required command missing: $tool" >&2
    exit 2
  fi
done

RUN_USER="${SUDO_USER:-$USER}"
RUN_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)"
if [[ -z "$RUN_HOME" ]]; then
  echo "ERROR: could not resolve home for $RUN_USER" >&2
  exit 2
fi
NODE_BIN="$(command -v node)"
RELEASE_REF="$(git -C "$REPO_ROOT" rev-parse HEAD)"
if [[ ! "$RELEASE_REF" =~ ^[a-f0-9]{40}$ ]]; then
  echo "ERROR: immutable git release ref unavailable" >&2
  exit 2
fi

ROUTE_LINE="$(ip route show default | head -n1)"
ROUTER_IP="$(awk '{for(i=1;i<=NF;i++) if($i=="via"){print $(i+1); exit}}' <<<"$ROUTE_LINE")"
IFACE="$(awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}' <<<"$ROUTE_LINE")"
LAN_CIDR="$(ip -o -f inet addr show dev "$IFACE" | awk 'NR==1{print $4}')"
LAN_HOST="${LAN_CIDR%/*}"
if [[ -z "$ROUTER_IP" || -z "$IFACE" || -z "$LAN_HOST" ]]; then
  echo "ERROR: could not determine LAN gateway/interface/address" >&2
  exit 2
fi

echo "[1/8] Installing TLS edge dependencies..."
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y caddy curl ca-certificates

echo "[2/8] Preparing gateway state and configuration..."
STATE_DIR="$RUN_HOME/.local/state/evercraft/public-gateway"
install -d -m 0700 "$STATE_DIR"
sudo install -d -m 0755 /etc/evercraft
sudo tee /etc/evercraft/saban-gateway.env >/dev/null <<EOF
EVERCRAFT_GATEWAY_STATE_DIR=$STATE_DIR
EVERCRAFT_GATEWAY_NODE_ID=saban-gateway-$(hostname | tr -c 'A-Za-z0-9._-' '-')
EVERCRAFT_GATEWAY_LAN_HOST=$LAN_HOST
EVERCRAFT_GATEWAY_BROKER_HOST=0.0.0.0
EVERCRAFT_GATEWAY_BROKER_PORT=$BROKER_PORT
EVERCRAFT_GATEWAY_BRIDGE_PORT=$BRIDGE_PORT
EVERCRAFT_GATEWAY_COMMISSIONING=true
EVERCRAFT_GATEWAY_COMMISSIONING_MS=$COMMISSIONING_MS
EVERCRAFT_GATEWAY_COMMISSIONING_NODE_PREFIX=chromebook-
EVERCRAFT_PUBLIC_HOST=$DOMAIN
EVERCRAFT_RELEASE_REF=$RELEASE_REF
EOF
sudo chmod 0644 /etc/evercraft/saban-gateway.env

echo "[3/8] Installing resident Saban gateway appliance..."
sudo tee /etc/systemd/system/evercraft-saban-gateway.service >/dev/null <<EOF
[Unit]
Description=Evercraft Saban public gateway appliance
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$REPO_ROOT
EnvironmentFile=/etc/evercraft/saban-gateway.env
ExecStart=$NODE_BIN $REPO_ROOT/systemia/saban/public-gateway-appliance.mjs
Restart=always
RestartSec=2
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=$STATE_DIR

[Install]
WantedBy=multi-user.target
EOF

echo "[4/8] Installing Caddy public edge..."
sudo tee /etc/evercraft/saban-public-edge.env >/dev/null <<EOF
EVERCRAFT_PUBLIC_HOST=$DOMAIN
EVERCRAFT_ACME_EMAIL=$ACME_EMAIL
EVERCRAFT_GATEWAY_BRIDGE_PORT=$BRIDGE_PORT
EVERCRAFT_GATEWAY_BROKER_PORT=$BROKER_PORT
EVERCRAFT_PUBLIC_BROKER_PORT=$PUBLIC_BROKER_PORT
EOF
sudo chmod 0644 /etc/evercraft/saban-public-edge.env

sudo install -d -m 0755 /etc/evercraft
sudo tee /etc/evercraft/saban-broker-public.caddy >/dev/null <<EOF
# commissioning-local-only
https://$DOMAIN:$PUBLIC_BROKER_PORT {
  @commissioning_local remote_ip 127.0.0.0/8 10.0.0.0/8 100.64.0.0/10 172.16.0.0/12 192.168.0.0/16 ::1 fc00::/7 fe80::/10
  handle @commissioning_local {
    reverse_proxy 127.0.0.1:$BROKER_PORT
    header {
      X-Content-Type-Options "nosniff"
      Referrer-Policy "no-referrer"
      -Server
    }
  }
  respond "Saban gateway commissioning is local-only" 403
}
EOF
sudo chmod 0644 /etc/evercraft/saban-broker-public.caddy

sudo tee /etc/evercraft/SabanCaddyfile >/dev/null <<'EOF'
{
  email {$EVERCRAFT_ACME_EMAIL}
  admin off
}

{$EVERCRAFT_PUBLIC_HOST} {
  reverse_proxy 127.0.0.1:{$EVERCRAFT_GATEWAY_BRIDGE_PORT}
  header {
    X-Content-Type-Options "nosniff"
    Referrer-Policy "no-referrer"
    Permissions-Policy "geolocation=(), microphone=(), camera=()"
    -Server
  }
}

import /etc/evercraft/saban-broker-public.caddy
EOF

sudo systemctl disable --now caddy.service >/dev/null 2>&1 || true
sudo tee /etc/systemd/system/evercraft-saban-public-edge.service >/dev/null <<'EOF'
[Unit]
Description=Evercraft Saban trusted public TLS edge
After=network-online.target evercraft-saban-gateway.service
Wants=network-online.target
Requires=evercraft-saban-gateway.service

[Service]
Type=simple
User=caddy
Group=caddy
EnvironmentFile=/etc/evercraft/saban-public-edge.env
ExecStart=/usr/bin/caddy run --environ --config /etc/evercraft/SabanCaddyfile --adapter caddyfile
Restart=always
RestartSec=2
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF

echo "[5/8] Enabling gateway and public edge..."
sudo systemctl daemon-reload
sudo systemctl enable --now evercraft-saban-gateway.service
sudo systemctl enable --now evercraft-saban-public-edge.service

echo "[6/8] Restricting the private broker to the LAN when UFW is active..."
if command -v ufw >/dev/null 2>&1 && sudo ufw status | grep -q '^Status: active'; then
  sudo ufw allow 80/tcp >/dev/null
  sudo ufw allow 443/tcp >/dev/null
  if [[ -n "$LAN_CIDR" ]]; then
    sudo ufw allow from "$LAN_CIDR" to any port "$BROKER_PORT" proto tcp >/dev/null
    sudo ufw allow from "$LAN_CIDR" to any port "$PUBLIC_BROKER_PORT" proto tcp >/dev/null
    sudo ufw allow from "$LAN_CIDR" to any port 42425 proto udp >/dev/null
  fi
fi

echo "[7/8] Moving router ingress off ChromeOS and onto this gateway..."
sudo bash "$REPO_ROOT/scripts/install-fabric-router-map-resident.sh" \
  --repo-root "$REPO_ROOT" \
  --gateway "$ROUTER_IP" \
  --host "$LAN_HOST" \
  --http-port 80 \
  --https-port 443 \
  --broker-port "$PUBLIC_BROKER_PORT"

echo "[8/8] Installing post-commission broker publication gate..."
sudo tee /usr/local/sbin/evercraft-publish-saban-broker >/dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
STATE_FILE="__STATE_FILE__"
PUBLIC_BROKER_PORT="__PUBLIC_BROKER_PORT__"
PRIVATE_BROKER_PORT="__PRIVATE_BROKER_PORT__"
PUBLIC_HOST="__PUBLIC_HOST__"
LAN_CIDR="__LAN_CIDR__"
CADDY_SNIPPET="/etc/evercraft/saban-broker-public.caddy"
ROUTER_ENV="/etc/evercraft/router-map.env"

[[ -s "$STATE_FILE" ]] || exit 0
authorized="$(node -e '
  const fs=require("fs");
  const s=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
  process.stdout.write(String(Number(s.authorized_device_count||0)));
' "$STATE_FILE")"
(( authorized >= 1 )) || exit 0

if grep -q '^# commissioning-local-only' "$CADDY_SNIPPET" 2>/dev/null; then
  cat > "$CADDY_SNIPPET" <<CADDY
https://$PUBLIC_HOST:$PUBLIC_BROKER_PORT {
  reverse_proxy 127.0.0.1:$PRIVATE_BROKER_PORT
  header {
    X-Content-Type-Options "nosniff"
    Referrer-Policy "no-referrer"
    -Server
  }
}
CADDY
  chmod 0644 "$CADDY_SNIPPET"
  if command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'; then
    ufw allow "$PUBLIC_BROKER_PORT"/tcp >/dev/null
  fi
  if [[ -f "$ROUTER_ENV" ]]; then
    tmp="$(mktemp)"
    awk -F= '$1 != "EVERCRAFT_ROUTER_BROKER_PORT" {print}' "$ROUTER_ENV" > "$tmp"
    printf 'EVERCRAFT_ROUTER_BROKER_PORT=%s\n' "$PUBLIC_BROKER_PORT" >> "$tmp"
    install -o root -g root -m 0644 "$tmp" "$ROUTER_ENV"
    rm -f "$tmp"
    systemctl start evercraft-router-map.service
  fi
  systemctl restart evercraft-saban-public-edge.service
fi
EOF
sudo sed -i \
  -e "s|__STATE_FILE__|$STATE_DIR/gateway-state.json|g" \
  -e "s|__PUBLIC_BROKER_PORT__|$PUBLIC_BROKER_PORT|g" \
  -e "s|__PRIVATE_BROKER_PORT__|$BROKER_PORT|g" \
  -e "s|__PUBLIC_HOST__|$DOMAIN|g" \
  -e "s|__LAN_CIDR__|$LAN_CIDR|g" \
  /usr/local/sbin/evercraft-publish-saban-broker
sudo chmod 0755 /usr/local/sbin/evercraft-publish-saban-broker

sudo tee /etc/systemd/system/evercraft-saban-broker-publish.service >/dev/null <<'EOF'
[Unit]
Description=Publish Saban broker only after a device is pinned
After=evercraft-saban-gateway.service evercraft-saban-public-edge.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/evercraft-publish-saban-broker
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=read-only
EOF

sudo tee /etc/systemd/system/evercraft-saban-broker-publish.timer >/dev/null <<'EOF'
[Unit]
Description=Watch Saban commissioning and publish broker after authorization

[Timer]
OnBootSec=10s
OnUnitActiveSec=15s
Persistent=true
Unit=evercraft-saban-broker-publish.service

[Install]
WantedBy=timers.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now evercraft-saban-broker-publish.timer

echo "Verifying local gateway surfaces..."
curl -fsS --max-time 5 "http://127.0.0.1:$BROKER_PORT/v1/remote/health" >/tmp/evercraft-saban-broker-health.json
sudo bash -c '
  set -a
  . /etc/evercraft/saban-public-edge.env
  set +a
  /usr/bin/caddy validate --config /etc/evercraft/SabanCaddyfile --adapter caddyfile
' >/dev/null

cat <<EOF

Saban public gateway is resident.

PUBLIC FABRIC:
  https://$DOMAIN

OUTBOUND BROKER:
  LAN commissioning: http://$LAN_HOST:$BROKER_PORT
  After device pinning: https://$DOMAIN:$PUBLIC_BROKER_PORT

GATEWAY LAN:
  $LAN_HOST

ROUTER:
  $ROUTER_IP

The Chromebook no longer needs inbound Linux port forwarding. Its local organism
will prefer a local gateway beacon and fall back to:
  https://$DOMAIN:$PUBLIC_BROKER_PORT

The first attested Chromebook enrollment during the five-minute commissioning
window is pinned into the gateway broker authorization ledger. During commissioning, broker port $PUBLIC_BROKER_PORT accepts only private-network
sources; public clients receive no broker authority, so an internet client
cannot win the commissioning race. Once the first attested Chromebook is
pinned, the resident publication gate opens the broker for authenticated
outbound reconnects. New devices still do not receive authority automatically.

External verification:
  node scripts/fabric-edge-external-canary.mjs --origin https://$DOMAIN
EOF
