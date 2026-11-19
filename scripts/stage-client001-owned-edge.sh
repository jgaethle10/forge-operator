#!/usr/bin/env bash
# Copy canonical Client 001 static source into a versioned owned-node release.
# Never edits Caddy, public DNS, an existing release, or /current.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_ROOT/public/clients/on-the-go/review/index.html"
ROOT="${EVERCRAFT_CLIENT001_RELEASE_ROOT:-/srv/evercraft/client001/releases}"
if [[ ! -f "$SRC" ]]; then
  echo 'Client 001 source not found' >&2
  exit 2
fi
if [[ "$ROOT" != /srv/evercraft/client001/releases && "$ROOT" != /srv/evercraft/client001/releases/* ]]; then
  echo 'Refusing to stage outside client-specific release root' >&2
  exit 2
fi
if [[ -L "$ROOT" ]]; then
  echo 'Refusing symlinked release root' >&2
  exit 2
fi
SOURCE_SHA="$(sha256sum "$SRC" | awk '{print $1}')"
DEST="$ROOT/$SOURCE_SHA"
if [[ -e "$DEST" ]]; then
  echo "Already staged: $DEST"
  cmp -- "$SRC" "$DEST/index.html"
else
  install -d -m 0755 "$DEST"
  install -m 0644 "$SRC" "$DEST/index.html"
fi
STAGED_SHA="$(sha256sum "$DEST/index.html" | awk '{print $1}')"
test "$SOURCE_SHA" = "$STAGED_SHA"
printf 'stage=OK\nsource_sha256=%s\nrelease_dir=%s\npublic_deploy=false\ndns_modified=false\n' "$SOURCE_SHA" "$DEST"
