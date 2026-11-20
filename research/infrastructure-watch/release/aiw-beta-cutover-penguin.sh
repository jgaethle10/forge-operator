#!/usr/bin/env bash
# Evercraft AIW: explicit, SHA-pinned public-edge cutover with rollback.
# --check is read-only. --activate restarts ONLY evercraft-public-edge.service.
set -Eeuo pipefail
umask 077
MODE="--check"
if [[ "$#" -gt 0 ]]; then MODE="$1"; fi
if [[ "$MODE" != "--check" && "$MODE" != "--activate" ]]; then
  echo "Usage: sudo bash aiw-beta-cutover-penguin.sh [--check|--activate]" >&2
  exit 2
fi
test "$(id -u)" = 0 || { echo "STOP: approved root operator required"; exit 2; }

HOST="fabric.systemiacommandcenters.com"
SRC="270291e8a8c3b32f10ca3f6dc47142e9e3542238"
RELEASE="/srv/evercraft/infrastructure-watch/releases/270291e8a8c3b32f10ca3f6dc47142e9e3542238-47d8da45c45d"
CURRENT="/srv/evercraft/infrastructure-watch/current"
CONFIG="/etc/evercraft/Caddyfile"
ENVFILE="/etc/evercraft/public-edge.env"
REVIEW="/var/lib/evercraft/aiw/public-beta/reviews/8e553e50a839-270291e8a8c3b32f10ca3f6dc47142e9e3542238"
BACKUP="$REVIEW/Caddyfile.before"
CANDIDATE="$REVIEW/Caddyfile.candidate"
ORIGINAL_SHA="8e553e50a839b76dd924877fffea223d5c565406e37037e08788355bc5e7afb8"
CANDIDATE_SHA="3b8ebe191ebe1009c1a59b10e79783678d998bc4ca13c22e82ead34c1dca9ef8"
EDGE="evercraft-public-edge.service"
FABRIC="evercraft-fabric.service"
sha() { sha256sum "$1" | awk '{print $1}'; }
fail() { echo "STOP: $*" >&2; exit 1; }
edge_get() {
  curl --noproxy '*' -fsSk --max-time 8 --resolve "$HOST:8443:127.0.0.1" "https://$HOST:8443$1"
}
edge_headers() {
  curl --noproxy '*' -fsSk --max-time 8 --resolve "$HOST:8443:127.0.0.1" -D - -o /dev/null "https://$HOST:8443$1"
}
# systemctl can report active before Caddy has bound 8443. Poll the actual
# HTTPS route (not just systemd state); all retries are bounded.
edge_health_status() {
  curl --noproxy '*' --silent --insecure --max-time 2 \
    --resolve "$HOST:8443:127.0.0.1" \
    --output /dev/null --write-out '%{http_code}' \
    "https://$HOST:8443/health"
}
await_edge_healthy() {
  local attempt status
  for attempt in $(seq 1 24); do
    status="$(edge_health_status || true)"
    if [[ "$status" == "200" ]]; then
      echo "public_edge_https_health=PASS (attempt $attempt)"
      return 0
    fi
    sleep 1
  done
  echo "public_edge_https_health=FAIL after bounded startup probes" >&2
  return 1
}

echo "=== AIW BETA PRODUCTION EDGE | $MODE ==="
for path in "$CONFIG" "$BACKUP" "$CANDIDATE" "$ENVFILE"; do
  test -f "$path" && test ! -L "$path" || fail "Required file missing or symlinked: $path"
