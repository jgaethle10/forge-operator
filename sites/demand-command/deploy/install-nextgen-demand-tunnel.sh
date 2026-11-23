#!/usr/bin/env bash
# Owned NextGen -> Penguin Demand-only reverse SSH tunnel.
# No third-party transport, DNS, Caddy, SSH daemon, or router changes.
set -euo pipefail
umask 077

MODE=--check
if (($#)); then MODE="$1"; shift; fi
LAN_IP=
EXPECTED_FINGERPRINT='SHA256:NVPAF3rqN9wjkR10o0EvB7aI/PBFaYj17dfDYvI++Ck'
while (($#)); do
  case "$1" in
    --lan-ip) LAN_IP="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done
ROOT="$HOME/.local/state/evercraft/demand-tunnel"
KEY="$HOME/.ssh/evercraft-demand-relay"
KNOWN="$ROOT/known_hosts"
UNITDIR="$HOME/.config/systemd/user"
UNIT="$UNITDIR/evercraft-demand-tunnel.service"
SERVICE=evercraft-demand-tunnel.service
SSH="$(command -v ssh || true)"
SCAN="$(command -v ssh-keyscan || true)"
KEYGEN="$(command -v ssh-keygen || true)"
PYTHON="$(command -v python3 || true)"
CURL="$(command -v curl || true)"

local_app() {
  "$CURL" --noproxy '*' -fsS --max-time 3 http://127.0.0.1:18896/ 2>/dev/null |
    grep -Fq '<title>Evercraft Demand Command | Private Console</title>'
}

if [[ "$MODE" == --check ]]; then
  echo '=== NextGen Demand reverse tunnel ==='
  if systemctl --user is-active --quiet "$SERVICE" 2>/dev/null; then
    echo 'User-managed tunnel process: active (not proof of remote forwarding)'
  else
    echo 'User-managed tunnel process: not active'
  fi
  if [[ -n "$CURL" ]] && local_app; then echo 'NextGen Demand app identity: PASS'
  else echo 'NextGen Demand app identity: unavailable'; fi
  if [[ -s "$KNOWN" ]]; then echo 'Pinned Penguin SSH host key file: present'
  else echo 'Pinned Penguin SSH host key file: missing'; fi
  echo 'Penguin loopback reverse-forward identity must be checked separately on Penguin.'
  exit 0
fi

if [[ "$MODE" != --verify && "$MODE" != --install ]]; then
  echo "Usage: $0 [--check|--verify --lan-ip CHROMEBOOK_LAN_IP|--install --lan-ip CHROMEBOOK_LAN_IP]" >&2
  exit 2
fi
[[ -n "$SSH" && -n "$SCAN" && -n "$KEYGEN" && -n "$PYTHON" && -n "$CURL" ]] ||
  { echo 'Missing OpenSSH, Python, or curl requirement' >&2; exit 2; }
[[ -n "$LAN_IP" ]] || { echo 'Set --lan-ip to the ChromeOS Wi-Fi LAN IPv4 (not Penguin Crostini 100.115.x.x).' >&2; exit 2; }
"$PYTHON" - "$LAN_IP" <<'PY'
import ipaddress, sys
v = ipaddress.IPv4Address(sys.argv[1])
rfc1918 = (ipaddress.ip_network('10.0.0.0/8'),
           ipaddress.ip_network('172.16.0.0/12'),
           ipaddress.ip_network('192.168.0.0/16'))
if not any(v in net for net in rfc1918):
    sys.exit('Only a private LAN IPv4 is allowed. Do not use Penguin Crostini address or a public host.')
PY
[[ -f "$KEY" && -f "$KEY.pub" && ! -L "$KEY" ]] ||
  { echo 'NextGen dedicated private SSH key missing; do not replace it automatically.' >&2; exit 2; }
[[ "$(stat -c '%a' "$KEY")" == 600 ]] || { echo 'SSH key must have 0600 permissions.' >&2; exit 2; }
ACTUAL_KEY="$("$KEYGEN" -lf "$KEY.pub" -E sha256 | awk '{print $2}')"
[[ "$ACTUAL_KEY" == 'SHA256:fyeshErB89g7fvv3d1uT07fvWTsS0IOg7mglIW5BcWE' ]] ||
  { echo 'NextGen key fingerprint differs from approved public identity.' >&2; exit 2; }
local_app || { echo 'Demand Command local 18896 identity not healthy. Do not install bridge.' >&2; exit 2; }
[[ ! -L "$ROOT" && ! -L "$KNOWN" && ! -L "$UNITDIR" && ! -L "$UNIT" ]] ||
  { echo 'Symlink in state/config path: hold for manual review' >&2; exit 2; }

TEMP="$(mktemp)"
trap 'rm -f "$TEMP"' EXIT
# ChromeOS/Crostini forwarding can accept TCP and delay an SSH key exchange.
# Each response remains UNTRUSTED until compared to the independent Penguin fingerprint.
# Retry only when no single key arrived; never retry through a key mismatch.
LINES=0
for attempt in 1 2 3 4; do
  : > "$TEMP"
  "$SCAN" -T 25 -p 8222 -t ed25519 "$LAN_IP" > "$TEMP" 2>/dev/null || true
  LINES="$(wc -l < "$TEMP")"
  if [[ "$LINES" -eq 1 ]]; then
    RECEIVED="$("$KEYGEN" -lf "$TEMP" -E sha256 | awk '{print $2}')"
    if [[ "$RECEIVED" != "$EXPECTED_FINGERPRINT" ]]; then
      echo 'SSH host fingerprint MISMATCH. Possible wrong device or interception. No tunnel installed.' >&2
      exit 2
    fi
    echo "PASS: Verified the dedicated Penguin SSH fingerprint (attempt $attempt)."
    break
  fi
  if [[ "$LINES" -ne 0 ]]; then
    echo 'Multiple SSH host keys or invalid response from LAN:8222; refusing to proceed.' >&2
    exit 2
  fi
  if [[ "$attempt" -lt 4 ]]; then
    echo "SSH key exchange did not finish on attempt $attempt; retrying the same pinned identity..."
    sleep 2
  fi
done
[[ "$LINES" -eq 1 ]] || {
  echo 'No single SSH ED25519 host key received; NO TUNNEL CREATED.' >&2
  "$PYTHON" - "$LAN_IP" <<'PY'
import socket, sys
host = sys.argv[1]
try:
    with socket.create_connection((host, 8222), timeout=5):
        print('TCP 8222: CONNECTED, but SSH ED25519 identity was not returned.')
        print('Inspect sshd on Penguin and whether ChromeOS maps to the intended Linux service.')
except ConnectionRefusedError:
    print('TCP 8222: CONNECTION REFUSED. Confirm ChromeOS forwards TCP 8222 and Penguin service listens.')
except TimeoutError:
    print('TCP 8222: TIMED OUT. Check Chromebook IP, Wi-Fi LAN isolation, ChromeOS forwarding and firewalls.')
except OSError as exc:
    print('TCP 8222: NETWORK ERROR (' + exc.__class__.__name__ + '). Check local routing and forwarding.')
PY
  echo 'Do not weaken host checking, open the household WAN, or start default SSH to bypass this.' >&2
  exit 2
}
echo "PASS: LAN SSH host fingerprint exactly matches dedicated Penguin key ($RECEIVED)."
if [[ "$MODE" == --verify ]]; then
  echo 'No tunnel, service, DNS, or Caddy configuration was changed.'
  exit 0
fi

# Install only after explicit --install. Do not overwrite an existing pinned identity.
install -d -m 0700 "$ROOT" "$UNITDIR"
if [[ -e "$KNOWN" ]]; then
  if ! cmp -s "$TEMP" "$KNOWN"; then
    echo 'Pinned known_hosts already exists but differs: manual review required.' >&2
    exit 2
  fi
else
  install -m 0600 "$TEMP" "$KNOWN"
fi

# Foreground manual ssh is not needed; the owned user service reconnects automatically.
UNIT_TMP="$(mktemp)"
trap 'rm -f "$TEMP" "$UNIT_TMP"' EXIT
cat > "$UNIT_TMP" <<EOF
[Unit]
Description=Evercraft Demand Command private NextGen to Penguin SSH tunnel
After=network-online.target evercraft-demand-command.service
Wants=network-online.target
Requires=evercraft-demand-command.service

[Service]
Type=simple
ExecStart=$SSH -F /dev/null -NT -i $KEY -p 8222 -o UserKnownHostsFile=$KNOWN -o GlobalKnownHostsFile=/dev/null -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=25 -o ServerAliveCountMax=3 -o ConnectTimeout=8 -R 127.0.0.1:18897:127.0.0.1:18896 demandrelay@$LAN_IP
Restart=always
RestartSec=20
UMask=0077
NoNewPrivileges=true

[Install]
WantedBy=default.target
EOF
if [[ -e "$UNIT" ]]; then
  cmp -s "$UNIT_TMP" "$UNIT" || {
    echo 'Existing tunnel unit differs. Refusing implicit changes. Inspect or explicitly retire the old tunnel first.' >&2
    exit 2
  }
else
  install -m 0600 "$UNIT_TMP" "$UNIT"
fi
systemctl --user daemon-reload
systemctl --user enable "$SERVICE" >/dev/null
systemctl --user start "$SERVICE"
sleep 2
systemctl --user is-active --quiet "$SERVICE" || {
  echo 'Tunnel process did not remain active. Inspect: journalctl --user -u evercraft-demand-tunnel.service --no-pager -n 20' >&2
  exit 1
}
echo 'NextGen tunnel process ACTIVE. This is not yet proof of remote forwarding.'
echo 'On Penguin verify: curl --noproxy "*" -fsS http://127.0.0.1:18897/ | grep -F "<title>Evercraft Demand Command | Private Console</title>"'
echo 'Once that passes, gate the separate authenticated HTTPS domain. No public route was enabled here.'
