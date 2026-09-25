#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root (sudo)." >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INSTALL_ROOT="${EVERCRAFT_INSTALL_ROOT:-/opt/evercraft/forge-operator}"
STATE_ROOT="${EVERCRAFT_NODESEED_ROOT:-/var/lib/evercraft/nodeseed}"
ENV_DIR="/etc/evercraft"
ENV_FILE="${ENV_DIR}/nodeseed.env"
UNIT_FILE="/etc/systemd/system/evercraft-nodeseed.service"
NODE_BIN="$(command -v node || true)"

if [[ -z "${NODE_BIN}" ]]; then
  echo "Node.js is required." >&2
  exit 3
fi

NODE_MAJOR="$("${NODE_BIN}" -p "Number(process.versions.node.split('.')[0])")"
if [[ "${NODE_MAJOR}" -lt 22 ]]; then
  echo "Node.js 22+ is required." >&2
  exit 3
fi

PREFLIGHT_TMP="$(mktemp)"
if ! "${NODE_BIN}" "${SOURCE_ROOT}/systemia/compute/field-preflight.mjs" --root "${STATE_ROOT}" > "${PREFLIGHT_TMP}"; then
  cat "${PREFLIGHT_TMP}" >&2
  rm -f "${PREFLIGHT_TMP}"
  exit 4
fi

if ! id evercraft >/dev/null 2>&1; then
  useradd --system --home "${STATE_ROOT}" --shell /usr/sbin/nologin evercraft
fi

mkdir -p "${INSTALL_ROOT}" "${STATE_ROOT}" "${ENV_DIR}"
chmod 0750 "${STATE_ROOT}" "${ENV_DIR}"
chown -R evercraft:evercraft "${STATE_ROOT}"

rm -rf "${INSTALL_ROOT:?}/"*
cp -a "${SOURCE_ROOT}/." "${INSTALL_ROOT}/"

ALLOCATOR_TOKEN="${EVERCRAFT_ALLOCATOR_TOKEN:-}"
if [[ -z "${ALLOCATOR_TOKEN}" ]]; then
  ALLOCATOR_TOKEN="$("${NODE_BIN}" -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
fi

ADVERTISE_HOST="${EVERCRAFT_ADVERTISE_HOST:-}"
if [[ -z "${ADVERTISE_HOST}" ]]; then
  ADVERTISE_HOST="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi
if [[ -z "${ADVERTISE_HOST}" ]]; then
  echo "Could not determine LAN address. Set EVERCRAFT_ADVERTISE_HOST." >&2
  exit 5
fi

NODE_ID="${EVERCRAFT_NODE_ID:-evercraft-$(hostname -s)}"

umask 077
cat > "${ENV_FILE}" <<EOF
EVERCRAFT_ALLOCATOR_TOKEN=${ALLOCATOR_TOKEN}
EVERCRAFT_ADVERTISE_HOST=${ADVERTISE_HOST}
EVERCRAFT_NODE_ID=${NODE_ID}
EOF
chmod 0600 "${ENV_FILE}"

cat > "${UNIT_FILE}" <<EOF
[Unit]
Description=Evercraft NodeSeed
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=evercraft
Group=evercraft
EnvironmentFile=${ENV_FILE}
WorkingDirectory=${INSTALL_ROOT}
ExecStart=${NODE_BIN} ${INSTALL_ROOT}/systemia/compute/node-seed.mjs --root ${STATE_ROOT} --node-id ${NODE_ID} --host 0.0.0.0 --advertise-host ${ADVERTISE_HOST}
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${STATE_ROOT}
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
EOF

INSTALL_BOOT_HASH=""
if [[ -r /proc/sys/kernel/random/boot_id ]]; then
  INSTALL_BOOT_HASH="$("${NODE_BIN}" -e "const fs=require('fs'),c=require('crypto');const v=fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();process.stdout.write('sha256:'+c.createHash('sha256').update(v).digest('hex'))")"
fi

cp "${PREFLIGHT_TMP}" "${STATE_ROOT}/node001-preflight.json"
rm -f "${PREFLIGHT_TMP}"
chown evercraft:evercraft "${STATE_ROOT}/node001-preflight.json"
chmod 0600 "${STATE_ROOT}/node001-preflight.json"

cat > "${STATE_ROOT}/install-receipt.json" <<EOF
{
  "schema": "evercraft.node001.install-receipt.v1",
  "node_id": "${NODE_ID}",
  "install_boot_id_hash": "${INSTALL_BOOT_HASH}",
  "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "service": "evercraft-nodeseed.service",
  "state_root": "${STATE_ROOT}"
}
EOF
chown evercraft:evercraft "${STATE_ROOT}/install-receipt.json"
chmod 0600 "${STATE_ROOT}/install-receipt.json"

systemctl daemon-reload
systemctl enable --now evercraft-nodeseed.service
sleep 2
systemctl is-active --quiet evercraft-nodeseed.service

echo "Evercraft NodeSeed installed and active."
echo "Device identity and allocator secret remain on this machine."
echo "Reboot once, then run field-certify.mjs to prove reboot persistence."