done
test -d "$RELEASE" && test ! -L "$RELEASE" || fail "Pinned static release missing"
test -f "$RELEASE/release.json" && test -f "$RELEASE/SHA256SUMS" || fail "Release receipts missing"
test ! -e "$CURRENT" && test ! -L "$CURRENT" || fail "AIW current already exists, no overwrite"
test "$(sha "$CONFIG")" = "$ORIGINAL_SHA" || fail "Caddy config drifted after candidate review"
test "$(sha "$BACKUP")" = "$ORIGINAL_SHA" || fail "Rollback backup is not the exact original config"
test "$(sha "$CANDIDATE")" = "$CANDIDATE_SHA" || fail "Prepared candidate changed"
CADDY_VERSION="$(/usr/bin/caddy version | awk '{print $1}')"
[[ "$CADDY_VERSION" == "v2.6.2" || "$CADDY_VERSION" == "2.6.2" ]] || fail "Caddy version drifted: $CADDY_VERSION"
grep -Eq '^[[:space:]]+admin[[:space:]]+off[[:space:]]*$' "$CONFIG" || fail "Caddy admin setting drifted"
test "$(awk -F= '$1=="EVERCRAFT_PUBLIC_HOST"{print substr($0,index($0,"=")+1)}' "$ENVFILE" | tail -1)" = "$HOST" || fail "Wrong public host"
EDGE_EMAIL="$(awk -F= '$1=="EVERCRAFT_ACME_EMAIL"{print substr($0,index($0,"=")+1)}' "$ENVFILE" | tail -1)"
test -n "$EDGE_EMAIL" || fail "Missing Caddy email environment variable"
START_COMMAND="$(systemctl show "$EDGE" -p ExecStart --value)"
[[ "$START_COMMAND" == *"caddy run"* && "$START_COMMAND" == *"--config /etc/evercraft/Caddyfile"* ]] || fail "Unexpected Caddy service entrypoint"
systemctl is-active --quiet "$EDGE" || fail "Public Caddy service inactive"
systemctl is-active --quiet "$FABRIC" || fail "Fabric service inactive"
curl -fsS --max-time 5 http://127.0.0.1:8787/health >/dev/null || fail "Fabric health failed"
(cd "$RELEASE" && sha256sum -c SHA256SUMS >/dev/null) || fail "Staged release checksum mismatch"
python3 - "$RELEASE/release.json" "$SRC" <<'PY'
import json,sys
from pathlib import Path
j=json.loads(Path(sys.argv[1]).read_text())
assert j["schema"]=="evercraft.aiw.public-beta-static.v1"
assert j["source_commit"]==sys.argv[2]
assert j["national_state_summaries_2025"]==52
assert j["wa_2026_deep_records"]==8618
assert j["wa_2026_total"]==8619 and j["wa_2026_poor"]==403
assert j["public_release_ready"] is False and j["public_url_verified"] is False
PY
runuser -u caddy -- test -r "$RELEASE/index.html" || fail "Caddy cannot read static release"
env EVERCRAFT_PUBLIC_HOST="$HOST" EVERCRAFT_ACME_EMAIL="$EDGE_EMAIL" \
  /usr/bin/caddy validate --config "$CONFIG" --adapter caddyfile >/dev/null 2>&1 || fail "Original Caddy config failed validation"
env EVERCRAFT_PUBLIC_HOST="$HOST" EVERCRAFT_ACME_EMAIL="$EDGE_EMAIL" \
  /usr/bin/caddy validate --config "$CANDIDATE" --adapter caddyfile >/dev/null 2>&1 || fail "Prepared Caddy config failed validation"
echo "verified_original_config_sha256=$ORIGINAL_SHA"
echo "verified_candidate_sha256=$CANDIDATE_SHA"
echo "release_receipt=PASS"
echo "Fabric_and_Caddy_active=true"

if [[ "$MODE" == "--check" ]]; then
  echo "preflight=PASS"
  echo "publication_activated=false"
  echo "activation_requires_explicit_--activate=true"
  exit 0
fi

echo "=== CHECK EXISTING PUBLIC EDGE BEFORE SERVICE RESTART ==="
baseline="$(edge_headers /health | awk '/^HTTP\//{code=$2} END{print code}')"
test "$baseline" = 200 || fail "Existing Caddy /health isn't HTTP 200; not restarting"

TMP=""
LINK_CREATED=0
CONFIG_CHANGED=0
DONE=0
rollback() {
  local status="$?"
  trap - EXIT INT TERM
  if [[ "$DONE" == 1 ]]; then exit 0; fi
  echo "=== AIW CUTOVER FAILED: AUTOMATIC EDGE ROLLBACK ===" >&2
  if [[ -n "$TMP" && -f "$TMP" ]]; then rm -f -- "$TMP"; fi
  if [[ "$CONFIG_CHANGED" == 1 ]]; then
    local restore
    restore="$(mktemp /etc/evercraft/.Caddyfile.aiw-restore.XXXXXXXX)"
    cp -- "$BACKUP" "$restore"
    chown --reference="$CONFIG" "$restore"
    chmod --reference="$CONFIG" "$restore"
    mv -fT -- "$restore" "$CONFIG"
    if [[ "$(sha "$CONFIG")" != "$ORIGINAL_SHA" ]]; then
      echo "CRITICAL: original config hash not restored" >&2
    fi
    if ! systemctl restart "$EDGE"; then
      echo "CRITICAL: failed to restart public edge after restoring original config" >&2
      echo "Inspect: sudo systemctl status evercraft-public-edge.service" >&2
    elif ! await_edge_healthy; then
      echo "CRITICAL: original public edge failed post-rollback HTTPS recovery" >&2
      echo "Inspect: sudo systemctl status evercraft-public-edge.service" >&2
      echo "Inspect: sudo journalctl -u evercraft-public-edge.service -n 80 --no-pager" >&2
    else
      echo "original_public_edge_HTTPS_restored=true" >&2
    fi
  fi
  if [[ "$LINK_CREATED" == 1 && -L "$CURRENT" ]] && [[ "$(readlink "$CURRENT")" == "$RELEASE" ]]; then
    rm -- "$CURRENT"
    echo "temporary_aiw_current_link_removed=true" >&2
  fi
  echo "publication_activated=false" >&2
  if [[ "$status" == 0 ]]; then status=1; fi
  exit "$status"
}
trap rollback EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

