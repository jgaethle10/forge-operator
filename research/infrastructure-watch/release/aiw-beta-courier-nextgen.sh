#!/usr/bin/env bash
# Move a VERIFIED Evercraft AIW static beta bundle across owned nodes through
# GitHub canonical source control. GitHub is an artifact courier, NOT runtime.
# No private DB, no production route change, no generated secret files.
set -euo pipefail

SOURCE_COMMIT="270291e8a8c3b32f10ca3f6dc47142e9e3542238"
BASE="$HOME/evercraft-aiw-stage"
ROOT="$HOME/.local/state/evercraft/aiw/national-map-private"
ARCHIVE="$ROOT/public-beta/releases/$SOURCE_COMMIT.tar.gz"
WORKTREE="$ROOT/public-beta/courier/$SOURCE_COMMIT"
BRANCH="release/aiw-beta-payload-${SOURCE_COMMIT:0:12}"
PAYLOAD="artifacts/aiw-public-beta/$SOURCE_COMMIT.tar.gz"
RECEIPT="artifacts/aiw-public-beta/$SOURCE_COMMIT.receipt.json"

test -f "$ARCHIVE" || { echo "STOP: exact verified local release archive missing"; exit 1; }
test -d "$BASE/.git" || git -C "$BASE" rev-parse --git-dir >/dev/null
mkdir -p "$(dirname "$WORKTREE")"
cd "$BASE"
git cat-file -e "$SOURCE_COMMIT^{commit}" || { echo "STOP: pinned release source commit absent"; exit 1; }
echo "=== VERIFY LOCAL BUNDLE BEFORE ANY PUSH ==="
python3 - "$ARCHIVE" "$SOURCE_COMMIT" <<'PY'
from pathlib import Path
import hashlib,json,re,sys,tarfile
p=Path(sys.argv[1])
commit=sys.argv[2]
if not p.is_file() or p.stat().st_size>25_000_000:raise SystemExit("STOP: archive invalid or too large")
required={"index.html","about.html","data/states.json","data/states.geojson",
          "data/wa-summary.json","data/wa-bridges.json",
          "vendor/leaflet.js","vendor/leaflet.css","vendor/LEAFLET-LICENSE",
          "vendor/US-ATLAS-LICENSE","robots.txt","release.json","SHA256SUMS"}
with tarfile.open(p,mode="r:gz") as t:
  members=t.getmembers()
  if len(members)!=len(required) or {m.name for m in members}!=required:
    raise SystemExit("STOP: archive membership wrong")
  if any(not m.isfile() or m.size>10_000_000 or
         Path(m.name).is_absolute() or ".." in Path(m.name).parts for m in members):
    raise SystemExit("STOP: archive contains path/link/size anomaly")
  read={m.name:t.extractfile(m).read() for m in members}
manifest=json.loads(read["release.json"])
if manifest.get("source_commit")!=commit or manifest.get("public_url_verified") is not False or \
    manifest.get("wa_2026_deep_records")!=8618 or manifest.get("national_state_summaries_2025")!=52:
  raise SystemExit("STOP: release claims or source commit mismatch")
for name,sha in manifest.get("files",{}).items():
  if name not in read or hashlib.sha256(read[name]).hexdigest()!=sha:
    raise SystemExit("STOP: member SHA mismatch for "+name)
if b"function hoverPreview(name)" not in read["index.html"]:
  raise SystemExit("STOP: approved hover interaction absent")
if b"Michael Bostock" not in read["vendor/US-ATLAS-LICENSE"]:
  raise SystemExit("STOP: map attribution missing")
print("PUBLIC-SAFE STATIC ARCHIVE: VERIFIED")
print("ARCHIVE SHA256:",hashlib.sha256(p.read_bytes()).hexdigest())
print("BYTES:",p.stat().st_size)
PY

echo "=== CHECK FOR ALREADY PUBLISHED EXACT COURIER ==="
ARCHIVE_SHA="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
ARCHIVE_BYTES="$(stat -c '%s' "$ARCHIVE")"
if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
  git -C "$BASE" fetch --no-tags origin "$BRANCH"
  REMOTE_COMMIT="$(git -C "$BASE" rev-parse FETCH_HEAD)"
  REMOTE_DIGEST="$(git -C "$BASE" show "$REMOTE_COMMIT:$PAYLOAD" | sha256sum | awk '{print $1}')"
  REMOTE_RECEIPT="$(git -C "$BASE" show "$REMOTE_COMMIT:$RECEIPT")"
  if [ "$REMOTE_DIGEST" = "$ARCHIVE_SHA" ] &&
     python3 - "$REMOTE_RECEIPT" "$ARCHIVE_SHA" "$ARCHIVE_BYTES" "$SOURCE_COMMIT" <<'PY'
import json,sys
r=json.loads(sys.argv[1])
assert r['schema']=='evercraft.aiw.github-courier.v1'
assert r['archive_sha256']==sys.argv[2]
assert r['archive_bytes']==int(sys.argv[3])
assert r['source_commit']==sys.argv[4]
PY
  then
    echo "EXACT GITHUB COURIER ALREADY PRESENT; no overwrite."
    echo "BRANCH: $BRANCH"
    echo "COURIER COMMIT: $REMOTE_COMMIT"
    echo "ARCHIVE SHA256: $ARCHIVE_SHA"
    echo "PUBLIC EDGE: UNCHANGED"
    exit 0
  fi
  echo "STOP: existing courier branch contains different bytes. No force push."
  exit 1
