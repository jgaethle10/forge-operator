#!/usr/bin/env bash
# GEMS-007: one bounded PRIVATE, CPU-only, previously-exposed southern
# geographic transfer stress test. No independent hidden test or submission.
# Usage: bash execute_gems007_southern_transfer.sh DATA_DIR ORIGINAL_GEMS001_ZIP
#        ORIGINAL_GEMS004_JSON GEMS006_JSON NEW_PRIVATE_OUTPUT_DIR
set -euo pipefail
umask 077
if [[ $# -ne 5 ]]; then
  echo 'Usage: execute_gems007_southern_transfer.sh VERIFIED_DATA_DIR ORIGINAL_GEMS001_ZIP ORIGINAL_GEMS004_JSON GEMS006_JSON NEW_PRIVATE_OUTPUT_DIR' >&2
  exit 64
fi
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo="$(realpath "$here/../../..")"
for path in "$1" "$2" "$3" "$4" "$5"; do
  [[ ! -L "$path" ]] || { echo 'Refusing symlinked GEMS input/output path' >&2; exit 65; }
done
[[ -d "$1" && -f "$2" && -f "$3" && -f "$4" ]] || {
  echo 'All original private inputs/receipts required; no download or re-run' >&2
  exit 65
}
data="$(realpath "$1")"
archive="$(realpath "$2")"
gems004="$(realpath "$3")"
gems006="$(realpath "$4")"
out="$(realpath -m "$5")"
[[ "$data" != "$repo" && "$data/" != "$repo/"* ]] || {
  echo 'Private competition rasters cannot reside inside repo' >&2; exit 65;
}
[[ "$out" != "$data" && "$out/" != "$data/"* &&
   "$out" != "$repo" && "$out/" != "$repo/"* &&
   "$out" != "$archive" && "$out" != "$gems004" &&
   "$out" != "$gems006" && ! -e "$out" && ! -L "$out" ]] || {
  echo 'Output must be NEW, private, and outside source or repo' >&2; exit 66;
}
[[ -d "$(dirname "$out")" ]] || {
  echo 'Private evidence parent must already exist' >&2; exit 66;
}
[[ "${GEMS_REPEAT:-0}" == 0 ]] || {
  echo 'No automatic or duplicate experiment replays' >&2; exit 67;
}
# Strict archive and published original-source hash, frozen north-only
# method receipts and original official rasters checked before fitting.
(cd "$here" && python3 - "$archive" "$gems004" "$gems006" "$data" <<'PY'
import hashlib,json,sys,zipfile
from pathlib import Path
from gems_002_negative_ablation import (
    ARCHIVED_GEMS_001_RUN_SHA256,verify_inputs,validate_organizer_grid,
    verify_original_model_source)
from gems_007_southern_transfer import load_frozen_preregistration
archive,gems004,gems006,data=map(Path,sys.argv[1:])
expected="c64bc77aa5756236dce97e08bf29e67396311d6b2014cf40c38358b354fcc377"
h=hashlib.sha256()
with archive.open("rb") as f:
    for chunk in iter(lambda:f.read(1048576),b""):
        h.update(chunk)
if h.hexdigest()!=expected:
    raise SystemExit("Preserved GEMS-001 archive SHA256 mismatch")
with zipfile.ZipFile(archive) as z:
    member=z.getinfo("run.py")
    if member.file_size>1024*1024:
        raise SystemExit("Original run.py larger than expected")
    model=z.read(member)
if hashlib.sha256(model).hexdigest()!=ARCHIVED_GEMS_001_RUN_SHA256:
    raise SystemExit("Preserved original run.py SHA256 mismatch")
original, frozen=load_frozen_preregistration(gems004,gems006)
if original["source_sha256"]!=ARCHIVED_GEMS_001_RUN_SHA256:
    raise SystemExit("GEMS-004 original source provenance mismatch")
if original["input_manifest"]!=verify_inputs(data):
    raise SystemExit("Official GeoDAWN input SHA256 mismatch")
if original["grid"]!=validate_organizer_grid(data):
    raise SystemExit("Official organizer CRS/grid mismatch")
local=Path("run.py")
if local.exists() or local.is_symlink():
    verify_original_model_source(local)
print("GEMS007_VERIFIED_SOURCE_AND_FROZEN_METHOD_PASS")
PY
)
model="$here/run.py"
created=0
if [[ ! -e "$model" && ! -L "$model" ]]; then
  python3 - "$archive" "$model" <<'PY'
import sys,zipfile
from pathlib import Path
with zipfile.ZipFile(sys.argv[1]) as z:raw=z.read("run.py")
with Path(sys.argv[2]).open("xb") as f:f.write(raw)
PY
  created=1
fi
cleanup() { if [[ "$created" == 1 ]]; then rm -f -- "$model"; fi; }
trap cleanup EXIT
export PYTHONHASHSEED=0 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1
(cd "$here" && python3 -m unittest -v test_gems_007_southern_transfer.py)
(cd "$here" && python3 gems_007_southern_transfer.py \
    --data-dir "$data" \
    --gems004-report "$gems004" \
    --gems006-report "$gems006" \
    --evidence-dir "$out")
echo 'GEMS007_REUSED_SOUTHERN_GEOGRAPHIC_STRESS_COMPLETE; NO NEW GEOLOGIC VALIDATION OR SUBMISSION'
