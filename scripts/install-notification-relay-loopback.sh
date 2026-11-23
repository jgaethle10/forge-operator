#!/usr/bin/env bash
# Install the existing Systemia Notification Fabric on private loopback only.
# Default is observation-only. --apply explicitly provisions an isolated Relay
# service but DOES NOT wire a Studio principal, touch Fabric, or send alerts.
set -euo pipefail
umask 077
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE=check
if [[ "${1:-}" == "--apply" && "$#" == 1 ]]; then MODE=apply
elif [[ "$#" != 0 && "${1:-}" != "--check" ]]; then
  echo "Usage: scripts/install-notification-relay-loopback.sh [--check|--apply]" >&2
  exit 2
elif [[ "${1:-}" == "--check" && "$#" != 1 ]]; then
  echo "Unknown arguments" >&2; exit 2
fi

ENV_FILE="/etc/evercraft/notification-fabric.env"
UNIT_FILE="/etc/systemd/system/evercraft-notification-fabric.service"
DATA="/var/lib/evercraft/notification-fabric"
PORT=3921
SCRIPT="$REPO/systemia/notification-fabric/resident-loopback.mjs"
NODE="$(command -v node || true)"
OWNER="$(stat -c %U "$REPO")"
if [[ ! -f "$SCRIPT" || -z "$NODE" || "$OWNER" == root || -z "$OWNER" ]]; then
  echo "HOLD: canonical resident source, node or ordinary checkout owner missing" >&2
  exit 2
fi
if ! id "$OWNER" >/dev/null 2>&1; then echo "HOLD: owner identity unavailable" >&2; exit 2; fi
if [[ ! -f "$REPO/node_modules/express/package.json" ]]; then
  echo "HOLD: existing Forge Express dependency is not installed; no npm operation attempted" >&2
  exit 3
fi

echo "RELAY_INSTALL_MODE=$MODE"
echo "RELAY_SOURCE_OWNER=$OWNER"
for name in "$ENV_FILE" "$UNIT_FILE" "$DATA"; do
  if [[ -L "$name" ]]; then echo "HOLD: symlink at an owned deployment path" >&2; exit 4; fi
done
if [[ "$MODE" == "check" ]]; then
  [[ -f "$ENV_FILE" ]] && echo "PRIVATE_ENV_PRESENT=YES" || echo "PRIVATE_ENV_PRESENT=NO"
  [[ -f "$UNIT_FILE" ]] && echo "SYSTEMD_UNIT_PRESENT=YES" || echo "SYSTEMD_UNIT_PRESENT=NO"
  [[ -d "$DATA" ]] && echo "PRIVATE_STORE_PRESENT=YES" || echo "PRIVATE_STORE_PRESENT=NO"
  systemctl show evercraft-notification-fabric.service \
    -p ActiveState -p Result -p ExecMainStatus --no-pager 2>/dev/null || true
  echo "READ_ONLY=YES"
  exit 0
fi

if [[ "$EUID" -ne 0 ]]; then
  echo "HOLD: --apply requires root through sudo" >&2
  exit 5
fi
if [[ -e "$ENV_FILE" || -e "$UNIT_FILE" ]]; then
  echo "HOLD: existing Relay configuration or unit requires review; refusing overwrite" >&2
  exit 6
fi
if ! test -d /etc/evercraft || ! test -d /var/lib/evercraft; then
  echo "HOLD: expected owned system roots are absent" >&2
  exit 7
fi
if ss -ltnH | grep -Eq ":$PORT([[:space:]]|$)"; then
  echo "HOLD: Relay loopback port already in use" >&2
  exit 8
fi
if [[ -e "$DATA" ]]; then
  "$NODE" - "$DATA" "$(id -u "$OWNER")" <<'NODE'
const fs=require('fs');
const [dir,uid]=process.argv.slice(2);
const st=fs.lstatSync(dir);
if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||
   st.uid!==Number(uid)||fs.realpathSync(dir)!==dir)
 throw Error('RELAY_PRIVATE_STORE_EXISTING_HOLD');
NODE
else
  install -d -m 0700 -o "$OWNER" -g "$(id -gn "$OWNER")" "$DATA"
fi

# Credentials generated ON HOST directly into a root-only file. Never
# output tokens, inject them into shell command arguments, or commit them.
"$NODE" - "$ENV_FILE" "$DATA" "$PORT" <<'NODE'
const fs=require('fs'),crypto=require('crypto');
const [file,dir,port]=process.argv.slice(2);
const token=()=>crypto.randomBytes(32).toString('hex');
const entries={
 EVERCRAFT_NOTIFICATION_BASE_URL:'http://127.0.0.1:'+port,
 EVERCRAFT_NOTIFICATION_PORT:port,
 EVERCRAFT_NOTIFICATION_DATA_DIR:dir,
 EVERCRAFT_NOTIFICATION_INGEST_TOKEN:token(),
 EVERCRAFT_NOTIFICATION_SESSION_SECRET:token(),
 EVERCRAFT_NOTIFICATION_RECEIPT_SECRET:token(),
 EVERCRAFT_NOTIFICATION_ALLOWED_ORIGINS:'',
};
const fd=fs.openSync(file,'wx',0o600);
try{fs.writeFileSync(fd,Object.entries(entries).map(([k,v])=>k+'='+v).join('\n')+'\n')}
finally{fs.closeSync(fd)}
fs.chmodSync(file,0o600);
NODE

cat > "$UNIT_FILE" <<EOF
[Unit]
Description=Evercraft private Systemia Notification Fabric
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$OWNER
WorkingDirectory=$REPO
EnvironmentFile=$ENV_FILE
ExecStart=$NODE $SCRIPT
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=read-only
PrivateTmp=true
PrivateDevices=true
ReadWritePaths=$DATA

[Install]
WantedBy=multi-user.target
EOF
chmod 0644 "$UNIT_FILE"

systemctl daemon-reload
systemctl enable --now evercraft-notification-fabric.service
if ! curl -fsS --max-time 8 -o /dev/null "http://127.0.0.1:$PORT/api/notifications/health"; then
  echo "HOLD: private Relay service did not pass health readback" >&2
  exit 9
fi
echo "PRIVATE_RELAY_HEALTH=PASS"
echo "LOOPBACK_ONLY=YES"
echo "STUDIO_DISPATCH=NOT_WIRED"
echo "NO_PUBLIC_PORT_OR_CUSTOMER_ALERT_CREATED=YES"
