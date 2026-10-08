#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INSTALL_ROOT="${EVERCRAFT_USER_INSTALL_ROOT:-$HOME/.local/share/evercraft/forge-operator}"
STATE_ROOT="${EVERCRAFT_OS_STATE_ROOT:-$HOME/.local/state/evercraft/os}"
PASSPORT_STATE="${EVERCRAFT_OS_PASSPORT_STATE_DIR:-$STATE_ROOT/passport}"
INSTALL_STATE="${EVERCRAFT_OS_INSTALL_STATE_DIR:-$STATE_ROOT/install-ledger}"
ENV_DIR="$HOME/.config/evercraft"
ENV_FILE="$ENV_DIR/os.env"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT_FILE="$UNIT_DIR/evercraft-os-host.service"
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
  echo "systemd user services are required for persistent Evercraft OS host mode." >&2
  exit 3
fi

mkdir -p "$INSTALL_ROOT" "$STATE_ROOT" "$PASSPORT_STATE" "$INSTALL_STATE" "$ENV_DIR" "$UNIT_DIR"
chmod 0700 "$STATE_ROOT" "$PASSPORT_STATE" "$INSTALL_STATE" "$ENV_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  : > "$ENV_FILE"
fi
chmod 0600 "$ENV_FILE"

set_env_value() {
  local key="$1"
  local value="$2"
  local tmp="$ENV_FILE.tmp"
  grep -v "^$key=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" "$ENV_FILE"
  chmod 0600 "$ENV_FILE"
}

DEVICE_CLASS="${EVERCRAFT_OS_DEVICE_CLASS:-laptop}"
HOME_PORT="${EVERCRAFT_HOME_PORT:-4310}"
NODE_ID="${EVERCRAFT_NODE_ID:-evercraft-$(hostname | tr -c 'A-Za-z0-9._-' '-')}"

set_env_value "EVERCRAFT_OS_STATE_ROOT" "$STATE_ROOT"
set_env_value "EVERCRAFT_OS_PASSPORT_STATE_DIR" "$PASSPORT_STATE"
set_env_value "EVERCRAFT_OS_INSTALL_STATE_DIR" "$INSTALL_STATE"
set_env_value "EVERCRAFT_OS_DEVICE_CLASS" "$DEVICE_CLASS"
set_env_value "EVERCRAFT_HOME_PORT" "$HOME_PORT"
set_env_value "EVERCRAFT_NODE_ID" "$NODE_ID"

rm -rf "${INSTALL_ROOT:?}/"*
cp -a "$SOURCE_ROOT/." "$INSTALL_ROOT/"

cat > "$UNIT_FILE" <<EOF
[Unit]
Description=Evercraft OS user-session host
After=default.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_ROOT
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN $INSTALL_ROOT/systemia/evercraft-os/host-supervisor.mjs --root $STATE_ROOT --passport-state $PASSPORT_STATE --install-state $INSTALL_STATE --node-id $NODE_ID --device-class $DEVICE_CLASS --home-port $HOME_PORT
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now evercraft-os-host.service
sleep 2

if ! systemctl --user is-active --quiet evercraft-os-host.service; then
  systemctl --user status evercraft-os-host.service --no-pager || true
  exit 4
fi

if [[ ! -s "$STATE_ROOT/host-status.json" ]]; then
  echo "Evercraft OS host did not emit a status receipt." >&2
  exit 5
fi

"$NODE_BIN" - "$STATE_ROOT/host-status.json" <<'NODE'
const fs=require('fs');
const file=process.argv[2];
const status=JSON.parse(fs.readFileSync(file,'utf8'));
if(status.schema!=='evercraft.os.host-status.v1') throw new Error('host status schema invalid');
if(status.state!=='running') throw new Error('host not running');
if(status.home?.running!==true) throw new Error('Evercraft Home not running');
if(status.boundaries?.root_privileges_required!==false) throw new Error('unexpected root requirement');
console.log('Evercraft OS host verified:', status.home.url);
NODE

echo "Evercraft OS user-session host installed and active."
echo "Home: http://127.0.0.1:$HOME_PORT"
echo "Node: $NODE_ID"
echo "Device class: $DEVICE_CLASS"
echo "State: $STATE_ROOT"
echo "Privileges: user mode only; no root or kernel replacement."
echo "Capsules: reconciled from authorized install-ledger state."
