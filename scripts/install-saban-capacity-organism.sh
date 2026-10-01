#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=""
RUN_USER=""
CADENCE="2min"
STATE_DIR="/var/lib/evercraft/saban-capacity"

usage(){
  cat <<'EOF'
Usage:
  sudo scripts/install-saban-capacity-organism.sh \
    --repo-root /home/user/forge-operator \
    [--user user] \
    [--cadence 2min] \
    [--state-dir /var/lib/evercraft/saban-capacity]

Installs Saban's zero-spend ambient capacity organism.

The resident cycle may:
  - passively observe local LAN/mDNS/Bluetooth-visible device hints;
  - hash raw hardware/network identifiers before persistence;
  - expire stale or revoked authorized devices;
  - compile active MicroSeed manifests into bounded capabilities;
  - plan zero-cost capability and workload placement;
  - write local receipts describing missing capacity.

It does NOT:
  - authorize observed devices;
  - log into discovered devices;
  - run arbitrary code on MicroSeed devices;
  - create commercial market orders or paid leases.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-root) REPO_ROOT="${2:-}"; shift 2 ;;
    --user) RUN_USER="${2:-}"; shift 2 ;;
    --cadence) CADENCE="${2:-}"; shift 2 ;;
    --state-dir) STATE_DIR="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: run this installer as root (normally with sudo)" >&2
  exit 2
fi
if [[ -z "$REPO_ROOT" || ! -f "$REPO_ROOT/systemia/saban/capacity-organism.mjs" ]]; then
  echo "ERROR: --repo-root must point to Forge Operator with capacity-organism.mjs" >&2
  exit 2
fi
if [[ -z "$RUN_USER" ]]; then
  RUN_USER="$(stat -c '%U' "$REPO_ROOT")"
fi
if ! id "$RUN_USER" >/dev/null 2>&1; then
  echo "ERROR: --user is not a local account" >&2
  exit 2
fi
if [[ ! "$CADENCE" =~ ^[1-9][0-9]*(s|min|h)$ ]]; then
  echo "ERROR: cadence must look like 30s, 2min, or 1h" >&2
  exit 2
fi

REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"
STATE_DIR="$(mkdir -p "$STATE_DIR" && cd "$STATE_DIR" && pwd)"
NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "ERROR: node is required" >&2
  exit 2
fi

RUN_GROUP="$(id -gn "$RUN_USER")"
chown "$RUN_USER:$RUN_GROUP" "$STATE_DIR"
chmod 0750 "$STATE_DIR"
install -d -o "$RUN_USER" -g "$RUN_GROUP" -m 0700 "$STATE_DIR/.secrets"
install -d -o "$RUN_USER" -g "$RUN_GROUP" -m 0700 "$STATE_DIR/.secrets/device-tokens"

GATEWAY_TOKEN_FILE="$STATE_DIR/.secrets/microseed-gateway-token"
if [[ ! -s "$GATEWAY_TOKEN_FILE" ]]; then
  umask 077
  "$NODE_BIN" -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex')+'\\n')" > "$GATEWAY_TOKEN_FILE"
  chown "$RUN_USER:$RUN_GROUP" "$GATEWAY_TOKEN_FILE"
  chmod 0600 "$GATEWAY_TOKEN_FILE"
fi

WORK_API_TOKEN_FILE="$STATE_DIR/.secrets/ambient-work-api-token"
if [[ ! -s "$WORK_API_TOKEN_FILE" ]]; then
  umask 077
  "$NODE_BIN" -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex')+'\\n')" > "$WORK_API_TOKEN_FILE"
  chown "$RUN_USER:$RUN_GROUP" "$WORK_API_TOKEN_FILE"
  chmod 0600 "$WORK_API_TOKEN_FILE"
fi

cat >/etc/systemd/system/evercraft-saban-capacity.service <<EOF
[Unit]
Description=Evercraft Saban zero-spend ambient capacity organism
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=$RUN_USER
Group=$RUN_GROUP
WorkingDirectory=$REPO_ROOT
Environment=SABAN_AMBIENT_STATE_DIR=$STATE_DIR
Environment=SABAN_ALLOW_COMMERCIAL_CAPACITY=0
ExecStart=$NODE_BIN $REPO_ROOT/systemia/saban/capacity-organism.mjs --once --root $STATE_DIR
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
ReadWritePaths=$STATE_DIR
TimeoutStartSec=40s
EOF

cat >/etc/systemd/system/evercraft-saban-capacity.timer <<EOF
[Unit]
Description=Refresh Evercraft Saban ambient capacity fabric

[Timer]
OnBootSec=35s
OnUnitActiveSec=$CADENCE
Persistent=true
Unit=evercraft-saban-capacity.service

[Install]
WantedBy=timers.target
EOF

