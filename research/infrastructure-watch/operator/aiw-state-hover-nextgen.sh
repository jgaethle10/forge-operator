#!/usr/bin/env bash
# A/B preview for source-dated hover cards, without disturbing 8794 or any other app.
set -euo pipefail

COMMIT="${1:?Usage: bash aiw-state-hover-nextgen.sh <full immutable GitHub commit>}"
[[ "$COMMIT" =~ ^[a-f0-9]{40}$ ]] || { echo "Full 40-character commit required"; exit 2; }

BASE="$HOME/evercraft-aiw-stage"
STATE="$HOME/.local/state/evercraft/aiw"
ROOT="$STATE/national-map-private"
STATE_FIRST="$ROOT/state-first"
HOVER="$ROOT/state-hover-preview"
PORT=8795
URL="http://127.0.0.1:$PORT"

echo "=== PRESERVE ORIGINAL NATIONAL MAP AND ALL EVERCRAFT SERVICES ==="
test -d "$BASE"
test -f "$ROOT/public/index.html"
test -f "$ROOT/owned-wa26-drilldown.js"
test -f "$ROOT/vendor/leaflet.js"
test -f "$ROOT/vendor/leaflet.css"
test -f "$ROOT/vendor/LICENSE"
test -f "$STATE_FIRST/states-v3.0.1.geojson"
test -f "$STATE/official-fhwa-2026/WA26-independent.sqlite"
curl -fsS --max-time 5 http://127.0.0.1:8794/healthz \
  | python3 -c 'import json,sys;d=json.load(sys.stdin);assert d["status"]=="ready" and d["state_polygons"]==56'
if ss -H -ltn "( sport = :$PORT )" | grep -q .; then
  echo "STOP: port $PORT occupied. No process stopped or replaced."
  exit 1
fi

echo "=== STAGE REVISED HOVER EXPERIENCE ==="
mkdir -p "$HOVER"
chmod 700 "$HOVER"
cd "$BASE"
git fetch origin "$COMMIT"
test "$(git rev-parse FETCH_HEAD)" = "$COMMIT"
for item in \
  "research/infrastructure-watch/engineering/aiw_national_private_gateway.py:aiw_national_private_gateway.py" \
  "research/infrastructure-watch/engineering/aiw_state_first_gateway.py:aiw_state_first_gateway.py" \
  "research/infrastructure-watch/operator/aiw-state-first-private.html:state-first-hover.html"; do
  git show "$COMMIT:${item%%:*}" > "$HOVER/${item#*:}"
done

python3 -m py_compile "$HOVER/aiw_national_private_gateway.py" "$HOVER/aiw_state_first_gateway.py"
python3 - "$HOVER/state-first-hover.html" <<'PY'
from pathlib import Path
import sys
page=Path(sys.argv[1]).read_text()
assert "function hoverPreview(name)" in page
assert "layer.bindTooltip(()=>hoverPreview(name)" in page
assert "layer.on('click'" in page
print("Hover preview code: STAGED")
PY

echo "=== START ISOLATED PRIVATE HOVER PREVIEW (8795) ==="
nohup python3 -u "$HOVER/aiw_state_first_gateway.py" \
  --national-dir "$ROOT/public" \
  --overlay "$ROOT/owned-wa26-drilldown.js" \
  --db "$STATE/official-fhwa-2026/WA26-independent.sqlite" \
  --leaflet-dir "$ROOT/vendor" \
  --state-geojson "$STATE_FIRST/states-v3.0.1.geojson" \
  --simple-html "$HOVER/state-first-hover.html" \
  --port "$PORT" \
  > "$HOVER/gateway.log" 2>&1 < /dev/null &
NEW_PID=$!

if ! python3 - "$URL" <<'PY'
import json,sys,time,urllib.request
url=sys.argv[1]
for i in range(12):
    try:
        with urllib.request.urlopen(url+"/healthz",timeout=3) as res:health=json.load(res)
        break
    except Exception:
        if i==11:raise
        time.sleep(1)
assert health["status"]=="ready"
assert health["state_polygons"]==56
assert health["washington_2026_records"]==8619
assert health["public_release_ready"] is False
with urllib.request.urlopen(url,timeout=5) as res:page=res.read().decode()
assert 'function hoverPreview(name)' in page
assert 'layer.bindTooltip(()=>hoverPreview(name)' in page
assert '<script src="/vendor/leaflet.js"></script>' in page
with urllib.request.urlopen(url+"/api/states",timeout=5) as res:states=json.load(res)
assert len(states["states"])==52
with urllib.request.urlopen(url+"/api/wa26/summary",timeout=5) as res:wa=json.load(res)
assert wa["records"]==8619 and wa["conditions"]["P"]==403
with urllib.request.urlopen(url+"/advanced",timeout=5) as res:advanced=res.read().decode()
assert 'Explore infrastructure across America' in advanced
print("HOVER PREVIEW PAGE: HTTP PASS")
print("STATE SUMMARIES: 52")
print("WASHINGTON 2026 SOURCE: 8,619")
print("ORIGINAL ADVANCED MAP: PRESERVED")
print("VISUAL HOVER BEHAVIOR: REQUIRES BROWSER REVIEW")
print("PUBLIC RELEASE: DISABLED")
PY
then
  echo "STOP: new preview did not pass. Existing 8794 and other services untouched."
  kill "$NEW_PID" 2>/dev/null || true
  tail -n 20 "$HOVER/gateway.log" || true
  exit 1
fi
printf '%s\n' "$NEW_PID" > "$HOVER/gateway.pid"
echo "HOVER PREVIEW: $URL"
echo "EXISTING MAP: http://127.0.0.1:8794"
echo "All other services preserved."
