#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ERROR: this installer is for macOS only." >&2
  exit 2
fi
if [[ "$(uname -m)" != "arm64" ]]; then
  echo "ERROR: Evercraft Node 001 requires Apple silicon (arm64)." >&2
  exit 2
fi
if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: run with sudo so launchd system services can be installed." >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
RUN_USER="${EVERCRAFT_RUN_USER:-${SUDO_USER:-}}"
if [[ -z "${RUN_USER}" || "${RUN_USER}" == "root" ]]; then
  echo "ERROR: set EVERCRAFT_RUN_USER to the ordinary Node 001 runtime user." >&2
  exit 2
fi
if ! /usr/bin/id "${RUN_USER}" >/dev/null 2>&1; then
  echo "ERROR: runtime user does not exist: ${RUN_USER}" >&2
  exit 2
fi
RUN_GROUP="$(/usr/bin/id -gn "${RUN_USER}")"

NODE_BIN="${EVERCRAFT_NODE_BIN:-$(command -v node || true)}"
if [[ -z "${NODE_BIN}" && -x /usr/bin/sudo ]]; then
  NODE_BIN="$(/usr/bin/sudo -u "${RUN_USER}" /bin/zsh -lc 'command -v node' 2>/dev/null || true)"
fi
if [[ -z "${NODE_BIN}" || ! -x "${NODE_BIN}" ]]; then
  echo "ERROR: Node.js 22+ is required and must be reachable by the runtime user." >&2
  exit 3
fi
NODE_MAJOR="$("${NODE_BIN}" -p "Number(process.versions.node.split('.')[0])")"
if [[ "${NODE_MAJOR}" -lt 22 ]]; then
  echo "ERROR: Node.js 22+ is required." >&2
  exit 3
fi

BASE="/Library/Application Support/Evercraft"
INSTALL_ROOT="${BASE}/forge-operator"
STATE_ROOT="${BASE}/state"
NODESEED_STATE="${STATE_ROOT}/nodeseed"
SYSTEMIA_STATE="${STATE_ROOT}/systemia"
SECRETS_DIR="${STATE_ROOT}/secrets"
LOG_DIR="${STATE_ROOT}/logs"
ALLOCATOR_TOKEN_FILE="${SECRETS_DIR}/nodeseed-allocator-token"
NODESEED_RUNNER="${INSTALL_ROOT}/node001/run-nodeseed.sh"
SYSTEMIA_RUNNER="${INSTALL_ROOT}/node001/run-systemia-resident.sh"
NODESEED_PLIST="/Library/LaunchDaemons/com.evercraft.nodeseed.plist"
SYSTEMIA_PLIST="/Library/LaunchDaemons/com.evercraft.systemia-resident.plist"

PREFLIGHT="$("${NODE_BIN}" "${SOURCE_ROOT}/systemia/compute/node001-macos-preflight.mjs" --root "${BASE}")" || {
  printf '%s\n' "${PREFLIGHT}" >&2
  exit 4
}
printf '%s\n' "${PREFLIGHT}"

mkdir -p "${INSTALL_ROOT}" "${NODESEED_STATE}" "${SYSTEMIA_STATE}/inbox" "${SECRETS_DIR}" "${LOG_DIR}"
rm -rf "${INSTALL_ROOT:?}/systemia" "${INSTALL_ROOT:?}/infra" "${INSTALL_ROOT:?}/registry" "${INSTALL_ROOT:?}/node001"
cp -a "${SOURCE_ROOT}/systemia" "${INSTALL_ROOT}/systemia"
mkdir -p "${INSTALL_ROOT}/infra"
cp -a "${SOURCE_ROOT}/infra/evercraft-edge" "${INSTALL_ROOT}/infra/evercraft-edge"
cp -a "${SOURCE_ROOT}/registry" "${INSTALL_ROOT}/registry"
cp "${SOURCE_ROOT}/package.json" "${INSTALL_ROOT}/package.json"
mkdir -p "${INSTALL_ROOT}/node001"

chown -R root:wheel "${INSTALL_ROOT}"
find "${INSTALL_ROOT}" -type d -exec chmod 0755 {} +
find "${INSTALL_ROOT}" -type f -exec chmod 0644 {} +
chown -R "${RUN_USER}:${RUN_GROUP}" "${STATE_ROOT}"
chmod 0750 "${STATE_ROOT}" "${NODESEED_STATE}" "${SYSTEMIA_STATE}" "${SECRETS_DIR}" "${LOG_DIR}"

if [[ ! -s "${ALLOCATOR_TOKEN_FILE}" ]]; then
  umask 077
  "${NODE_BIN}" -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex')+'\n')" > "${ALLOCATOR_TOKEN_FILE}"
fi
chown "${RUN_USER}:${RUN_GROUP}" "${ALLOCATOR_TOKEN_FILE}"
chmod 0600 "${ALLOCATOR_TOKEN_FILE}"

