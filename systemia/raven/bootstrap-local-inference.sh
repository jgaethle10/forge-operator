#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROVIDER="${1:-}"
MODEL="${2:-}"
STATE_ROOT="${EVERCRAFT_LOCAL_ORGANISM_ROOT:-$HOME/.local/state/evercraft/organism}"
VAULT_ROOT="${RAVEN_PROVIDER_CREDENTIAL_STATE_DIR:-$STATE_ROOT/compute/private/provider-credentials}"
NODE_BIN="$(command -v node || true)"

usage() {
  cat >&2 <<'EOF'
Usage:
  bootstrap-local-inference.sh <provider> <model>

Providers:
  gemini  - hosted Gemini through Evercraft encrypted provider vault
  openai  - hosted OpenAI Responses through Evercraft encrypted provider vault
  ollama  - local Ollama, no provider credential

Example:
  ./systemia/raven/bootstrap-local-inference.sh gemini gemini-3.5-flash-lite

The script never accepts a hosted provider API key as an argument or environment variable.
If a hosted credential is missing, it prompts with terminal echo disabled and seals the key directly into the Evercraft vault.
EOF
  exit 2
}

[[ -n "${PROVIDER}" && -n "${MODEL}" ]] || usage
case "${PROVIDER,,}" in
  gemini|openai|ollama) PROVIDER="${PROVIDER,,}" ;;
  *) usage ;;
esac
[[ "${MODEL}" =~ ^[a-zA-Z0-9._:-]{1,160}$ ]] || {
  echo "Model id contains unsupported characters." >&2
  exit 2
}
[[ -n "${NODE_BIN}" ]] || {
  echo "Node.js is required." >&2
  exit 2
}

mkdir -p "${VAULT_ROOT}"
chmod 0700 "${VAULT_ROOT}"

if [[ "${PROVIDER}" != "ollama" ]]; then
  STATUS_JSON="$("${NODE_BIN}" "${SOURCE_ROOT}/systemia/raven/seal-inference-key.mjs" status     --provider "${PROVIDER}" --state-dir "${VAULT_ROOT}")"
  CONFIGURED="$("${NODE_BIN}" -e '
    const body=JSON.parse(process.argv[1]);
    process.stdout.write(body.configured===true?"yes":"no");
  ' "${STATUS_JSON}")"

  if [[ "${CONFIGURED}" != "yes" ]]; then
    if [[ ! -t 0 ]]; then
      echo "A hosted provider credential is missing and interactive input is unavailable." >&2
      echo "Run this command from an interactive Chromebook terminal." >&2
      exit 3
    fi
    printf '%s API key (input hidden): ' "${PROVIDER}" >&2
    IFS= read -r -s PROVIDER_KEY
    printf '\n' >&2
    if [[ -z "${PROVIDER_KEY}" ]]; then
      echo "No API key supplied." >&2
      exit 3
    fi
    SEAL_JSON="$(printf '%s' "${PROVIDER_KEY}" | "${NODE_BIN}"       "${SOURCE_ROOT}/systemia/raven/seal-inference-key.mjs" seal       --provider "${PROVIDER}" --state-dir "${VAULT_ROOT}")"
    unset PROVIDER_KEY
    "${NODE_BIN}" -e '
      const body=JSON.parse(process.argv[1]);
      if(body.ok!==true||body.secret_material_returned!==false){
        throw new Error("credential_seal_not_verified");
      }
      console.log("Provider credential sealed into Evercraft vault: "+body.provider);
      console.log("Credential reference: "+body.credential_ref);
    ' "${SEAL_JSON}"
  else
    echo "Existing ${PROVIDER} credential found in Evercraft vault."
  fi
fi

RAVEN_INFERENCE_PROVIDER="${PROVIDER}" RAVEN_INFERENCE_MODEL="${MODEL}" RAVEN_PROVIDER_CREDENTIAL_STATE_DIR="${VAULT_ROOT}" "${SOURCE_ROOT}/systemia/compute/install-local-organism-user.sh"

