#!/usr/bin/env bash
# Dedicated Evercraft Demand Command reverse-SSH ingress. No Fabric/Caddy/router changes.
set -euo pipefail
umask 077

MODE="${1:---check}"
shift || true
PUBLIC_FILE=''
EXPECTED_FINGERPRINT=''
while (($#)); do
  case "$1" in
    --public-key-file) PUBLIC_FILE="${2:-}"; shift 2 ;;
    --expected-fingerprint) EXPECTED_FINGERPRINT="${2:-}"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
BASE=/etc/evercraft/demand-relay
HOME_DIR=/var/lib/evercraft/demandrelay
AUTH="$HOME_DIR/.ssh/authorized_keys"
HOSTKEY="$BASE/ssh_host_ed25519_key"
CONFIG="$BASE/sshd_config"
SERVICE=evercraft-demand-relay-sshd.service
UNIT="/etc/systemd/system/$SERVICE"

if [[ "$MODE" == '--check' ]]; then
  echo '=== Evercraft Penguin Demand-only SSH ingress ==='
  echo "Isolated SSH service: $(systemctl is-active "$SERVICE" 2>/dev/null || true)"
  echo "Existing default SSH service: $(systemctl is-active ssh.service 2>/dev/null || true)"
  if [[ -f "$CONFIG" ]]; then echo 'Isolated config: installed'; else echo 'Isolated config: absent'; fi
  if [[ -r "${HOSTKEY}.pub" ]]; then
    echo 'Isolated host fingerprint (public):'
    ssh-keygen -lf "${HOSTKEY}.pub" -E sha256
  else echo 'Isolated host key: absent'; fi
  echo 'Private SSH port 8222 listener:'
  ss -H -ltn '( sport = :8222 )' 2>/dev/null || true
  echo 'No change made; ChromeOS LAN forwarding and NextGen tunnel are separate gates.'
  exit 0
fi

if [[ "$MODE" != '--install' ]]; then
  echo "Usage: $0 [--check|--install --public-key-file FILE --expected-fingerprint SHA256:...]" >&2
  exit 2
fi
if (( EUID != 0 )); then echo 'Installation requires sudo/root.' >&2; exit 2; fi
[[ -f "$SOURCE_DIR/sshd-demand-relay.conf.example" ]] || { echo 'Staged SSH config missing' >&2; exit 2; }
[[ -f "$PUBLIC_FILE" && -r "$PUBLIC_FILE" ]] || { echo 'Public key file unreadable' >&2; exit 2; }
[[ "$EXPECTED_FINGERPRINT" =~ ^SHA256:[A-Za-z0-9+/]{43}$ ]] || { echo 'Expected SHA256 fingerprint required' >&2; exit 2; }
for cmd in sshd ssh-keygen systemctl useradd getent ss; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Missing required command: $cmd" >&2; exit 2; }
done

