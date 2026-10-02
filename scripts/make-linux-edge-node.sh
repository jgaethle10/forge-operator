#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo." >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DNS_CANARY=edge-canary.evercraftpropertyservices.com.
NODE_ENV=/etc/evercraft/nodeseed.env
EDGE_STATE_DIR=/var/lib/evercraft/nodeseed/edge-dns
FAILURE_DOMAIN="${EVERCRAFT_FAILURE_DOMAIN:-}"

[[ "${EVERCRAFT_EDGE_OPERATOR_AUTHORIZED:-}" == "true" ]] || {
  echo "HOLD: explicit current owner authorization is required." >&2
  exit 10
}
[[ -n "$FAILURE_DOMAIN" ]] || { echo "HOLD: EVERCRAFT_FAILURE_DOMAIN is required." >&2; exit 11; }
[[ "$FAILURE_DOMAIN" != "home-wan-1" ]] || {
  echo "HOLD: second node must be outside Penguin's home-wan-1 failure domain." >&2
  exit 12
}

echo "[1/6] Promoting Linux host into an attested Edge DNS candidate NodeSeed..."
bash "$REPO_ROOT/scripts/promote-linux-edge-node.sh"

echo "[2/6] Verifying DNS locally over UDP+TCP..."
node "$REPO_ROOT/infra/evercraft-edge/dns/probe.mjs" \
  --server 127.0.0.1 --port 1053 --name "_evercraft.$DNS_CANARY" \
  >/tmp/evercraft-edge-dns-local-canary.json

GATEWAY="${EVERCRAFT_ROUTER_GATEWAY:-}"
LAN_HOST="${EVERCRAFT_ROUTER_LAN_HOST:-}"
if [[ -z "$GATEWAY" ]]; then
  GATEWAY="$(ip -4 route show default 2>/dev/null | awk 'NR==1{print $3}')"
fi
if [[ -z "$LAN_HOST" ]]; then
  LAN_HOST="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++)if($i=="src"){print $(i+1);exit}}')"
fi
if [[ -z "$LAN_HOST" ]]; then
  LAN_HOST="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi
[[ -n "$GATEWAY" && -n "$LAN_HOST" ]] || {
  echo "HOLD: could not determine router gateway/LAN host. Set EVERCRAFT_ROUTER_GATEWAY and EVERCRAFT_ROUTER_LAN_HOST." >&2
  exit 20
}

echo "[3/6] Mapping WAN TCP+UDP 53 to Linux DNS 1053..."
set +e
node "$REPO_ROOT/scripts/evercraft-public-edge-map.mjs" \
  --gateway "$GATEWAY" \
  --host "$LAN_HOST" \
  --scope dns >/tmp/evercraft-edge-router-map.log 2>&1
MAP_RC=$?
set -e
cat /tmp/evercraft-edge-router-map.log
if [[ "$MAP_RC" -ne 0 ]]; then
  echo
  echo "HOLD: automatic WAN mapping failed. The node stays a candidate."
  exit 20
fi

PUBLIC_IP="$(curl -4fsS --max-time 8 https://api.ipify.org || true)"
[[ -n "$PUBLIC_IP" ]] || { echo "HOLD: public IPv4 could not be observed." >&2; exit 21; }

echo "[4/6] Public candidate IP observed locally."
EXTERNAL_RECEIPT="$EDGE_STATE_DIR/external-public-verification.json"
IDENTITY_NAME="_evercraft.$DNS_CANARY"
EXPECTED_TXT="service=evercraft://edge/canary"
install -d -o evercraft -g evercraft -m 0750 "$EDGE_STATE_DIR"

echo "[5/6] Running independent external DNS verification..."
set +e
node "$REPO_ROOT/infra/evercraft-edge/dns/external-public-verifier.mjs" \
  --server "$PUBLIC_IP" \
  --name "$IDENTITY_NAME" \
  --expected-txt "$EXPECTED_TXT" \
  --receipt-path "$EDGE_STATE_DIR/query-receipts.json" \
  --local-proof /tmp/evercraft-edge-dns-local-canary.json \
  > "$EXTERNAL_RECEIPT.tmp"
