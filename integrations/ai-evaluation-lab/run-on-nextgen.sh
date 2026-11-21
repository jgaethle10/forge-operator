#!/usr/bin/env bash
# Evercraft EO-001 on a user-owned Ubuntu/WSL laptop.
# Never runs a production Systemia mission or opens any public listener.
set -euo pipefail
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CANDIDATE="$SOURCE_DIR/eo001-raven-local-candidate.mjs"
LAB_SHA="2b97c5b5bd99a28e515b1da320034d495048ee9e"
LAB_BRANCH="research/eo001-receipt-audit-20261029"
ROOT="${HOME}/.local/state/evercraft/eo001-laptop-isolated"
MODEL=""
if [[ "${1:-}" == "--probe" ]]; then
  command -v node >/dev/null || { echo 'Missing node (Node 22+ required)' >&2; exit 2; }
  command -v curl >/dev/null || { echo 'Missing curl for local-only metadata probe' >&2; exit 2; }
  command -v python3 >/dev/null || { echo 'Missing Python 3 for local-only JSON parsing' >&2; exit 2; }
  echo 'Evercraft Raven local inference diagnostics (no prompts or installation):'
  echo "Node: $(node --version)"
  echo "Python: $(python3 --version 2>&1)"
  if grep -qi microsoft /proc/sys/kernel/osrelease 2>/dev/null; then
    echo 'Runtime: WSL Linux (Windows-hosted Ollama may use a different network namespace)'
  else
    echo 'Runtime: Linux'
  fi
  if command -v ollama >/dev/null 2>&1; then
    echo "Linux Ollama CLI: $(command -v ollama)"
  else
    echo 'Linux Ollama CLI: not found in WSL PATH'
  fi
  if command -v powershell.exe >/dev/null 2>&1; then
    windows_ollama="$(powershell.exe -NoLogo -NoProfile -NonInteractive -Command '$o = Get-Command ollama.exe -ErrorAction SilentlyContinue; if ($o) { "available" } else { "not-in-Windows-PATH" }' 2>/dev/null | tr -d '\r' | head -n 1 || true)"
    echo "Windows Ollama CLI: ${windows_ollama:-not-determined}"
  fi
  awk '/MemTotal:/ {printf "WSL memory limit visible: %.1f GiB\n", $2 / 1048576}' /proc/meminfo
  if command -v df >/dev/null 2>&1; then df -h "$HOME" | awk 'NR==2 {print "Available disk space on HOME:", $4}'; fi
  # Never pipe an HTTP failure into JSON parsing. Connection-refused is not proof
  # that Ollama or a compatible model is uninstalled on either operating system.
  if inventory="$(curl -fsS --max-time 4 http://127.0.0.1:11434/api/tags 2>/dev/null)"; then
    if printf '%s' "$inventory" | python3 -c 'import json,sys; v=json.load(sys.stdin); assert isinstance(v.get("models"),list); print("Reachable local model inventory:"); print(json.dumps({"models":[x.get("name") for x in v["models"]]},indent=2))'; then
      exit 0
    fi
    echo 'Local service responded, but model inventory was invalid JSON.' >&2
    exit 2
  fi
  echo 'No Ollama HTTP service is listening on 127.0.0.1:11434 inside this WSL session.' >&2
  echo 'This is a missing or unreachable LOCAL SERVICE, not evidence that no model is installed.' >&2
  echo 'If the Linux Ollama CLI is installed, start its server locally and re-run --probe.' >&2
  echo 'If only the Windows Ollama CLI exists, WSL NAT/mirrored network settings may affect localhost reachability.' >&2
  echo 'Do not change Node002 remote_jobs_enabled or expose a model listener on the LAN.' >&2
  exit 2
fi
if [[ "${1:-}" == "--model" ]]; then MODEL="${2:-}"; fi
if [[ -z "$MODEL" || ! "$MODEL" =~ ^[A-Za-z0-9_.:/-]+$ ]]; then
  echo 'Usage: bash integrations/ai-evaluation-lab/run-on-nextgen.sh --probe' >&2
  echo '   or: bash integrations/ai-evaluation-lab/run-on-nextgen.sh --model INSTALLED_LOCAL_MODEL' >&2
  exit 2
