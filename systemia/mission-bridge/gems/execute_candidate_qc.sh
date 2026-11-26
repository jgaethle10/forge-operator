#!/usr/bin/env bash
# GEMS-002 offline full-grid build + preserved GEMS-001 comparison.
# No DrivenData submission. No network downloads. Existing official data only.
# Usage: bash execute_candidate_qc.sh AUTHORIZED_DATA_DIR GEMS_001_ARCHIVE NEW_OUTPUT_DIR
set -euo pipefail
if [[ $# -ne 3 ]]; then
  echo "Usage: bash execute_candidate_qc.sh AUTHORIZED_DATA_DIR GEMS_001_ARCHIVE NEW_OUTPUT_DIR" >&2
  exit 64
fi
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
data_dir="$(realpath "$1")"
archive="$(realpath "$2")"
output="$3"
if [[ ! -d "$data_dir" || ! -f "$archive" ]]; then
  echo "Missing authorized raster directory or GEMS-001 archive" >&2; exit 65
fi
if [[ -e "$output" ]]; then
  echo "Output already exists; refusal to overwrite" >&2; exit 66
fi
output_parent="$(realpath -m "$(dirname "$output")")"
output="$output_parent/$(basename "$output")"
case "$output/" in
  "$data_dir/"*|"$script_dir/"*) echo "Unsafe output inside organizer data or repository" >&2; exit 67 ;;
esac
export PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1
source_path="$script_dir/run.py"
created_source=0
if [[ ! -e "$source_path" ]]; then
  python3 - "$archive" "$source_path" <<'PY'
import hashlib,sys,zipfile
from pathlib import Path
archive=Path(sys.argv[1]);dst=Path(sys.argv[2])
with zipfile.ZipFile(archive) as z:
    source=z.read("run.py")
expected="db07aef8eb3edaa78efdc704d867cc8c2cf12ae1c8d17152fd0280238c92ca8b"
if hashlib.sha256(source).hexdigest()!=expected:
    raise SystemExit("Wrong archived original model SHA256")
with dst.open("xb") as f:f.write(source)
PY
  created_source=1
fi
cleanup() { if [[ "$created_source" == "1" ]]; then rm -f "$source_path"; fi; }
trap cleanup EXIT
cd "$script_dir"
python3 -m unittest -v test_gems_002_prepare_candidate.py test_audit_candidate_comparison.py
# No output created before hash and metadata checks; the builder refuses an existing output.
python3 gems_002_prepare_candidate.py --data-dir "$data_dir" --output-dir "$output"
export GEMS_002_OUTPUT="$output"
expected="$(python3 - <<'PY'
import json,os
from pathlib import Path
receipt=json.loads((Path(os.environ["GEMS_002_OUTPUT"])/"candidate-evidence.json").read_text())
assert receipt["submission_made"] is False
assert receipt["automatic_promotion_allowed"] is False
assert receipt["negative_exclusion_meters"] == 1000
assert receipt["sha256_and_roundtrip_verified"] is True
print(receipt["candidate_sha256"])
PY
)"
python3 audit_candidate_comparison.py \
  --gems-001-archive "$archive" \
  --gems-002-tif "$output/gems_002_candidate_UNSUBMITTED.tif" \
  --expected-gems-002-sha256 "$expected" \
  --receipt "$output/full-grid-comparison.json"
python3 - <<'PY'
import json,os
from pathlib import Path
root=Path(os.environ["GEMS_002_OUTPUT"])
a=json.loads((root/"candidate-evidence.json").read_text())
b=json.loads((root/"full-grid-comparison.json").read_text())
assert a["candidate_sha256"] == b["gems_002_sha256"]
assert b["grid_and_nan_mask_match"]
assert a["submission_made"] is False and b["submission_made"] is False
print(json.dumps({"state":"offline_candidate_qc_complete",
 "candidate_sha256":a["candidate_sha256"],
 "finite_cells":a["finite_grid_cells"],
 "candidate_positive_fraction":a["positive_prediction_fraction"],
 "positive_ge_0_2_density_ratio_vs_gems_001":b["density_ge_0_2_ratio_new_vs_old"],
 "ready_for_scored_submission":False,"submission_made":False},indent=2))
PY
echo "OFFLINE QC COMPLETE. Inspect both evidence JSONs; do not auto-submit."
