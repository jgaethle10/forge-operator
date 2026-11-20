#!/usr/bin/env bash
# Penguin / Node001: receive an official-public-data-only AIW release from
# GitHub source control, then privately stage. Does not publish or reload Caddy.
set -euo pipefail
RELEASE_REF="${1:?Usage: bash aiw-beta-receive-penguin.sh <40-character-verified-release-kit-commit>}"
[[ "$RELEASE_REF" =~ ^[a-f0-9]{40}$ ]] ||
  { echo "STOP: release-kit source commit must be immutable SHA"; exit 2; }
SOURCE_COMMIT="270291e8a8c3b32f10ca3f6dc47142e9e3542238"
BRANCH="release/aiw-beta-payload-${SOURCE_COMMIT:0:12}"
PAYLOAD="artifacts/aiw-public-beta/$SOURCE_COMMIT.tar.gz"
RECEIPT="artifacts/aiw-public-beta/$SOURCE_COMMIT.receipt.json"
REPO="$HOME/.local/share/evercraft/forge-operator"
STATE="$HOME/.local/state/evercraft/aiw/public-beta"
ARCHIVE="$STATE/$SOURCE_COMMIT.tar.gz"
RECEIPT_FILE="$STATE/$SOURCE_COMMIT.receipt.json"

echo "=== VERIFY PENGUIN GITHUB CANONICAL REPO ==="
test -d "$REPO" || { echo "STOP: Node001 source repo absent at $REPO"; exit 1; }
test "$(git -C "$REPO" remote get-url origin | grep -Ec 'github\.com[:/]jgaethle10/forge-operator(\.git)?$')" = 1 ||
  { echo "STOP: Unexpected GitHub source origin"; exit 1; }

echo "=== FETCH CONTENT-ADDRESSED EVERCRAFT PUBLIC DATA COURIER ==="
git -C "$REPO" fetch --no-tags origin "$BRANCH"
COURIER_COMMIT="$(git -C "$REPO" rev-parse FETCH_HEAD)"
test "$(git -C "$REPO" cat-file -t "$COURIER_COMMIT")" = commit
mkdir -p "$STATE"
chmod 700 "$STATE"

if [ -e "$RECEIPT_FILE" ] || [ -e "$ARCHIVE" ]; then
  echo "STOP: existing local transfer detected. Never overwrite; inspect receipt."
  exit 1
fi
git -C "$REPO" show "$COURIER_COMMIT:$RECEIPT" > "$RECEIPT_FILE"
git -C "$REPO" show "$COURIER_COMMIT:$PAYLOAD" > "$ARCHIVE"
chmod 600 "$RECEIPT_FILE" "$ARCHIVE"

echo "=== VERIFY ARCHIVE AND COURIER SOURCE ==="
python3 - "$RECEIPT_FILE" "$ARCHIVE" "$SOURCE_COMMIT" "$PAYLOAD" <<'PY'
import hashlib,json,sys
from pathlib import Path
receipt=json.loads(Path(sys.argv[1]).read_text())
p=Path(sys.argv[2])
assert receipt["schema"]=="evercraft.aiw.github-courier.v1"
assert receipt["source_commit"]==sys.argv[3]
assert receipt["payload_path"]==sys.argv[4]
assert receipt["kind"]=="public-federal-static-data-only"
assert receipt["public_deployed"] is False
assert receipt["archive_bytes"]==p.stat().st_size
assert receipt["archive_sha256"]==hashlib.sha256(p.read_bytes()).hexdigest()
print("OWNED PENGUIN ARCHIVE: SHA-256 VERIFIED")
print("ARCHIVE:",p)
print("COURIER SHA256:",receipt["archive_sha256"])
PY

echo "=== FETCH HASH-PINNED STAGING AND READ-ONLY EDGE PREFLIGHT SCRIPTS ==="
git -C "$REPO" fetch --no-tags origin "$RELEASE_REF"
test "$(git -C "$REPO" rev-parse FETCH_HEAD)" = "$RELEASE_REF"
git -C "$REPO" show "$RELEASE_REF:research/infrastructure-watch/release/aiw-beta-edge-preflight.sh" > "$STATE/aiw-beta-edge-preflight.sh"
git -C "$REPO" show "$RELEASE_REF:research/infrastructure-watch/release/aiw-beta-stage-owned-edge.sh" > "$STATE/aiw-beta-stage-owned-edge.sh"
bash -n "$STATE/aiw-beta-edge-preflight.sh"
bash -n "$STATE/aiw-beta-stage-owned-edge.sh"

echo "=== READ-ONLY EDGE DIAGNOSTICS ==="
bash "$STATE/aiw-beta-edge-preflight.sh"

echo "=== PRIVATELY STAGE VERIFIED RELEASE, DO NOT GO PUBLIC ==="
sudo bash "$STATE/aiw-beta-stage-owned-edge.sh" "$ARCHIVE"
echo "STAGING COMPLETED. CURRENT SYMLINK / CADDY / DNS / TLS LEFT UNCHANGED."
echo "PUBLICATION: STILL HELD UNTIL EXACT LIVE ROUTE REVIEW AND OUTSIDE-IN HTTPS RECEIPT."
