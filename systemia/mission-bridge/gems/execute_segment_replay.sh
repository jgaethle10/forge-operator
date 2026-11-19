#!/usr/bin/env bash
# GEMS-002 connected-segment real-data replay. Isolated research only.
# Usage: bash execute_segment_replay.sh /path/to/authorized/data /path/to/gems_001_verified_submission.zip /private/output/new-directory
set -euo pipefail
if [[ $# -ne 3 ]]; then
  echo "Usage: bash execute_segment_replay.sh AUTHORIZED_DATA_DIR GEMS_001_ARCHIVE NEW_OUTPUT_DIR" >&2
  exit 64
fi
data_dir="$(realpath "$1")"
archive="$(realpath "$2")"
dest="$3"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1
[[ -d "$data_dir" && -f "$archive" ]] || { echo "Authorized dataset dir or archived original model missing" >&2; exit 65; }
[[ -f "$script_dir/gems_002_segment_holdouts.py" ]] || { echo "Repository experiment source missing" >&2; exit 66; }
[[ ! -e "$dest" ]] || { echo "Refusing to overwrite existing evidence output: $dest" >&2; exit 67; }
mkdir -p "$dest"
dest="$(realpath "$dest")"
[[ "$dest" != "$script_dir"* && "$dest" != "$data_dir"* ]] || { echo "Evidence output must be outside source and dataset directories" >&2; exit 68; }
mkdir -p "$dest"/run-a "$dest"/run-b
original="$script_dir/run.py"
created_source=0
if [[ ! -e "$original" ]]; then
  python3 - "$archive" "$original" <<'PY'
import hashlib,sys,zipfile
from pathlib import Path
arch=Path(sys.argv[1]);out=Path(sys.argv[2])
with zipfile.ZipFile(arch) as z:
    data=z.read("run.py")
expected="db07aef8eb3edaa78efdc704d867cc8c2cf12ae1c8d17152fd0280238c92ca8b"
if hashlib.sha256(data).hexdigest()!=expected:
    raise SystemExit("Archived GEMS-001 model source SHA-256 mismatch")
out.write_bytes(data)
PY
  created_source=1
fi
cleanup() { if [[ "$created_source" == 1 ]]; then rm -f "$original"; fi; }
trap cleanup EXIT
cd "$script_dir"
python3 -m unittest -v test_gems_002_segment_holdouts.py 2>&1 | tee "$dest/unit-tests.log"
python3 verify_official_input_hashes.py "$data_dir" --receipt "$dest/input-integrity.json" | tee "$dest/hash-verification.log"
python3 gems_002_segment_holdouts.py --data-dir "$data_dir" --evidence-dir "$dest/run-a" 2>&1 | tee "$dest/run-a-execution.log"
python3 gems_002_segment_holdouts.py --data-dir "$data_dir" --evidence-dir "$dest/run-b" 2>&1 | tee "$dest/run-b-execution.log"
python3 - "$dest" <<'PY'
import copy,hashlib,json,sys
from pathlib import Path
out=Path(sys.argv[1])
a=json.loads((out/"run-a/gems-002-connected-segment-holdout.json").read_text())
b=json.loads((out/"run-b/gems-002-connected-segment-holdout.json").read_text())
assert a["submission_made"] is False and b["submission_made"] is False
assert a["inputs"]==b["inputs"]
a.pop("elapsed_seconds",None);b.pop("elapsed_seconds",None)
if a!=b:
    raise SystemExit("Independent whole-fault experiments disagreed: STOP, no promotion")
report={"schema":"evercraft.gems.segment-repro.v1","passes":True,
  "source":"GEMS-002 connected-component whole-fault mapped-label proxy",
  "input_manifest":a["inputs"],
  "fold_ledger_exactly_reproduced_excluding_runtime":True,
  "pooled_baseline":a["pooled_mapped_fault_proxy"]["0"],
  "pooled_exclude_1000m":a["pooled_mapped_fault_proxy"]["10"],
  "delta":a["winner_gain"],"submission_made":False,
  "ground_truth_is_new_faults":False}
p=out/"segment-reproducibility.json"
p.write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps(report,indent=2))
PY
echo "COMPLETE. Evidence is private at $dest; DO NOT submit based on this proxy alone."
