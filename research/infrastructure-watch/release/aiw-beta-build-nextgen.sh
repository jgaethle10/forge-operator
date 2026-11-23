#!/usr/bin/env bash
# Evercraft AIW release bundle, privately built on NextGen. NO public mutation.
set -euo pipefail
COMMIT="${1:?Usage: aiw-beta-build-nextgen.sh <reviewed-40char-commit>}"
[[ "$COMMIT" =~ ^[a-f0-9]{40}$ ]] || { echo "STOP: exact commit required"; exit 2; }
BASE="$HOME/evercraft-aiw-stage"
ROOT="$HOME/.local/state/evercraft/aiw/national-map-private"
PREVIEW="http://127.0.0.1:8796"
RELEASE="$ROOT/public-beta"
OUTPUT="$RELEASE/releases/$COMMIT"
mkdir -p "$RELEASE/releases"
chmod 700 "$RELEASE" "$RELEASE/releases"
cd "$BASE"
git fetch origin "$COMMIT"
test "$(git rev-parse FETCH_HEAD)" = "$COMMIT"
mkdir -p "$RELEASE/source"
git show "$COMMIT:research/infrastructure-watch/operator/aiw-state-first-private.html" > "$RELEASE/source/approved-hover-$COMMIT.html"
git show "$COMMIT:research/infrastructure-watch/release/aiw_public_beta_bundle.py" > "$RELEASE/source/aiw_public_beta_bundle_$COMMIT.py"
python3 -m py_compile "$RELEASE/source/aiw_public_beta_bundle_$COMMIT.py"
test -f "$ROOT/vendor/leaflet.js"
test -f "$ROOT/vendor/leaflet.css"
test -f "$ROOT/vendor/LICENSE"
test -f "$ROOT/state-first/us-atlas-LICENSE"
if test -e "$OUTPUT" || test -e "$OUTPUT.tar.gz"; then
  echo "STOP: This release already exists. Never overwrite immutable bundle."
  exit 1
fi
echo "=== CHECK PRIVATE APPROVED MAP AND SOURCE EVIDENCE ==="
curl -fsS "$PREVIEW/healthz" | python3 -c '
import json,sys
h=json.load(sys.stdin)
assert h["status"]=="ready"
assert h["state_polygons"]==56 and h["national_2025_summaries"]==52
assert h["washington_2026_records"]==8619
assert h["public_release_ready"] is False
print("PRIVATE PREVIEW: VERIFIED (NOT PUBLIC)")
'
echo "=== BUILD SELF-CONTAINED PUBLIC-BETA PACKAGE ==="
python3 "$RELEASE/source/aiw_public_beta_bundle_$COMMIT.py" \
  --origin "$PREVIEW" \
  --source-html "$RELEASE/source/approved-hover-$COMMIT.html" \
  --leaflet-dir "$ROOT/vendor" \
  --us-atlas-license "$ROOT/state-first/us-atlas-LICENSE" \
  --commit "$COMMIT" \
  --output "$OUTPUT"
echo "=== VERIFY RELEASE CONTENT HASHES ==="
(cd "$OUTPUT" && sha256sum -c SHA256SUMS)
python3 - "$OUTPUT" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1])
manifest=json.loads((p/"release.json").read_text())
assert manifest["wa_2026_deep_records"]==8618
assert manifest["wa_2026_total"]==8619
assert manifest["national_state_summaries_2025"]==52
assert manifest["public_url_verified"] is False
assert manifest["public_release_ready"] is False
print("PACKAGE: CONTENT-VERIFIED, PRIVATE, NOT PUBLISHED")
PY
echo "BUNDLE: $OUTPUT.tar.gz"
echo "SOURCE COMMIT: $COMMIT"
echo "PUBLIC WEBSITE: NOT YET CHANGED"
