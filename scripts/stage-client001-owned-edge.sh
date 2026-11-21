#!/usr/bin/env bash
# Copy canonical Client 001 source into one immutable, digest-named local release.
# NO symlink flip, Caddy reload, DNS mutation, public hosting or client promotion.
set -euo pipefail
umask 022
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_ROOT/public/clients/on-the-go/review/index.html"
ROOT="${EVERCRAFT_CLIENT001_RELEASE_ROOT:-/srv/evercraft/client001/releases}"
if [[ ! -f "$SRC" || -L "$SRC" ]]; then
  echo 'Client 001 canonical source missing or symlinked' >&2
  exit 2
fi
if [[ "$ROOT" != /srv/evercraft/client001/releases && "$ROOT" != /srv/evercraft/client001/releases/* ]]; then
  echo 'Refusing to stage outside client-specific release root' >&2
  exit 2
fi
if [[ "$ROOT" != "$(realpath -m -- "$ROOT")" ]]; then
  echo 'Noncanonical release root refused' >&2
  exit 2
fi
# Reject symlinks anywhere in the release-root ancestry, not just the last path.
walk=''
IFS='/' read -r -a parts <<< "${ROOT#/}"
for part in "${parts[@]}"; do
  walk="$walk/$part"
  if [[ -L "$walk" ]]; then
    echo 'Refusing symlink in release root ancestry' >&2
    exit 2
  fi
  if [[ -e "$walk" && ! -d "$walk" ]]; then
    echo 'Release ancestor is not a directory' >&2
    exit 2
  fi
done
if [[ -L "$ROOT" ]]; then
  echo 'Refusing symlinked release root' >&2
  exit 2
fi
install -d -m 0755 "$ROOT"
SOURCE_SHA="$(sha256sum "$SRC" | awk '{print $1}')"
DEST="$ROOT/$SOURCE_SHA"
check_dest() {
  if [[ -L "$DEST" || -L "$DEST/index.html" || ! -d "$DEST" ||
        ! -f "$DEST/index.html" ]]; then
    echo 'Existing digest release is not a normal directory with a regular index.html' >&2
    exit 2
  fi
  local count
  count="$(find "$DEST" -mindepth 1 -maxdepth 1 | wc -l)"
  if [[ "$count" != 1 ]]; then
    echo 'Digest release contains unexpected files' >&2
    exit 2
  fi
  cmp -- "$SRC" "$DEST/index.html"
}
if [[ -e "$DEST" || -L "$DEST" ]]; then
  check_dest
else
  # Write to a temporary sibling and move without clobbering an existing digest.
  # A failed or interrupted copy cannot create a half-written release.
  temp="$(mktemp -d "$ROOT/.client001-stage.XXXXXXXX")"
  cleanup(){ [[ -n "${temp:-}" && -d "$temp" ]] && rm -rf -- "$temp"; }
  trap cleanup EXIT
  install -m 0644 "$SRC" "$temp/index.html"
  cmp -- "$SRC" "$temp/index.html"
  mv -T -n -- "$temp" "$DEST"
  check_dest
  cleanup
  trap - EXIT
fi
STAGED_SHA="$(sha256sum "$DEST/index.html" | awk '{print $1}')"
test "$SOURCE_SHA" = "$STAGED_SHA"
printf 'stage=OK\nsource_sha256=%s\nrelease_dir=%s\npublic_deploy=false\ndns_modified=false\n' "$SOURCE_SHA" "$DEST"
