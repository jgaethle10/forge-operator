#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo." >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV=/etc/evercraft/nodeseed.env
[[ -f "$ENV" ]] || { echo "HOLD: NodeSeed environment missing." >&2; exit 10; }

CURRENT_LABELS="$(awk -F= '/^EVERCRAFT_NODE_LABELS=/{print substr($0,index($0,"=")+1)}' "$ENV")"
case ",$CURRENT_LABELS," in
  *,public-ingress,*) ;;
  *) echo "HOLD: Penguin has not earned public-ingress." >&2; exit 11 ;;
esac

TMP="$ENV.tmp"
grep -v -E '^(EVERCRAFT_FAILURE_DOMAIN|EVERCRAFT_ZERO_COST)=' "$ENV" > "$TMP"
printf 'EVERCRAFT_FAILURE_DOMAIN=home-wan-1\n' >> "$TMP"
printf 'EVERCRAFT_ZERO_COST=true\n' >> "$TMP"
mv "$TMP" "$ENV"
chmod 0600 "$ENV"

systemctl restart evercraft-nodeseed.service
sleep 2
systemctl is-active --quiet evercraft-nodeseed.service || {
  systemctl --no-pager --full status evercraft-nodeseed.service >&2 || true
  exit 12
}

echo "[1/2] Verifying Penguin placement metadata..."
curl -fsS http://127.0.0.1:42420/v1/capacity | node -e "
let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{
 const j=JSON.parse(s);
 const ok=
  j.node_id==='evercraft-penguin' &&
  j.failure_domain==='home-wan-1' &&
  j.zero_cost===true &&
  j.public_ingress===true &&
  j.placement_labels?.includes('public-ingress');
 console.log(JSON.stringify({
  ok,
  node_id:j.node_id,
  failure_domain:j.failure_domain,
  zero_cost:j.zero_cost,
  public_ingress:j.public_ingress,
  placement_labels:j.placement_labels
 },null,2));
 if(!ok)process.exit(3);
});"

echo "[2/2] Proving direct external DNS-over-TCP authority..."
bash "$REPO_ROOT/scripts/prove-edge-direct-tcp-authority.sh"

echo
echo "PASS: Penguin now carries placement metadata plus direct external TCP authority proof."