fi
echo "=== PREPARE OR SAFELY RESUME COURIER WORKTREE ==="
if [ -e "$WORKTREE" ]; then
  test -d "$WORKTREE" && test ! -L "$WORKTREE" ||
    { echo "STOP: courier worktree is not a real directory"; exit 1; }
  ACTUAL_TREE="$(git -C "$WORKTREE" rev-parse --show-toplevel)"
  test "$ACTUAL_TREE" = "$WORKTREE" ||
    { echo "STOP: unexpected worktree origin; no cleanup attempted"; exit 1; }
  test "$(git -C "$WORKTREE" branch --show-current)" = "$BRANCH" ||
    { echo "STOP: existing worktree is not on the pinned courier branch"; exit 1; }
  test "$(git -C "$WORKTREE" rev-parse HEAD)" = "$SOURCE_COMMIT" ||
    { echo "STOP: existing worktree has advanced; refusing to overwrite it"; exit 1; }
  git -C "$WORKTREE" diff --quiet ||
    { echo "STOP: tracked files in worktree were modified"; exit 1; }
  test -z "$(git -C "$WORKTREE" diff --cached --name-only)" ||
    { echo "STOP: pre-existing staged changes must be inspected"; exit 1; }
  for item in "$PAYLOAD" "$RECEIPT"; do
    test -f "$WORKTREE/$item" && test ! -L "$WORKTREE/$item" ||
      { echo "STOP: expected courier file missing or replaced by link: $item"; exit 1; }
  done
  cmp -- "$ARCHIVE" "$WORKTREE/$PAYLOAD" ||
    { echo "STOP: worktree archive differs from independently verified source"; exit 1; }
  python3 - "$WORKTREE/$RECEIPT" "$SOURCE_COMMIT" "$ARCHIVE_SHA" "$ARCHIVE_BYTES" "$PAYLOAD" <<'PY'
import json,sys
from pathlib import Path
record=json.loads(Path(sys.argv[1]).read_text())
expected={"schema":"evercraft.aiw.github-courier.v1","source_commit":sys.argv[2],
          "archive_sha256":sys.argv[3],"archive_bytes":int(sys.argv[4]),
          "payload_path":sys.argv[5],"kind":"public-federal-static-data-only",
          "public_deployed":False,"runtime_host":"Evercraft-owned-edge-only"}
if record!=expected:raise SystemExit("STOP: prior courier receipt differs from source")
print("EXACT FAILED COURIER WORKTREE: RESUMED SAFELY")
PY
else
  git -C "$BASE" worktree add --detach "$WORKTREE" "$SOURCE_COMMIT"
  git -C "$WORKTREE" switch -c "$BRANCH"
  mkdir -p "$WORKTREE/$(dirname "$PAYLOAD")"
  cp -- "$ARCHIVE" "$WORKTREE/$PAYLOAD"
  python3 - "$WORKTREE/$RECEIPT" "$SOURCE_COMMIT" "$ARCHIVE_SHA" "$ARCHIVE_BYTES" "$PAYLOAD" <<'PY'
import json,sys
from pathlib import Path
path=Path(sys.argv[1])
payload={"schema":"evercraft.aiw.github-courier.v1","source_commit":sys.argv[2],
         "archive_sha256":sys.argv[3],"archive_bytes":int(sys.argv[4]),
         "payload_path":sys.argv[5],"kind":"public-federal-static-data-only",
         "public_deployed":False,"runtime_host":"Evercraft-owned-edge-only"}
path.write_text(json.dumps(payload,indent=2,sort_keys=True)+"\n")
PY
fi

echo "=== STAGE ONLY TWO VERIFIED PUBLIC COURIER FILES ==="
# Evercraft intentionally ignores artifacts/ globally. Force-include ONLY
# these two already-verified paths, never the whole ignored folder.
git -C "$WORKTREE" add -f -- "$PAYLOAD" "$RECEIPT"
STAGED_FILES="$(git -C "$WORKTREE" diff --cached --name-only)"
EXPECTED_STAGED="$(printf '%s\n' "$PAYLOAD" "$RECEIPT" | sort)"
test "$(printf '%s\n' "$STAGED_FILES" | sort)" = "$EXPECTED_STAGED" ||
  { echo "STOP: unexpected paths staged; nothing pushed"; exit 1; }
STAGED_DIGEST="$(git -C "$WORKTREE" show ":$PAYLOAD" | sha256sum | awk '{print $1}')"
test "$STAGED_DIGEST" = "$ARCHIVE_SHA" ||
  { echo "STOP: staged Git blob differs from verified archive"; exit 1; }
git -C "$WORKTREE" diff --cached --stat
git -C "$WORKTREE" diff --cached --quiet &&
  { echo "STOP: expected courier files were not staged"; exit 1; }
git -C "$WORKTREE" -c commit.gpgsign=false commit -m "artifact(aiw): courier immutable verified historical beta snapshot to owned edge"
PAYLOAD_COMMIT="$(git -C "$WORKTREE" rev-parse HEAD)"
echo "=== PUSH ONE NON-PRODUCTION GITHUB COURIER REF ==="
git -C "$WORKTREE" push origin "HEAD:refs/heads/$BRANCH"
REMOTE_COMMIT="$(git -C "$WORKTREE" ls-remote origin "refs/heads/$BRANCH" | awk '{print $1}')"
test "$REMOTE_COMMIT" = "$PAYLOAD_COMMIT"
echo "GITHUB COURIER: VERIFIED"
echo "BRANCH: $BRANCH"
echo "COURIER COMMIT: $PAYLOAD_COMMIT"
echo "ARCHIVE SHA256: $ARCHIVE_SHA"
echo "PENGUIN FETCH PATH: $PAYLOAD"
echo "PUBLIC EDGE: UNCHANGED"
echo "NO NEW HOSTING PROVIDER OR RUNTIME"
