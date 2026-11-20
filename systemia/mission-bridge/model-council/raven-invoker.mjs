import { createInferenceEngine } from '../../raven/inference-gateway.mjs';

// Systemia owns admission and the transaction-safe attempt ledger.
// Raven owns private inference and provider credentials. Never call this
// from the browser or from the public heartbeat projection.
export function createRavenAdvisoryInvoker({
  credentialStateDir='', engineFactory=createInferenceEngine, fetchImpl=globalThis.fetch
}={}) {
  if(!credentialStateDir||typeof credentialStateDir!=='string')
    throw Error('owned_credential_vault_required');
  return async function invoke({provider,model,request_id,role,input}={}) {
    if(!['anthropic','xai'].includes(provider))
      throw Error('external_advisory_provider_not_allowed');
    if(typeof model!=='string'||!model.trim()||!request_id||!role||!input)
      throw Error('incomplete_advisory_invocation');
    const engine=engineFactory({provider,model,credentialStateDir,fetchImpl});
    // No cloud call until invoked by executeAdvisory after reservation.
    return engine.infer({request_id,role,input});
  };
}
