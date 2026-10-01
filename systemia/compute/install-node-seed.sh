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
REMOTE_UNIT_FILE="/etc/systemd/system/evercraft-remote-admission.service"
NODE_BIN="$(command -v node || true)"
NODE_ROLE="${EVERCRAFT_NODE_ROLE:-public_edge}"
if [[ "${NODE_ROLE}" != "public_edge" && "${NODE_ROLE}" != "private_worker" && "${NODE_ROLE}" != "virtual_worker" && "${NODE_ROLE}" != "operator_authorized_public_edge" ]]; then
  echo "EVERCRAFT_NODE_ROLE must be public_edge, private_worker, virtual_worker, or operator_authorized_public_edge." >&2
  exit 3
fi

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
if ! "${NODE_BIN}" "${SOURCE_ROOT}/systemia/compute/field-preflight.mjs" --root "${STATE_ROOT}" --role "${NODE_ROLE}" > "${PREFLIGHT_TMP}"; then
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
mkdir -p "${INSTALL_ROOT}"

# NodeSeed has grown into the Evercraft Compute substrate and runtime-node.mjs
# intentionally composes multiple Systemia resident workloads. Copy the reviewed
# Systemia code tree as one immutable field bundle so a newly installed node
# cannot advertise workload classes whose modules were omitted by the installer.
cp -a "${SOURCE_ROOT}/systemia" "${INSTALL_ROOT}/systemia"
mkdir -p "${INSTALL_ROOT}/infra"
cp -a "${SOURCE_ROOT}/infra/evercraft-edge" "${INSTALL_ROOT}/infra/evercraft-edge"
find "${INSTALL_ROOT}/systemia" "${INSTALL_ROOT}/infra/evercraft-edge" -type d -exec chmod 0755 {} +
find "${INSTALL_ROOT}/systemia" "${INSTALL_ROOT}/infra/evercraft-edge" -type f -exec chmod 0644 {} +

ALLOCATOR_TOKEN="${EVERCRAFT_ALLOCATOR_TOKEN:-}"
if [[ -z "${ALLOCATOR_TOKEN}" ]]; then
  ALLOCATOR_TOKEN="$("${NODE_BIN}" -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
fi

BIND_HOST="${EVERCRAFT_BIND_HOST:-}"
ADVERTISE_HOST="${EVERCRAFT_ADVERTISE_HOST:-}"
if [[ "${NODE_ROLE}" == "private_worker" || "${NODE_ROLE}" == "virtual_worker" ]]; then
  BIND_HOST="${BIND_HOST:-127.0.0.1}"
  ADVERTISE_HOST="${ADVERTISE_HOST:-127.0.0.1}"
else
  BIND_HOST="${BIND_HOST:-0.0.0.0}"
  if [[ -z "${ADVERTISE_HOST}" ]]; then
    ADVERTISE_HOST="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  if [[ -z "${ADVERTISE_HOST}" ]]; then
    echo "Could not determine LAN address. Set EVERCRAFT_ADVERTISE_HOST." >&2
    exit 5
  fi
fi

NODE_ID="${EVERCRAFT_NODE_ID:-evercraft-$(hostname -s)}"
DEFAULT_NODE_LABELS=""
if [[ "${NODE_ROLE}" == "operator_authorized_public_edge" ]]; then
  DEFAULT_NODE_LABELS="operator-authorized,public-edge-candidate,gateway,evercraft-edge-dns,chromebook"
fi
NODE_LABELS="${EVERCRAFT_NODE_LABELS:-${DEFAULT_NODE_LABELS}}"

umask 077
cat > "${ENV_FILE}" <<EOF
EVERCRAFT_ALLOCATOR_TOKEN=${ALLOCATOR_TOKEN}
EVERCRAFT_BIND_HOST=${BIND_HOST}
EVERCRAFT_ADVERTISE_HOST=${ADVERTISE_HOST}
EVERCRAFT_NODE_ID=${NODE_ID}
EVERCRAFT_NODE_LABELS=${NODE_LABELS}
EVERCRAFT_NODE_ROLE=${NODE_ROLE}
EOF

if [[ -n "${EVERCRAFT_REMOTE_BROKER_URL:-}" ]]; then
  printf 'EVERCRAFT_REMOTE_BROKER_URL=%s\n' "${EVERCRAFT_REMOTE_BROKER_URL}" >> "${ENV_FILE}"
fi

# Public-edge configuration is opt-in. If the host is already provisioned with
# a wildcard domain and local certificate paths, persist only those references.
# Certificate/key bytes remain on the node and are never printed or copied into
# receipts.
if [[ -n "${EVERCRAFT_PUBLIC_EDGE_BASE_DOMAIN:-}" ]]; then
  printf 'EVERCRAFT_PUBLIC_EDGE_BASE_DOMAIN=%s\n' "${EVERCRAFT_PUBLIC_EDGE_BASE_DOMAIN}" >> "${ENV_FILE}"
fi
if [[ -n "${EVERCRAFT_PUBLIC_EDGE_TLS_KEY_PATH:-}" ]]; then
  printf 'EVERCRAFT_PUBLIC_EDGE_TLS_KEY_PATH=%s\n' "${EVERCRAFT_PUBLIC_EDGE_TLS_KEY_PATH}" >> "${ENV_FILE}"