mapfile -t PUBLINES < "$PUBLIC_FILE"
if (( ${#PUBLINES[@]} != 1 )) || [[ ! "${PUBLINES[0]}" =~ ^ssh-ed25519[[:space:]]+[A-Za-z0-9+/]+={0,2}([[:space:]]+[A-Za-z0-9._@-]+)?$ ]]; then
  echo 'Expected one OpenSSH ed25519 public-key line, no other material' >&2
  exit 2
fi
ACTUAL_FINGERPRINT="$(ssh-keygen -lf "$PUBLIC_FILE" -E sha256 | awk '{print $2}')"
if [[ "$ACTUAL_FINGERPRINT" != "$EXPECTED_FINGERPRINT" ]]; then
  echo 'Public key fingerprint mismatch. No service changed.' >&2
  exit 2
fi
if [[ -L "$BASE" || -L "$HOME_DIR" || -L "$HOME_DIR/.ssh" || -L "$AUTH" || -L "$HOSTKEY" || -L "$CONFIG" || -L "$UNIT" ]]; then
  echo 'Refusing symlinked privileged path' >&2
  exit 2
fi
if systemctl is-active --quiet "$SERVICE"; then
  echo "Demand-only SSH service is already active. No restart or key rotation performed."
  exit 0
fi
if ss -H -ltn '( sport = :8222 )' 2>/dev/null | grep -q ':8222'; then
  echo 'TCP port 8222 already occupied. Refusing to change any listener.' >&2
  exit 2
fi

if getent passwd demandrelay >/dev/null; then
  ACTUAL_SHELL="$(getent passwd demandrelay | cut -d: -f7)"
  ACTUAL_HOME="$(getent passwd demandrelay | cut -d: -f6)"
  if [[ "$ACTUAL_SHELL" != /usr/sbin/nologin || "$ACTUAL_HOME" != "$HOME_DIR" ]]; then
    echo 'Existing demandrelay account is not the expected no-login service identity.' >&2
    exit 2
  fi
else
  useradd --system --user-group --create-home --home-dir /var/lib/evercraft/demandrelay --shell /usr/sbin/nologin demandrelay
fi
install -d -o root -g root -m 0700 "$BASE"
install -d -o demandrelay -g demandrelay -m 0700 "$HOME_DIR/.ssh"
TEMP="$(mktemp "$BASE/.publickey.XXXXXXXX")"
trap 'rm -f "$TEMP"' EXIT
printf 'restrict,port-forwarding,permitlisten="127.0.0.1:18897" %s\n' "${PUBLINES[0]}" > "$TEMP"
chmod 0600 "$TEMP"
if [[ -e "$AUTH" ]]; then
  cmp -s "$TEMP" "$AUTH" || { echo 'Existing relay authorized key differs; manual rotation required' >&2; exit 2; }
else
  install -o demandrelay -g demandrelay -m 0600 "$TEMP" "$AUTH"
fi
[[ "$(stat -c %U:%G:%a "$AUTH")" == "demandrelay:demandrelay:600" ]] || { echo "Authorized key must belong to demandrelay with mode 0600" >&2; exit 2; }

if [[ -e "$CONFIG" ]]; then
  cmp -s "$SOURCE_DIR/sshd-demand-relay.conf.example" "$CONFIG" || { echo 'Existing relay config differs; manual review required' >&2; exit 2; }
else
  install -o root -g root -m 0600 "$SOURCE_DIR/sshd-demand-relay.conf.example" "$CONFIG"
fi
if [[ ! -e "$HOSTKEY" && ! -e "${HOSTKEY}.pub" ]]; then
  ssh-keygen -q -t ed25519 -N '' -C evercraft-demand-penguin -f "$HOSTKEY"
  chmod 0600 "$HOSTKEY"
  chmod 0644 "${HOSTKEY}.pub"
elif [[ ! -f "$HOSTKEY" || ! -f "${HOSTKEY}.pub" ]]; then
  echo 'SSH host key pair incomplete: fail closed.' >&2
  exit 2
fi

install -d -o root -g root -m 0755 /run/sshd
/usr/sbin/sshd -t -f "$CONFIG"
# Check effective settings before enabling the isolated listener.
EFFECTIVE="$(/usr/sbin/sshd -T -f "$CONFIG")"
for required in 'port 8222' 'passwordauthentication no' 'kbdinteractiveauthentication no' 'permitrootlogin no' 'allowtcpforwarding remote' 'permitlisten 127.0.0.1:18897' 'gatewayports no' 'maxsessions 0'; do
  grep -Fxq "$required" <<< "$EFFECTIVE" || { echo "Required SSH policy absent: $required" >&2; exit 2; }
done

UNIT_CONTENT="$(cat <<EOT
[Unit]
Description=Evercraft Demand Command isolated reverse SSH ingress
After=network.target

[Service]
Type=simple
ExecStartPre=/usr/bin/install -d -o root -g root -m 0755 /run/sshd
ExecStartPre=/usr/sbin/sshd -t -f $CONFIG
ExecStart=/usr/sbin/sshd -D -e -f $CONFIG
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOT
)"
if [[ -e "$UNIT" ]]; then
  if [[ "$(cat "$UNIT")" != "$UNIT_CONTENT" ]]; then
    echo 'Dedicated relay service definition differs; manual review required' >&2
    exit 2
  fi
else
  printf '%s\n' "$UNIT_CONTENT" > "$UNIT"
  chmod 0644 "$UNIT"
fi
systemctl daemon-reload
systemctl enable --now "$SERVICE"
sleep 1
systemctl is-active --quiet "$SERVICE" || { echo 'Relay service failed; inspect systemctl status' >&2; exit 1; }
ss -H -ltn '( sport = :8222 )' | grep -q ':8222' || { echo 'Relay not listening on 8222' >&2; exit 1; }

echo 'PASS: key-only, forwarding-only Penguin Demand SSH endpoint listening on Crostini 8222.'
echo 'NEW DEDICATED PENGUIN HOST FINGERPRINT (compare independently from NextGen):'
ssh-keygen -lf "${HOSTKEY}.pub" -E sha256
echo "Authorized NextGen public key fingerprint: $ACTUAL_FINGERPRINT"
echo 'Existing SSH service, Fabric and Caddy were not restarted or changed.'
echo 'Still NOT publicly deployed: ChromeOS LAN port forwarding, NextGen tunnel, DNS, HTTPS auth remain gated.'