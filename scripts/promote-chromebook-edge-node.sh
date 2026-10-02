#!/usr/bin/env bash
set -euo pipefail
if [[ "${EUID}" -ne 0 ]]; then echo "Run with sudo." >&2; exit 2; fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="$(command -v node || true)"
[[ -n "$NODE_BIN" ]] || { echo "Node.js required" >&2; exit 3; }
RELEASE_REF="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || true)"
[[ "$RELEASE_REF" =~ ^[a-f0-9]{40}$ ]] || { echo "Immutable git release ref unavailable" >&2; exit 4; }

export EVERCRAFT_NODE_ROLE=operator_authorized_public_edge
export EVERCRAFT_NODE_LABELS="operator-authorized,public-edge-candidate,gateway,evercraft-edge-dns,chromebook"
export EVERCRAFT_FAILURE_DOMAIN="${EVERCRAFT_FAILURE_DOMAIN:-home-wan-1}"
export EVERCRAFT_ZERO_COST=true
bash "$REPO_ROOT/systemia/compute/install-node-seed.sh"

STATE_ROOT=/var/lib/evercraft/nodeseed
SNAP_DIR="$STATE_ROOT/edge-dns"
install -d -o evercraft -g evercraft -m 0750 "$SNAP_DIR"
install -o evercraft -g evercraft -m 0600 "$REPO_ROOT/infra/evercraft-edge/dns/canary-zone.json" "$SNAP_DIR/canary-zone.json"

ENV=/etc/evercraft/nodeseed.env
grep -v '^EVERCRAFT_EDGE_' "$ENV" > "$ENV.tmp" || true
cat >> "$ENV.tmp" <<EOF
EVERCRAFT_EDGE_RELEASE_REF=$RELEASE_REF
EVERCRAFT_EDGE_DNS_SNAPSHOT=$SNAP_DIR/canary-zone.json
EVERCRAFT_EDGE_DNS_LEASE_TTL_MS=3600000
EVERCRAFT_NODESEED_LOCAL_ENDPOINT=http://127.0.0.1:42420
EOF
mv "$ENV.tmp" "$ENV"
chmod 0600 "$ENV"

cat > /etc/systemd/system/evercraft-edge-dns-bootstrap.service <<EOF
[Unit]
Description=Evercraft Edge DNS Chromebook admission canary
After=network-online.target evercraft-nodeseed.service
Requires=evercraft-nodeseed.service

[Service]
Type=simple
User=evercraft
Group=evercraft
EnvironmentFile=$ENV
WorkingDirectory=/opt/evercraft/forge-operator
ExecStart=$NODE_BIN /opt/evercraft/forge-operator/systemia/compute/edge-dns-bootstrap-resident.mjs
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$STATE_ROOT

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now evercraft-nodeseed.service evercraft-edge-dns-bootstrap.service
sleep 2
if ! systemctl is-active --quiet evercraft-nodeseed.service; then
  echo "ERROR: evercraft-nodeseed.service is not active after Edge promotion." >&2
  systemctl --no-pager --full status evercraft-nodeseed.service >&2 || true
  journalctl -u evercraft-nodeseed.service -n 80 --no-pager >&2 || true
  exit 6
fi
if ! systemctl is-active --quiet evercraft-edge-dns-bootstrap.service; then
  echo "ERROR: evercraft-edge-dns-bootstrap.service failed to stay active." >&2
  systemctl --no-pager --full status evercraft-edge-dns-bootstrap.service >&2 || true
  journalctl -u evercraft-edge-dns-bootstrap.service -n 100 --no-pager >&2 || true
  exit 7
fi

CAPACITY="$(curl -fsS --max-time 3 http://127.0.0.1:42420/v1/capacity)"
printf '%s' "$CAPACITY" | "$NODE_BIN" -e "
let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{
 const j=JSON.parse(s);
 if(!j.supported_workloads?.includes('systemia.evercraft-edge-dns.v1')) process.exit(5);
 console.log(JSON.stringify({ok:true,node_id:j.node_id,placement_labels:j.placement_labels,supports_edge_dns:true,attestation_supported:j.attestation_supported===true},null,2));
});"

echo
echo "Chromebook is now an Evercraft Edge DNS candidate NodeSeed."
echo "DNS candidate listens inside Linux on TCP+UDP 1053."
echo "public-ingress label is intentionally withheld until an external canary proves reachability."
