#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STATE_ROOT="${EVERCRAFT_LOCAL_ORGANISM_ROOT:-$HOME/.local/state/evercraft/organism}"
ENV_FILE="$HOME/.config/evercraft/local-organism.env"
INSTALLER="${SOURCE_ROOT}/systemia/compute/install-local-organism-user.sh"

if [[ ! -x "${INSTALLER}" ]]; then
  chmod +x "${INSTALLER}" 2>/dev/null || true
fi

if [[ ! -f "${INSTALLER}" ]]; then
  echo "Evercraft local organism installer is missing." >&2
  exit 2
fi

if [[ -n "${EVERCRAFT_REMOTE_BROKER_URL:-}" ]]; then
  export EVERCRAFT_REMOTE_BROKER_URL
elif [[ ! -f "${ENV_FILE}" ]] || ! grep -q '^EVERCRAFT_REMOTE_BROKER_URL=' "${ENV_FILE}"; then
  echo "Remote Operator needs the existing Evercraft remote-capacity broker URL." >&2
  echo "Set EVERCRAFT_REMOTE_BROKER_URL to the verified Evercraft broker origin, then run this command again." >&2
  exit 3
fi

export EVERCRAFT_REMOTE_OPERATOR_ENABLED=true
bash "${INSTALLER}"

CHROMEOS_HOST_BOUNDARY_MODE="${EVERCRAFT_CHROMEOS_HOST_BOUNDARY_ENABLED:-auto}"
case "${CHROMEOS_HOST_BOUNDARY_MODE,,}" in
  true|false|auto) ;;
  *)
    echo "EVERCRAFT_CHROMEOS_HOST_BOUNDARY_ENABLED must be true, false, or auto." >&2
    exit 2
    ;;
esac

CROS_GUEST=false
if [[ -d /mnt/chromeos ]] || [[ "$(hostname 2>/dev/null || true)" == "penguin" ]]; then
  CROS_GUEST=true
fi

if [[ "${CHROMEOS_HOST_BOUNDARY_MODE,,}" == "true" ]] ||    [[ "${CHROMEOS_HOST_BOUNDARY_MODE,,}" == "auto" && "${CROS_GUEST}" == "true" ]]; then
  HOST_BRIDGE_INSTALLER="${SOURCE_ROOT}/systemia/compute/install-chromeos-host-boundary-bridge-user.sh"
  if [[ ! -f "${HOST_BRIDGE_INSTALLER}" ]]; then
    echo "ChromeOS host-boundary bridge installer is missing." >&2
    exit 4
  fi
  chmod +x "${HOST_BRIDGE_INSTALLER}" 2>/dev/null || true
  bash "${HOST_BRIDGE_INSTALLER}"
fi

RECEIPT="${STATE_ROOT}/local-organism-receipt.json"
SEED_RECEIPT="${STATE_ROOT}/compute/nodeseed-receipt.json"

for _ in $(seq 1 20); do
  if [[ -f "${RECEIPT}" && -f "${SEED_RECEIPT}" ]]; then
    break
  fi
  sleep 0.25
done

node - "${RECEIPT}" "${SEED_RECEIPT}" <<'NODE'
const fs = require('fs');
const [receiptFile, seedFile] = process.argv.slice(2);
if (!fs.existsSync(receiptFile) || !fs.existsSync(seedFile)) {
  throw new Error('Evercraft local organism receipts were not produced.');
}
const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
if (receipt?.remote_operator?.enabled !== true) {
  throw new Error('Remote Operator did not become enabled.');
}
const endpoint = String(seed.endpoint || '');
if (!/^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(endpoint)) {
  throw new Error('NodeSeed is not loopback-only; refusing Remote Operator verification.');
}
(async () => {
  const capacity = await fetch(endpoint + '/v1/capacity').then((response) => response.json());
  if (capacity?.capacity_hint?.services?.remote_operator?.ready !== true) {
    throw new Error('NodeSeed does not advertise a ready Remote Operator.');
  }
  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.remote-operator.enablement-receipt.v1',
    node_id: seed.node_id,
    remote_operator_ready: true,
    root_keys: capacity.capacity_hint.services.remote_operator.roots,
    outbound_only: true,
    public_ingress: false,
    remote_admission_state: receipt.remote_admission?.state || 'unknown',
    chromeos_host_boundary_bridge_expected:
      process.env.EVERCRAFT_CHROMEOS_HOST_BOUNDARY_ENABLED !== 'false',
  }, null, 2));
})().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
NODE
