#!/usr/bin/env bash
# One authorized, local-only GEMS research handoff.
# Run: bash execute_gems_research_bundle.sh hard|directional|both OFFICIAL_DATA_DIR GEMS001_ZIP NEW_PRIVATE_OUTPUT_DIR
# No network, no credentials, no prediction TIFF, no DrivenData submission.
set -euo pipefail
umask 077

usage='Usage: execute_gems_research_bundle.sh hard|directional|both AUTHORIZED_GEODAWN_DIR GEMS001_ZIP NEW_PRIVATE_OUTPUT_DIR'
if [[ $# -ne 4 ]]; then echo "$usage" >&2; exit 64; fi
mode="$1"
case "$mode" in hard|directional|both) ;; *) echo "$usage" >&2; exit 64;; esac

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo="$(realpath "$here/../../..")"
# Refuse symlinked source inputs and any output under source or repository.
[[ ! -L "$2" && ! -L "$3" ]] || { echo 'Refusing symlinked inputs' >&2; exit 65; }
[[ -d "$2" && -f "$3" ]] || { echo 'Authorized local inputs missing; no download or execution' >&2; exit 65; }
data="$(realpath "$2")"
archive="$(realpath "$3")"
dest="$(realpath -m "$4")"
[[ "$data" != "$repo" && "$data/" != "$repo/"* ]] || { echo 'Private source dataset must not be inside repository' >&2; exit 65; }
[[ "$dest" != "$data" && "$dest/" != "$data/"* &&
   "$dest" != "$repo" && "$dest/" != "$repo/"* &&
   "$dest" != "$archive" && ! -e "$dest" && ! -L "$dest" ]] || {
   echo 'Output unsafe, already present, or within source/repository' >&2; exit 66;
}
[[ "${GEMS_REPEAT:-0}" == 0 ]] || {
  echo 'This bounded bundle refuses repeat runs; use a separate reviewed experiment' >&2; exit 67;
}
[[ -d "$(dirname "$dest")" ]] || {
  echo 'Output parent must exist in private owner-controlled storage' >&2; exit 67;
}

# Verify source bytes and model BEFORE creating output or paying any CPU cost for training.
# Already-pinned official checks are shared with GEMS-004 and GEMS-005.
(cd "$here" && python3 - "$data" "$archive" <<'PY'
import hashlib,sys,zipfile
from pathlib import Path
from gems_002_negative_ablation import (
    ARCHIVED_GEMS_001_RUN_SHA256, verify_inputs, validate_organizer_grid,
    verify_original_model_source)
data, archive = Path(sys.argv[1]), Path(sys.argv[2])
manifest=verify_inputs(data)
grid=validate_organizer_grid(data)
with zipfile.ZipFile(archive) as z:
    source=z.read('run.py')
if hashlib.sha256(source).hexdigest()!=ARCHIVED_GEMS_001_RUN_SHA256:
    raise SystemExit('Preserved GEMS-001 source hash mismatch')
local=Path('run.py')
if local.exists() or local.is_symlink():
    verify_original_model_source(local)
print('GEMS research source preflight PASS:', grid['crs'],
      grid['width'], 'x', grid['height'], 'input rasters=', len(manifest))
PY
)

mkdir -m 0700 "$dest"
export GEMS_REPEAT=0 PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1
if [[ "$mode" == hard || "$mode" == both ]]; then
  bash "$here/execute_hard_negative_ablation.sh" "$data" "$archive" "$dest/gems004"
fi
if [[ "$mode" == directional || "$mode" == both ]]; then
  bash "$here/execute_directional_ablation.sh" "$data" "$archive" "$dest/gems005"
fi
if [[ "$mode" == both ]]; then
  (cd "$here" && python3 gems_cross_experiment_gate.py \
    --gems004 "$dest/gems004/run-a/hard-negative-full-area.json" \
    --gems005 "$dest/gems005/run-a/directional-full-area-ablation.json" \
    --receipt "$dest/cross-experiment-verification.json")
fi

# No declaration of official improvement can emerge from an offline proxy run.
python3 - "$mode" "$dest" <<'PY'
import json,sys
from pathlib import Path
mode,dest=sys.argv[1],Path(sys.argv[2])
summary={
  "schema":"evercraft.gems.bounded-offline-research-handoff.v1",
  "mode":mode,
  "gems004_report_exists":(dest/'gems004/run-a/hard-negative-full-area.json').is_file(),
  "gems005_report_exists":(dest/'gems005/run-a/directional-full-area-ablation.json').is_file(),
  "baseline_parity_verified":(dest/'cross-experiment-verification.json').is_file(),
  "research_only":True,
  "hidden_new_fault_dti_known":False,
  "independent_unseen_validation":False,
  "scored_submission_made":False,
  "candidate_geotiff_created":False,
  "automatic_promotion_allowed":False
}
with (dest/'handoff-summary.json').open('x') as f:
    json.dump(summary,f,indent=2,allow_nan=False)
    f.write('\n')
print(json.dumps(summary,indent=2))
PY
echo 'GEMS OFFLINE RESEARCH HANDOFF COMPLETE. Preserve all private evidence; do not submit.'
