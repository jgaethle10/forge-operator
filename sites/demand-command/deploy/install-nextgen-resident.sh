#!/usr/bin/env bash
# Evercraft Demand Command resident NextGen canary. Does not publish ports.
set -euo pipefail
umask 077

usage() {
  cat <<'HELP'
Usage: bash sites/demand-command/deploy/install-nextgen-resident.sh [--check|--install|--show-token]
  --check       Inspect service and loopback (default; no changes).
  --install     Install/start ONLY the private Demand Command user systemd unit.
  --show-token  Print private browser token locally; never send it in chat or screenshots.
The private API remains bound to 127.0.0.1:18896.
HELP
}

MODE="${1:---check}"
case "$MODE" in --check|--install|--show-token) ;; -h|--help) usage; exit 0 ;; *) usage >&2; exit 2 ;; esac
SITE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
BACKEND="$SITE/backend"
CONF="$HOME/.config/evercraft"
ENVFILE="$CONF/demand-command.env"
UNITDIR="$HOME/.config/systemd/user"
UNIT="$UNITDIR/evercraft-demand-command.service"
SERVICE="evercraft-demand-command.service"
PYTHON="$(command -v python3 || true)"
[[ -f "$BACKEND/server.py" && -f "$BACKEND/console.html" && -n "$PYTHON" ]] || { echo 'FAIL: checked-out backend/Python missing' >&2; exit 2; }

title_probe() {
  curl --noproxy '*' -fsS --max-time 3 http://127.0.0.1:18896/ 2>/dev/null |
    grep -Fq '<title>Evercraft Demand Command | Private Console</title>'
}
if [[ "$MODE" == "--show-token" ]]; then
  [[ -f "$ENVFILE" && ! -L "$ENVFILE" ]] || { echo 'Token file missing' >&2; exit 2; }
  [[ "$(stat -c '%a' "$ENVFILE")" == "600" ]] || { echo 'Unsafe token file permissions' >&2; exit 2; }
  echo 'PRIVATE BROWSER TOKEN BELOW. Never paste it into chat, screenshots, logs or GitHub.'
  sed -n 's/^EVERCRAFT_DEMAND_TOKEN=//p' "$ENVFILE"
  exit 0
fi
if [[ "$MODE" == "--check" ]]; then
  echo "Private URL (local only): http://127.0.0.1:18896/"
  if command -v systemctl >/dev/null && systemctl --user is-active --quiet "$SERVICE"; then
    echo 'User service: active'
  else
    echo 'User service: not active'
  fi
  if title_probe; then echo 'Loopback Demand Command HTML: PASS'
  else echo 'Loopback Demand Command HTML: NOT REACHABLE'; fi
  if command -v loginctl >/dev/null; then
    echo "User linger: $(loginctl show-user "$USER" -p Linger --value 2>/dev/null || echo unknown)"
  fi
  echo 'Public HTTPS deployment: not configured by this script'
  exit 0
fi

command -v systemctl >/dev/null || { echo 'systemctl required' >&2; exit 2; }
systemctl --user show-environment >/dev/null ||
  { echo 'No user systemd manager. Enable WSL systemd and restart WSL before installing.' >&2; exit 2; }
if [[ -L "$ENVFILE" || -L "$UNIT" ]]; then
  echo 'Refusing to overwrite a symlinked credential or service file' >&2; exit 2
fi
if title_probe && ! systemctl --user is-active --quiet "$SERVICE"; then
  echo 'Port 18896 already serves Demand Command from a non-managed terminal. Close only that terminal/process first; refusing a port takeover.' >&2
  exit 2
fi
if ! title_probe && (exec 3<>/dev/tcp/127.0.0.1/18896) 2>/dev/null; then
  echo 'Port 18896 is in use by a different or unrecognized process. Refusing to disturb it.' >&2
  exit 2
fi

install -d -m 0700 "$CONF" "$UNITDIR" "$HOME/.local/state/evercraft"
if [[ ! -e "$ENVFILE" ]]; then
  "$PYTHON" - "$ENVFILE" <<'PY'
import os, pathlib, secrets, sys
target = pathlib.Path(sys.argv[1])
state = pathlib.Path.home() / '.local/state/evercraft/demand-command.sqlite'
fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w', encoding='utf-8') as f:
    f.write('EVERCRAFT_DEMAND_TOKEN=' + secrets.token_urlsafe(48) + '\n')
    f.write('EVERCRAFT_DEMAND_PORT=18896\n')
    f.write('EVERCRAFT_DEMAND_DB=' + str(state) + '\n')
PY
fi
[[ -f "$ENVFILE" && "$(stat -c '%a' "$ENVFILE")" == "600" ]] ||
  { echo 'Private environment must be a regular 0600 file' >&2; exit 2; }

cat > "$UNIT" <<EOF
[Unit]
Description=Evercraft Demand Command private NextGen canary
After=network.target

[Service]
Type=simple
WorkingDirectory=$BACKEND
EnvironmentFile=$ENVFILE
ExecStart=$PYTHON $BACKEND/server.py
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=default.target
EOF
chmod 0600 "$UNIT"
systemctl --user daemon-reload
systemctl --user enable "$SERVICE" >/dev/null
systemctl --user restart "$SERVICE"
for try in 1 2 3 4 5 6 7 8 9 10; do
  if title_probe; then break; fi
  sleep 1
done
if ! title_probe; then
  echo 'Service did not pass local title check; inspect with: systemctl --user status evercraft-demand-command.service' >&2
  exit 1
fi
echo 'PASS: Demand Command resident user service. Terminal may now be closed.'
echo 'Local URL: http://127.0.0.1:18896/'
echo 'Browser token: bash sites/demand-command/deploy/install-nextgen-resident.sh --show-token'
echo 'This does not publish an HTTPS link or enable Systemia intake.'
if command -v loginctl >/dev/null; then
  echo "User linger: $(loginctl show-user "$USER" -p Linger --value 2>/dev/null || echo unknown)"
  echo 'If linger is disabled, the service may stop when the user session ends.'
fi