cat > "${NODESEED_RUNNER}" <<EOF
#!/bin/zsh
set -euo pipefail
export EVERCRAFT_ALLOCATOR_TOKEN="\$(cat '${ALLOCATOR_TOKEN_FILE}')"
export EVERCRAFT_NODE_LABELS="node001,mac-mini,arm64,private-worker,control-plane,always-on"
export EVERCRAFT_ZERO_COST="false"
exec '${NODE_BIN}' '${INSTALL_ROOT}/systemia/compute/node-seed.mjs' \
  --root '${NODESEED_STATE}' \
  --node-id evercraft-node001 \
  --host 0.0.0.0 \
  --labels "node001,mac-mini,arm64,private-worker,control-plane,always-on"
EOF

cat > "${SYSTEMIA_RUNNER}" <<EOF
#!/bin/zsh
set -euo pipefail
exec '${NODE_BIN}' '${INSTALL_ROOT}/systemia/control-plane/resident-runner.mjs' \
  --root '${INSTALL_ROOT}' \
  --config '${INSTALL_ROOT}/systemia/control-plane/node001.config.json' \
  --state-root '${SYSTEMIA_STATE}'
EOF

chown root:wheel "${NODESEED_RUNNER}" "${SYSTEMIA_RUNNER}"
chmod 0755 "${NODESEED_RUNNNER}" "${SYSTEMIA_RUNNER}"

cat > "${NODESEED_PLIST}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.evercraft.nodeseed</string>
  <key>ProgramArguments</key>
  <array><string>${NODESEED_RUNNER}</string></array>
  <key>UserName</key><string>${RUN_USER}</string>
  <key>GroupName</key><string>${RUN_GROUP}</string>
  <key>WorkingDirectory</key><string>${INSTALL_ROOT}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>StandardOutPath</key><string>${LOG_DIR}/nodeseed.stdout.log</string>
  <key>StandardErrorPath</key><string>${LOG_DIR}/nodeseed.stderr.log</string>
</dict>
</plist>
EOF

cat > "${SYSTEMIA_PLIST}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.evercraft.systemia-resident</string>
  <key>ProgramArguments</key>
  <array><string>${SYSTEMIA_RUNNER}</string></array>
  <key>UserName</key><string>${RUN_USER}</string>
  <key>GroupName</key><string>${RUN_GROUP}</string>
  <key>WorkingDirectory</key><string>${INSTALL_ROOT}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlivive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>StandardOutPath</key><string>${LOG_DIR}/systemia.stdout.log</string>
  <key>StandardErrorPath</key><string>${LOG_DIR}/systemia.stderr.log</string>
</dict>
</plist>
EOF

chown root:wheel "${NODESEED_PLIST}" "${SYSTEMIA_PLIST}"
chmod 0644 "${NODESEED_PLIST}" "${SYSTEMIA_PLIST}"
/usr/bin/plutil -lint "${NODESEED_PLIST}" >/dev/null
/usr/bin/plutil -lint "${SYSTEMIA_PLIST}" >/dev/null

/bin/launchctl bootout system "${NODESEED_PLIST}" >/dev/null 2>&1 || true
/bin/launchctl bootout system "${SYSTEMIA_PLIST}" >/dev/null 2>&1 || true
/bin/launchctl bootstrap system "${NODESEED_PLIST}"
/bin/launchctl bootstrap system "${SYSTEMIA_PLIST}"
/bin/launchctl kickstart -k system/com.evercraft.nodeseed
/bin/launchctl kickstart -k system/com.evercraft.systemia-resident

ready=false
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if [[ -s "${NODESEED_STATE}/nodeseed-receipt.json" && -s "${SYSTEMIA_STATE}/resident-health.json" ]]; then
    ready=true
    break
  fi
  sleep 1
done

if [[ "${ready}" != "true" ]]; then
  echo "ERROR: Node 001 services did not produce health receipts." >&2
  /bin/launchctl print system/com.evercraft.nodeseed >&2 || true
  /bin/launchctl print system/com.evercraft.systemia-resident >&2 || true
  tail -80 "${LOG_DIR}/nodeseed.stderr.log" >&2 2>/dev/null || true
  tail -80 "${LOG_DIR}/systemia.stderr.log" >&2 2>/dev/null || true
  exit 6
fi

INSTALL_RECEIPT="${STATE_ROOT}/node001-install-receipt.json"
cat > "${INSTALL_RECEIPT}" <<EOF
{
  "schema": "evercraft.node001.macos-install-receipt.v1",
  "node_id": "evercraft-node001",
  "platform": "darwin",
  "architecture": "arm64",
  "node_role": "private_worker",
  "nodeseed_service": "com.evercraft.nodeseed",
  "resident_control_plane_service": "com.evercraft.systemia-resident",
  "public_ingress_authority_granted": false,
  "payment_authority_granted": false,
  "publish_authority_granted": false,
  "trust_change_authority_granted": false,
  "allocator_secret_exposed_in_receipt": false,
  "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
chown "${RUN_USER}:${RUN_GROUP}" "${INSTALL_RECEIPT}"
chmod 0600 "${INSTALL_RECEIPT}"

echo "Evercraft Node 001 installed: NodeSeed + resident Systemia are supervised by launchd."
echo "Authority boundary: private worker only. No public-edge, payment, publish, or trust-change authority granted."
