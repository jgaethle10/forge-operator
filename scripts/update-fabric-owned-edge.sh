#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=""
REMOTE="origin"
BRANCH="main"
SERVICE="evercraft-fabric.service"
HEALTH_URL="http://127.0.0.1:8787/health"
STATE_DIR="/var/lib/evercraft/fabric-update"
RUNTIME_RELEASE_REF_FILE="$STATE_DIR/runtime-release-ref"
FABRIC_ENV="/etc/evercraft/fabric.env"
ENV_BACKUP=""
EDGE_ATTESTATION_EXPECTED=false
VISUAL_INGEST_TOKEN_CREATED=false
PUBLIC_EDGE_SERVICE="evercraft-public-edge.service"
ROUTER_MAP_SERVICE="evercraft-router-map.service"
ROUTER_MAP_TIMER="evercraft-router-map.timer"
OUTBOUND_RELAY_SERVICE="evercraft-fabric-outbound-relay.service"
OUTBOUND_RELAY_ENV="/etc/evercraft/outbound-relay.env"
ROUTER_MAP_ENV="/etc/evercraft/router-map.env"
ROUTER_MAP_INSTALLER=""
SABAN_CAPACITY_INSTALLER=""
SABAN_CAPACITY_STATE_DIR="/var/lib/evercraft/saban-capacity"
SABAN_CAPACITY_HEALTH_FILE="/var/lib/evercraft/fabric-secrets/saban-capacity-health.json"
HOME_EDGE_INSTALLER=""
HOME_EDGE_SERVICE="evercraft-home.service"
HOME_LOCAL_HEALTH="http://127.0.0.1:4310/api/health"

usage() {
  cat <<'EOF'
Usage:
  scripts/update-fabric-owned-edge.sh --repo-root /path/to/forge-operator

Fail-closed update cycle for the owned Evercraft Fabric edge:
  fetch authorized Forge main -> fast-forward only -> run Fabric/Yard proofs
  -> reconcile local edge-attestation wiring -> restart Evercraft Fabric
  -> verify local health + signed NodeSeed nonce -> rollback on failure.

Must run as root (normally from the resident systemd timer). The repository
commands themselves run as the ordinary owner of the checkout.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-root) REPO_ROOT="${2:-}"; shift 2 ;;
    --remote) REMOTE="${2:-}"; shift 2 ;;
    --branch) BRANCH="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: owned Fabric updater must run as root via systemd or sudo" >&2
  exit 2
fi
if [[ -z "$REPO_ROOT" || ! -d "$REPO_ROOT/.git" ]]; then
  echo "ERROR: --repo-root must point to the Forge Operator git checkout" >&2
  exit 2
fi
if [[ ! "$REMOTE" =~ ^[A-Za-z0-9._-]+$ || ! "$BRANCH" =~ ^[A-Za-z0-9._/-]+$ ]]; then
  echo "ERROR: remote or branch rejected" >&2
  exit 2
fi

REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"
RUN_USER="$(stat -c '%U' "$REPO_ROOT")"
if [[ -z "$RUN_USER" || "$RUN_USER" == "root" ]]; then
  echo "ERROR: Forge checkout must be owned by the ordinary Evercraft runtime user" >&2
  exit 2
fi

as_user() {
  runuser -u "$RUN_USER" -- "$@"
}

