#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo." >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_USER="${SUDO_USER:-$(stat -c '%U' "$REPO_ROOT")}"
ROUTER_ENV=/etc/evercraft/router-map.env
NODE_ENV=/etc/evercraft/nodeseed.env
DNS_CANARY=edge-canary.evercraftpropertyservices.com.
WORKFLOW=evercraft-edge-dns-canary.yml
REPO=jgaethle10/forge-operator

echo "[1/6] Promoting Chromebook into an attested Edge DNS candidate NodeSeed..."
bash "$REPO_ROOT/scripts/promote-chromebook-edge-node.sh"

echo "[2/6] Verifying DNS inside Crostini..."
node "$REPO_ROOT/infra/evercraft-edge/dns/probe.mjs"   --server 127.0.0.1 --port 1053 --name "$DNS_CANARY" >/tmp/evercraft-edge-dns-local-canary.json

if [[ ! -f "$ROUTER_ENV" ]]; then
  echo "HOLD: router-map configuration is missing at $ROUTER_ENV" >&2
  echo "The Chromebook is now an Edge DNS candidate, but the WAN mapping cannot be created yet." >&2
  exit 20
fi

# shellcheck disable=SC1090
source "$ROUTER_ENV"

echo "[3/6] Reasserting DNS-only WAN mappings: TCP+UDP 53 -> Chromebook 1053..."
set +e
node "$REPO_ROOT/scripts/evercraft-public-edge-map.mjs" \
  --gateway "$EVERCRAFT_ROUTER_GATEWAY" \
  --host "$EVERCRAFT_ROUTER_LAN_HOST" \
  --scope dns >/tmp/evercraft-edge-router-map.log 2>&1
MAP_RC=$?
set -e
if [[ "$MAP_RC" -ne 0 ]]; then
  cat /tmp/evercraft-edge-router-map.log >&2 || true
  echo
  echo "HOLD: automatic WAN DNS mapping did not succeed."
  echo "The Crostini-to-ChromeOS LAN self-probe is advisory only and is no longer treated as proof."
  echo "ChromeOS should still have 1053 TCP and 1053 UDP enabled under Linux port forwarding."
  echo "The router must map public TCP+UDP 53 to Chromebook TCP+UDP 1053."
  echo "The mapper attempted UPnP-IGD, NAT-PMP, and PCP; inspect the attempts above for the actual router boundary."
  exit 20
fi
echo "[router mapping receipt]"
cat /tmp/evercraft-edge-router-map.log

PUBLIC_IP="$(curl -4fsS --max-time 8 https://api.ipify.org || true)"
if [[ -z "$PUBLIC_IP" ]]; then
  echo "HOLD: public IPv4 could not be observed." >&2
  exit 21
fi

echo "[4/6] Public candidate IP observed locally."

EDGE_STATE_DIR=/var/lib/evercraft/nodeseed/edge-dns
REQUEST_FILE="$EDGE_STATE_DIR/external-canary-request.json"
install -d -o evercraft -g evercraft -m 0750 "$EDGE_STATE_DIR"

CAPACITY_JSON="$(curl -fsS --max-time 3 http://127.0.0.1:42420/v1/capacity)"
NODE_ID="$(printf '%s' "$CAPACITY_JSON" | node -e "
let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{
 const j=JSON.parse(s); if(!j.node_id)process.exit(2); process.stdout.write(String(j.node_id));
});")"
MAPPING_METHOD="$(node -e "
const fs=require('fs');
try{const j=JSON.parse(fs.readFileSync('/tmp/evercraft-edge-router-map.log','utf8'));process.stdout.write(String(j.method||'unknown'))}catch{process.stdout.write('unknown')}
")"

REQUEST_ID=""
if [[ -f "$REQUEST_FILE" ]]; then
  REQUEST_ID="$(node -e "
const fs=require('fs');
try{
 const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
 if(j.schema==='evercraft.edge.external-canary-request.v1' &&
    j.node_id===process.argv[2] &&
    j.public_ipv4===process.argv[3] &&
    j.canary_name===process.argv[4] &&
    /^[a-f0-9]{32}$/.test(String(j.request_id||''))) process.stdout.write(j.request_id);
}catch{}
" "$REQUEST_FILE" "$NODE_ID" "$PUBLIC_IP" "$DNS_CANARY")"
fi

if [[ -z "$REQUEST_ID" ]]; then
  REQUEST_ID="$(node -e "process.stdout.write(require('crypto').randomBytes(16).toString('hex'))")"
  node -e "
const fs=require('fs');
const body={
 schema:'evercraft.edge.external-canary-request.v1',
 request_id:process.argv[2],
 node_id:process.argv[3],
 public_ipv4:process.argv[4],
 canary_name:process.argv[5],
 router_mapping_method:process.argv[6],
 requested_transports:['udp/53','tcp/53'],
 created_at:new Date().toISOString()
};
fs.writeFileSync(process.argv[1],JSON.stringify(body,null,2)+'\\n',{mode:0o600});
" "$REQUEST_FILE" "$REQUEST_ID" "$NODE_ID" "$PUBLIC_IP" "$DNS_CANARY" "$MAPPING_METHOD"
  chown evercraft:evercraft "$REQUEST_FILE"
  chmod 0600 "$REQUEST_FILE"
