#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_DIR="$HOME/.config/evercraft"
ENV_FILE="$ENV_DIR/chromeos-host-boundary.env"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT_FILE="$UNIT_DIR/evercraft-chromeos-host-boundary-bridge.service"
STATE_DIR="$HOME/.local/state/evercraft/organism/chromeos-host-boundary"

mkdir -p "$ENV_DIR" "$UNIT_DIR" "$STATE_DIR"
chmod 700 "$ENV_DIR" "$STATE_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  TOKEN="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  {
    printf 'EVERCRAFT_CHROMEOS_HOST_BRIDGE_TOKEN=%s\n' "$TOKEN"
    printf 'EVERCRAFT_CHROMEOS_HOST_BRIDGE_HOST=0.0.0.0\n'
    printf 'EVERCRAFT_CHROMEOS_HOST_BRIDGE_PORT=18081\n'
    printf 'EVERCRAFT_CHROMEOS_HOST_BOUNDARY_STATE_DIR=%s\n' "$STATE_DIR"
  } > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
else
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  TOKEN="${EVERCRAFT_CHROMEOS_HOST_BRIDGE_TOKEN:-}"
fi

if [[ "${#TOKEN}" -lt 32 ]]; then
  echo "ChromeOS host bridge token is missing or too short." >&2
  exit 2
fi

cat > "$UNIT_FILE" <<UNIT
[Unit]
Description=Evercraft ChromeOS Host Boundary Bridge
After=default.target

[Service]
Type=simple
WorkingDirectory=$SOURCE_ROOT
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/env node $SOURCE_ROOT/systemia/compute/chromeos-host-boundary-bridge.mjs
Restart=on-failure
RestartSec=2
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable --now evercraft-chromeos-host-boundary-bridge.service

echo
echo "Evercraft ChromeOS Host Boundary Bridge is running."
echo "Paste this pairing token into the extension options:"
echo "$TOKEN"
echo
echo "Receiver: http://127.0.0.1:18081/v1/chromeos-host-boundary/report"
echo "State:    $STATE_DIR/latest.json"
