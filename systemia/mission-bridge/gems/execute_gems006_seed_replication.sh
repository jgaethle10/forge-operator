#!/usr/bin/env bash
# Bounded, OWNER-LOCAL, single-seed replication of the GEMS-004
# distance-matched random negative control. No hard-negative model fitted.
# Usage: bash execute_gems006_seed_replication.sh VERIFIED_RASTERS_DIR
#        PRESERVED_GEMS001_ZIP ORIGINAL_GEMS004_REPORT_JSON NEW_PRIVATE_EVIDENCE_DIR
set -euo pipefail
umask 077
if [[ $# -ne 4 ]]; then
  echo 'Usage: execute_gems006_seed_replication.sh OFFICIAL_DATA_DIR GEMS001_ZIP ORIGINAL_GEMS004_JSON NEW_PRIVATE_EVIDENCE_DIR' >&2
  exit 64
fi
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo="$(realpath "$dir/../../..")"
for arg in "$1" "$2" "$3" "$4"; do
  [[ ! -L "$arg" ]] || { echo "Refusing symlink path" >&2; exit 65; }
done
[[ -d "$1" && -f "$2" && -f "$3" ]] || {
  echo "Missing owner-private original data, preserved GEMS-001 archive or GEMS-004 receipt" >&2
  exit 65
}
data="$(realpath "$1")"
archive="$(realpath "$2")"
prior="$(realpath "$3")"
out="$(realpath -m "$4")"
[[ "$data" != "$repo" && "$data/" != "$repo/"* ]] || {
  echo "Restricted source data cannot be inside repository" >&2; exit 65;
}
[[ "$out" != "$repo" && "$out/" != "$repo/"* &&
   "$out" != "$data" && "$out/" != "$data/"* &&
   ! -e "$out" && ! -L "$out" ]] || {
  echo "Private evidence output must be new and outside data/repository" >&2
  exit 66
}
[[ "${GEMS_REPEAT:-0}" == 0 ]] || {
  echo "Refusing repeated or automatic training" >&2; exit 67;
}
[[ -d "$(dirname "$out")" ]] || {
  echo "Private evidence parent must already exist" >&2; exit 67;
}
# Verify original archive bytes, model source, and original report before
# allocating the large official feature matrix or creating any output.
(cd "$dir" && python3 - "$archive" "$prior" "$data" <<'PY'
import hashlib,sys,zipfile
from pathlib import Path
from gems_002_negative_ablation import (
    ARCHIVED_GEMS_001_RUN_SHA256,verify_inputs,validate_organizer_grid)
from gems_006_seed_replication import original_receipt_check
import json
archive,prior,data=map(Path,sys.argv[1:])
# This archive SHA is the GEMS-004 Work research receipt, not a user password.
expected_zip="c64bc77aa5756236dce97e08bf29e67396311d6b2014cf40c38358b354fcc377"
h=hashlib.sha256()
with archive.open("rb") as f:
    for block in iter(lambda:f.read(1048576),b""):
        h.update(block)
if h.hexdigest()!=expected_zip:
    raise SystemExit("Preserved GEMS-001 ZIP SHA mismatch")
with zipfile.ZipFile(archive) as z:
    info=z.getinfo("run.py")
    if info.file_size>1024*1024:
        raise SystemExit("Original run.py unexpectedly large")
    raw=z.read(info)
if hashlib.sha256(raw).hexdigest()!=ARCHIVED_GEMS_001_RUN_SHA256:
    raise SystemExit("Original run.py SHA mismatch")
if prior.stat().st_size>10*1024*1024:
    raise SystemExit("Prior GEMS-004 report unexpectedly large")
source=json.loads(prior.read_bytes())
original_receipt_check(source)
if source["source_sha256"]!=ARCHIVED_GEMS_001_RUN_SHA256:
    raise SystemExit("Original model provenance mismatch")
if source["input_manifest"]!=verify_inputs(data) or source["grid"]!=validate_organizer_grid(data):
    raise SystemExit("Original GEMS-004 input or geospatial grid drift")
print("GEMS006_SOURCE_AND_ORIGINAL_RECEIPT_PREFLIGHT_PASS")
PY
)
# This local file is already checked against the archived source above.
model="$dir/run.py"
created=0
if [[ -e "$model" || -L "$model" ]]; then
  [[ -f "$model" && ! -L "$model" ]] || { echo "Unsafe existing model source" >&2; exit 65; }
  (cd "$dir" && python3 - <<'PY'
from pathlib import Path
from gems_002_negative_ablation import verify_original_model_source
verify_original_model_source(Path("run.py"))
PY
)
else
  python3 - "$archive" "$model" <<'PY'
import sys,zipfile
from pathlib import Path
with zipfile.ZipFile(sys.argv[1]) as z:
    source=z.read("run.py")
with Path(sys.argv[2]).open("xb") as f:
    f.write(source)
PY
  created=1
fi
cleanup() { if [[ "$created" == 1 ]]; then rm -f -- "$model"; fi; }
trap cleanup EXIT
export PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1
(cd "$dir" && python3 -m unittest -v test_gems_006_seed_replication.py)
(cd "$dir" && python3 gems_006_seed_replication.py \
    --data-dir "$data" --original-gems004-report "$prior" \
    --evidence-dir "$out")
echo "GEMS006_INDEPENDENT_SEED_MAPPED_FAULT_PROXY_COMPLETE_NO_SUBMISSION"
