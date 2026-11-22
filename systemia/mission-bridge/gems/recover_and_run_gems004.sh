#!/usr/bin/env bash
# Recover exact original competition rasters to OWNER-LOCAL private storage,
# then run ONE bounded GEMS-004 full-area mapped-fault proxy experiment.
# Usage: bash recover_and_run_gems004.sh DATA_DIR VERIFIED_GEMS001_ZIP NEW_OUTPUT_DIR [--fetch-verified-mirror]
# No automatic scored submission, candidate GeoTIFF, paid compute, or remote model execution.
set -euo pipefail
umask 077
if [[ $# -lt 3 || $# -gt 4 ]] || { [[ $# -eq 4 && "$4" != "--fetch-verified-mirror" ]]; }; then
  echo "Usage: bash recover_and_run_gems004.sh PRIVATE_DATA_DIR GEMS001_ARCHIVE_ZIP NEW_PRIVATE_OUTPUT_DIR [--fetch-verified-mirror]" >&2
  exit 64
fi
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo="$(realpath "$here/../../..")"
[[ ! -L "$1" && ! -L "$2" && ! -L "$3" ]] || { echo "Unsafe symlink path" >&2; exit 65; }
[[ -d "$1" && -f "$2" ]] || { echo "Existing private data directory AND original GEMS-001 archive are required" >&2; exit 65; }
data="$(realpath "$1")"
archive="$(realpath "$2")"
output="$(realpath -m "$3")"
case "$data/" in "$repo/"*) echo "Refusing data inside repository" >&2; exit 65;; esac
case "$output/" in "$repo/"*|"$data/"*) echo "Refusing output inside repository or source data" >&2; exit 65;; esac
[[ ! -e "$output" && ! -L "$output" ]] || { echo "Output already exists" >&2; exit 66; }
[[ "${GEMS_REPEAT:-0}" == 0 ]] || { echo "Automatic/repeated experiment denied" >&2; exit 67; }

# Archive authenticity is checked before ANY network request or model execution.
(cd "$here" && python3 - "$archive" <<'PY'
import hashlib,sys,zipfile
from pathlib import Path
from gems_002_negative_ablation import ARCHIVED_GEMS_001_RUN_SHA256
path=Path(sys.argv[1])
if path.is_symlink() or not path.is_file():
    raise SystemExit("GEMS-001 preserved model archive unsafe or missing")
with zipfile.ZipFile(path) as z:
    info=z.getinfo("run.py")
    if info.file_size>1024*1024:
        raise SystemExit("GEMS-001 model source unexpectedly large")
    raw=z.read(info)
if hashlib.sha256(raw).hexdigest()!=ARCHIVED_GEMS_001_RUN_SHA256:
    raise SystemExit("GEMS-001 archived model SHA256 mismatch")
print("ORIGINAL_GEMS001_MODEL_SHA256_PASS")
PY
)

# This mirror is NOT the official portal; only bytes matching the original
# organizer SHA256 are accepted. No network action without explicit flag.
if [[ "${4:-}" == "--fetch-verified-mirror" ]]; then
  command -v curl >/dev/null || { echo "curl required for opt-in recovery" >&2; exit 69; }
  command -v sha256sum >/dev/null || { echo "sha256sum required" >&2; exit 69; }
  base="https://huggingface.co/datasets/fabricioslv/gems-prize-geodawn/resolve/main"
  while read -r name expected; do
    target="$data/$name"
    if [[ -e "$target" || -L "$target" ]]; then
      [[ -f "$target" && ! -L "$target" ]] || { echo "Unsafe existing raster: $name" >&2; exit 65; }
      actual="$(sha256sum "$target" | awk '{print $1}')"
      [[ "$actual" == "$expected" ]] || { echo "Existing raster hash mismatch: $name" >&2; exit 65; }
      echo "SOURCE_REUSED_SHA256_PASS: $name"
      continue
    fi
    partial="$data/.$name.partial.$$"
    [[ ! -e "$partial" && ! -L "$partial" ]] || { echo "Temporary filename collision" >&2; exit 65; }
    cleanup_partial() { rm -f -- "$partial"; }
    trap cleanup_partial EXIT
    echo "Downloading SOURCE DATA only (not running remote code): $name"
    curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
      --retry 2 --connect-timeout 20 --max-time 1800 --max-filesize 550000000 \
      --output "$partial" "$base/$name"
    actual="$(sha256sum "$partial" | awk '{print $1}')"
    [[ "$actual" == "$expected" ]] || { echo "Downloaded raster failed organizer hash: $name" >&2; exit 65; }
    mv -n -- "$partial" "$target"
    trap - EXIT
    echo "SOURCE_DOWNLOADED_SHA256_PASS: $name"
  done <<'HASHES'
example_submission.tif 2176d08e485aa2cd2860ce8df539db4faf4d76163b38a4dd8c30a40454d35cbc
existing_faults.tif 7ba308ccdc4418b31a178f4f1ef21aaa6e152e4028f2f6f64b01f7eb25ae4093
gems-geodawn-numerical-features.tif 4371c82e3b8339b807bdffcf4ef59a225520fe2988d521be208ae33743123bc5
HASHES
fi

# Each file must be the EXACT pinned original, even when --fetch was omitted.
(cd "$here" && python3 - "$data" <<'PY'
import sys
from pathlib import Path
from gems_002_negative_ablation import verify_inputs,validate_organizer_grid
data=Path(sys.argv[1])
original=verify_inputs(data)
grid=validate_organizer_grid(data)
print("GEMS_OFFICIAL_INPUT_SHA256_AND_GRID_PASS",len(original),grid["crs"])
PY
)

# Avoid exhausting a memory-starved owner node. No automatic payment or cloud job.
if [[ -r /proc/meminfo ]]; then
  mem_kb="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
  if [[ -n "$mem_kb" ]] && ((mem_kb < 4194304)); then
    echo "HOLD: less than 4 GiB available RAM. Run in approved isolated memory-sufficient CPU, not production Penguin." >&2
    exit 70
  fi
fi
bash "$here/execute_gems_research_bundle.sh" hard "$data" "$archive" "$output"
echo "GEMS004_REAL_DATA_PROXY_RUN_COMPLETED; HUMAN_REVIEW_REQUIRED; NO_SUBMISSION"