verify_health() {
  "${NODE_BIN}" -e '
    const port=Number(process.argv[1]);
    const expectedProvider=process.argv[2];
    fetch("http://127.0.0.1:"+port+"/health")
      .then(async r=>({status:r.status,body:await r.json()}))
      .then(({status,body})=>{
        if(status!==200||body.ok!==true) process.exit(1);
        if(port===4322&&body.provider!==expectedProvider) process.exit(1);
        if(body.base44_required!==false) process.exit(1);
        process.stdout.write(JSON.stringify({
          service:body.service,
          provider:body.provider||null,
          model:body.model||null,
          loopback_only:body.loopback_only===true,
          base44_required:body.base44_required
        }));
      })
      .catch(()=>process.exit(1));
  ' "$1" "${PROVIDER}"
}

RAVEN_HEALTH=""
INFERENCE_HEALTH=""
for _ in $(seq 1 30); do
  RAVEN_HEALTH="$(verify_health 4321 2>/dev/null || true)"
  INFERENCE_HEALTH="$(verify_health 4322 2>/dev/null || true)"
  if [[ -n "${RAVEN_HEALTH}" && -n "${INFERENCE_HEALTH}" ]]; then
    break
  fi
  sleep 0.5
done

if [[ -z "${RAVEN_HEALTH}" || -z "${INFERENCE_HEALTH}" ]]; then
  echo "Raven residents did not reach verified loopback health." >&2
  systemctl --user status evercraft-local-organism.service --no-pager || true
  exit 4
fi

GATEWAY_TOKEN_FILE="${STATE_ROOT}/compute/services/systemia-core/.private-bindings/raven/inference-gateway-token"
if [[ ! -f "${GATEWAY_TOKEN_FILE}" ]]; then
  echo "Raven inference gateway authority file is missing." >&2
  exit 5
fi

VALIDATION_JSON="$("${NODE_BIN}" -e '
  const fs=require("fs");
  const file=process.argv[1];
  const expectedProvider=process.argv[2];
  const expectedModel=process.argv[3];
  const stat=fs.statSync(file);
  if((stat.mode & 0o077)!==0) throw new Error("gateway_token_permissions_too_open");
  const token=fs.readFileSync(file,"utf8").trim();
  if(Buffer.byteLength(token,"utf8")<32) throw new Error("gateway_token_too_short");
  fetch("http://127.0.0.1:4322/v1/validate",{
    method:"POST",
    headers:{
      authorization:"Bearer "+token,
      "content-type":"application/json"
    },
    body:JSON.stringify({schema:"evercraft.raven.inference-validation.request.v1"})
  })
  .then(async r=>({status:r.status,body:await r.json()}))
  .then(({status,body})=>{
    if(status!==200||body.ok!==true||body.status!=="available") {
      process.stderr.write(JSON.stringify(body)+"\n");
      process.exit(2);
    }
    if(body.provider!==expectedProvider||body.model!==expectedModel) process.exit(3);
    if(body.inference_performed!==false||body.prompt_sent!==false) process.exit(4);
    if(body.base44_used!==false) process.exit(5);
    process.stdout.write(JSON.stringify({
      status:body.status,
      provider:body.provider,
      model:body.model,
      validation_receipt:body.validation_receipt,
      inference_performed:false,
      prompt_sent:false,
      base44_used:false
    }));
  })
  .catch(error=>{
    process.stderr.write(String(error?.message||error)+"\n");
    process.exit(6);
  });
' "${GATEWAY_TOKEN_FILE}" "${PROVIDER}" "${MODEL}")" || {
  echo "Provider key/model metadata validation failed. No inference prompt was sent." >&2
  exit 6
}

echo "Raven private runtime: ${RAVEN_HEALTH}"
echo "Raven inference gateway: ${INFERENCE_HEALTH}"
echo "Provider/model metadata validation: ${VALIDATION_JSON}"
echo "Provider credential values printed: false"
echo "Base44 required: false"
echo "Live model inference has NOT been exercised by this bootstrap command."
