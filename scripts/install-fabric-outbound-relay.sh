#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELAY_HOST=""
RELAY_USER=""
RELAY_PORT=22
REMOTE_PORT=18787
IDENTITY_FILE=""
KNOWN_HOSTS_FILE=""
LOCAL_PORT=8787
STATE_DIR="/var/lib/evercraft/outbound-relay"

usage(){
  cat <<'EOF'
Usage:
  sudo scripts/install-fabric-outbound-relay.sh \
    --relay-host relay.example.com \
    --relay-user evercraft-relay \
    --identity-file /home/user/.ssh/evercraft-relay \
    --known-hosts-file /home/user/.ssh/known_hosts \
    [--relay-port 22] [--remote-port 18787]

Installs a resident, outbound-only SSH reverse relay for Evercraft Fabric.

Security properties:
  - Fabric remains loopback-only on 127.0.0.1:8787.
  - The remote forwarded socket binds only to 127.0.0.1 on the relay node.
  - Strict host-key checking is mandatory.
  - No password prompts or interactive shell are allowed.
  - The service fails closed if the reverse forward cannot be established.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --relay-host) RELAY_HOST="${2:-}"; shift 2 ;;
    --relay-user) RELAY_USER="${2:-}"; shift 2 ;;
    --relay-port) RELAY_PORT="${2:-}"; shift 2 ;;
    --remote-port) REMOTE_PORT="${2:-}"; shift 2 ;;
    --identity-file) IDENTITY_FILE="${2:-}"; shift 2 ;;
    --known-hosts-file) KNOWN_HOSTS_FILE="${2:-}"; shift 2 ;;
    --repo-root) REPO_ROOT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: run installer with sudo" >&2
  exit 2
fi
if [[ ! "$RELAY_HOST" =~ ^[A-Za-z0-9.-]+$ || -z "$RELAY_HOST" ]]; then
  echo "ERROR: --relay-host must be a hostname or IPv4-style label" >&2
  exit 2
fi
if [[ ! "$RELAY_USER" =~ ^[A-Za-z_][A-Za-z0-9._-]*$ ]]; then
  echo "ERROR: --relay-user rejected" >&2
  exit 2
fi
for value in "$RELAY_PORT" "$REMOTE_PORT" "$LOCAL_PORT"; do
  [[ "$value" =~ ^[0-9]+$ ]] && (( value >= 1 && value <= 65535 )) || {
    echo "ERROR: invalid TCP port" >&2
    exit 2
  }
done

RUN_USER="${SUDO_USER:-$(stat -c '%U' "$REPO_ROOT")}"
RUN_GROUP="$(id -gn "$RUN_USER")"
if [[ "$RUN_USER" == "root" ]]; then
  echo "ERROR: relay client must run as the ordinary Evercraft runtime user" >&2
  exit 2
fi
if [[ ! -f "$IDENTITY_FILE" ]]; then
  echo "ERROR: identity file not found" >&2
  exit 2
fi
if [[ ! -f "$KNOWN_HOSTS_FILE" ]]; then
  echo "ERROR: known_hosts file not found; strict host pinning is required" >&2
  exit 2
fi
if ! command -v ssh >/dev/null 2>&1; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y openssh-client
fi

install -d -m 0755 /etc/evercraft
install -d -o "$RUN_USER" -g "$RUN_GROUP" -m 0750 "$STATE_DIR"

cat >/etc/evercraft/outbound-relay.env <<EOF
EVERCRAFT_RELAY_HOST=$RELAY_HOST
EVERCRAFT_RELAY_USER=$RELAY_USER
EVERCRAFT_RELAY_PORT=$RELAY_PORT
EVERCRAFT_RELAY_REMOTE_PORT=$REMOTE_PORT
EVERCRAFT_RELAY_LOCAL_PORT=$LOCAL_PORT
EVERCRAFT_RELAY_IDENTITY_FILE=$IDENTITY_FILE
EVERCRAFT_RELAY_KNOWN_HOSTS_FILE=$KNOWN_HOSTS_FILE
EOF
chmod 0640 /etc/evercraft/outbound-relay.env
chown root:"$RUN_GROUP" /etc/evercraft/outbound-relay.env

cat >/usr/local/sbin/evercraft-fabric-outbound-relay <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
source /etc/evercraft/outbound-relay.env
STATE_DIR=/var/lib/evercraft/outbound-relay
mkdir -p "$STATE_DIR"
node - <<'NODE' >"$STATE_DIR/latest.json"
const fs=require('fs');
const receipt={
  schema:'evercraft.fabric-outbound-relay.v1',
  state:'starting',
  transport:'ssh_reverse_tcp',
  relay_host:process.env.EVERCRAFT_RELAY_HOST,
  relay_port:Number(process.env.EVERCRAFT_RELAY_PORT),
  remote_bind:'127.0.0.1',
  remote_port:Number(process.env.EVERCRAFT_RELAY_REMOTE_PORT),
  local_target:'127.0.0.1:'+process.env.EVERCRAFT_RELAY_LOCAL_PORT,
  secret_material_exposed:false,
  observed_at:new Date().toISOString(),
};
process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
NODE
exec /usr/bin/ssh -NT \
  -o BatchMode=yes \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=20 \
  -o ServerAliveCountMax=3 \
  -o StrictHostKeyChecking=yes \
  -o "UserKnownHostsFile=$EVERCRAFT_RELAY_KNOWN_HOSTS_FILE" \
  -o "IdentitiesOnly=yes" \
  -i "$EVERCRAFT_RELAY_IDENTITY_FILE" \
  -p "$EVERCRAFT_RELAY_PORT" \
  -R "127.0.0.1:$EVERCRAFT_RELAY_REMOTE_PORT:127.0.0.1:$EVERCRAFT_RELAY_LOCAL_PORT" \
  "$EVERCRAFT_RELAY_USER@$EVERCRAFT_RELAY_HOST"
EOF
chmod 0755 /usr/local/sbin/evercraft-fabric-outbound-relay

cat >/etc/systemd/system/evercraft-fabric-outbound-relay.service <<EOF
[Unit]
Description=Evercraft Fabric outbound service relay
After=network-online.target evercraft-fabric.service
Wants=network-online.target
Requires=evercraft-fabric.service

[Service]
Type=simple
User=$RUN_USER
Group=$RUN_GROUP
EnvironmentFile=/etc/evercraft/outbound-relay.env
ExecStart=/usr/local/sbin/evercraft-fabric-outbound-relay
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ReadOnlyPaths=$IDENTITY_FILE $KNOWN_HOSTS_FILE
ReadWritePaths=$STATE_DIR

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now evercraft-fabric-outbound-relay.service
echo "Evercraft outbound relay installed."
systemctl --no-pager --full status evercraft-fabric-outbound-relay.service | sed -n '1,14p'
