#!/usr/bin/env bash
# GEMS-004 controlled hard-negative HGB comparison, full northern scoreable area.
# Offline private research ONLY. Does not create GeoTIFF or submit to DrivenData.
# Usage: bash execute_hard_negative_ablation.sh OFFICIAL_DATA_DIR GEMS001_ZIP NEW_OUTPUT_DIR
# Default one real-data run. Set GEMS_REPEAT=1 ONLY for justified replay.
set -euo pipefail
if [[ $# -ne 3 ]]; then
  echo "Usage: bash execute_hard_negative_ablation.sh AUTHORIZED_GEODAWN_DIR GEMS_001_ARCHIVE_ZIP NEW_EVIDENCE_DIR" >&2
  exit 64
fi
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
data="$(realpath "$1")"
archive="$(realpath "$2")"
dest="$(realpath -m "$3")"
[[ -d "$data" && -f "$archive" ]] || { echo "Authorized source files missing: STOP, no download or compute" >&2; exit 65; }
[[ ! -e "$dest" ]] || { echo "Evidence directory exists, refusing overwrite" >&2; exit 66; }
case "$dest/" in
  "$data/"*|"$dir/"*) echo "Evidence output cannot reside inside official data or repository" >&2; exit 67 ;;
esac
export PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1
model="$dir/run.py"
created=0
if [[ ! -e "$model" ]]; then
  python3 - "$archive" "$model" <<'PY'
from pathlib import Path
import hashlib,sys,zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    source=archive.read("run.py")
expected="db07aef8eb3edaa78efdc704d867cc8c2cf12ae1c8d17152fd0280238c92ca8b"
if hashlib.sha256(source).hexdigest()!=expected:raise SystemExit("Archived original model SHA mismatch")
with Path(sys.argv[2]).open("xb") as f:f.write(source)
PY
  created=1
fi
cleanup() { if [[ "$created" == 1 ]]; then rm -f "$model"; fi; }
trap cleanup EXIT
cd "$dir"
python3 -m unittest -v test_gems_004_hard_negative_ablation.py
mkdir -p "$dest"
python3 gems_004_hard_negative_ablation.py --data-dir "$data" --evidence-dir "$dest/run-a"
if [[ "${GEMS_REPEAT:-0}" == "1" ]]; then
  python3 gems_004_hard_negative_ablation.py --data-dir "$data" --evidence-dir "$dest/run-b"
fi
python3 - "$dest" <<'PY'
from pathlib import Path
import sys,json
out=Path(sys.argv[1])
a=json.loads((out/"run-a/hard-negative-full-area.json").read_text())
rep=(out/"run-b/hard-negative-full-area.json").exists()
if rep:
    b=json.loads((out/"run-b/hard-negative-full-area.json").read_text())
    a.pop("execution_elapsed_seconds",None)
    b.pop("execution_elapsed_seconds",None)
    if a!=b:raise SystemExit("REPLAY MISMATCH: no promotion or submission")
assert a["scored_submission_made"] is False
assert a["model_promotion_allowed"] is False
assert a["candidate_tif_created"] is False
base=a["full_area_baseline"];candidate=a["full_area_hard_negative"]
summary={
    "schema":"evercraft.gems.hard-negative-decision-gate.v1",
    "selection_target":"known-fault full-area geographic proxy, not official hidden new-fault score",
    "baseline_dti":base["dti"],"hard_mined_dti":candidate["dti"],
    "hard_minus_baseline":candidate["dti"]-base["dti"],
    "baseline_weighted_terms":base,"hard_mined_weighted_terms":candidate,
    "corridor_proxy_baseline":a["corridor_baseline"]["dti"],
    "corridor_proxy_hard_mined":a["corridor_hard_negative"]["dti"],
    "all_three_folds_improve_full_area":all(
        row["hard_mined"]["full_dti"]>row["baseline"]["full_dti"]
        for row in a["fold_ledger"]),
    "repeat_executed":rep,"reproducibility_checked":rep,
    "recommend_scored_submission":False,"scored_submission_made":False}
(out/"hard-negative-decision-gate.json").write_text(json.dumps(summary,indent=2)+"\n")
print(json.dumps(summary,indent=2))
PY
echo "GEMS-004 HARD-NEGATIVE PROXY EVALUATED OFFLINE. Do not promote or submit."
