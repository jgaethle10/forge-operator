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

if [[ -n "${EVERCRAFT_LOCAL_ZERO_SPEND:-}" ]]; then
  case "${EVERCRAFT_LOCAL_ZERO_SPEND,,}" in
    true|false) set_env_value "EVERCRAFT_LOCAL_ZERO_SPEND" "${EVERCRAFT_LOCAL_ZERO_SPEND,,}" ;;
    *) echo "EVERCRAFT_LOCAL_ZERO_SPEND must be true or false." >&2; exit 2 ;;
  esac
elif ! grep -q '^EVERCRAFT_LOCAL_ZERO_SPEND=' "${ENV_FILE}"; then
  set_env_value "EVERCRAFT_LOCAL_ZERO_SPEND" "true"
fi

if [[ -n "${EVERCRAFT_NATIVE_BROWSER_BOOTSTRAP:-}" ]]; then
  case "${EVERCRAFT_NATIVE_BROWSER_BOOTSTRAP,,}" in
    true|false) set_env_value "EVERCRAFT_NATIVE_BROWSER_BOOTSTRAP" "${EVERCRAFT_NATIVE_BROWSER_BOOTSTRAP,,}" ;;
    *) echo "EVERCRAFT_NATIVE_BROWSER_BOOTSTRAP must be true or false." >&2; exit 2 ;;
  esac
elif ! grep -q '^EVERCRAFT_NATIVE_BROWSER_BOOTSTRAP=' "${ENV_FILE}"; then
  set_env_value "EVERCRAFT_NATIVE_BROWSER_BOOTSTRAP" "true"
fi

# Explicit node identity for non-Chromebook hosts such as HP NextGen WSL2.
# This value is persisted only in the private user environment file.
if [[ -n "${EVERCRAFT_LOCAL_ORGANISM_NODE_ID:-}" ]]; then
  if [[ ! "${EVERCRAFT_LOCAL_ORGANISM_NODE_ID}" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{2,79}$ ]]; then
    echo "EVERCRAFT_LOCAL_ORGANISM_NODE_ID must be a bounded safe node identifier." >&2
    exit 2
  fi
  set_env_value "EVERCRAFT_LOCAL_ORGANISM_NODE_ID" "${EVERCRAFT_LOCAL_ORGANISM_NODE_ID}"
fi

if [[ -n "${EVERCRAFT_REMOTE_BROKER_URL:-}" ]]; then
  set_env_value "EVERCRAFT_REMOTE_BROKER_URL" "${EVERCRAFT_REMOTE_BROKER_URL}"
fi

if [[ -n "${EVERCRAFT_REMOTE_OPERATOR_ENABLED:-}" ]]; then
  case "${EVERCRAFT_REMOTE_OPERATOR_ENABLED,,}" in
    true|false) set_env_value "EVERCRAFT_REMOTE_OPERATOR_ENABLED" "${EVERCRAFT_REMOTE_OPERATOR_ENABLED,,}" ;;
    *) echo "EVERCRAFT_REMOTE_OPERATOR_ENABLED must be true or false." >&2; exit 2 ;;
  esac
fi

if [[ -n "${RAVEN_INFERENCE_PROVIDER:-}" ]]; then
  case "${RAVEN_INFERENCE_PROVIDER,,}" in
    ollama|gemini|openai) set_env_value "RAVEN_INFERENCE_PROVIDER" "${RAVEN_INFERENCE_PROVIDER,,}" ;;
    *) echo "RAVEN_INFERENCE_PROVIDER must be ollama, gemini, or openai." >&2; exit 2 ;;
  esac
fi
if [[ -n "${RAVEN_INFERENCE_MODEL:-}" ]]; then
  set_env_value "RAVEN_INFERENCE_MODEL" "${RAVEN_INFERENCE_MODEL}"
fi
if [[ -n "${RAVEN_PROVIDER_CREDENTIAL_STATE_DIR:-}" ]]; then
  set_env_value "RAVEN_PROVIDER_CREDENTIAL_STATE_DIR" "${RAVEN_PROVIDER_CREDENTIAL_STATE_DIR}"
fi
if [[ -n "${RAVEN_OLLAMA_ORIGIN:-}" ]]; then
  set_env_value "RAVEN_OLLAMA_ORIGIN" "${RAVEN_OLLAMA_ORIGIN}"
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

if grep -q '^EVERCRAFT_LOCAL_ZERO_SPEND=true$' "${ENV_FILE}"; then
  echo "Capacity economics: existing local organism is zero-spend capacity."
else
  echo "Capacity economics: zero-spend advertisement disabled by operator configuration."
fi

if grep -q '^EVERCRAFT_NATIVE_BROWSER_BOOTSTRAP=true$' "${ENV_FILE}"; then
  echo "Browser runtime: user-space Playwright/Chromium bootstrap enabled; no root privileges or system packages."
else
  echo "Browser runtime: native user-space bootstrap disabled."
fi

if grep -q '^EVERCRAFT_REMOTE_BROKER_URL=.' "${ENV_FILE}"; then
  echo "Remote admission: configured through private user environment."
else
  echo "Remote admission: not configured; enrollment request will still be generated."
fi

if grep -q '^EVERCRAFT_REMOTE_OPERATOR_ENABLED=true$' "${ENV_FILE}"; then
  echo "Remote Operator: enabled; outbound control grant required."
else
  echo "Remote Operator: disabled."
fi

if grep -q '^RAVEN_INFERENCE_PROVIDER=.' "${ENV_FILE}" && grep -q '^RAVEN_INFERENCE_MODEL=.' "${ENV_FILE}"; then
  echo "Raven inference: configured; Systemia Core will mint private runtime authority files on admission."
else
  echo "Raven inference: not configured; private team inference remains disabled."
fi

echo "State: ${STATE_ROOT}"
echo "This user-mode Chromebook/Crostini runtime is authorized compute, not Node 001 physical field certification."