VERIFY_RC=$?
set -e

if [[ -s "$EXTERNAL_RECEIPT.tmp" ]]; then
  mv "$EXTERNAL_RECEIPT.tmp" "$EXTERNAL_RECEIPT"
  chown evercraft:evercraft "$EXTERNAL_RECEIPT"
  chmod 0600 "$EXTERNAL_RECEIPT"
else
  rm -f "$EXTERNAL_RECEIPT.tmp"
fi

if [[ "$VERIFY_RC" -ne 0 ]]; then
  echo "HOLD: independent external DNS verification did not pass."
  if [[ -f "$EXTERNAL_RECEIPT" ]]; then
    node -e "
const fs=require('fs');
const r=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
console.log(JSON.stringify({
  verified:r.verified,
  classification:r.classification,
  runtime_identity_verified:r.runtime_identity?.verified===true,
  runtime_identity_matches:r.runtime_identity?.match_count||0,
  runtime_identity_distinct_sources:r.runtime_identity?.distinct_remote_addresses||0,
  local_protocol_verified:r.local_protocol_proof?.verified===true,
  tcp_proof_mode:r.tcp_proof_mode||null,
  tcp53_successes:r.distributed?.tcp53?.success_count||0,
  udp53_successes:r.distributed?.udp53?.success_count||0
},null,2));
" "$EXTERNAL_RECEIPT"
  fi
  echo "Node remains public-edge-candidate."
  exit 25
fi

node -e "
const fs=require('fs');
const r=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
if(r.verified!==true)process.exit(2);
console.log(JSON.stringify({
  verified:true,
  classification:r.classification,
  runtime_identity_verified:r.runtime_identity?.verified===true,
  runtime_identity_matches:r.runtime_identity?.match_count||0,
  runtime_identity_distinct_sources:r.runtime_identity?.distinct_remote_addresses||0,
  local_protocol_verified:r.local_protocol_proof?.verified===true,
  tcp53_successes:r.distributed?.tcp53?.success_count||0,
  udp53_successes:r.distributed?.udp53?.success_count||0,
  observed_at:r.observed_at
},null,2));
" "$EXTERNAL_RECEIPT"

echo "[6/6] External canary passed. Promoting Linux node to public-ingress..."
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

NODE_ID="$(curl -fsS http://127.0.0.1:42420/v1/capacity | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>process.stdout.write(JSON.parse(s).node_id||''))")"

cat > "$EDGE_STATE_DIR/public-ingress-receipt.json" <<EOF
{
  "schema":"evercraft.edge.linux-public-ingress.v1",
  "state":"verified",
  "node_id":"$NODE_ID",
  "failure_domain":"$FAILURE_DOMAIN",
  "zero_cost":true,
  "external_verification_receipt":"$EXTERNAL_RECEIPT",
  "external_identity_name":"$IDENTITY_NAME",
  "udp_53_verified":true,
  "tcp_53_verified":true,
  "placement_label":"public-ingress",
  "public_ip_persisted":false,
  "verified_at":"$(date -u +%FT%TZ)"
}
EOF
chown evercraft:evercraft "$EDGE_STATE_DIR/public-ingress-receipt.json"
chmod 0600 "$EDGE_STATE_DIR/public-ingress-receipt.json"

curl -fsS http://127.0.0.1:42420/v1/capacity | node -e "
let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{
 const j=JSON.parse(s);
 const ok=
   j.placement_labels?.includes('public-ingress') &&
   j.supported_workloads?.includes('systemia.evercraft-edge-dns.v1') &&
   j.failure_domain===process.argv[1] &&
   j.zero_cost===true &&
   j.public_ingress===true;
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
 if(!ok)process.exit(3);
});" "$FAILURE_DOMAIN"

echo
echo "PASS: Linux host is now an attested Evercraft Edge DNS public-ingress NodeSeed."
echo "Saban may consider it only if its failure domain is distinct from every selected authoritative replica."
