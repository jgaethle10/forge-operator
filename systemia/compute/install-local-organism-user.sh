#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INSTALL_ROOT="${EVERCRAFT_USER_INSTALL_ROOT:-$HOME/.local/share/evercraft/forge-operator}"
STATE_ROOT="${EVERCRAFT_LOCAL_ORGANISM_ROOT:-$HOME/.local/state/evercraft/organism}"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT_FILE="$UNIT_DIR/evercraft-local-organism.service"
HEALTH_UNIT_FILE="$UNIT_DIR/evercraft-local-organism-health.service"
HEALTH_TIMER_FILE="$UNIT_DIR/evercraft-local-organism-health.timer"
ENV_DIR="$HOME/.config/evercraft"
ENV_FILE="$ENV_DIR/local-organism.env"
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

mkdir -p "${INSTALL_ROOT}" "${STATE_ROOT}" "${UNIT_DIR}" "${ENV_DIR}"
chmod 0700 "${STATE_ROOT}" "${ENV_DIR}"

if [[ ! -f "${ENV_FILE}" ]]; then
  : > "${ENV_FILE}"
  chmod 0600 "${ENV_FILE}"
fi

set_env_value() {
  local key="$1"
  local value="$2"
  local tmp="${ENV_FILE}.tmp"
  grep -v "^${key}=" "${ENV_FILE}" > "${tmp}" || true
  printf '%s=%s\n' "${key}" "${value}" >> "${tmp}"
  mv "${tmp}" "${ENV_FILE}"
  chmod 0600 "${ENV_FILE}"
}

if [[ -n "${EVERCRAFT_REMOTE_BROKER_URL:-}" ]]; then
  set_env_value "EVERCRAFT_REMOTE_BROKER_URL" "${EVERCRAFT_REMOTE_BROKER_URL}"
fi
set_env_value "EVERCRAFT_REMOTE_BROKER_AUTO_DISCOVERY" "${EVERCRAFT_REMOTE_BROKER_AUTO_DISCOVERY:-true}"
set_env_value "EVERCRAFT_REMOTE_BROKER_FALLBACK_URLS" "${EVERCRAFT_REMOTE_BROKER_FALLBACK_URLS:-https://fabric.systemiacommandcenters.com:9443}"

if [[ -n "${EVERCRAFT_REMOTE_OPERATOR_ENABLED:-}" ]]; then
  case "${EVERCRAFT_REMOTE_OPERATOR_ENABLED,,}" in
    true|false) set_env_value "EVERCRAFT_REMOTE_OPERATOR_ENABLED" "${EVERCRAFT_REMOTE_OPERATOR_ENABLED,,}" ;;
    *) echo "EVERCRAFT_REMOTE_OPERATOR_ENABLED must be true or false." >&2; exit 2 ;;
  esac
fi

rm -rf "${INSTALL_ROOT:?}/"*
cp -a "${SOURCE_ROOT}/." "${INSTALL_ROOT}/"

cat > "${UNIT_FILE}" <<EOF
[Unit]
Description=Evercraft local organism
After=default.target
StartLimitIntervalSec=0

[Service]
Type=simple
WorkingDirectory=${INSTALL_ROOT}
EnvironmentFile=-${ENV_FILE}
ExecStart=${NODE_BIN} ${INSTALL_ROOT}/systemia/compute/local-organism.mjs --root ${STATE_ROOT}
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=default.target
EOF

cat > "${HEALTH_UNIT_FILE}" <<EOF
[Unit]
Description=Evercraft local organism health watch
After=evercraft-local-organism.service

[Service]
Type=oneshot
WorkingDirectory=${INSTALL_ROOT}
EnvironmentFile=-${ENV_FILE}
ExecStart=${NODE_BIN} ${INSTALL_ROOT}/systemia/compute/local-organism-health-watch.mjs --root ${STATE_ROOT}
NoNewPrivileges=true
PrivateTmp=true
TimeoutStartSec=30s
EOF

cat > "${HEALTH_TIMER_FILE}" <<'EOF'
[Unit]
Description=Watch and recover Evercraft local organism

[Timer]
OnBootSec=30s
OnUnitActiveSec=60s
Persistent=true
Unit=evercraft-local-organism-health.service

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now evercraft-local-organism.service
systemctl --user enable --now evercraft-local-organism-health.timer
sleep 2

if ! systemctl --user is-active --quiet evercraft-local-organism.service; then
  systemctl --user status evercraft-local-organism.service --no-pager || true
  exit 4
fi
if ! systemctl --user is-active --quiet evercraft-local-organism-health.timer; then
  systemctl --user status evercraft-local-organism-health.timer --no-pager || true
  exit 5
fi

"${NODE_BIN}" "${INSTALL_ROOT}/systemia/compute/local-organism-health-watch.mjs" \
  --root "${STATE_ROOT}" --observe-only >/dev/null
if [[ ! -s "${STATE_ROOT}/health-watch.json" ]]; then
  echo "Evercraft health watch did not produce its initial receipt." >&2
  exit 6
fi

echo "Evercraft local organism installed and active."
echo "Runtime: NodeSeed -> Evercraft Compute -> Yard -> KAIDANCE -> Systemia Core"
echo "Network: loopback-only; no public ingress created."
echo "Health watch: every 60s with bounded user-service restart and receipt."
if grep -q '^EVERCRAFT_REMOTE_BROKER_URL=.' "${ENV_FILE}"; then
  echo "Remote admission: explicit broker configured."
else
  echo "Remote admission: Saban gateway auto-discovery enabled with stable HTTPS fallback."
fi
if grep -q '^EVERCRAFT_REMOTE_OPERATOR_ENABLED=true$' "${ENV_FILE}"; then
  echo "Remote Operator: enabled; outbound control grant required."
else
  echo "Remote Operator: disabled."
fi
echo "State: ${STATE_ROOT}"
echo "This user-mode Chromebook/Crostini runtime is authorized compute, not Node 001 physical field certification."
