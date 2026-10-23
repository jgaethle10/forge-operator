#!/usr/bin/env bash
# Local-only NextGen WSL bootstrap. Without --apply: status only.
set -euo pipefail
SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DOCTOR="${SOURCE_ROOT}/systemia/compute/nextgen-remote-doctor.mjs"
if [[ "${1:-}" != "--apply" ]]; then
  node "${DOCTOR}"
  echo "READ ONLY: nothing changed on NextGen."
  exit 0
fi
if [[ "${2:-}" != "--approval-ref" || -z "${3:-}" || $# -ne 3 ]]; then
  echo "An explicit local --approval-ref is required." >&2
  exit 2
fi
if [[ "$(id -u)" -eq 0 ]]; then
  echo "Refusing root; use the ordinary WSL user." >&2
  exit 2
fi
if [[ ${#3} -gt 128 || ! "$3" =~ ^[a-zA-Z0-9._:/-]+$ ]]; then
  echo "Invalid local approval reference." >&2
  exit 2
fi
node "${DOCTOR}" --require-local-prerequisites >/dev/null || {
  node "${DOCTOR}"
  echo "Preflight failed; no changes were made." >&2
  exit 3
}
# Reuse the canonical reviewed outbound user-mode installer.
EVERCRAFT_REMOTE_OPERATOR_ENABLED=true bash "${SOURCE_ROOT}/systemia/compute/enable-remote-operator-user.sh"
node "${DOCTOR}"
echo "Local bootstrap only: separate Yard device trust and a live MCP proof are required."