fi

GRANT_FILE="$REPO_ROOT/infra/evercraft-edge/registry/public-ingress-grants/$REQUEST_ID.json"
echo "[5/6] Checking for independent external canary grant..."
if [[ ! -f "$GRANT_FILE" ]]; then
  echo "HOLD: external verifier has not granted public ingress yet."
  echo "EXTERNAL_CANARY_REQUEST_ID=$REQUEST_ID"
  echo "NODE_ID=$NODE_ID"
  echo "CANARY_NAME=$DNS_CANARY"
  echo "ROUTER_MAPPING_METHOD=$MAPPING_METHOD"
  echo "Public IPv4 remains only in local state: $REQUEST_FILE"
  echo "Node remains public-edge-candidate."
  exit 26
fi

set +e
node -e "
const fs=require('fs');
const g=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
const ok=
 g.schema==='evercraft.edge.public-ingress-grant.v1' &&
 g.request_id===process.argv[2] &&
 g.node_id===process.argv[3] &&
 g.canary_name===process.argv[4] &&
 g.verified===true &&
 g.udp_53_verified===true &&
 g.tcp_53_verified===true &&
 typeof g.evidence_ref==='string' &&
 g.evidence_ref.length>0;
if(!ok){
 console.error(JSON.stringify({ok:false,grant:g},null,2));
 process.exit(2);
}
console.log(JSON.stringify({ok:true,request_id:g.request_id,node_id:g.node_id,verified:g.verified,evidence_ref:g.evidence_ref,verified_at:g.verified_at},null,2));
" "$GRANT_FILE" "$REQUEST_ID" "$NODE_ID" "$DNS_CANARY"
GRANT_RC=$?
set -e
if [[ "$GRANT_RC" -ne 0 ]]; then
  echo "HOLD: external canary grant exists but failed admission checks." >&2
  exit 27
fi

echo "[6/6] External canary passed. Promoting placement label to public-ingress..."
CURRENT_LABELS="$(awk -F= '/^EVERCRAFT_NODE_LABELS=/{print substr($0,index($0,"=")+1)}' "$NODE_ENV")"
PROMOTED="$(printf '%s' "$CURRENT_LABELS" | tr ',' '\n' | grep -v '^public-edge-candidate$' | sed '/^$/d' | sort -u | paste -sd, -)"
case ",$PROMOTED," in
  *,public-ingress,*) ;;
  *) PROMOTED="${PROMOTED:+$PROMOTED,}public-ingress" ;;
esac
TMP="$NODE_ENV.tmp"
grep -v '^EVERCRAFT_NODE_LABELS=' "$NODE_ENV" > "$TMP"
printf 'EVERCRAFT_NODE_LABELS=%s\n' "$PROMOTED" >> "$TMP"
mv "$TMP" "$NODE_ENV"
chmod 0600 "$NODE_ENV"

systemctl restart evercraft-nodeseed.service
sleep 2
systemctl restart evercraft-edge-dns-bootstrap.service
sleep 2

install -d -o evercraft -g evercraft -m 0750 /var/lib/evercraft/nodeseed/edge-dns
cat > /var/lib/evercraft/nodeseed/edge-dns/public-ingress-receipt.json <<EOF
{
  "schema":"evercraft.edge.chromebook-public-ingress.v1",
  "state":"verified",
  "public_ipv4":"$PUBLIC_IP",
  "external_canary_request_id":"$REQUEST_ID",
  "external_canary_grant_ref":"infra/evercraft-edge/registry/public-ingress-grants/$REQUEST_ID.json",
  "udp_53_verified":true,
  "tcp_53_verified":true,
  "placement_label":"public-ingress",
  "verified_at":"$(date -u +%FT%TZ)"
}
EOF
chown evercraft:evercraft /var/lib/evercraft/nodeseed/edge-dns/public-ingress-receipt.json
chmod 0600 /var/lib/evercraft/nodeseed/edge-dns/public-ingress-receipt.json

curl -fsS http://127.0.0.1:42420/v1/capacity | node -e "
let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{
 const j=JSON.parse(s);
 const ok=j.placement_labels?.includes('public-ingress')&&j.supported_workloads?.includes('systemia.evercraft-edge-dns.v1');
 console.log(JSON.stringify({ok,node_id:j.node_id,placement_labels:j.placement_labels,supports_edge_dns:j.supported_workloads?.includes('systemia.evercraft-edge-dns.v1'),attestation_supported:j.attestation_supported===true},null,2));
 if(!ok)process.exit(3);
});"

echo
echo "PASS: this Chromebook is now an attested Evercraft Edge DNS public-ingress NodeSeed."
echo "Saban may discover it for systemia.evercraft-edge-dns.v1 placement."
