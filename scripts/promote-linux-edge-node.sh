#!/usr/bin/env bash
set -euo pipefail
if [[ "${EUID}" -ne 0 ]]; then echo "Run with sudo." >&2; exit 2; fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="$(command -v node || true)"
[[ -n "$NODE_BIN" ]] || { echo "Node.js 22+ required" >&2; exit 3; }
[[ "${EVERCRAFT_EDGE_OPERATOR_AUTHORIZED:-}" == "true" ]] || {
  echo "HOLD: set EVERCRAFT_EDGE_OPERATOR_AUTHORIZED=true only after the machine owner explicitly authorizes this bounded Evercraft Edge role." >&2
  exit 10
}
FAILURE_DOMAIN="${EVERCRAFT_FAILURE_DOMAIN:-}"
[[ -n "$FAILURE_DOMAIN" ]] || { echo "HOLD: EVERCRAFT_FAILURE_DOMAIN is required." >&2; exit 11; }
[[ "$FAILURE_DOMAIN" != "home-wan-1" ]] || {
  echo "HOLD: second authoritative node must not share Penguin's home-wan-1 failure domain." >&2
  exit 12
}
[[ "$FAILURE_DOMAIN" =~ ^[a-zA-Z0-9._-]{3,128}$ ]] || { echo "Invalid EVERCRAFT_FAILURE_DOMAIN." >&2; exit 13; }

RELEASE_REF="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || true)"
[[ "$RELEASE_REF" =~ ^[a-f0-9]{40}$ ]] || { echo "Immutable git release ref unavailable" >&2; exit 4; }

export EVERCRAFT_NODE_ROLE=operator_authorized_public_edge
export EVERCRAFT_NODE_LABELS="operator-authorized,public-edge-candidate,gateway,evercraft-edge-dns,linux-edge"
export EVERCRAFT_ZERO_COST=true
export EVERCRAFT_FAILURE_DOMAIN="$FAILURE_DOMAIN"
export EVERCRAFT_NODE_ID="${EVERCRAFT_NODE_ID:-evercraft-$(hostname -s | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9._-')}"

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
EVERCRAFT_EDGE_DNS_QUERY_RECEIPTS=$SNAP_DIR/query-receipts.json
EVERCRAFT_EDGE_DNS_RECEIPT_QNAME=_evercraft.edge-canary.evercraftpropertyservices.com.
EVERCRAFT_NODESEED_LOCAL_ENDPOINT=http://127.0.0.1:42420
EOF
mv "$ENV.tmp" "$ENV"
chmod 0600 "$ENV"

cat > /etc/systemd/system/evercraft-edge-dns-bootstrap.service <<EOF
[Unit]
Description=Evercraft Edge DNS Linux admission canary
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
for unit in evercraft-nodeseed.service evercraft-edge-dns-bootstrap.service; do
  if ! systemctl is-active --quiet "$unit"; then
    echo "ERROR: $unit failed." >&2
    systemctl --no-pager --full status "$unit" >&2 || true
    journalctl -u "$unit" -n 100 --no-pager >&2 || true
    exit 14
  fi
done

curl -fsS http://127.0.0.1:42420/v1/capacity | "$NODE_BIN" -e "
let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{
 const j=JSON.parse(s);
 const ok=
   j.supported_workloads?.includes('systemia.evercraft-edge-dns.v1') &&
   j.failure_domain===process.argv[1] &&
   j.zero_cost===true &&
   j.public_ingress===false;
 console.log(JSON.stringify({
   ok,
   node_id:j.node_id,
   placement_labels:j.placement_labels,
   failure_domain:j.failure_domain,
   zero_cost:j.zero_cost,
   public_ingress:j.public_ingress,
   supports_edge_dns:j.supported_workloads?.includes('systemia.evercraft-edge-dns.v1'),
   attestation_supported:j.attestation_supported===true
 },null,2));
 if(!ok)process.exit(15);
});" "$FAILURE_DOMAIN"

echo
echo "Linux host is now an attested Evercraft Edge DNS candidate NodeSeed."
echo "Failure domain: $FAILURE_DOMAIN"
echo "public-ingress remains withheld until external TCP/UDP DNS proof passes."
