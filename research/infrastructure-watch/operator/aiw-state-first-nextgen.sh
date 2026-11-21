#!/usr/bin/env bash
set -euo pipefail
COMMIT="${1:?Usage: bash aiw-state-first-nextgen.sh <full-github-commit>}"
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]] || { echo "STOP: 40-character Git commit required" >&2; exit 2; }
BASE="$HOME/evercraft-aiw-stage"
STATE="$HOME/.local/state/evercraft/aiw"
ROOT="$STATE/national-map-private"
STAGE="$ROOT/state-first"
PORT=8794
URL="http://127.0.0.1:$PORT"
DATA_URL="https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json"
MAP_SOURCE="$STAGE/states-10m.us-atlas-v3.0.1.json"
GEOJSON="$STAGE/states-v3.0.1.geojson"

echo "=== VERIFY EXISTING EVERCRAFT SYSTEMS ==="
for unit in evercraft-aiw-api.service evercraft-aiw-operations.service evercraft-aiw-washington-2026.service; do
  systemctl --user is-active --quiet "$unit" || { echo "STOP: $unit unhealthy"; exit 1; }
done
systemctl --user is-active --quiet evercraft-aiw-heartbeat.timer
for port in 8793 8790; do
  ss -H -ltn "( sport = :$port )" | grep -q . || { echo "STOP: $port not listening"; exit 1; }
done
if ss -H -ltn "( sport = :$PORT )" | grep -q .; then
  echo "STOP: staging port $PORT occupied. No changes made."
  exit 1
fi
test -f "$ROOT/public/index.html"
test -f "$ROOT/owned-wa26-drilldown.js"
test -f "$ROOT/vendor/leaflet.js"
test -f "$ROOT/vendor/leaflet.css"
test -f "$ROOT/vendor/LICENSE"
test -f "$STATE/official-fhwa-2026/WA26-independent.sqlite"
mkdir -p "$STAGE"
chmod 700 "$STAGE"

echo "=== FETCH IMMUTABLE EVERCRAFT CODE ==="
cd "$BASE"
git fetch origin "$COMMIT"
test "$(git rev-parse FETCH_HEAD)" = "$COMMIT"
for entry in \
  'research/infrastructure-watch/engineering/aiw_state_geometry.py:aiw_state_geometry.py' \
  'research/infrastructure-watch/engineering/aiw_state_first_gateway.py:aiw_state_first_gateway.py' \
  'research/infrastructure-watch/operator/aiw-state-first-private.html:state-first.html' \
  'research/infrastructure-watch/engineering/aiw_national_private_gateway.py:aiw_national_private_gateway.py'; do
  git show "$COMMIT:${entry%%:*}" > "$STAGE/${entry#*:}"
done
python3 -m py_compile "$STAGE/aiw_state_geometry.py" "$STAGE/aiw_state_first_gateway.py" "$STAGE/aiw_national_private_gateway.py"

echo "=== ACQUIRE PUBLISHED STATE GEOMETRY AS STATIC DATA ONLY ==="
if [ ! -f "$MAP_SOURCE" ]; then
  TEMP_FILE="$(mktemp "$STAGE/.states-topojson-XXXXXX")"
  trap 'rm -f "$TEMP_FILE"' EXIT
  curl -fLsS --retry 2 --connect-timeout 10 --max-time 60 "$DATA_URL" -o "$TEMP_FILE"
  python3 - "$TEMP_FILE" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]);data=json.loads(p.read_text())
assert data['type']=='Topology' and 'states' in data['objects']
assert len(data['objects']['states']['geometries'])>=50
assert p.stat().st_size<1_000_000
print('Geographic source validated:',p.stat().st_size,'bytes')
PY
  chmod 600 "$TEMP_FILE"
  mv -n "$TEMP_FILE" "$MAP_SOURCE"
fi
if [ ! -f "$STAGE/us-atlas-LICENSE" ]; then
  curl -fLsS --retry 2 --connect-timeout 10 --max-time 30 \
    'https://raw.githubusercontent.com/topojson/us-atlas/master/LICENSE' \
    -o "$STAGE/us-atlas-LICENSE"
  chmod 600 "$STAGE/us-atlas-LICENSE"
fi

echo "=== CONVERT CENSUS-DERIVED BOUNDARIES LOCALLY ==="
if [ ! -f "$GEOJSON" ]; then
  python3 "$STAGE/aiw_state_geometry.py" --source "$MAP_SOURCE" --dest "$GEOJSON"
else
  echo "Existing GeoJSON kept, no overwrite."
fi
chmod 600 "$MAP_SOURCE" "$GEOJSON"

echo "=== START PRIVATE STATE-FIRST NATIONAL MAP ==="
nohup python3 -u "$STAGE/aiw_state_first_gateway.py" \
  --national-dir "$ROOT/public" \
  --overlay "$ROOT/owned-wa26-drilldown.js" \
  --db "$STATE/official-fhwa-2026/WA26-independent.sqlite" \
  --leaflet-dir "$ROOT/vendor" \
  --state-geojson "$GEOJSON" \
  --simple-html "$STAGE/state-first.html" \
  --port "$PORT" \
  > "$STAGE/gateway.log" 2>&1 < /dev/null &
PID=$!

if ! python3 - "$URL" <<'PY'
import json,time,sys,urllib.request
u=sys.argv[1]
for i in range(12):
  try:
    with urllib.request.urlopen(u+'/healthz',timeout=3) as r: health=json.load(r)
    break
  except Exception:
    if i==11:raise
    time.sleep(1)
assert health['status']=='ready' and health['public_release_ready'] is False
assert health['state_polygons']>=50 and health['washington_2026_records']==8619
with urllib.request.urlopen(u,timeout=4) as r: page=r.read().decode()
assert 'Explore America.' in page and '/data/states.geojson' in page
with urllib.request.urlopen(u+'/api/states',timeout=5) as r:states=json.load(r)
assert states['scope']=='national_state_summaries_FHWA_2025'
assert len(states['states'])>=50
assert any(s['name']=='Washington' for s in states['states'])
with urllib.request.urlopen(u+'/data/states.geojson',timeout=5) as r:geo=json.load(r)
assert geo['type']=='FeatureCollection' and len(geo['features'])>=50
assert any(f['properties']['name']=='Washington' for f in geo['features'])
with urllib.request.urlopen(u+'/api/wa26/summary',timeout=5) as r:wa=json.load(r)
assert wa['records']==8619 and wa['conditions']['P']==403
with urllib.request.urlopen(u+'/advanced',timeout=5) as r:advanced=r.read().decode()
assert 'Explore infrastructure across America' in advanced
print('STATE-FIRST NATIONAL UI: HTTP PASS')
print('ACTUAL STATE POLYGONS:',len(geo['features']))
print('FHWA 2025 SUMMARIES:',len(states['states']))
print('WA 2026 DRILLDOWN: 8,619 RECORDS')
print('ORIGINAL ADVANCED MAP: PRESERVED')
print('PUBLIC RELEASE: DISABLED')
print('BROWSER USABILITY/LOOK: NEEDS VISUAL REVIEW')
PY
then
  echo "STOP: new staging failed. Existing ports untouched."
  kill "$PID" 2>/dev/null || true
  tail -n 20 "$STAGE/gateway.log" || true
  exit 1
fi
printf '%s\n' "$PID" > "$STAGE/gateway.pid"
echo "SIMPLE MAP: $URL"
echo 'PRIOR MAP: http://127.0.0.1:8793'
echo 'No public publication or runtime change.'
