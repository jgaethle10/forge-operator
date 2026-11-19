#!/usr/bin/env bash
# Evercraft AIW: stage the original U.S. map with locally hosted Leaflet.
# Never changes existing ports 8786/8787/8790/8791/8792 or publishes anything.
set -euo pipefail

COMMIT="${1:?Usage: bash aiw-national-nextgen-map-v2.sh <approved immutable commit>}"
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]] || { echo "Immutable Git commit SHA required" >&2; exit 2; }

BASE="$HOME/evercraft-aiw-stage"
STATE="$HOME/.local/state/evercraft/aiw"
ROOT="$STATE/national-map-private"
PUBLIC="$ROOT/public"
VENDOR="$ROOT/vendor"
PORT=8793
GATE="$ROOT/national-gateway-interactive.py"
URL="http://127.0.0.1:$PORT"

echo "=== PRESERVE EXISTING SYSTEMS ==="
for unit in evercraft-aiw-api.service evercraft-aiw-operations.service evercraft-aiw-washington-2026.service; do
  systemctl --user is-active --quiet "$unit" || { echo "STOP: Existing service $unit is not active"; exit 1; }
done
systemctl --user is-active --quiet evercraft-aiw-heartbeat.timer
test -f "$PUBLIC/index.html"
test -f "$ROOT/owned-wa26-drilldown.js"
test -f "$STATE/official-fhwa-2026/WA26-independent.sqlite"
test -d "$BASE"
if ss -H -ltn "( sport = :$PORT )" | grep -q .; then
  echo "STOP: Port $PORT already occupied. Existing service left untouched."
  exit 1
fi

echo "=== FETCH IMMUTABLE EVERCRAFT GATEWAY ==="
cd "$BASE"
git fetch origin "$COMMIT"
test "$(git rev-parse FETCH_HEAD)" = "$COMMIT"
git show "$COMMIT:research/infrastructure-watch/engineering/aiw_national_private_gateway.py" > "$GATE"
python3 -m py_compile "$GATE"

echo "=== DOWNLOAD AND VERIFY STATIC, SELF-HOSTED MAP LIBRARY ==="
# These are third-party open-source SOURCE DISTRIBUTIONS, not hosted runtimes.
# All browser-executed map code is subsequently served by the owned gateway.
tmp="$(mktemp -d "$ROOT/.leaflet-stage.XXXXXXXX")"
cleanup(){ rm -rf "$tmp"; }
trap cleanup EXIT
curl -fLsS --retry 2 --connect-timeout 10 --max-time 45   "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js" -o "$tmp/leaflet.js"
curl -fLsS --retry 2 --connect-timeout 10 --max-time 45   "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css" -o "$tmp/leaflet.css"
curl -fLsS --retry 2 --connect-timeout 10 --max-time 45   "https://raw.githubusercontent.com/Leaflet/Leaflet/v1.9.4/LICENSE" -o "$tmp/LICENSE"

python3 - "$tmp" <<'PY'
import base64,hashlib,sys
from pathlib import Path
folder=Path(sys.argv[1])
expected={
  "leaflet.js":"20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=",
  "leaflet.css":"p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=",
}
for name,digest in expected.items():
  contents=(folder/name).read_bytes()
  actual=base64.b64encode(hashlib.sha256(contents).digest()).decode()
  if actual!=digest:
    raise SystemExit("STOP: official Leaflet 1.9.4 SRI mismatch: "+name)
  print(name,": official SHA-256 verified; bytes=",len(contents))
assert b"BSD 2-Clause" in (folder/"LICENSE").read_bytes()
print("License: present")
PY

mkdir -p "$VENDOR"
chmod 700 "$VENDOR"
for filename in leaflet.js leaflet.css LICENSE; do
  install -m 600 "$tmp/$filename" "$VENDOR/$filename"
done

echo "=== START INDEPENDENT NATIONAL MAP ON 8793 ==="
nohup python3 -u "$GATE"   --national-dir "$PUBLIC"   --overlay "$ROOT/owned-wa26-drilldown.js"   --db "$STATE/official-fhwa-2026/WA26-independent.sqlite"   --leaflet-dir "$VENDOR"   --port "$PORT"   > "$ROOT/national-gateway-interactive.log" 2>&1 < /dev/null &
new_pid=$!

echo "=== VERIFY PRIVATE ASSETS, REAL SOURCE API AND U.S. FRONT DOOR ==="
if ! python3 - "$URL" <<'PY'
import json,sys,time,urllib.request
url=sys.argv[1]
for attempt in range(12):
  try:
    with urllib.request.urlopen(url+"/healthz",timeout=3) as r: health=json.load(r)
    break
  except Exception:
    if attempt==11: raise
    time.sleep(1)
assert health["national_map"]=="original_preserved"
assert health["interactive_map_engine"]=="self_hosted_leaflet_1_9_4"
assert health["public_release_ready"] is False
assert health["national_2026_complete"] is False
with urllib.request.urlopen(url+"/",timeout=5) as r: html=r.read().decode()
assert 'Explore infrastructure across America' in html
assert '<script src="/vendor/leaflet.js"></script>' in html
assert '<link rel="stylesheet" href="/vendor/leaflet.css">' in html
for asset in ("/vendor/leaflet.js","/vendor/leaflet.css","/owned-wa26-drilldown.js"):
  with urllib.request.urlopen(url+asset,timeout=5) as r:
    assert r.status==200 and len(r.read())>100
with urllib.request.urlopen(url+"/api/wa26/summary",timeout=5) as r:
  wa=json.load(r)
assert wa["records"]==8619 and wa["conditions"]["P"]==403
print("NATIONAL U.S. PAGE: HTTP PASS")
print("OWNED INTERACTIVE MAP LIBRARY: SERVED + HASH VERIFIED")
print("WASHINGTON DEEP EVIDENCE: 8,619 VERIFIED")
print("PUBLIC RELEASE: DISABLED")
print("BROWSER VISUAL QUALITY: NOT YET REVIEWED")
PY
then
  echo "New gateway did not verify. Stopping ONLY spawned staging PID $new_pid."
  kill "$new_pid" 2>/dev/null || true
  exit 1
fi

printf '%s\n' "$new_pid" > "$ROOT/national-gateway-interactive.pid"
echo "PRIVATE MAP: $URL"
echo "Other Evercraft services and 8792 remained unchanged."
