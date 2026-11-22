#!/usr/bin/env bash
# GEMS-005 offline 34 vs 38 geophysical-feature ablation.
# No downloads, no scored submission, no candidate file, no promotion.
# Usage: execute_directional_ablation.sh AUTHORIZED_DATA_DIR GEMS001_ARCHIVE NEW_EVIDENCE_DIR
set -euo pipefail
if [[ $# -ne 3 ]]; then
  echo 'Usage: execute_directional_ablation.sh AUTHORIZED_DATA_DIR GEMS001_ARCHIVE NEW_EVIDENCE_DIR' >&2
  exit 64
fi
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
data="$(realpath "$1")"
archive="$(realpath "$2")"
output="$(realpath -m "$3")"
[[ -d "$data" && -f "$archive" ]] || { echo 'Missing authorized original inputs: stop, no downloads' >&2;exit 65; }
[[ ! -e "$output" ]] || { echo 'Refusing to overwrite existing evidence' >&2;exit 66; }
case "$output/" in
 "$data/"*|"$here/"*) echo 'Output inside input data or repo is forbidden' >&2;exit 67;;
esac
export PYTHONHASHSEED=0 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1
model="$here/run.py"
created=0
if [[ ! -e "$model" ]]; then
 python3 - "$archive" "$model" <<'PY'
import hashlib,sys,zipfile
from pathlib import Path
with zipfile.ZipFile(sys.argv[1]) as archive:source=archive.read('run.py')
expected='db07aef8eb3edaa78efdc704d867cc8c2cf12ae1c8d17152fd0280238c92ca8b'
if hashlib.sha256(source).hexdigest()!=expected:raise SystemExit('Original model source SHA mismatch')
with Path(sys.argv[2]).open('xb') as file:file.write(source)
PY
 created=1
fi
cleanup() { if [[ "$created" == "1" ]]; then rm -f "$model"; fi; }
trap cleanup EXIT
cd "$here"
python3 -m unittest -v test_gems_005_directional_features.py test_gems_005_directional_ablation.py
mkdir -p "$output"
python3 gems_005_directional_ablation.py --data-dir "$data" --evidence-dir "$output/run-a"
python3 - "$output" <<'PY'
import json,sys
from pathlib import Path
dest=Path(sys.argv[1]);r=json.loads((dest/'run-a/directional-full-area-ablation.json').read_text())
# Same conservation and off-corridor score audit on the solo GEMS-005 path.
from gems_cross_experiment_gate import validate_pooled
validate_pooled(r,'baseline_34','full_area_original_34','corridor_original_34')
validate_pooled(r,'directional_38','full_area_directional_38','corridor_directional_38')
assert r['submission_made'] is False and r['automatic_promotion_allowed'] is False
base=r['full_area_original_34'];test=r['full_area_directional_38']
result={'schema':'evercraft.gems.directional-decision-gate.v1',
 'baseline_known_fault_full_area':base,'directional_known_fault_full_area':test,
 'delta_dti':test['dti']-base['dti'],
 'all_three_folds_improve':all(f['directional_38']['full_dti']>f['baseline_34']['full_dti'] for f in r['fold_ledger']),
 'not_an_unseen_validation':True,'hidden_new_fault_score_available':False,
 'new_candidate_created':False,'scored_submission_made':False,'auto_promote':False}
(dest/'directional-decision-gate.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
PY
echo 'GEMS-005 OFFLINE PROXY COMPLETE, NO CANDIDATE OR SUBMISSION.'
