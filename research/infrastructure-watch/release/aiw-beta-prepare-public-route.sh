#!/usr/bin/env bash
# Prepare a validated, path-scoped AIW Caddy candidate and immutable rollback
# snapshot. This NEVER edits/reloads any live service, symlink or route.
set -euo pipefail
umask 077

if [[ "$(id -u)" -ne 0 || "$#" -ne 2 ]]; then
  echo "Usage: sudo bash aiw-beta-prepare-public-route.sh /path/to/aiw_caddy_candidate.py /path/to/AIW-public-beta.Caddyfile.fragment"
  exit 2
fi

BUILDER="$1"
FRAGMENT="$2"
CONFIG="/etc/evercraft/Caddyfile"
ENVFILE="/etc/evercraft/public-edge.env"
RELEASE="/srv/evercraft/infrastructure-watch/releases/270291e8a8c3b32f10ca3f6dc47142e9e3542238-47d8da45c45d"
CURRENT="/srv/evercraft/infrastructure-watch/current"
REVIEW="/var/lib/evercraft/aiw/public-beta/reviews"
EXPECTED_SOURCE="270291e8a8c3b32f10ca3f6dc47142e9e3542238"

echo "=== AIW PUBLIC BETA | PREPARE VALIDATED ROUTE WITHOUT LIVE MUTATION ==="
test -f "$BUILDER" && test ! -L "$BUILDER"
test -f "$FRAGMENT" && test ! -L "$FRAGMENT"
test -f "$CONFIG" && test ! -L "$CONFIG"
test -f "$ENVFILE" && test ! -L "$ENVFILE"
test -d "$RELEASE" && test ! -L "$RELEASE"
test -f "$RELEASE/release.json" && test -f "$RELEASE/SHA256SUMS"
if [[ -e "$CURRENT" || -L "$CURRENT" ]]; then
  echo "STOP: AIW current release already exists; never replace it implicitly."
  exit 1
fi
systemctl is-active --quiet evercraft-fabric.service
systemctl is-active --quiet evercraft-public-edge.service
curl -fsS --max-time 5 http://127.0.0.1:8787/health >/dev/null

PUBLIC_HOST="$(awk -F= '$1=="EVERCRAFT_PUBLIC_HOST"{print substr($0,index($0,"=")+1)}' "$ENVFILE" | tail -1)"
ACME_EMAIL="$(awk -F= '$1=="EVERCRAFT_ACME_EMAIL"{print substr($0,index($0,"=")+1)}' "$ENVFILE" | tail -1)"
test "$PUBLIC_HOST" = "fabric.systemiacommandcenters.com" ||
  { echo "STOP: Unexpected Fabric public host"; exit 1; }
test -n "$ACME_EMAIL"

RUN_COMMAND="$(systemctl show evercraft-public-edge.service -p ExecStart --value)"
if [[ "$RUN_COMMAND" != *"caddy run"* || "$RUN_COMMAND" != *"--config /etc/evercraft/Caddyfile"* ]]; then
  echo "STOP: resident Caddy entrypoint differs from expected run/config model."
  exit 1
fi

echo "=== REVERIFY ORIGINAL CONTENT-ADDRESSED RELEASE ==="
(cd "$RELEASE" && sha256sum -c SHA256SUMS >/dev/null)
python3 - "$RELEASE" "$EXPECTED_SOURCE" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]); m=json.loads((p/"release.json").read_text())
assert m["source_commit"]==sys.argv[2]
assert m["schema"]=="evercraft.aiw.public-beta-static.v1"
assert m["public_release_ready"] is False
assert m["public_url_verified"] is False
assert m["national_state_summaries_2025"]==52
assert m["wa_2026_total"]==8619 and m["wa_2026_poor"]==403
assert m["wa_2026_deep_records"]==8618
print("static_release_receipt=PASS")
PY
if ! runuser -u caddy -- test -r "$RELEASE/index.html"; then
  echo "STOP: Caddy cannot read the released static page."
  exit 1
fi
echo "caddy_static_read=PASS"

echo "=== VALIDATE INSTALLED CADDY WITH ITS REAL PUBLIC EDGE ENV ==="
env EVERCRAFT_PUBLIC_HOST="$PUBLIC_HOST" EVERCRAFT_ACME_EMAIL="$ACME_EMAIL" \
    /usr/bin/caddy validate --config "$CONFIG" --adapter caddyfile >/dev/null
