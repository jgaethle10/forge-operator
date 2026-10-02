#!/usr/bin/env bash
set -euo pipefail

STATE_DIR="${SABAN_AMBIENT_STATE_DIR:-/var/lib/evercraft/saban-capacity}"
MAX_STALE_SECONDS="${SABAN_WATCHDOG_MAX_STALE_SECONDS:-600}"
RUN_USER="${SABAN_RUN_USER:-}"
RUN_GROUP="${SABAN_RUN_GROUP:-}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: Saban resident watchdog requires root for bounded systemd repair." >&2
  exit 2
fi
[[ "$MAX_STALE_SECONDS" =~ ^[1-9][0-9]*$ ]] || {
  echo "ERROR: SABAN_WATCHDOG_MAX_STALE_SECONDS must be a positive integer." >&2
  exit 2
}

declare -a repairs=()
declare -a stale_cycles=()

ensure_active(){
  local unit="$1" kind="$2"
  if systemctl is-active --quiet "$unit"; then
    return 0
  fi
  if [[ "$kind" == "timer" ]]; then
    systemctl enable --now "$unit" >/dev/null 2>&1
  else
    systemctl restart "$unit" >/dev/null 2>&1
  fi
  repairs+=("$unit")
}

fresh_enough(){
  local file="$1"
  [[ -s "$file" ]] || return 1
  local mtime now age
  mtime="$(stat -c %Y "$file" 2>/dev/null || echo 0)"
  now="$(date +%s)"
  age=$(( now - mtime ))
  (( age >= 0 && age <= MAX_STALE_SECONDS ))
}

kick_if_stale(){
  local file="$1" service="$2" label="$3"
  if fresh_enough "$file"; then
    return 0
  fi
  stale_cycles+=("$label")
  if ! systemctl is-active --quiet "$service"; then
    systemctl start "$service" >/dev/null 2>&1 || true
  else
    systemctl restart "$service" >/dev/null 2>&1 || true
  fi
  repairs+=("$service")
}

ensure_active evercraft-saban-capacity.timer timer
ensure_active evercraft-saban-probation.timer timer
ensure_active evercraft-saban-dispatch.timer timer
ensure_active evercraft-saban-microseed-gateway.service service
ensure_active evercraft-saban-work-api.service service
ensure_active evercraft-saban-pairing-api.service service

kick_if_stale "$STATE_DIR/capacity-organism-state.json" evercraft-saban-capacity.service capacity
kick_if_stale "$STATE_DIR/probation-cycle.json" evercraft-saban-probation.service probation
kick_if_stale "$STATE_DIR/ambient-job-dispatch-cycle.json" evercraft-saban-dispatch.service dispatch

sleep 1

healthy=true
for unit in   evercraft-saban-capacity.timer   evercraft-saban-probation.timer   evercraft-saban-dispatch.timer   evercraft-saban-microseed-gateway.service   evercraft-saban-work-api.service   evercraft-saban-pairing-api.service
do
  systemctl is-active --quiet "$unit" || healthy=false
done

install -d -m 0750 "$STATE_DIR"
RECEIPT="$STATE_DIR/resident-watchdog.json"
REPAIRS_JSON="$(printf '%s
' "${repairs[@]:-}" | node -e "
let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{
 const rows=s.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 process.stdout.write(JSON.stringify([...new Set(rows)]));
});")"
STALE_JSON="$(printf '%s
' "${stale_cycles[@]:-}" | node -e "
let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{
 const rows=s.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 process.stdout.write(JSON.stringify([...new Set(rows)]));
});")"

cat > "$RECEIPT.tmp" <<EOF
{
  "schema":"evercraft.saban.resident-watchdog.v1",
  "healthy":$healthy,
  "repair_count":$(node -e "console.log(JSON.parse(process.argv[1]).length)" "$REPAIRS_JSON"),
  "repaired_units":$REPAIRS_JSON,
  "stale_cycles":$STALE_JSON,
  "owner_authorization_changed":false,
  "pairing_authority_used":false,
  "commercial_spend_usd":0,
  "broker_grants_created":false,
  "observed_at":"$(date -u +%FT%TZ)"
}
EOF
mv "$RECEIPT.tmp" "$RECEIPT"
chmod 0640 "$RECEIPT"
if [[ -n "$RUN_USER" && -n "$RUN_GROUP" ]]; then
  chown "$RUN_USER:$RUN_GROUP" "$RECEIPT"
fi

cat "$RECEIPT"
[[ "$healthy" == "true" ]]
