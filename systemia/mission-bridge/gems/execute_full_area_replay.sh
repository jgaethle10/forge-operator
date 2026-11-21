#!/usr/bin/env bash
# GEMS-002 full-area mapped-fault proxy: fixed baseline 0 vs selected 1000m.
# Run only with authorized official GeoDAWN TIFFs in an isolated free CPU workspace.
# Never submits or writes a candidate. Outputs local research receipts only.
# Usage: bash execute_full_area_replay.sh AUTHORIZED_DATA_DIR GEMS_001_ARCHIVE NEW_OUTPUT_DIR
set -euo pipefail
if [[ $# -ne 3 ]]; then
  echo "Usage: bash execute_full_area_replay.sh AUTHORIZED_DATA_DIR GEMS_001_ARCHIVE NEW_OUTPUT_DIR" >&2
  exit 64
fi
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
data="$(realpath "$1")"
archive="$(realpath "$2")"
output="$3"
[[ -d "$data" && -f "$archive" ]] || { echo "Authorized data or archived original model missing" >&2; exit 65; }
[[ ! -e "$output" ]] || { echo "Refusing to overwrite output" >&2; exit 66; }
output="$(realpath -m "$output")"
case "$output/" in
  "$data/"*|"$script_dir/"*) echo "Output must be outside dataset and repo" >&2; exit 67 ;;
esac
export PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1
model="$script_dir/run.py"
created=0
if [[ ! -e "$model" ]]; then
  python3 - "$archive" "$model" <<'PY'
import hashlib,sys,zipfile
from pathlib import Path
archive=Path(sys.argv[1]);target=Path(sys.argv[2])
with zipfile.ZipFile(archive) as z:raw=z.read("run.py")
expected="db07aef8eb3edaa78efdc704d867cc8c2cf12ae1c8d17152fd0280238c92ca8b"
if hashlib.sha256(raw).hexdigest()!=expected:raise SystemExit("Archived GEMS-001 source hash mismatch")
with target.open("xb") as f:f.write(raw)
PY
  created=1
fi
cleanup() { [[ "$created" != 1 ]] || rm -f "$model"; }
trap cleanup EXIT
cd "$script_dir"
python3 -m unittest -v test_gems_002_full_area_validation.py
mkdir -p "$output"
python3 gems_002_full_area_validation.py --data-dir "$data" --evidence-dir "$output/run-a"
if [[ "${GEMS_REPEAT:-0}" == "1" ]]; then
  python3 gems_002_full_area_validation.py --data-dir "$data" --evidence-dir "$output/run-b"
fi
python3 - "$output" <<'PY'
import json,sys
from pathlib import Path
root=Path(sys.argv[1])
left=json.loads((root/"run-a/full-area-proxy.json").read_text())
repeated=(root/"run-b/full-area-proxy.json").exists()
if repeated:
    right=json.loads((root/"run-b/full-area-proxy.json").read_text())
    left.pop("elapsed_seconds",None);right.pop("elapsed_seconds",None)
    if left!=right:
        raise SystemExit("Full-area replay disagreement: HOLD, do not promote")
assert left["submission_made"] is False and left["competition_score_known"] is False
baseline=left["postprocess_exploratory_summaries"]["r0_t0.2_min1"]["full_area_pooled_dti"]
selected=left["postprocess_exploratory_summaries"]["r10_t0.2_min1"]["full_area_pooled_dti"]
ranking=sorted(((v["full_area_pooled_dti"],k) for k,v in left["postprocess_exploratory_summaries"].items()),reverse=True)
summary={"schema":"evercraft.gems.full-area-proxy-replay.v2",
 "full_area_baseline_proxy":baseline,"full_area_1000m_proxy":selected,
 "delta_vs_baseline":selected-baseline,
 "highest_exploratory_postprocess_proxy":ranking[0][1],
 "highest_exploratory_postprocess_proxy_dti":ranking[0][0],
 "all_fold_records_reproduced":repeated,"two_executions":repeated,
 "not_an_unseen_validation":True,"not_an_official_score":True,
 "scored_submission_made":False}
(root/"full-area-replay-summary.json").write_text(json.dumps(summary,indent=2)+"\n")
print(json.dumps(summary,indent=2))
PY
echo "FULL-AREA PROXY STUDY COMPLETE; inspect FP terms and segment folds. NO SUBMISSION."