LIVE_SHA="$(sha256sum "$CONFIG" | awk '{print $1}')"
REVIEW_DIR="$REVIEW/${LIVE_SHA:0:12}-$EXPECTED_SOURCE"
if [[ -e "$REVIEW_DIR" || -L "$REVIEW_DIR" ]]; then
  echo "STOP: candidate already prepared for this live config. No overwrites."
  echo "Review existing directory: $REVIEW_DIR"
  exit 1
fi
install -d -o root -g root -m 0700 "$REVIEW"
mkdir -m 0700 "$REVIEW_DIR"
install -o root -g root -m 0600 "$CONFIG" "$REVIEW_DIR/Caddyfile.before"
python3 "$BUILDER" --source "$REVIEW_DIR/Caddyfile.before" \
  --fragment "$FRAGMENT" --output "$REVIEW_DIR/Caddyfile.candidate"
chmod 0600 "$REVIEW_DIR/Caddyfile.candidate"

echo "=== VALIDATE EXACT CANDIDATE AND ADAPT TO PRIVATE JSON ==="
env EVERCRAFT_PUBLIC_HOST="$PUBLIC_HOST" EVERCRAFT_ACME_EMAIL="$ACME_EMAIL" \
    /usr/bin/caddy validate --config "$REVIEW_DIR/Caddyfile.candidate" --adapter caddyfile >/dev/null
env EVERCRAFT_PUBLIC_HOST="$PUBLIC_HOST" EVERCRAFT_ACME_EMAIL="$ACME_EMAIL" \
    /usr/bin/caddy adapt --config "$REVIEW_DIR/Caddyfile.candidate" --adapter caddyfile \
    >"$REVIEW_DIR/candidate.adapted.json"
chmod 0600 "$REVIEW_DIR/candidate.adapted.json"

python3 - "$REVIEW_DIR/candidate.adapted.json" <<'PY'
import json,sys
from pathlib import Path
d=json.loads(Path(sys.argv[1]).read_text())
found_path=False;found_static=False;found_fabric=False;found_home=False;found_worlds=False
def visit(obj):
  global found_path,found_static,found_fabric,found_home,found_worlds
  if isinstance(obj,dict):
    if obj.get("handler")=="file_server":found_static=True
    if obj.get("root")=="/srv/evercraft/infrastructure-watch/current":found_static=True
    for value in obj.values():visit(value)
  elif isinstance(obj,list):
    for value in obj:visit(value)
  elif isinstance(obj,str):
    found_path|="/infrastructure-watch" in obj
    found_fabric|="127.0.0.1:8787" in obj
    found_home|="127.0.0.1:4310" in obj
    found_worlds|="127.0.0.1:8788" in obj
visit(d)
if not all((found_path,found_static,found_fabric,found_home,found_worlds)):
  raise SystemExit("STOP: adapted candidate did not preserve AIW/Fabric/Home/Worlds")
print("caddy_adapted_routes=PASS")
print("fabric_home_worlds_preserved=PASS")
PY

echo "=== REPORT RELOAD CAPABILITY WITHOUT SIGNALING RUNNING EDGE ==="
VERSION="$(/usr/bin/caddy version | awk '{print $1}')"
echo "installed_caddy_version=$VERSION"
python3 - "$VERSION" <<'PY'
import re,sys
m=re.match(r"v?(\d+)\.(\d+)\.(\d+)",sys.argv[1])
if not m:
  print("signal_reload_eligibility=UNKNOWN; HOLD")
else:
  supported=tuple(map(int,m.groups()))>=(2,11,0)
  print("SIGUSR1_reload_capability="+("VERSION_ELIGIBLE" if supported else "VERSION_TOO_OLD"))
  print("signal_reload_requires_runtime_approval=true")
PY
echo "original_caddy_sha256=$LIVE_SHA"
echo "candidate_caddy_sha256=$(sha256sum "$REVIEW_DIR/Caddyfile.candidate" | awk '{print $1}')"
echo "review_directory=$REVIEW_DIR"
echo "candidate_prepared=true"
echo "live_caddy_unchanged=true"
echo "live_symlink_unchanged=true"
echo "services_restarted=false"
echo "publication_activated=false"
echo "=== HOLD FOR ROUTE CUTOVER AND VERSION-SAFE RELOAD DECISION ==="
