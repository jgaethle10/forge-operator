#!/usr/bin/env bash
# Opt-in local-only timer: no remote listener, no remote job admission, no auto-push.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
NODE="$(command -v node)"
UNIT_DIR="$HOME/.config/systemd/user"
SERVICE="evercraft-nextgen-local-graphics.service"
TIMER="evercraft-nextgen-local-graphics.timer"
if [[ ! -f "$REPO/scripts/nextgen-local-graphics.mjs" ]]; then
  echo 'FAIL: missing local graphics runner' >&2; exit 1
fi
if [[ -e "$UNIT_DIR/$SERVICE" || -e "$UNIT_DIR/$TIMER" ]]; then
  echo 'HOLD: local graphics units already exist; inspect them before changing anything.' >&2
  exit 1
fi
mkdir -p "$UNIT_DIR"
cat > "$UNIT_DIR/$SERVICE" <<SERVICE_UNIT
[Unit]
Description=Evercraft NextGen local QA and graphics build (no network control)
[Service]
Type=oneshot
WorkingDirectory=$REPO
ExecStart=$NODE $REPO/scripts/nextgen-local-graphics.mjs
CPUQuota=150%
MemoryMax=2G
Nice=10
IOSchedulingClass=idle
NoNewPrivileges=true
TimeoutStartSec=5min
SERVICE_UNIT
cat > "$UNIT_DIR/$TIMER" <<TIMER_UNIT
[Unit]
Description=Check approved local Evercraft graphics inputs twice per hour
[Timer]
OnBootSec=5min
OnUnitActiveSec=30min
AccuracySec=2min
Unit=$SERVICE
[Install]
WantedBy=timers.target
TIMER_UNIT
systemctl --user daemon-reload
systemctl --user enable --now "$TIMER"
systemctl --user start "$SERVICE"
echo "LOCAL GRAPHICS TIMER READY: $TIMER"
systemctl --user list-timers --all "$TIMER" --no-pager
