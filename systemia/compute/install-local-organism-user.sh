#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INSTALL_ROOT="${EVERCRAFT_USER_INSTALL_ROOT:-$HOME/.local/share/evercraft/forge-operator}"
STATE_ROOT="${EVERCRAFT_LOCAL_ORGANISM_ROOT:-$HOME/.local/state/evercraft/organism}"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT_FILE="$UNIT_DIR/evercraft-local-organism.service"
NODE_BIN="$(command -v node || true)"

if [[ -z "${NODE_BIN}" ]]; then
  echo "Node.js is required." >&2
  exit 2
fi

NODE_MAJOR="$("${NODE_BIN}" -p "Number(process.versions.node.split('.')[0])")"
if [[ "${NODE_MAJOR}" -lt 22 ]]; then
  echo "Node.js 22+ is required." >&2
  exit 2
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemd user services are required for persistent user-mode operation." >&2
  exit 3
fi

mkdir -p "${INSTALL_ROOT}" "${STATE_ROOT}" "${UNIT_DIR}"
chmod 0700 "${STATE_ROOT}"

rm -rf "${INSTALL_ROOT:?}/"*
cp -a "${SOURCE_ROOT}/." "${INSTALL_ROOT}/"

cat > "${UNIT_FILE}" <<EOF
[Unit]
Description=Evercraft local organism
After=default.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_ROOT}
ExecStart=${NODE_BIN} ${INSTALL_ROOT}/systemia/compute/local-organism.mjs --root ${STATE_ROOT}
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now evercraft-local-organism.service
sleep 2

if ! systemctl --user is-active --quiet evercraft-local-organism.service; then
  systemctl --user status evercraft-local-organism.service --no-pager || true
  exit 4
fi

echo "Evercraft local organism installed and active."
echo "Runtime: NodeSeed -> Evercraft Compute -> Yard -> KAIDANCE -> Systemia Core"
echo "Network: loopback-only; no public ingress created."
echo "State: ${STATE_ROOT}"
echo "This user-mode Chromebook/Crostini runtime is authorized compute, not Node 001 physical field certification."
