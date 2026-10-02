#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo." >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_ROOT="${EVERCRAFT_NODESEED_ROOT:-/var/lib/evercraft/nodeseed}"
EDGE_STATE_DIR="$STATE_ROOT/edge-dns"
DNS_CANARY=edge-canary.evercraftpropertyservices.com.
IDENTITY_NAME="_evercraft.$DNS_CANARY"
EXPECTED_TXT="service=evercraft://edge/canary"
PUBLIC_IP="${EVERCRAFT_PUBLIC_IP:-}"

if [[ -z "$PUBLIC_IP" ]]; then
  PUBLIC_IP="$(curl -4fsS --max-time 8 https://api.ipify.org || true)"
fi
[[ "$PUBLIC_IP" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || {
  echo "HOLD: public IPv4 could not be observed." >&2
  exit 10
}

install -d -o evercraft -g evercraft -m 0750 "$EDGE_STATE_DIR"
TMP="$EDGE_STATE_DIR/direct-tcp-authority.json.tmp"
OUT="$EDGE_STATE_DIR/direct-tcp-authority.json"

set +e
node "$REPO_ROOT/infra/evercraft-edge/dns/direct-tcp-authority.mjs" \
  --server "$PUBLIC_IP" \
  --name "$IDENTITY_NAME" \
  --expected-txt "$EXPECTED_TXT" > "$TMP"
RC=$?
set -e

if [[ -s "$TMP" ]]; then
  mv "$TMP" "$OUT"
  chown evercraft:evercraft "$OUT"
  chmod 0600 "$OUT"
else
  rm -f "$TMP"
fi

if [[ "$RC" -ne 0 ]]; then
  echo "HOLD: direct external DNS-over-TCP authority proof failed."
  [[ -f "$OUT" ]] && node -e "
const fs=require('fs');
const r=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
console.log(JSON.stringify({
  verified:r.verified,
  transport:r.transport,
  source_surface:r.source_surface,
  http_status:r.http_status,
  parsed:r.parsed,
  excerpt:r.evidence_excerpt?.slice(0,1200)||null
},null,2));
" "$OUT"
  exit 11
fi

node -e "
const fs=require('fs');
const r=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
if(r.verified!==true||r.transport!=='tcp53')process.exit(2);
console.log(JSON.stringify({
  verified:true,
  transport:r.transport,
  source_surface:r.source_surface,
  aa:r.parsed?.aa===true,
  ra:r.parsed?.ra===true,
  noerror:r.parsed?.noerror===true,
  has_expected_txt:r.parsed?.has_expected_txt===true,
  observed_at:r.observed_at
},null,2));
" "$OUT"

echo "PASS: direct external DNS-over-TCP authority proof stored locally at $OUT"
echo "Public IP is not written into the receipt."
