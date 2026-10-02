#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=""
YARD_STATE_DIR=""
SABAN_STATE_DIR=""
BROKER_DEPLOYMENT_ID=""
RUN_USER=""
CADENCE="2min"
MAX_INTENTS="16"

usage(){
  cat <<'EOF'
Usage:
  sudo scripts/install-yard-saban-intent-drainer.sh \
    --repo-root /path/to/forge-operator \
    --yard-state-dir /var/lib/evercraft/yard \
    --saban-state-dir /var/lib/evercraft/saban-capacity \
    --broker-deployment-id <existing-yard-broker-deployment> \
    [--user user] [--cadence 2min] [--max-intents 16]

Installs the Yard-owned bridge that:
  - refreshes Saban's sanitized NodeSeed inventory from Yard;
  - drains frozen Saban NodeSeed execution intents through short-lived Yard grants;
  - never writes allocator/control tokens into Saban state.

It does NOT deploy a broker, authorize a remote device, or permit paid capacity.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-root) REPO_ROOT="${2:-}"; shift 2 ;;
    --yard-state-dir) YARD_STATE_DIR="${2:-}"; shift 2 ;;
    --saban-state-dir) SABAN_STATE_DIR="${2:-}"; shift 2 ;;
    --broker-deployment-id) BROKER_DEPLOYMENT_ID="${2:-}"; shift 2 ;;
    --user) RUN_USER="${2:-}"; shift 2 ;;
    --cadence) CADENCE="${2:-}"; shift 2 ;;
    --max-intents) MAX_INTENTS="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ "${EUID}" -eq 0 ]] || { echo "ERROR: run with sudo." >&2; exit 2; }
[[ -n "$REPO_ROOT" && -f "$REPO_ROOT/systemia/yard/saban-intent-drain-runner.mjs" ]] || {
  echo "ERROR: --repo-root must point to Forge Operator." >&2; exit 2;
}
[[ -n "$YARD_STATE_DIR" && -d "$YARD_STATE_DIR" ]] || {
  echo "ERROR: --yard-state-dir must already exist." >&2; exit 2;
}
[[ -n "$SABAN_STATE_DIR" ]] || { echo "ERROR: --saban-state-dir is required." >&2; exit 2; }
[[ -n "$BROKER_DEPLOYMENT_ID" ]] || { echo "ERROR: --broker-deployment-id is required." >&2; exit 2; }
[[ "$BROKER_DEPLOYMENT_ID" =~ ^[a-zA-Z0-9._-]{3,160}$ ]] || {
  echo "ERROR: broker deployment id contains unsupported characters." >&2; exit 2;
}
[[ "$CADENCE" =~ ^[1-9][0-9]*(s|min|h)$ ]] || {
  echo "ERROR: cadence must look like 30s, 2min, or 1h." >&2; exit 2;
}
[[ "$MAX_INTENTS" =~ ^[1-9][0-9]*$ ]] || { echo "ERROR: --max-intents must be positive." >&2; exit 2; }

REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"
YARD_STATE_DIR="$(cd "$YARD_STATE_DIR" && pwd)"
mkdir -p "$SABAN_STATE_DIR"
SABAN_STATE_DIR="$(cd "$SABAN_STATE_DIR" && pwd)"
NODE_BIN="$(command -v node || true)"
[[ -n "$NODE_BIN" ]] || { echo "ERROR: node is required." >&2; exit 2; }

if [[ -z "$RUN_USER" ]]; then
  RUN_USER="$(stat -c '%U' "$YARD_STATE_DIR")"
fi
id "$RUN_USER" >/dev/null 2>&1 || { echo "ERROR: --user is not a local account." >&2; exit 2; }
RUN_GROUP="$(id -gn "$RUN_USER")"

BROKER_RECORD="$YARD_STATE_DIR/$BROKER_DEPLOYMENT_ID.json"
[[ -s "$BROKER_RECORD" ]] || {
  echo "ERROR: configured broker deployment does not exist in Yard state: $BROKER_RECORD" >&2
  exit 3
}
node - "$BROKER_RECORD" <<'NODE'
const fs=require('fs');
const row=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const ok=
  row?.deployment_id &&
  row?.state==='ready' &&
  row?.receipt?.workload_class==='systemia.remote-capacity-broker.v1';
if(!ok){
  console.error('ERROR: Yard deployment is not a ready remote capacity broker.');
  process.exit(4);
}
NODE

install -d -o "$RUN_USER" -g "$RUN_GROUP" -m 0750 "$SABAN_STATE_DIR"
install -d -m 0755 /etc/evercraft

ENV_FILE=/etc/evercraft/yard-saban-intent-drain.env
cat > "$ENV_FILE" <<EOF
EVERCRAFT_YARD_STATE_DIR=$YARD_STATE_DIR
SABAN_AMBIENT_STATE_DIR=$SABAN_STATE_DIR
EVERCRAFT_REMOTE_BROKER_DEPLOYMENT_ID=$BROKER_DEPLOYMENT_ID
EOF
chmod 0644 "$ENV_FILE"

cat >/etc/systemd/system/evercraft-yard-saban-intent-drain.service <<EOF
[Unit]
Description=Evercraft Yard drain of Saban NodeSeed intents
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=$RUN_USER
Group=$RUN_GROUP
WorkingDirectory=$REPO_ROOT
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN $REPO_ROOT/systemia/yard/saban-intent-drain-runner.mjs --max-intents $MAX_INTENTS
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
RestrictRealtime=true
ReadWritePaths=$YARD_STATE_DIR $SABAN_STATE_DIR
TimeoutStartSec=120s
EOF

cat >/etc/systemd/system/evercraft-yard-saban-intent-drain.timer <<EOF
[Unit]
Description=Continuously bridge Yard remote capacity and Saban execution

[Timer]
OnBootSec=90s
OnUnitActiveSec=$CADENCE
Persistent=true
Unit=evercraft-yard-saban-intent-drain.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now evercraft-yard-saban-intent-drain.timer
systemctl start evercraft-yard-saban-intent-drain.service || true

echo "Yard/Saban NodeSeed intent drainer installed."
echo "Broker deployment: $BROKER_DEPLOYMENT_ID"
echo "Safe Saban inventory: $SABAN_STATE_DIR/nodeseed-capacity-inventory.json"
echo "Drain receipt: $SABAN_STATE_DIR/yard-saban-intent-drain.json"
echo "Authority material persisted into Saban state: false"
