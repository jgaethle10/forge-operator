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

PUBLIC_IP="$(curl -4fsS --max-time 8 https://api.ipify.org || true)"
if [[ -z "$PUBLIC_IP" ]]; then
  echo "HOLD: public IPv4 could not be observed." >&2
  exit 21
fi

echo "[4/6] Public candidate IP: $PUBLIC_IP"
if ! command -v gh >/dev/null 2>&1; then
  echo "HOLD: GitHub CLI is unavailable, so the independent outside-network canary cannot be dispatched." >&2
  exit 22
fi
if ! runuser -u "$RUN_USER" -- gh auth status -h github.com >/dev/null 2>&1; then
  echo "HOLD: GitHub CLI is not authenticated for the runtime user." >&2
  exit 23
fi

echo "[5/6] Dispatching independent GitHub UDP/TCP 53 canary..."
START_EPOCH="$(date -u +%s)"
runuser -u "$RUN_USER" -- gh workflow run "$WORKFLOW" --repo "$REPO"   -f server_ip="$PUBLIC_IP" -f name="$DNS_CANARY"

RUN_ID=""
for _ in $(seq 1 30); do
  RUN_JSON="$(runuser -u "$RUN_USER" -- gh run list --repo "$REPO" --workflow "$WORKFLOW" --event workflow_dispatch --limit 5 --json databaseId,createdAt,status,conclusion 2>/dev/null || true)"
  RUN_ID="$(printf '%s' "$RUN_JSON" | node -e "
let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{
 try{
  const start=Number(process.argv[1]);
  const rows=JSON.parse(s);
  const row=rows.find(x=>Date.parse(x.createdAt)/1000>=start-5);
  if(row)process.stdout.write(String(row.databaseId));
 }catch{}
});" "$START_EPOCH")"
  [[ -n "$RUN_ID" ]] && break
  sleep 2
done
if [[ -z "$RUN_ID" ]]; then
  echo "HOLD: external canary was dispatched but its run could not be resolved." >&2
  exit 24
fi

set +e
runuser -u "$RUN_USER" -- gh run watch "$RUN_ID" --repo "$REPO" --exit-status
CANARY_RC=$?
set -e
if [[ "$CANARY_RC" -ne 0 ]]; then
  echo "HOLD: the internet cannot yet verify this Chromebook over both UDP and TCP port 53." >&2
  echo "Node remains public-edge-candidate. Saban will not receive a false public-ingress claim." >&2
  exit 25
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
  "external_canary_run_id":"$RUN_ID",
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
