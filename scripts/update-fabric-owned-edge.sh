#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=""
REMOTE="origin"
BRANCH="main"
SERVICE="evercraft-fabric.service"
HEALTH_URL="http://127.0.0.1:8787/health"
STATE_DIR="/var/lib/evercraft/fabric-update"

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
  printf '{"schema":"evercraft.fabric-update.v1","state":"current","release_ref":"%s","observed_at":"%s"}\n'     "$before" "$(date -u +%FT%TZ)" > "$STATE_DIR/last-update.json"
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
  systemctl restart "$SERVICE" || true
  printf '{"schema":"evercraft.fabric-update.v1","state":"rolled_back","from_ref":"%s","attempted_ref":"%s","reason":"%s","observed_at":"%s"}\n'     "$before" "$target" "$reason" "$(date -u +%FT%TZ)" > "$STATE_DIR/last-update.json"
  chmod 0640 "$STATE_DIR/last-update.json"
}

as_user git -C "$REPO_ROOT" merge --ff-only "$REMOTE/$BRANCH"

if ! (
  cd "$REPO_ROOT"
  as_user npm run test:fabric-directory &&
  as_user npm run test:fabric-local &&
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
if ! HEALTH_JSON="$health" EXPECTED_COUNT="$expected_count" as_user node -e "
  const h=JSON.parse(process.env.HEALTH_JSON||'{}');
  const expected=Number(process.env.EXPECTED_COUNT||0);
  if(h.ok!==true || h.service!=='evercraft-fabric-local') process.exit(2);
  if(Number(h.capability_count)!==expected) process.exit(3);
"; then
  rollback "health_contract_failed"
  exit 9
fi

printf '{"schema":"evercraft.fabric-update.v1","state":"updated","from_ref":"%s","release_ref":"%s","capability_count":%s,"observed_at":"%s"}\n'   "$before" "$target" "$expected_count" "$(date -u +%FT%TZ)" > "$STATE_DIR/last-update.json"
chmod 0640 "$STATE_DIR/last-update.json"
echo "Evercraft Fabric updated to $target with $expected_count capabilities."