cat >/etc/systemd/system/evercraft-saban-microseed-gateway.service <<EOF
[Unit]
Description=Evercraft Saban bounded MicroSeed execution gateway
After=network-online.target evercraft-saban-capacity.service
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
Group=$RUN_GROUP
WorkingDirectory=$REPO_ROOT
Environment=SABAN_AMBIENT_STATE_DIR=$STATE_DIR
Environment=SABAN_ALLOW_COMMERCIAL_CAPACITY=0
Environment=SABAN_MICROSEED_ALLOW_INSECURE_LAN=0
ExecStart=$NODE_BIN $REPO_ROOT/systemia/saban/microseed-gateway-runner.mjs --root $STATE_DIR --host 127.0.0.1 --port 8791 --gateway-token-file $GATEWAY_TOKEN_FILE
Restart=always
RestartSec=5s
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
ReadWritePaths=$STATE_DIR
TimeoutStartSec=20s

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/systemd/system/evercraft-saban-work-api.service <<EOF
[Unit]
Description=Evercraft Saban loopback product work intake API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
Group=$RUN_GROUP
WorkingDirectory=$REPO_ROOT
Environment=SABAN_AMBIENT_STATE_DIR=$STATE_DIR
Environment=SABAN_ALLOW_COMMERCIAL_CAPACITY=0
ExecStart=$NODE_BIN $REPO_ROOT/systemia/saban/ambient-work-api-runner.mjs --root $STATE_DIR --host 127.0.0.1 --port 8793 --token-file $WORK_API_TOKEN_FILE
Restart=always
RestartSec=5s
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
ReadWritePaths=$STATE_DIR
TimeoutStartSec=20s

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/systemd/system/evercraft-saban-probation.service <<EOF
[Unit]
Description=Evercraft Saban MicroSeed probation and calibration organism
After=network-online.target evercraft-saban-microseed-gateway.service evercraft-saban-capacity.service
Requires=evercraft-saban-microseed-gateway.service

[Service]
Type=oneshot
User=$RUN_USER
Group=$RUN_GROUP
WorkingDirectory=$REPO_ROOT
Environment=SABAN_AMBIENT_STATE_DIR=$STATE_DIR
Environment=SABAN_ALLOW_COMMERCIAL_CAPACITY=0
ExecStart=$NODE_BIN $REPO_ROOT/systemia/saban/microseed-probation-organism.mjs --root $STATE_DIR --gateway-url http://127.0.0.1:8791 --gateway-token-file $GATEWAY_TOKEN_FILE
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
ReadWritePaths=$STATE_DIR
TimeoutStartSec=90s
EOF

cat >/etc/systemd/system/evercraft-saban-probation.timer <<EOF
[Unit]
Description=Continuously conform and calibrate authorized MicroSeed devices

[Timer]
OnBootSec=55s
OnUnitActiveSec=$CADENCE
Persistent=true
Unit=evercraft-saban-probation.service

[Install]
WantedBy=timers.target
EOF

cat >/etc/systemd/system/evercraft-saban-dispatch.service <<EOF
[Unit]
Description=Evercraft Saban zero-spend ambient job dispatcher
After=network-online.target evercraft-saban-capacity.service evercraft-saban-probation.service evercraft-saban-microseed-gateway.service
Requires=evercraft-saban-microseed-gateway.service

[Service]
Type=oneshot
User=$RUN_USER
Group=$RUN_GROUP
WorkingDirectory=$REPO_ROOT
Environment=SABAN_AMBIENT_STATE_DIR=$STATE_DIR
Environment=SABAN_ALLOW_COMMERCIAL_CAPACITY=0
ExecStart=$NODE_BIN $REPO_ROOT/systemia/saban/ambient-job-dispatcher.mjs --root $STATE_DIR --gateway-url http://127.0.0.1:8791 --gateway-token-file $GATEWAY_TOKEN_FILE --max-jobs 16
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
ReadWritePaths=$STATE_DIR
TimeoutStartSec=120s
EOF

cat >/etc/systemd/system/evercraft-saban-dispatch.timer <<EOF
[Unit]
Description=Drain bounded Evercraft product work through Saban ambient fabric

[Timer]
OnBootSec=75s
OnUnitActiveSec=$CADENCE
Persistent=true
Unit=evercraft-saban-dispatch.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now evercraft-saban-capacity.timer
systemctl enable --now evercraft-saban-microseed-gateway.service
systemctl enable --now evercraft-saban-work-api.service
systemctl enable --now evercraft-saban-probation.timer
systemctl enable --now evercraft-saban-dispatch.timer
systemctl start evercraft-saban-capacity.service
systemctl start evercraft-saban-probation.service || true

echo "Saban capacity organism installed."
systemctl --no-pager --full status evercraft-saban-capacity.timer | sed -n '1,12p'
echo
echo "State: $STATE_DIR/capacity-organism-state.json"
echo "Registry: $STATE_DIR/registry"
echo "MicroSeed gateway: http://127.0.0.1:8791"
echo "Product work API: http://127.0.0.1:8793"
echo "Probation timer: evercraft-saban-probation.timer"
echo "Dispatch timer: evercraft-saban-dispatch.timer"
echo "Gateway token file: $GATEWAY_TOKEN_FILE"
echo "Work API token file: $WORK_API_TOKEN_FILE"
echo "Device token directory: $STATE_DIR/.secrets/device-tokens"