ln -s -- "$RELEASE" "$CURRENT"
LINK_CREATED=1
TMP="$(mktemp /etc/evercraft/.Caddyfile.aiw-new.XXXXXXXX)"
cp -- "$CANDIDATE" "$TMP"
chown --reference="$CONFIG" "$TMP"
chmod --reference="$CONFIG" "$TMP"
test "$(sha "$TMP")" = "$CANDIDATE_SHA" || fail "Candidate copy did not match"
test "$(sha "$CONFIG")" = "$ORIGINAL_SHA" || fail "Caddyfile changed while preparing activation"
mv -fT -- "$TMP" "$CONFIG"
TMP=""
CONFIG_CHANGED=1

echo "=== RESTART ONLY EVERCRAFT PUBLIC EDGE ==="
systemctl restart "$EDGE"
systemctl is-active --quiet "$EDGE" || fail "Public edge failed restart"
# Caddy 2.6.2 can need a short startup period before its HTTPS listener is
# reachable. Do not mistake one immediate connection-refused for a hard failure.
await_edge_healthy || fail "New Caddy route did not become HTTPS-ready"
systemctl is-active --quiet "$FABRIC" || fail "Fabric is unexpectedly inactive"
curl -fsS --max-time 5 http://127.0.0.1:8787/health >/dev/null || fail "Fabric local health failed"

# Compare the bytes served by local HTTPS with our immutable release.
for pair in \
  /infrastructure-watch/:index.html \
  /infrastructure-watch/about.html:about.html \
  /infrastructure-watch/data/states.json:data/states.json \
  /infrastructure-watch/data/states.geojson:data/states.geojson \
  /infrastructure-watch/data/wa-summary.json:data/wa-summary.json \
  /infrastructure-watch/data/wa-bridges.json:data/wa-bridges.json \
  /infrastructure-watch/vendor/leaflet.js:vendor/leaflet.js \
  /infrastructure-watch/vendor/leaflet.css:vendor/leaflet.css; do
  IFS=: read -r route file <<< "$pair"
  actual="$(edge_get "$route" | sha256sum | awk '{print $1}')"
  test "$actual" = "$(sha "$RELEASE/$file")" || fail "Served bytes mismatch: $route"
  echo "verified_static_route=$route"
done
edge_get /health >/dev/null || fail "Existing Fabric /health changed"
edge_headers /infrastructure-watch/ | grep -qi '^content-security-policy:' ||
  fail "Static site security header absent"
REDIRECT_STATUS="$(curl --noproxy '*' -sk --max-time 5 --output /dev/null --write-out '%{http_code}' \
  --resolve "$HOST:8443:127.0.0.1" "https://$HOST:8443/infrastructure-watch")"
test "$REDIRECT_STATUS" = 308 || fail "Trailing-slash redirect not active"
test "$(sha "$CONFIG")" = "$CANDIDATE_SHA" || fail "Running config file changed unexpectedly"
DONE=1
trap - EXIT INT TERM
echo "OWNED_EDGE_AI_WATCH_LOCAL_HTTPS=VERIFIED"
echo "FABRIC_RESIDENT_HEALTH=PASS"
echo "CADDY_ROLLBACK_BACKUP=$BACKUP"
echo "PUBLIC_INTERNET_HTTPS=NOT_YET_INDEPENDENTLY_VERIFIED"
echo "All existing services retained; public-edge service restarted once."