valid_ipv4() {
  local value="${1:-}"
  [[ "$value" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
  local IFS=.
  local octet
  read -r -a octets <<<"$value"
  [[ "${#octets[@]}" -eq 4 ]] || return 1
  for octet in "${octets[@]}"; do
    [[ "$octet" =~ ^[0-9]+$ ]] || return 1
    (( 10#$octet >= 0 && 10#$octet <= 255 )) || return 1
  done
}

router_map_config_value() {
  local key="$1"
  [[ -f "$ROUTER_MAP_ENV" ]] || return 0
  grep -E "^${key}=" "$ROUTER_MAP_ENV" 2>/dev/null | tail -1 | cut -d= -f2- || true
}

repair_router_map_env_permissions() {
  [[ -f "$ROUTER_MAP_ENV" ]] || return 0
  # router-map.env and its parent contain only gateway/LAN host/repo/node coordinates.
  # The bounded unprivileged router-map service must be able to traverse/read them.
  chmod 0755 "$(dirname "$ROUTER_MAP_ENV")" 2>/dev/null || true
  chmod 0644 "$ROUTER_MAP_ENV" 2>/dev/null || true
}

ensure_router_map_resident_from_saved_config() {
  repair_router_map_env_permissions
  # Never invent or scan router credentials. This recovery path only reuses
  # the previously operator-approved gateway + Chromebook LAN host.
  [[ -f "$ROUTER_MAP_ENV" ]] || {
    echo "Evercraft ingress recovery: router_map_config=absent"
    return 0
  }

  if systemctl cat "$ROUTER_MAP_SERVICE" >/dev/null 2>&1 &&
     systemctl cat "$ROUTER_MAP_TIMER" >/dev/null 2>&1; then
    return 0
  fi

  local gateway lan_host
  gateway="$(router_map_config_value EVERCRAFT_ROUTER_GATEWAY)"
  lan_host="$(router_map_config_value EVERCRAFT_ROUTER_LAN_HOST)"
  if ! valid_ipv4 "$gateway" || ! valid_ipv4 "$lan_host"; then
    echo "Evercraft ingress recovery: router_map_config=invalid"
    return 0
  fi

  if [[ ! -f "$ROUTER_MAP_INSTALLER" ]]; then
    echo "Evercraft ingress recovery: router_map_installer=missing"
    return 0
  fi

  echo "Evercraft ingress recovery: restoring bounded router-map resident from saved config"
  if ! SUDO_USER="$RUN_USER" bash "$ROUTER_MAP_INSTALLER"       --gateway "$gateway"       --host "$lan_host"       --repo-root "$REPO_ROOT" >/dev/null; then
    echo "Evercraft ingress recovery: router_map_restore=failed"
    return 0
  fi
  echo "Evercraft ingress recovery: router_map_restore=installed"
}

reassert_owned_public_ingress() {
  repair_router_map_env_permissions
  local edge_state="not_installed"
  local router_state="not_installed"
  local relay_state="not_installed"

  ensure_router_map_resident_from_saved_config

  if [[ -f "$OUTBOUND_RELAY_ENV" ]] && systemctl cat "$OUTBOUND_RELAY_SERVICE" >/dev/null 2>&1; then
    systemctl enable "$OUTBOUND_RELAY_SERVICE" >/dev/null 2>&1 || true
    if systemctl is-active --quiet "$OUTBOUND_RELAY_SERVICE"; then
      relay_state="active"
    elif systemctl restart "$OUTBOUND_RELAY_SERVICE"; then
      relay_state="restarted"
    else
      relay_state="restart_failed"
    fi
  fi

  if systemctl cat "$PUBLIC_EDGE_SERVICE" >/dev/null 2>&1; then
    if systemctl is-active --quiet "$PUBLIC_EDGE_SERVICE"; then
      edge_state="active"
    elif systemctl restart "$PUBLIC_EDGE_SERVICE"; then
      edge_state="restarted"
    else
      edge_state="restart_failed"
    fi
  fi

  if systemctl cat "$ROUTER_MAP_TIMER" >/dev/null 2>&1; then
    systemctl enable --now "$ROUTER_MAP_TIMER" >/dev/null 2>&1 || true
  fi
  if systemctl cat "$ROUTER_MAP_SERVICE" >/dev/null 2>&1; then
    if systemctl start "$ROUTER_MAP_SERVICE"; then
      router_state="reasserted"
    else
      router_state="reassert_failed"
    fi
  fi

  echo "Evercraft ingress recovery: outbound_relay=$relay_state public_edge=$edge_state router_map=$router_state"
}

RUN_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)"
if [[ -z "$RUN_HOME" ]]; then
  echo "ERROR: could not resolve home directory for $RUN_USER" >&2
  exit 2
fi

NODE_RECEIPT="$RUN_HOME/.local/state/evercraft/organism/compute/nodeseed-receipt.json"
ALLOCATOR_TOKEN_FILE="$RUN_HOME/.local/state/evercraft/organism/.secrets/allocator-token"
VISUAL_INGEST_TOKEN_FILE="/var/lib/evercraft/fabric-secrets/visual-ingest-token"
NETWORK_OBSERVER_INSTALLER="$REPO_ROOT/scripts/install-fabric-network-observer.sh"
ROUTER_MAP_INSTALLER="$REPO_ROOT/scripts/install-fabric-router-map-resident.sh"
SABAN_CAPACITY_INSTALLER="$REPO_ROOT/scripts/install-saban-capacity-organism.sh"
HOME_EDGE_INSTALLER="$REPO_ROOT/scripts/install-evercraft-home-edge.sh"

mkdir -p "$STATE_DIR"
chown root:"$RUN_USER" "$STATE_DIR"
chmod 0750 "$STATE_DIR"

write_runtime_release_ref() {
  local release="${1:-}"
  if [[ ! "$release" =~ ^[a-fA-F0-9]{40,64}$ ]]; then
    echo "ERROR: invalid Fabric runtime release ref" >&2
    return 1
  fi
  local tmp
  tmp="$(mktemp "$STATE_DIR/runtime-release-ref.XXXXXX")"
  printf '%s\n' "${release,,}" > "$tmp"
  install -o root -g "$RUN_USER" -m 0640 "$tmp" "$RUNTIME_RELEASE_REF_FILE"
  rm -f "$tmp"
}

ensure_visual_ingest_token() {
  VISUAL_INGEST_TOKEN_CREATED=false
  if [[ -s "$VISUAL_INGEST_TOKEN_FILE" ]]; then
    return 0
  fi

  install -d -o root -g "$RUN_USER" -m 0750 "$(dirname "$VISUAL_INGEST_TOKEN_FILE")"
  local tmp
  tmp="$(mktemp "$STATE_DIR/visual-ingest-token.XXXXXX")"
  as_user node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex')+'\\n')" > "$tmp"
  install -o "$RUN_USER" -g "$RUN_USER" -m 0600 "$tmp" "$VISUAL_INGEST_TOKEN_FILE"
  rm -f "$tmp"
  VISUAL_INGEST_TOKEN_CREATED=true
  echo "Evercraft update: Visual Desk ingest credential initialized"
}

reconcile_edge_attestation_env() {
  EDGE_ATTESTATION_EXPECTED=false

  # The public Fabric edge may exist before the local organism does. In that
  # state we do not invent identity proof. The external canary remains held.
  if [[ ! -f "$NODE_RECEIPT" || ! -f "$ALLOCATOR_TOKEN_FILE" ]]; then
    return 0
  fi

  EDGE_ATTESTATION_EXPECTED=true
  mkdir -p "$(dirname "$FABRIC_ENV")"
  if [[ ! -f "$FABRIC_ENV" ]]; then
    : > "$FABRIC_ENV"
    chmod 0600 "$FABRIC_ENV"
  fi

  local current_node current_token
  current_node="$(grep '^EVERCRAFT_EDGE_NODE_RECEIPT=' "$FABRIC_ENV" 2>/dev/null | tail -1 | cut -d= -f2- || true)"
  current_token="$(grep '^EVERCRAFT_EDGE_ALLOCATOR_TOKEN_FILE=' "$FABRIC_ENV" 2>/dev/null | tail -1 | cut -d= -f2- || true)"

  if [[ "$current_node" == "$NODE_RECEIPT" && "$current_token" == "$ALLOCATOR_TOKEN_FILE" ]]; then
    return 0
  fi

  ENV_BACKUP="$STATE_DIR/fabric.env.before-attestation"
  cp "$FABRIC_ENV" "$ENV_BACKUP"
  chmod 0600 "$ENV_BACKUP"

  local tmp
  tmp="$(mktemp)"
  awk -F= '
    $1 != "EVERCRAFT_EDGE_NODE_RECEIPT" &&
    $1 != "EVERCRAFT_EDGE_ALLOCATOR_TOKEN_FILE" { print }
  ' "$FABRIC_ENV" > "$tmp"
  printf 'EVERCRAFT_EDGE_NODE_RECEIPT=%s\n' "$NODE_RECEIPT" >> "$tmp"
  printf 'EVERCRAFT_EDGE_ALLOCATOR_TOKEN_FILE=%s\n' "$ALLOCATOR_TOKEN_FILE" >> "$tmp"
  install -o root -g root -m 0600 "$tmp" "$FABRIC_ENV"
  rm -f "$tmp"
}

restore_edge_attestation_env() {
  if [[ -n "$ENV_BACKUP" && -f "$ENV_BACKUP" ]]; then
    install -o root -g root -m 0600 "$ENV_BACKUP" "$FABRIC_ENV"
  fi
}

clear_env_backup() {
  if [[ -n "$ENV_BACKUP" && -f "$ENV_BACKUP" ]]; then
    rm -f "$ENV_BACKUP"
  fi
  ENV_BACKUP=""
}

ensure_network_observer() {
  local force="${1:-false}"
  if [[ "$force" != "true" ]] &&
     systemctl is-active --quiet evercraft-network-observer.timer 2>/dev/null &&
     test -s /var/lib/evercraft/network-observer/latest.json; then
    return 0
  fi
  if [[ ! -f "$NETWORK_OBSERVER_INSTALLER" ]]; then
    echo "ERROR: network observer installer missing from deployed Forge revision" >&2
    return 1
  fi
  bash "$NETWORK_OBSERVER_INSTALLER" \
    --repo-root "$REPO_ROOT" \
    --user "$RUN_USER" \
    --cadence 2min >/dev/null
  systemctl is-active --quiet evercraft-network-observer.timer
  test -s /var/lib/evercraft/network-observer/latest.json
}

write_saban_capacity_receipt() {
  local state="$1" reason="${2:-}"
  local release_ref="" observed_at="" resident=false
  release_ref="$(as_user git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || true)"
  observed_at="$(date -u +%FT%TZ)"
  [[ "$state" == "ready" ]] && resident=true

  printf '{"schema":"evercraft.fabric-saban-capacity-reconcile.v1","state":"%s","release_ref":"%s","reason":"%s","owned_host":true,"zero_spend_only":true,"public_market_discovery":false,"observed_at":"%s"}\n' \
    "$state" "$release_ref" "$reason" "$observed_at" \
    > "$STATE_DIR/saban-capacity.json"
  chmod 0640 "$STATE_DIR/saban-capacity.json"

  install -d -o root -g "$RUN_USER" -m 0750 "$(dirname "$SABAN_CAPACITY_HEALTH_FILE")"
  local health_tmp
  health_tmp="$(mktemp "$STATE_DIR/saban-capacity-health.XXXXXX")"
  printf '{"schema":"evercraft.fabric-saban-capacity-health.v1","resident":%s,"state":"%s","owned_host":true,"zero_spend_only":true,"public_market_discovery":false,"observed_at":"%s"}\n' \
    "$resident" "$state" "$observed_at" > "$health_tmp"
  install -o "$RUN_USER" -g "$RUN_USER" -m 0640 "$health_tmp" "$SABAN_CAPACITY_HEALTH_FILE"
  rm -f "$health_tmp"
}

verify_saban_capacity_state() {
  local capacity_file="$SABAN_CAPACITY_STATE_DIR/capacity-organism-state.json"
  local expansion_file="$SABAN_CAPACITY_STATE_DIR/resource-field-expansion-state.json"

  systemctl is-active --quiet evercraft-saban-capacity.timer || return 1
  systemctl is-active --quiet evercraft-saban-resource-expansion.service || return 1
  systemctl is-active --quiet evercraft-saban-watchdog.timer || return 1
  [[ -s "$capacity_file" && -s "$expansion_file" ]] || return 1

  as_user env \
    CAPACITY_FILE="$capacity_file" \
    EXPANSION_FILE="$expansion_file" \
    node - <<'NODE'
const fs=require('fs');
const capacity=JSON.parse(fs.readFileSync(process.env.CAPACITY_FILE,'utf8'));
const expansion=JSON.parse(fs.readFileSync(process.env.EXPANSION_FILE,'utf8'));

if(capacity.schema!=='evercraft.saban.capacity-organism-state.v1') process.exit(2);
if(capacity.commercial_capacity_authorized!==false) process.exit(3);
if(capacity.observation_never_grants_authority!==true) process.exit(4);

if(expansion.schema!=='evercraft.saban.resource-expansion-cycle.v1') process.exit(5);
if(expansion.paid_execution_authorized!==false) process.exit(6);
if(expansion.market_order_created!==false) process.exit(7);
if(expansion.paid_lease_created!==false) process.exit(8);
NODE
}

ensure_saban_capacity_resident() {
  if verify_saban_capacity_state 2>/dev/null; then
    write_saban_capacity_receipt "ready" "already_healthy"
    echo "Evercraft update: Saban Resource Field resident=healthy"
    return 0
  fi

  if [[ ! -f "$SABAN_CAPACITY_INSTALLER" ]]; then
    write_saban_capacity_receipt "held" "installer_missing"
    echo "ERROR: Saban capacity installer missing from deployed Forge revision" >&2
    return 1
  fi

  echo "Evercraft update: converging Saban Resource Field resident"
  if ! bash "$SABAN_CAPACITY_INSTALLER" \
      --repo-root "$REPO_ROOT" \
      --user "$RUN_USER" \
      --cadence 2min \
      --state-dir "$SABAN_CAPACITY_STATE_DIR" \
      --owned-host >/dev/null; then
    write_saban_capacity_receipt "held" "installer_failed"
    return 1
  fi

  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if verify_saban_capacity_state 2>/dev/null; then
      write_saban_capacity_receipt "ready" "installed_or_repaired"
      echo "Evercraft update: Saban Resource Field resident=ready"
      return 0
    fi
    sleep 1
  done

  write_saban_capacity_receipt "held" "resident_verification_failed"
  return 1
}

ensure_home_edge_resident() {
  if [[ ! -f "$HOME_EDGE_INSTALLER" ]]; then
    echo "ERROR: Evercraft Home edge installer missing from deployed Forge revision" >&2
    return 1
  fi

  local expected_release current_release
  expected_release="$(as_user git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || true)"
  current_release=""

  if systemctl is-active --quiet "$HOME_EDGE_SERVICE" 2>/dev/null &&
     curl -fsS --max-time 5 "$HOME_LOCAL_HEALTH" >/tmp/evercraft-home-update-health.json 2>/dev/null &&
     grep -Fq 'handle_path /home/*' /etc/evercraft/Caddyfile 2>/dev/null; then
    current_release="$(as_user node -e "const fs=require('fs');const h=JSON.parse(fs.readFileSync('/tmp/evercraft-home-update-health.json','utf8'));process.stdout.write(String(h.source_release_ref||''))" 2>/dev/null || true)"
    if [[ -n "$expected_release" && "$current_release" == "$expected_release" ]]; then
      echo "Evercraft update: Personal Home resident=healthy release=$current_release"
      return 0
    fi
    echo "Evercraft update: Personal Home release drift current=${current_release:-unknown} expected=${expected_release:-unknown}"
  fi

  echo "Evercraft update: converging Personal Home on the owned HTTPS edge"
  if ! bash "$HOME_EDGE_INSTALLER" --repo-root "$REPO_ROOT" --user "$RUN_USER"; then
    echo "ERROR: Evercraft Home edge convergence failed" >&2
    return 1
  fi

  systemctl is-active --quiet "$HOME_EDGE_SERVICE" &&
    curl -fsS --max-time 5 "$HOME_LOCAL_HEALTH" >/tmp/evercraft-home-update-health.json
}

read_health() {
  curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null || true
}

health_supports_attestation() {
  local health="$1"
  runuser -u "$RUN_USER" -- env HEALTH_JSON="$health" node -e "
    const h=JSON.parse(process.env.HEALTH_JSON||'{}');
    if(h.ok!==true || h.service!=='evercraft-fabric-local') process.exit(2);
    if(h.edge_attestation_supported!==true) process.exit(3);
    if(h.edge_attestation_allocator_authority_exposed!==false) process.exit(4);
  "
}

verify_edge_attestation_local() {
  if [[ "$EDGE_ATTESTATION_EXPECTED" != "true" ]]; then
    return 0
  fi

  local nonce body
  nonce="edge_local_$(as_user node -e "process.stdout.write(require('crypto').randomBytes(18).toString('hex'))")"
  body="$(curl -fsS --max-time 5     -H 'content-type: application/json'     --data "{\"nonce\":\"$nonce\"}"     "http://127.0.0.1:8787/.well-known/evercraft-edge-attestation")"

  runuser -u "$RUN_USER" -- env     EDGE_ATTESTATION_JSON="$body"     EDGE_ATTESTATION_NONCE="$nonce"     REPO_ROOT="$REPO_ROOT"     node --input-type=module - <<'NODE'
import { pathToFileURL } from 'node:url';
const moduleUrl=pathToFileURL(
  process.env.REPO_ROOT+'/systemia/compute/device-identity.mjs'
).href;
const { verifyNodeAttestation }=await import(moduleUrl);
const payload=JSON.parse(process.env.EDGE_ATTESTATION_JSON||'{}');
if(payload.ok!==true || payload.schema!=='evercraft.operator-public-edge.attestation.v1') process.exit(2);
if(payload.allocator_authority_exposed!==false || payload.allocator_authority_persisted!==false) process.exit(3);
if(payload.physical_field_claim!==false) process.exit(4);
const verified=verifyNodeAttestation({
  attestation:payload.attestation,
  expectedNonce:process.env.EDGE_ATTESTATION_NONCE,
  maxAgeMs:60000,
  now:new Date(),
});
if(verified.ok!==true || verified.field_claim!==false) process.exit(5);
NODE
}

verify_current_runtime() {
  local expected_count="$1"
  local expected_release="$2"
  local health=""
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    health="$(read_health)"
    [[ -n "$health" ]] && break
    sleep 1
  done
  [[ -n "$health" ]] || return 8

  runuser -u "$RUN_USER" -- env     HEALTH_JSON="$health"     EXPECTED_COUNT="$expected_count"     EXPECTED_RELEASE="$expected_release"     EDGE_ATTESTATION_EXPECTED="$EDGE_ATTESTATION_EXPECTED"     node -e "
      const h=JSON.parse(process.env.HEALTH_JSON||'{}');
      const expected=Number(process.env.EXPECTED_COUNT||0);
      const expectedRelease=String(process.env.EXPECTED_RELEASE||'').toLowerCase();
      if(h.ok!==true || h.service!=='evercraft-fabric-local') process.exit(2);
      if(Number(h.capability_count)!==expected) process.exit(3);
      if(String(h.source_release_ref||'').toLowerCase()!==expectedRelease) process.exit(10);
      if(process.env.EDGE_ATTESTATION_EXPECTED==='true') {
        if(h.edge_attestation_supported!==true) process.exit(4);
        if(h.edge_attestation_allocator_authority_exposed!==false) process.exit(5);
      }
      if(h.visual_desk_ingest_ready!==true) process.exit(6);
      if(h.visual_desk_ingest_publication_authority!==false) process.exit(7);
      if(h.earthworks_simulator_path!=='/earthworks') process.exit(8);
      if(h.earthworks_simulator_authority!=='interactive_software_simulation_only') process.exit(9);
    " || return 9

  local earthworks_page=""
  earthworks_page="$(curl -fsS --max-time 5 "http://127.0.0.1:8787/earthworks" 2>/dev/null || true)"
  [[ -n "$earthworks_page" ]] || return 14
  grep -F 'Live Yard 001' <<< "$earthworks_page" >/dev/null || return 14
  grep -F 'Shadow' <<< "$earthworks_page" >/dev/null || return 14
  grep -F 'Autonomy' <<< "$earthworks_page" >/dev/null || return 14
  grep -F 'STOP ALL' <<< "$earthworks_page" >/dev/null || return 14

  local attestation_code=10
  for attempt in 1 2 3 4 5 6; do
    set +e
    verify_edge_attestation_local
    attestation_code=$?
    set -e
    if [[ "$attestation_code" -eq 0 ]]; then
      return 0
    fi
    echo "Evercraft update: edge attestation not ready yet (attempt $attempt/6, code $attestation_code)"
    sleep 2
  done
  return 10
}

remote_url="$(as_user git -C "$REPO_ROOT" remote get-url "$REMOTE")"
if [[ ! "$remote_url" =~ ^(https://github\.com/|git@github\.com:)jgaethle10/forge-operator(\.git)?$ ]]; then
  echo "ERROR: update remote is not the authorized Forge Operator repository" >&2
  exit 3
fi

dirty_status="$(as_user git -C "$REPO_ROOT" status --porcelain --untracked-files=all)"
DIRT_CLASSIFIER="$REPO_ROOT/scripts/classify-fabric-checkout-dirt.mjs"
if [[ ! -f "$DIRT_CLASSIFIER" ]]; then
  echo "HOLD: checkout-drift classifier missing; refusing unattended update" >&2
  exit 4
fi

blocking_dirty="$(printf '%s\n' "$dirty_status" | as_user node "$DIRT_CLASSIFIER" --blocking-lines)"
journal_dirty="$(printf '%s\n' "$dirty_status" | as_user node "$DIRT_CLASSIFIER" --journal-dirty)"

if [[ -n "$blocking_dirty" ]]; then
  echo "HOLD: Forge checkout has source changes; refusing unattended update" >&2
  printf '%s\n' "$blocking_dirty" >&2
  exit 4
fi

if [[ "$journal_dirty" == "true" ]]; then
  echo "HOLD: Journal contains uncheckpointed changes; refusing unattended update" >&2
  exit 4
fi

if [[ -n "$dirty_status" ]]; then
  echo "Evercraft update: ignoring generated artifacts/ entries in checkout preflight"
fi

before="$(as_user git -C "$REPO_ROOT" rev-parse HEAD)"
as_user git -C "$REPO_ROOT" fetch --prune "$REMOTE" "$BRANCH"
target="$(as_user git -C "$REPO_ROOT" rev-parse "$REMOTE/$BRANCH")"

expected_count_for_current() {
  as_user node -e "
    const fs=require('fs');
    const x=JSON.parse(fs.readFileSync('$REPO_ROOT/public/chum/capabilities.json','utf8'));
    process.stdout.write(String((x.capabilities||[]).length));
  "
}

if [[ "$before" == "$target" ]]; then
  write_runtime_release_ref "$before"
  ensure_visual_ingest_token
  reconcile_edge_attestation_env
  if [[ -n "$ENV_BACKUP" || "$VISUAL_INGEST_TOKEN_CREATED" == "true" ]]; then
    if ! systemctl restart "$SERVICE"; then
      restore_edge_attestation_env
      systemctl restart "$SERVICE" || true
      echo "ERROR: Fabric restart failed during edge-attestation env reconciliation" >&2
      exit 7
    fi
  fi

  expected_count="$(expected_count_for_current)"
  set +e
  verify_current_runtime "$expected_count" "$before"
  code=$?
  set -e
  if [[ "$code" -ne 0 ]]; then
    echo "Evercraft update: current checkout is aligned but resident Fabric runtime drifted (verification code $code); restarting once"
    if ! systemctl restart "$SERVICE"; then
      restore_edge_attestation_env
      [[ -n "$ENV_BACKUP" ]] && systemctl restart "$SERVICE" || true
      echo "ERROR: Fabric restart failed while repairing resident runtime drift" >&2
      exit 7
    fi
    set +e
    verify_current_runtime "$expected_count" "$before"
    code=$?
    set -e
  fi
  if [[ "$code" -ne 0 ]]; then
    restore_edge_attestation_env
    [[ -n "$ENV_BACKUP" ]] && systemctl restart "$SERVICE" || true
    echo "ERROR: current Fabric verification failed after one bounded restart ($code)" >&2
    exit "$code"
  fi

  if ! ensure_network_observer false; then
    echo "ERROR: Fabric is healthy but resident network observer installation failed" >&2
    exit 11
  fi

  if ! ensure_home_edge_resident; then
    echo "ERROR: Fabric is healthy but Personal Home convergence failed; next update cycle will retry" >&2
    exit 13
  fi

  # Reassert every owned ingress layer we can control from Crostini.
  # ChromeOS host port-forward toggles remain outside the guest boundary.
  reassert_owned_public_ingress

  if ! ensure_saban_capacity_resident; then
    echo "ERROR: Fabric is healthy but Saban Resource Field resident convergence failed; next update cycle will retry" >&2
    exit 12
  fi

  clear_env_backup
  printf '{"schema":"evercraft.fabric-update.v1","state":"current","release_ref":"%s","capability_count":%s,"edge_attestation_expected":%s,"edge_attestation_verified":%s,"saban_capacity_resident":true,"observed_at":"%s"}\n'     "$before" "$expected_count" "$EDGE_ATTESTATION_EXPECTED" "$EDGE_ATTESTATION_EXPECTED" "$(date -u +%FT%TZ)"     > "$STATE_DIR/last-update.json"
  chmod 0640 "$STATE_DIR/last-update.json"
  exit 0
fi

if ! as_user git -C "$REPO_ROOT" merge-base --is-ancestor "$before" "$target"; then
  echo "HOLD: remote branch is not a fast-forward from the deployed revision" >&2
  exit 5
fi

rollback() {
  local reason="${1:-update_failed}"
  as_user git -C "$REPO_ROOT" reset --hard "$before" >/dev/null
  write_runtime_release_ref "$before" || true
  restore_edge_attestation_env
  systemctl restart "$SERVICE" || true
  printf '{"schema":"evercraft.fabric-update.v1","state":"rolled_back","from_ref":"%s","attempted_ref":"%s","reason":"%s","observed_at":"%s"}\n'     "$before" "$target" "$reason" "$(date -u +%FT%TZ)" > "$STATE_DIR/last-update.json"
  chmod 0640 "$STATE_DIR/last-update.json"
}

as_user git -C "$REPO_ROOT" merge --ff-only "$REMOTE/$BRANCH"

if ! (
  cd "$REPO_ROOT"
  as_user npm run test:fabric-directory &&
  as_user npm run test:fabric-local &&
  as_user npm run test:remote-operator &&
  as_user node --test tests/fabric-edge-attestation.test.mjs tests/fabric-owned-edge-installer.test.mjs tests/fabric-outbound-relay.test.mjs &&
  as_user npm run proof:specialist-handoff-yard
); then
  rollback "proof_failed"
  exit 6
fi

ensure_visual_ingest_token
reconcile_edge_attestation_env
write_runtime_release_ref "$target"

if ! systemctl restart "$SERVICE"; then
  rollback "service_restart_failed"
  exit 7
fi

expected_count="$(expected_count_for_current)"
set +e
verify_current_runtime "$expected_count" "$target"
code=$?
set -e
if [[ "$code" -ne 0 ]]; then
  rollback "runtime_verification_failed_$code"
  exit "$code"
fi

if ! ensure_network_observer true; then
  echo "ERROR: Fabric update is healthy but resident network observer installation failed" >&2
  exit 11
fi

if ! ensure_home_edge_resident; then
  echo "ERROR: Fabric update accepted but Personal Home convergence failed; next update cycle will retry" >&2
  exit 13
fi

# A source update is also an ingress recovery opportunity.
reassert_owned_public_ingress

# Source and Fabric runtime are already verified at this point. Capacity
# convergence is retried by the resident update timer rather than rolling back
# a healthy Fabric revision and leaving newly written systemd units orphaned.
if ! ensure_saban_capacity_resident; then
  echo "ERROR: Fabric update accepted but Saban Resource Field resident convergence failed; next update cycle will retry" >&2
  exit 12
fi

clear_env_backup
printf '{"schema":"evercraft.fabric-update.v1","state":"updated","from_ref":"%s","release_ref":"%s","capability_count":%s,"edge_attestation_expected":%s,"edge_attestation_verified":%s,"saban_capacity_resident":true,"observed_at":"%s"}\n'   "$before" "$target" "$expected_count" "$EDGE_ATTESTATION_EXPECTED" "$EDGE_ATTESTATION_EXPECTED" "$(date -u +%FT%TZ)"   > "$STATE_DIR/last-update.json"
chmod 0640 "$STATE_DIR/last-update.json"
echo "Evercraft Fabric updated to $target with $expected_count capabilities."