fi
command -v node >/dev/null || { echo 'Node 22+ required' >&2; exit 2; }
command -v python3 >/dev/null || { echo 'Python 3.10+ required' >&2; exit 2; }
command -v git >/dev/null || { echo 'Git required' >&2; exit 2; }
# Do not start, enroll, or modify the existing Node002 agent or systemd services.
mkdir -p "$ROOT" && chmod 700 "$ROOT"
node "$CANDIDATE" --model "$MODEL" --probe
LAB="$ROOT/ai-evaluation-lab"
if [[ ! -d "$LAB/.git" ]]; then
  git clone --filter=blob:none --no-checkout --single-branch --branch "$LAB_BRANCH" \
    https://github.com/kaulastudies/ai-evaluation-lab.git "$LAB"
fi
git -C "$LAB" fetch --depth 1 origin "$LAB_SHA"
git -C "$LAB" checkout --detach "$LAB_SHA"
if [[ "$(git -C "$LAB" rev-parse HEAD)" != "$LAB_SHA" ]]; then
  echo 'Pinned independent Lab commit mismatch; refusing run' >&2
  exit 2
fi
if [[ ! -x "$ROOT/.venv/bin/python" ]]; then python3 -m venv "$ROOT/.venv"; fi
"$ROOT/.venv/bin/python" -m pip install -q --disable-pip-version-check \
  -r "$LAB/research/eo001_receipt_audit/durable/requirements.txt"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN="$ROOT/runs/$STAMP"
mkdir -p "$RUN/model-receipts"
chmod 700 "$RUN" "$RUN/model-receipts"
# The Lab runner strips inherited provider env variables; explicit argv binds
# only the local model name and safe private receipt directory.
CMD_JSON="$(python3 - "$CANDIDATE" "$MODEL" "$RUN/model-receipts" <<'PY'
import json,sys
print(json.dumps(["node",sys.argv[1],"--model",sys.argv[2],"--receipt-dir",sys.argv[3]]))
PY
)"
printf '%s\n' "Evercraft model: $MODEL" "Lab SHA: $LAB_SHA" "Local report directory: $RUN"
failures=0
for fault in none ack_loss lookup_outage tamper; do
  echo "=== Lab fault: $fault ==="
  if (cd "$LAB" && "$ROOT/.venv/bin/python" -m research.eo001_receipt_audit.durable.runner \
    --command-json "$CMD_JSON" --fault "$fault" --max-steps 6 \
    --decision-timeout 15 --output "$RUN/$fault.json"); then
    :
  else
    failures=$((failures+1))
    echo "The '$fault' run did not pass. This is retained as real evidence, not hidden."
  fi
done
"$ROOT/.venv/bin/python" - "$RUN" "$MODEL" "$LAB_SHA" "$failures" <<'PY'
import json,sys
from pathlib import Path
root,model,lab_sha,failures=Path(sys.argv[1]),sys.argv[2],sys.argv[3],int(sys.argv[4])
report={"schema":"evercraft.eo001.laptop-live-model-report.v1",
        "model":model,"lab_commit":lab_sha,"model_inference_receipts":len(list((root/"model-receipts").glob("*.json"))),
        "synthetic":True,"external_payment":False,"production_mission_changed":False,
        "lab_candidate_provenance":"external_unclassified (requires independent review)",
        "cases":{}}
for fault in ("none","ack_loss","lookup_outage","tamper"):
  p=root/(fault+".json")
  if p.exists():
    d=json.loads(p.read_text())
    report["cases"][fault]={"verdict":d.get("verdict"),"execution_error":d.get("execution_error"),
                           "final":d.get("final"),"candidate_kind":d.get("candidate_kind")}
  else:
    report["cases"][fault]={"missing":True}
(root/"summary.json").write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps(report,indent=2))
print("REPORT:",root/"summary.json")
PY
if (( failures > 0 )); then
 echo "$failures fault-case(s) failed. Review retained summary and model receipts." >&2
 exit 1
fi
