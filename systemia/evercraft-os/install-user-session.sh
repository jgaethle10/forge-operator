#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INSTALL_ROOT="${EVERCRAFT_USER_INSTALL_ROOT:-$HOME/.local/share/evercraft/forge-operator}"
STATE_ROOT="${EVERCRAFT_OS_STATE_ROOT:-$HOME/.local/state/evercraft/os}"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT_FILE="$UNIT_DIR/evercraft-os.service"
ENV_DIR="$HOME/.config/evercraft"
ENV_FILE="$ENV_DIR/evercraft-os.env"
NODE_BIN="$(command -v node || true)"

if [[ -z "$NODE_BIN" ]]; then
  echo "Node.js is required." >&2
  exit 2
fi

NODE_MAJOR="$("$NODE_BIN" -p "Number(process.versions.node.split('.')[0])")"
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  echo "Node.js 22+ is required." >&2
  exit 2
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemd user services are required for persistent Evercraft OS user-session boot." >&2
  exit 3
fi

mkdir -p "$INSTALL_ROOT" "$STATE_ROOT" "$UNIT_DIR" "$ENV_DIR"
chmod 0700 "$STATE_ROOT" "$ENV_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  : > "$ENV_FILE"
  chmod 0600 "$ENV_FILE"
fi

set_env_value() {
  local key="$1"
  local value="$2"
  local tmp="$ENV_FILE.tmp"
  grep -v "^$key=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" "$ENV_FILE"
  chmod 0600 "$ENV_FILE"
}

if [[ -n "${EVERCRAFT_NODE_ID:-}" ]]; then
  set_env_value "EVERCRAFT_NODE_ID" "$EVERCRAFT_NODE_ID"
fi
set_env_value "EVERCRAFT_OS_STATE_ROOT" "$STATE_ROOT"
set_env_value "EVERCRAFT_HOME_HOST" "127.0.0.1"
set_env_value "EVERCRAFT_HOME_AUTH" "${EVERCRAFT_HOME_AUTH:-local}"
set_env_value "EVERCRAFT_HOME_PORT" "${EVERCRAFT_HOME_PORT:-4310}"
set_env_value "EVERCRAFT_OS_DEVICE_CLASS" "${EVERCRAFT_OS_DEVICE_CLASS:-desktop}"

rm -rf "${INSTALL_ROOT:?}/"*
cp -a "$SOURCE_ROOT/." "$INSTALL_ROOT/"

cat > "$UNIT_FILE" <<EOF
[Unit]
Description=Evercraft OS user-session supervisor
After=default.target evercraft-local-organism.service
Wants=evercraft-local-organism.service
StartLimitIntervalSec=0

[Service]
Type=simple
WorkingDirectory=$INSTALL_ROOT
EnvironmentFile=-$ENV_FILE
ExecStart=$NODE_BIN $INSTALL_ROOT/systemia/evercraft-os/user-supervisor.mjs --root $STATE_ROOT
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$STATE_ROOT
LockPersonality=true
RestrictSUIDSGID=true

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now evercraft-os.service
sleep 2

if ! systemctl --user is-active --quiet evercraft-os.service; then
  systemctl --user status evercraft-os.service --no-pager || true
  exit 4
fi

if [[ ! -s "$STATE_ROOT/boot/latest.json" ]]; then
  echo "Evercraft OS did not emit a boot receipt." >&2
  exit 5
fi

"$NODE_BIN" -e '
const fs=require("fs");
const file=process.argv[1];
const r=JSON.parse(fs.readFileSync(file,"utf8"));
if(!["ready","held"].includes(r.state)) process.exit(2);
if(r.source_preflight!=="pass") process.exit(3);
if(r.home?.listen_scope!=="loopback") process.exit(4);
if(r.privilege_boundary?.root_required!==false) process.exit(5);
console.log(JSON.stringify({
  state:r.state,
  node_id:r.node_id,
  home_url:r.home?.url,
  receipt_hash:r.receipt_hash,
  capsule_hold_count:r.capsule_reconciliation?.hold_count
}));
' "$STATE_ROOT/boot/latest.json"

echo "Evercraft OS user-session supervisor is active."
echo "Home: loopback only."
echo "Privilege: no root runtime required."
echo "Installed capability capsules are reconciled from the Passport-gated install ledger."
echo "State: $STATE_ROOT"
