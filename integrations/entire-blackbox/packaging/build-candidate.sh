#!/usr/bin/env bash
# Deterministic, non-publishing packaging proof for Entire Black Box.
# Requires Go, GNU tar, gzip, zip, and sha256sum on a trusted Linux builder.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
version="${1:-0.1.0}"
out="${2:-$root/dist}"
if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Version must be a stable semver number without v prefix" >&2
  exit 2
fi
mkdir -p "$out"
out="$(cd "$out" && pwd)"
if [[ -e "$out/checksums.txt" ]]; then
  echo "Refusing to replace existing candidate: $out/checksums.txt" >&2
  exit 2
fi
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
targets=(linux_amd64 linux_arm64 darwin_amd64 darwin_arm64 windows_amd64 windows_arm64)
assets=()
for target in "${targets[@]}"; do
  IFS=_ read -r os arch <<< "$target"
  name="entire-blackbox_${version}_${os}_${arch}"
  binary="entire-blackbox"
  if [[ "$os" == "windows" ]]; then binary="entire-blackbox.exe"; fi
  mkdir -p "$work/$target"
  CGO_ENABLED=0 GOOS="$os" GOARCH="$arch" \
    go -C "$root" build -trimpath -buildvcs=false -ldflags="-buildid=" -o "$work/$target/$binary" .
  # 1980-01-01 is valid for ZIP and removes nondeterministic file timestamps.
  touch -t 198001010000.00 "$work/$target/$binary"
  if [[ "$os" == "windows" ]]; then
    asset="$name.zip"
    (cd "$work/$target" && zip -X -q -D "$out/$asset" "$binary")
  else
    asset="$name.tar.gz"
    (cd "$work/$target" && tar --sort=name --mtime='@315532800' \
      --owner=0 --group=0 --numeric-owner -cf - "$binary" | gzip -n -9 > "$out/$asset")
  fi
  assets+=("$asset")
done
(
  cd "$out"
  sha256sum "${assets[@]}" > checksums.txt
)
echo "CANDIDATE_ARCHIVES_CREATED: ${#assets[@]} (not a published release)"
