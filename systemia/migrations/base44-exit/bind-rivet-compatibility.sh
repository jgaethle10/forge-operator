#!/usr/bin/env bash
set -euo pipefail

APP_ID="${RIVET_BASE44_APP_ID:-6ab2062323d5c33c7dde7606}"
BINDING_FILE="${1:-}"
TOKEN_FILE="${2:-}"

if [[ -z "${BINDING_FILE}" || -z "${TOKEN_FILE}" ]]; then
  echo "Usage: $0 <hosting-service-state.json> <rivet-team-token-file>" >&2
  exit 2
fi
if [[ ! -f "${BINDING_FILE}" ]]; then
  echo "Binding file not found: ${BINDING_FILE}" >&2
  exit 2
fi
if [[ ! -f "${TOKEN_FILE}" ]]; then
  echo "Token file not found: ${TOKEN_FILE}" >&2
  exit 2
fi
if ! command -v base44 >/dev/null 2>&1; then
  echo "Base44 CLI is required for the temporary compatibility binding." >&2
  exit 3
fi

readarray -t FIELDS < <(node - "${BINDING_FILE}" <<'NODE'
const fs=require('fs');
const file=process.argv[2];
const state=JSON.parse(fs.readFileSync(file,'utf8'));
const binding=state?.compatibility_binding;
if(binding?.schema!=='evercraft.rivet.compatibility-binding.v1') throw new Error('compatibility_binding_missing');
if(binding.route_verified!==true) throw new Error('compatibility_route_not_verified');
const url=String(binding.reports_url||'').trim();
const parsed=new URL(url);
if(parsed.protocol!=='https:' && !['127.0.0.1','localhost','::1'].includes(parsed.hostname)) {
  throw new Error('compatibility_binding_requires_https');
}
if(!url.endsWith('/v1/reports')) throw new Error('compatibility_binding_must_target_v1_reports');
console.log(url);
console.log(String(binding?.target_secret_names?.url||'RIVET_YARD_GATEWAY_URL'));
console.log(String(binding?.target_secret_names?.token||'RIVET_YARD_GATEWAY_TOKEN'));
NODE
)

REPORTS_URL="${FIELDS[0]}"
URL_KEY="${FIELDS[1]}"
TOKEN_KEY="${FIELDS[2]}"
TOKEN="$(tr -d '\r\n' < "${TOKEN_FILE}")"
if [[ -z "${TOKEN}" ]]; then
  echo "Token file is empty." >&2
  exit 4
fi

TMP="$(mktemp)"
cleanup() {
  chmod 0600 "${TMP}" 2>/dev/null || true
  if command -v shred >/dev/null 2>&1; then
    shred -u "${TMP}" 2>/dev/null || rm -f "${TMP}"
  else
    rm -f "${TMP}"
  fi
}
trap cleanup EXIT
chmod 0600 "${TMP}"

{
  printf '%s=%s\n' "${URL_KEY}" "${REPORTS_URL}"
  printf '%s=%s\n' "${TOKEN_KEY}" "${TOKEN}"
} > "${TMP}"

base44 --app-id "${APP_ID}" secrets set --env-file "${TMP}" >/dev/null
NAMES="$(base44 --app-id "${APP_ID}" secrets list 2>/dev/null || true)"

if ! grep -q "${URL_KEY}" <<<"${NAMES}" || ! grep -q "${TOKEN_KEY}" <<<"${NAMES}"; then
  echo "Compatibility secret names did not verify after write." >&2
  exit 5
fi

echo "RIVET compatibility bridge bound to verified Evercraft Hosting route."
echo "URL secret: ${URL_KEY}"
echo "Token secret: ${TOKEN_KEY}"
echo "Token value was not printed."
