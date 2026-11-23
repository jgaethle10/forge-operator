#!/usr/bin/env bash
# Stage an independently checked AIW public beta archive on Evercraft's OWNED edge.
# Does NOT link /current, edit Caddy, restart services, change DNS, or go public.
set -euo pipefail
if [ "$#" -ne 1 ] || [ "${1:-}" = "--help" ]; then
  echo "Usage: sudo bash aiw-beta-stage-owned-edge.sh /absolute/path/to/verified-release.tar.gz"
  exit 2
fi
[ "$(id -u)" = 0 ] || { echo "STOP: stage as root on the approved owned edge"; exit 2; }
ARCHIVE="$1"
test -f "$ARCHIVE"
ROOT="/srv/evercraft/infrastructure-watch"
test ! -L "$ROOT"
install -d -o root -g root -m 0755 "$ROOT" "$ROOT/releases"
echo "=== INSPECT AND STAGE CONTENT-ADDRESSED SOURCE RECEIPT (NO PUBLIC CUTOVER) ==="
python3 - "$ARCHIVE" "$ROOT/releases" <<'PY'
import hashlib,json,os
from pathlib import Path
import re,sys,tarfile,tempfile,shutil

archive=Path(sys.argv[1]).resolve()
root=Path(sys.argv[2]).resolve()
if archive.stat().st_size>25_000_000:
    raise SystemExit("STOP: release archive larger than expected")
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
required={"index.html","about.html","data/states.json","data/states.geojson",
          "data/wa-summary.json","data/wa-bridges.json",
          "vendor/leaflet.js","vendor/leaflet.css","vendor/LEAFLET-LICENSE",
          "vendor/US-ATLAS-LICENSE","robots.txt","release.json","SHA256SUMS"}
with tarfile.open(archive,mode="r:gz") as tar:
    members=tar.getmembers()
    names=[m.name for m in members]
    if set(names)!=required or len(names)!=len(required):
        raise SystemExit("STOP: unexpected/missing/duplicated files in release archive")
    if not all(m.isfile() and 0<m.size<10_000_000 and m.name==str(Path(m.name))
               and not Path(m.name).is_absolute() for m in members):
        raise SystemExit("STOP: archive has a link, directory, traversal or invalid payload")
    items={m.name:tar.extractfile(m).read() for m in members}
for name,data in items.items():
    if len(data)>10_000_000:raise SystemExit("STOP: payload size exceeded")
manifest=json.loads(items["release.json"])
sha=manifest.get("source_commit","")
if not isinstance(sha,str) or not re.fullmatch(r"[a-f0-9]{40}",sha):
    raise SystemExit("STOP: no pinned 40-character source commit")
if (manifest.get("schema")!="evercraft.aiw.public-beta-static.v1" or
    manifest.get("public_release_ready") is not False or
    manifest.get("public_url_verified") is not False or
    manifest.get("national_2026_complete") is not False or
    manifest.get("national_state_summaries_2025")!=52 or
    manifest.get("geography_boundaries")!=56 or
    manifest.get("wa_2026_total")!=8619 or
    manifest.get("wa_2026_poor")!=403 or
    manifest.get("wa_2026_deep_records")!=8618):
    raise SystemExit("STOP: bundle evidence/launch contract mismatch")
checks=manifest.get("files",{})
if set(checks)!=required-{"release.json","SHA256SUMS"}:
    raise SystemExit("STOP: receipt missing expected file digest")
for name,expected in checks.items():
    if hashlib.sha256(items[name]).hexdigest()!=expected:
        raise SystemExit("STOP: receipt checksum mismatch for "+name)
sha_lines=items["SHA256SUMS"].decode("ascii").splitlines()
for line in sha_lines:
    if len(line)<67 or line[64:66]!="  " or line[66:] not in items:
        raise SystemExit("STOP: malformed SHA256SUMS")
    if hashlib.sha256(items[line[66:]]).hexdigest()!=line[:64]:
        raise SystemExit("STOP: SHA256SUMS mismatch")
if len(sha_lines)!=len(required)-1:raise SystemExit("STOP: incomplete SHA256SUMS")
geo=json.loads(items["data/states.geojson"])
states=json.loads(items["data/states.json"])
wa=json.loads(items["data/wa-summary.json"])
deep=json.loads(items["data/wa-bridges.json"])
if (len(geo.get("features",[]))!=56 or len(states.get("states",[]))!=52 or
    wa.get("records")!=8619 or wa.get("conditions",{}).get("P")!=403 or
    len(deep.get("bridges",[]))!=8618):
    raise SystemExit("STOP: public facts failed independent archive read")
page=items["index.html"].decode("utf8")
if "function hoverPreview(name)" not in page or "fetch('./data/wa-bridges.json'" not in page:
    raise SystemExit("STOP: wrong frontend shipped")
if b"Michael Bostock" not in items["vendor/US-ATLAS-LICENSE"]:
    raise SystemExit("STOP: geographic data license missing")
final=root/(sha+"-"+digest[:12])
if final.exists():
    raise SystemExit("STOP: identical release already staged; nothing overwritten")
scratch=Path(tempfile.mkdtemp(prefix=".aiw-stage-",dir=root))
try:
    for name,data in items.items():
        target=scratch/name
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(data)
        target.chmod(0o644)
    scratch.chmod(0o755)
    scratch.rename(final)
except Exception:
    shutil.rmtree(scratch,ignore_errors=True)
    raise
print("RELEASE STAGED:",final)
print("ARCHIVE SHA256:",digest)
print("PINNED GITHUB SOURCE:",sha)
print("WA 2026 DEEP RECORDS:",len(deep["bridges"]))
print("LIVE CADDY ROUTE: UNCHANGED")
print("LIVE CURRENT SYMLINK: UNCHANGED")
print("PUBLICATION: NOT ATTEMPTED")
PY

echo "=== READ-ONLY EDGE STATUS ==="
for service in evercraft-fabric.service evercraft-public-edge.service; do
  if systemctl is-active --quiet "$service"; then
    echo "$service: active"
  else
    echo "$service: NOT ACTIVE, PUBLIC RELEASE HELD"
  fi
done
if test -f /etc/evercraft/Caddyfile; then
  # Match the existing resident Caddy service's public-edge environment.
  # Never source an env file as executable shell code.
  EDGE_ENV=/etc/evercraft/public-edge.env
  EDGE_HOST=""
  EDGE_EMAIL=""
  if test -r "$EDGE_ENV"; then
    EDGE_HOST="$(awk -F= '$1=="EVERCRAFT_PUBLIC_HOST"{print substr($0,index($0,"=")+1)}' "$EDGE_ENV" | tail -1)"
    EDGE_EMAIL="$(awk -F= '$1=="EVERCRAFT_ACME_EMAIL"{print substr($0,index($0,"=")+1)}' "$EDGE_ENV" | tail -1)"
  fi
  if env EVERCRAFT_PUBLIC_HOST="$EDGE_HOST" EVERCRAFT_ACME_EMAIL="$EDGE_EMAIL" \
      /usr/bin/caddy validate --config /etc/evercraft/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    echo "EXISTING CADDY: valid with installed public-edge environment (no modifications)"
  else
    echo "EXISTING CADDY: blocked even with public-edge environment; public release held"
  fi
else
  echo "EXISTING CADDY: missing; public release held"
fi
echo "NEXT GATE: review exact existing Caddy site block before scoped route installation."
