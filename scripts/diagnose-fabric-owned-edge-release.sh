#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=""
STATE_DIR="/var/lib/evercraft/fabric-update"
UPDATE_SERVICE="evercraft-fabric-update.service"
UPDATE_TIMER="evercraft-fabric-update.timer"
FABRIC_SERVICE="evercraft-fabric.service"

usage(){
  cat <<'EOF'
Usage:
  scripts/diagnose-fabric-owned-edge-release.sh --repo-root /path/to/forge-operator

Read-only release doctor for the owned Fabric Chromebook/Crostini edge.

Reports release alignment, dirty-path blockers, update timer/service state,
local FindMyPart GET/readiness responses, the non-secret Fabric update receipt,
and recent updater HOLD/ERROR lines.

It never prints Fabric environment files, allocator tokens, Visual Desk ingest
tokens, OpenAI challenge tokens, or other secrets. It performs no fetch,
checkout, reset, restart, enable/disable, or other mutation.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-root) REPO_ROOT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$REPO_ROOT" || ! -d "$REPO_ROOT/.git" ]]; then
  echo "ERROR: --repo-root must point to the Forge Operator checkout" >&2
  exit 2
fi

REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"
remote="$(git -C "$REPO_ROOT" remote get-url origin 2>/dev/null || true)"
local_head="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || true)"
tracking_head="$(git -C "$REPO_ROOT" rev-parse origin/main 2>/dev/null || true)"
branch="$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null || true)"
dirty="$(git -C "$REPO_ROOT" status --porcelain --untracked-files=all 2>/dev/null || true)"
non_artifact_dirty="$(printf '%s\n' "$dirty" | grep -vE '^\?\? artifacts/' || true)"

service_state(){
  local unit="$1"
  if ! command -v systemctl >/dev/null 2>&1; then
    printf 'systemctl_unavailable'
    return
  fi
  systemctl is-active "$unit" 2>/dev/null || true
}

enabled_state(){
  local unit="$1"
  if ! command -v systemctl >/dev/null 2>&1; then
    printf 'systemctl_unavailable'
    return
  fi
  systemctl is-enabled "$unit" 2>/dev/null || true
}

printf 'Evercraft Fabric release doctor\n'
printf 'repo_root=%s\n' "$REPO_ROOT"
printf 'remote=%s\n' "$remote"
printf 'branch=%s\n' "$branch"
printf 'local_head=%s\n' "$local_head"
printf 'tracking_origin_main=%s\n' "$tracking_head"
if [[ -n "$local_head" && -n "$tracking_head" && "$local_head" == "$tracking_head" ]]; then
  printf 'local_vs_tracking=current\n'
else
  printf 'local_vs_tracking=drifted_or_unknown\n'
fi

if [[ -n "$non_artifact_dirty" ]]; then
  printf 'source_dirty_blocker=true\n'
  printf '%s\n' "$non_artifact_dirty" | sed 's/^/dirty_path=/'
else
  printf 'source_dirty_blocker=false\n'
fi

printf 'fabric_service_active=%s\n' "$(service_state "$FABRIC_SERVICE")"
printf 'update_service_active=%s\n' "$(service_state "$UPDATE_SERVICE")"
printf 'update_timer_active=%s\n' "$(service_state "$UPDATE_TIMER")"
printf 'update_timer_enabled=%s\n' "$(enabled_state "$UPDATE_TIMER")"

receipt="$STATE_DIR/last-update.json"
if [[ -r "$receipt" ]]; then
  printf 'last_update_receipt=%s\n' "$receipt"
  if command -v node >/dev/null 2>&1; then
    node - "$receipt" <<'NODE'
const fs=require('fs');
const file=process.argv[2];
try{
  const x=JSON.parse(fs.readFileSync(file,'utf8'));
  const safe={
    schema:x.schema||null,
    state:x.state||null,
    from_ref:x.from_ref||null,
    release_ref:x.release_ref||null,
    attempted_ref:x.attempted_ref||null,
    reason:x.reason||null,
    capability_count:x.capability_count??null,
    edge_attestation_expected:x.edge_attestation_expected??null,
    edge_attestation_verified:x.edge_attestation_verified??null,
    saban_capacity_resident:x.saban_capacity_resident??null,
    observed_at:x.observed_at||null,
  };
  for(const [key,value] of Object.entries(safe)){
    if(value!==null) process.stdout.write('last_update_'+key+'='+String(value)+'\n');
  }
}catch{
  process.stdout.write('last_update_receipt_state=invalid_json\n');
}
NODE
  else
    printf 'last_update_receipt_state=node_unavailable\n'
  fi
else
  printf 'last_update_receipt=missing_or_unreadable\n'
fi

if command -v journalctl >/dev/null 2>&1; then
  printf '%s\n' '--- recent updater HOLD/ERROR/release lines ---'
  journalctl -u "$UPDATE_SERVICE" --no-pager -n 120 2>/dev/null \
    | grep -E 'HOLD:|ERROR:|updated to|rolled_back|Fabric update:|Evercraft update:' \
    | tail -40 \
    || true
fi

# Diagnose the exact customer symptom without requesting customer data.
# These are loopback GETs only, never an order, payment, or admin action.
local_probe(){
  local route="$1"
  if ! command -v curl >/dev/null 2>&1; then
    printf 'curl_unavailable'
    return
  fi
  local status
  status="$(curl --silent --show-error --max-time 5 --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:8787$route" 2>/dev/null || true)"
  if [[ ! "$status" =~ ^[0-9]{3}$ || "$status" == '000' ]]; then
    printf 'unreachable'
  else
    printf '%s' "$status"
  fi
}
findmypart_source_available=false
if [[ -f "$REPO_ROOT/public/findmypart/index.html" ]] &&
   grep -Fq "const findMyPartPath=" "$REPO_ROOT/systemia/mcp/fabric-local-runtime.mjs" 2>/dev/null; then
  findmypart_source_available=true
fi
printf 'findmypart_source_route_available=%s\n' "$findmypart_source_available"
public_part_status="$(local_probe '/findmypart/')"
local_part_status="$(local_probe '/findmypart')"
local_intake_status="$(local_probe '/api/findmypart/readiness')"
printf 'findmypart_local_slash_http=%s\n' "$public_part_status"
printf 'findmypart_local_no_slash_http=%s\n' "$local_part_status"
printf 'findmypart_local_readiness_http=%s\n' "$local_intake_status"
if [[ "$public_part_status" == '404' && "$findmypart_source_available" == 'true' ]]; then
  printf 'findmypart_diagnosis=local_runtime_not_serving_merged_route\n'
  printf 'findmypart_next=inspect_release_ref_updater_hold_and_resident_service_execstart\n'
elif [[ "$public_part_status" == '200' && "$local_intake_status" != '200' ]]; then
  printf 'findmypart_diagnosis=frontage_local_but_inquiry_readiness_missing\n'
elif [[ "$public_part_status" == '200' && "$local_intake_status" == '200' ]]; then
  printf 'findmypart_diagnosis=local_route_present_check_external_tls_proxy_and_intake_available\n'
elif [[ "$public_part_status" == 'unreachable' ]]; then
  printf 'findmypart_diagnosis=local_fabric_unreachable\n'
else
  printf 'findmypart_diagnosis=route_not_yet_proven\n'
fi
printf 'doctor_mutation_performed=false\n'