fi
if [[ -n "${EVERCRAFT_PUBLIC_EDGE_TLS_CERT_PATH:-}" ]]; then
  printf 'EVERCRAFT_PUBLIC_EDGE_TLS_CERT_PATH=%s\n' "${EVERCRAFT_PUBLIC_EDGE_TLS_CERT_PATH}" >> "${ENV_FILE}"
fi
if [[ -n "${EVERCRAFT_PUBLIC_EDGE_PORT:-}" ]]; then
  printf 'EVERCRAFT_PUBLIC_EDGE_PORT=%s\n' "${EVERCRAFT_PUBLIC_EDGE_PORT}" >> "${ENV_FILE}"
fi
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
ExecStart=${NODE_BIN} ${INSTALL_ROOT}/systemia/compute/node-seed.mjs --root ${STATE_ROOT} --node-id ${NODE_ID} --host ${BIND_HOST} --advertise-host ${ADVERTISE_HOST}
Restart=always
RestartSec=3
NoNewPrivileges=true
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
AmbientCapabilities=CAP_NET_BIND_SERVICE
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${STATE_ROOT}
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
EOF

cat > "${REMOTE_UNIT_FILE}" <<EOF
[Unit]
Description=Evercraft outbound remote admission
After=network-online.target evercraft-nodeseed.service
Wants=network-online.target
Requires=evercraft-nodeseed.service

[Service]
Type=simple
User=evercraft
Group=evercraft
EnvironmentFile=${ENV_FILE}
WorkingDirectory=${INSTALL_ROOT}
ExecCondition=/bin/sh -c '/bin/grep -q "^EVERCRAFT_REMOTE_BROKER_URL=." "${ENV_FILE}"'
ExecStart=${NODE_BIN} ${INSTALL_ROOT}/systemia/compute/remote-admission-service.mjs --root ${STATE_ROOT} --env-file ${ENV_FILE}
Restart=always
RestartSec=5
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
  "node_role": "${NODE_ROLE}",
  "install_boot_id_hash": "${INSTALL_BOOT_HASH}",
  "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "service": "evercraft-nodeseed.service",
  "remote_admission_service": "evercraft-remote-admission.service",
  "bind_host": "${BIND_HOST}",
  "advertise_host": "${ADVERTISE_HOST}",
  "outbound_only": $( [[ "${NODE_ROLE}" == "private_worker" || "${NODE_ROLE}" == "virtual_worker" ]] && echo true || echo false ),
  "state_root": "${STATE_ROOT}"
}
EOF
chown evercraft:evercraft "${STATE_ROOT}/install-receipt.json"
chmod 0600 "${STATE_ROOT}/install-receipt.json"

systemctl daemon-reload
systemctl enable --now evercraft-nodeseed.service
systemctl enable evercraft-remote-admission.service
if grep -q '^EVERCRAFT_REMOTE_BROKER_URL=.' "${ENV_FILE}"; then
  systemctl restart evercraft-remote-admission.service
fi
sleep 2
if ! systemctl is-active --quiet evercraft-nodeseed.service; then
  echo "ERROR: evercraft-nodeseed.service failed to stay active." >&2
  systemctl --no-pager --full status evercraft-nodeseed.service >&2 || true
  journalctl -u evercraft-nodeseed.service -n 80 --no-pager >&2 || true
  echo "[foreground import diagnostic]" >&2
  runuser -u evercraft -- env \
    EVERCRAFT_ALLOCATOR_TOKEN="$ALLOCATOR_TOKEN" \
    EVERCRAFT_BIND_HOST="$BIND_HOST" \
    EVERCRAFT_ADVERTISE_HOST="$ADVERTISE_HOST" \
    EVERCRAFT_NODE_ID="$NODE_ID" \
    EVERCRAFT_NODE_LABELS="$NODE_LABELS" \
    "$NODE_BIN" -e "import('${INSTALL_ROOT}/systemia/compute/node-seed.mjs').then(()=>console.error('node-seed module import ok')).catch(e=>{console.error(e?.stack||e);process.exit(1)})" >&2 || true
  exit 6
fi

echo "Evercraft NodeSeed installed and active."
if [[ "${NODE_ROLE}" == "private_worker" || "${NODE_ROLE}" == "virtual_worker" ]]; then
  echo "Ingress: loopback-only. No LAN/public NodeSeed listener created."
fi
if grep -q '^EVERCRAFT_REMOTE_BROKER_URL=.' "${ENV_FILE}"; then
  echo "Outbound admission: persistent service enabled."
else
  echo "Outbound admission: unit installed and waiting for EVERCRAFT_REMOTE_BROKER_URL."
fi
echo "Device identity and allocator secret remain on this machine."
if [[ "${NODE_ROLE}" == "operator_authorized_public_edge" ]]; then
  echo "Operator-authorized edge installed as a candidate. public-ingress is not claimed until an external ingress canary passes."
else
  echo "Reboot once, capture field-offline-check.mjs while isolated, then run field-certify.mjs."
fi
