#!/usr/bin/env bash
set -euo pipefail

DOMAIN=""
ACME_EMAIL=""
TUNNEL_PORT=18787

usage(){
  cat <<'EOF'
Usage:
  sudo scripts/install-fabric-relay-node.sh \
    --domain fabric.example.com \
    --email ops@example.com \
    [--tunnel-port 18787]

Installs the HTTPS termination side of an Evercraft outbound relay node.
The SSH daemon on this public node must independently restrict the relay account
to remote forwarding with GatewayPorts disabled and PermitListen limited to
127.0.0.1:<tunnel-port>. This installer does not weaken sshd policy.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --email) ACME_EMAIL="${2:-}"; shift 2 ;;
    --tunnel-port) TUNNEL_PORT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ "${EUID}" -eq 0 ]] || { echo "ERROR: run with sudo" >&2; exit 2; }
[[ "$DOMAIN" == *.* && "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "ERROR: invalid domain" >&2; exit 2; }
[[ "$ACME_EMAIL" == *@*.* ]] || { echo "ERROR: invalid ACME email" >&2; exit 2; }
[[ "$TUNNEL_PORT" =~ ^[0-9]+$ ]] && (( TUNNEL_PORT >= 1 && TUNNEL_PORT <= 65535 )) || { echo "ERROR: invalid tunnel port" >&2; exit 2; }

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y caddy curl ca-certificates

install -d -m 0755 /etc/evercraft
cat >/etc/evercraft/relay-Caddyfile <<EOF
{
  email $ACME_EMAIL
  admin off
}

$DOMAIN {
  reverse_proxy 127.0.0.1:$TUNNEL_PORT
  header {
    X-Content-Type-Options "nosniff"
    Referrer-Policy "no-referrer"
    Permissions-Policy "geolocation=(), microphone=(), camera=()"
    -Server
  }
}
EOF

caddy validate --config /etc/evercraft/relay-Caddyfile --adapter caddyfile >/dev/null

cat >/etc/systemd/system/evercraft-fabric-relay-edge.service <<'EOF'
[Unit]
Description=Evercraft Fabric relay public HTTPS edge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=caddy
Group=caddy
ExecStart=/usr/bin/caddy run --config /etc/evercraft/relay-Caddyfile --adapter caddyfile
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF

systemctl disable --now caddy.service >/dev/null 2>&1 || true
systemctl daemon-reload
systemctl enable --now evercraft-fabric-relay-edge.service

cat <<EOF
Evercraft relay HTTPS edge installed.

Required SSH boundary (configure separately and fail closed):
  dedicated relay account
  AllowTcpForwarding remote
  GatewayPorts no
  PermitListen 127.0.0.1:$TUNNEL_PORT
  password authentication disabled for the relay account

Public HTTPS terminates here; the reverse-tunnel socket remains loopback-only.
EOF
