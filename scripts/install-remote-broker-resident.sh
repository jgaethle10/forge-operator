#!/usr/bin/env bash
set -euo pipefail
# Stage a private, supervised broker without editing existing public routing.
if [[ $EUID -ne 0 ]]; then echo "Run with sudo." >&2; exit 2; fi
if [[ $# -gt 1 || ( $# -eq 1 && "$1" != "--start" ) ]]; then
  echo "Usage: sudo bash scripts/install-remote-broker-resident.sh [--start]" >&2
  exit 2
fi
START=false
[[ "$*" == "--start" ]] && START=true
SOURCE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_ROOT="$(systemctl show evercraft-nodeseed.service -p WorkingDirectory --value)"
NODE_BIN="$(command -v node)"
TARGET_FILE="$TARGET_ROOT/systemia/yard/remote-broker-resident.mjs"
UNIT_FILE="/etc/systemd/system/evercraft-remote-broker-resident.service"
NODE_ROOT="/var/lib/evercraft/nodeseed"
UNIT_KNOWN=false

if [[ "$TARGET_ROOT" != "/opt/evercraft/forge-operator" ||
      ! -f "$TARGET_ROOT/systemia/yard/operator.mjs" ||
      ! -f "$TARGET_ROOT/systemia/network/outbound-capacity-broker.mjs" ]]; then
  echo "HOLD: installed NodeSeed runtime or broker dependencies changed." >&2
  exit 3
fi
if [[ ! -f "$SOURCE_ROOT/systemia/yard/remote-broker-resident.mjs" ||
      ! -f "$NODE_ROOT/nodeseed-receipt.json" ]]; then
  echo "HOLD: reviewed source or existing NodeSeed receipt is missing." >&2
  exit 4
fi
if ! systemctl is-active --quiet evercraft-nodeseed.service; then
  echo "HOLD: NodeSeed not active." >&2
  exit 5
fi
if [[ -e "$UNIT_FILE" ]]; then
  UNIT_KNOWN=true
  if ! grep -Fq 'Evercraft PRIVATE remote capacity broker (no public route)' "$UNIT_FILE"; then
    echo "HOLD: existing unit is not ours; refusing overwrite." >&2
    exit 6
  fi
fi
if [[ -e "$TARGET_FILE" && "$UNIT_KNOWN" == false ]] &&
    ! cmp -s "$SOURCE_ROOT/systemia/yard/remote-broker-resident.mjs" "$TARGET_FILE"; then
  echo "HOLD: installed target file differs and lacks recognized unit." >&2
  exit 7
fi
if systemctl is-active --quiet evercraft-remote-broker-resident.service; then
  echo "HOLD: broker supervisor already active; refusing replacement." >&2
  exit 8
fi
"$NODE_BIN" --check "$SOURCE_ROOT/systemia/yard/remote-broker-resident.mjs"
install -o root -g root -m 0644 "$SOURCE_ROOT/systemia/yard/remote-broker-resident.mjs" "$TARGET_FILE"
cat > "$UNIT_FILE" <<SERVICE
[Unit]
Description=Evercraft PRIVATE remote capacity broker (no public route)
After=network-online.target evercraft-nodeseed.service
Requires=evercraft-nodeseed.service

[Service]
Type=simple
User=evercraft
Group=evercraft
EnvironmentFile=/etc/evercraft/nodeseed.env
WorkingDirectory=$TARGET_ROOT
ExecStart=$NODE_BIN $TARGET_FILE --run
Restart=on-failure
RestartSec=10
TimeoutStopSec=20
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$NODE_ROOT
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
SERVICE
chmod 0644 "$UNIT_FILE"
systemctl daemon-reload
echo "STAGED: private broker source and service. Fabric / Caddy unchanged."
if [[ "$START" == true ]]; then
  systemctl enable --now evercraft-remote-broker-resident.service
  systemctl is-active --quiet evercraft-remote-broker-resident.service
  echo "ACTIVATED: localhost-only broker. No public route or device authorization."
  "$NODE_BIN" "$TARGET_FILE" --status
else
  echo "Not activated. To activate later: sudo systemctl enable --now evercraft-remote-broker-resident.service"
fi
