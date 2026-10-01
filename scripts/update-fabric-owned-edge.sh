#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=""
REMOTE="origin"
BRANCH="main"
SERVICE="evercraft-fabric.service"
HEALTH_URL="http://127.0.0.1:8787/health"
STATE_DIR="/var/lib/evercraft/fabric-update"
FABRIC_ENV="/etc/evercraft/fabric.env"
ENV_BACKUP=""
EDGE_ATTESTATION_EXPECTED=false

usage() {
  cat <<'EOF'
Usage:
  scripts/update-fabric-owned-edge.sh --repo-root /path/to/forge-operator

Fail-closed update cycle for the owned Evercraft Fabric edge:
  fetch authorized Forge main -> fast-forward only -> run Fabric/Yard proofs
  -> restart Evercraft Fabric -> verify local health -> rollback on failure.

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

run_home="$(getent passwd "$RUN_USER" | cut -d: -f6)"
if [[ -z "$run_home" ]]; then
  echo "ERROR: could not resolve home directory for $RUN_USER" >&2
  exit 2
fi
NODE_RECEIPT="$run_home/.local/state/evercraft/organism/compute/nodeseed-receipt.json"
ALLOCATOR_TOKEN_FILE="$run_home/.local/state/evercraft/organism/.secrets/allocator-token"

reconcile_edge_attestation_env() {
  EDGE_ATTESTATION_EXPECTED=false
  if [[ ! -f "$NODE_RECEIPT" || ! -f "$ALLOCATOR_TOKEN_FILE" ]]; then
    return 0
  fi
  EDGE_ATTESTATION_EXPECTED=true
  mkdir -p "$(dirname "$FABRIC_ENV")" "$STATE_DIR"
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

verify_edge_attestation_local() {
  if [[ "$EDGE_ATTESTATION_EXPECTED" != "true" ]]; then
    return 0
  fi
  local nonce body
  nonce="edge_local_$(openssl rand -hex 18)"
  body="$(curl -fsS --max-time 5     -H 'content-type: application/json'     --data "{\"nonce\":\"$nonce\"}"     "http://127.0.0.1:8787/.well-known/evercraft-edge-attestation")"
  EDGE_ATTESTATION_JSON="$body" EDGE_ATTESTATION_NONCE="$nonce" REPO_ROOT="$REPO_ROOT" as_user node --input-type=module - <<'NODE'
import { verifyNodeAttestation } from process.env.REPO_ROOT + '/systemia/compute/device-identity.mjs';
const payload=JSON.parse(process.env.EDGE_ATTESTATION_JSON||'{}');
if(payload.ok!==true || payload.schema!=='evercraft.operator-public-edge.attestation.v1') process.exit(2);
if(payload.allocator_authority_exposed!==false || payload.allocator_authority_persisted!==false) process.exit(3);
const verified=verifyNodeAttestation({
  attestation:payload.attestation,
  expectedNonce:process.env.EDGE_ATTESTATION_NONCE,
  maxAgeMs:60000,
  now:new Date(),
});
if(verified.ok!==true || verified.field_claim!==false) process.exit(4);
NODE
}

remote_url="$(as_user git -C "$REPO_ROOT" remote get-url "$REMOTE")"
if [[ ! "$remote_url" =~ ^(https://github\.com/|git@github\.com:)jgaethle10/forge-operator(\.git)?$ ]]; then
  echo "ERROR: update remote is not the authorized Forge Operator repository" >&2
  exit 3
fi

if [[ -n "$(as_user git -C "$REPO_ROOT" status --porcelain)" ]]; then
  echo "HOLD: Forge checkout is dirty; refusing unattended update" >&2
  exit 4
fi

mkdir -p "$STATE_DIR"
chmod 0750 "$STATE_DIR"

before="$(as_user git -C "$REPO_ROOT" rev-parse HEAD)"
as_user git -C "$REPO_ROOT" fetch --prune "$REMOTE" "$BRANCH"
target="$(as_user git -C "$REPO_ROOT" rev-parse "$REMOTE/$BRANCH")"

if [[ "$before" == "$target" ]]; then
  reconcile_edge_attestation_env
  if [[ -n "$ENV_BACKUP" ]]; then
    reconcile_edge_attestation_env

if ! systemctl restart "$SERVICE"; then
      restore_edge_attestation_env
      systemctl restart "$SERVICE" || true
      echo "ERROR: Fabric restart failed during edge-attestation env reconciliation" >&2
      exit 7
    fi
    sleep 2
  fi
  health="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null || true)"
  if [[ -z "$health" ]]; then
    restore_edge_attestation_env
    [[ -n "$ENV_BACKUP" ]] && systemctl restart "$SERVICE" || true
    echo "ERROR: current Fabric health unavailable" >&2
    exit 8
  fi
  if [[ "$EDGE_ATTESTATION_EXPECTED" == "true" ]]; then
    if ! HEALTH_JSON="$health" as_user node -e "const h=JSON.parse(process.env.HEALTH_JSON||'{}'); if(h.edge_attestation_supported!==true) process.exit(2);"; then
      restore_edge_attestation_env
      [[ -n "$ENV_BACKUP" ]] && systemctl restart "$SERVICE" || true
      echo "ERROR: current Fabric did not advertise edge attestation" >&2
      exit 9
    fi
    if ! verify_edge_attestation_local; then
      restore_edge_attestation_env
      [[ -n "$ENV_BACKUP" ]] && systemctl restart "$SERVICE" || true
      echo "ERROR: local signed edge attestation failed" >&2
      exit 10
    fi
  fi
  printf '{"schema":"evercraft.fabric-update.v1","state":"current","release_ref":"%s","edge_attestation_expected":%s,"edge_attestation_verified":%s,"observed_at":"%s"}\n'     "$before" "$EDGE_ATTESTATION_EXPECTED" "$EDGE_ATTESTATION_EXPECTED" "$(date -u +%FT%TZ)" > "$STATE_DIR/last-update.json"
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
  as_user node --test tests/fabric-edge-attestation.test.mjs tests/fabric-owned-edge-installer.test.mjs &&
  as_user npm run proof:specialist-handoff-yard
); then
  rollback "proof_failed"
  exit 6
fi

if ! systemctl restart "$SERVICE"; then
  rollback "service_restart_failed"
  exit 7
fi

health=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if health="$(curl -fsS --max-time 3 "$HEALTH_URL" 2>/dev/null)"; then
    break
  fi
  sleep 1
done

if [[ -z "$health" ]]; then
  rollback "health_unreachable"
  exit 8
fi

expected_count="$(as_user node -e "const fs=require('fs'); const x=JSON.parse(fs.readFileSync('$REPO_ROOT/public/chum/capabilities.json','utf8')); process.stdout.write(String((x.capabilities||[]).length));")"
if ! HEALTH_JSON="$health" EXPECTED_COUNT="$expected_count" EDGE_ATTESTATION_EXPECTED="$EDGE_ATTESTATION_EXPECTED" as_user node -e "
  const h=JSON.parse(process.env.HEALTH_JSON||'{}');
  const expected=Number(process.env.EXPECTED_COUNT||0);
  if(h.ok!==true || h.service!=='evercraft-fabric-local') process.exit(2);
  if(Number(h.capability_count)!==expected) process.exit(3);
  if(process.env.EDGE_ATTESTATION_EXPECTED==='true' && h.edge_attestation_supported!==true) process.exit(4);
"; then
  rollback "health_contract_failed"
  exit 9
fi

if ! verify_edge_attestation_local; then
  rollback "edge_attestation_failed"
  exit 10
fi

printf '{"schema":"evercraft.fabric-update.v1","state":"updated","from_ref":"%s","release_ref":"%s","capability_count":%s,"edge_attestation_expected":%s,"edge_attestation_verified":%s,"observed_at":"%s"}\n'   "$before" "$target" "$expected_count" "$EDGE_ATTESTATION_EXPECTED" "$EDGE_ATTESTATION_EXPECTED" "$(date -u +%FT%TZ)" > "$STATE_DIR/last-update.json"
chmod 0640 "$STATE_DIR/last-update.json"
echo "Evercraft Fabric updated to $target with $expected_count capabilities."
