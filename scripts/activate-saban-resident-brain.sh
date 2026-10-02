#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo." >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_USER="${SUDO_USER:-$(stat -c '%U' "$REPO_ROOT")}"
STATE_DIR="${SABAN_AMBIENT_STATE_DIR:-/var/lib/evercraft/saban-capacity}"
CADENCE="${SABAN_CAPACITY_CADENCE:-2min}"

if [[ ! -f "$REPO_ROOT/systemia/saban/capacity-organism.mjs" ]]; then
  echo "HOLD: Forge Operator Saban capacity organism missing." >&2
  exit 10
fi

echo "[1/4] Installing resident Saban capacity organism..."
bash "$REPO_ROOT/scripts/install-saban-capacity-organism.sh" \
  --repo-root "$REPO_ROOT" \
  --user "$RUN_USER" \
  --cadence "$CADENCE" \
  --state-dir "$STATE_DIR"

echo "[2/4] Running an immediate portfolio-wide capacity cycle..."
systemctl start evercraft-saban-capacity.service
systemctl start evercraft-saban-probation.service || true
systemctl start evercraft-saban-dispatch.service || true

echo "[3/4] Verifying resident control surfaces..."
for unit in \
  evercraft-saban-capacity.timer \
  evercraft-saban-probation.timer \
  evercraft-saban-dispatch.timer \
  evercraft-saban-watchdog.timer \
  evercraft-saban-microseed-gateway.service \
  evercraft-saban-work-api.service \
  evercraft-saban-pairing-api.service
do
  if ! systemctl is-active --quiet "$unit"; then
    echo "ERROR: $unit is not active." >&2
    systemctl --no-pager --full status "$unit" >&2 || true
    exit 11
  fi
done

echo "[4/4] Reading Saban autonomy state..."
for file in \
  "$STATE_DIR/capacity-organism-state.json" \
  "$STATE_DIR/capacity-autonomy-plan.json" \
  "$STATE_DIR/authority-requests.json"
do
  [[ -s "$file" ]] || {
    echo "ERROR: expected Saban state missing: $file" >&2
    exit 12
  }
done

node - "$STATE_DIR" <<'NODE'
const fs=require('fs'),path=require('path');
const root=process.argv[2];
const cap=JSON.parse(fs.readFileSync(path.join(root,'capacity-organism-state.json'),'utf8'));
const auto=JSON.parse(fs.readFileSync(path.join(root,'capacity-autonomy-plan.json'),'utf8'));
const auth=JSON.parse(fs.readFileSync(path.join(root,'authority-requests.json'),'utf8'));
console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.resident-brain-activation.v1',
  production_ready:cap.production_ready===true,
  active_device_count:cap.active_device_count||0,
  compute_offer_count:cap.compute_offer_count||0,
  live_portfolio_tasks:cap.workload_anatomy?.tasks?.length||0,
  missing_capacity_count:cap.missing_capacity?.length||0,
  safe_autonomous_actions:auto.safe_autonomous_action_count||0,
  pending_authority_requests:auto.authority_request_count||0,
  observed_authority_leads:auto.observed_authority_lead_count||0,
  post_authority_pipelines:auto.post_authority_pipeline_count||0,
  authority_queue_entries:
    (auth.authority_requests?.length||0)+(auth.observed_authority_leads?.length||0),
  commercial_capacity_authorized:false,
  observation_never_grants_authority:auto.policies?.observation_never_grants_authority===true
},null,2));
NODE

echo
echo "PASS: Saban is resident. It will discover, qualify, dispatch, learn, and rebalance continuously within granted authority."
