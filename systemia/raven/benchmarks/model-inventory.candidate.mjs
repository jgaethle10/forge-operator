import { createInferenceEngine } from '../inference-gateway.mjs';

// Candidate only. Call with trusted operator inventory, never prompts, web content,
// model output, or arbitrary user-supplied specs. No production runtime wiring.
const ADAPTER_RUNTIME = Object.freeze({ ollama:'local', openai:'cloud', gemini:'cloud' });
const MAX_SPEC_ENTRIES = 32;
const name = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 300;
const finitePositiveOrZero = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const reason = (provider_id, model_id, code) => ({ provider_id, model_id, code });

/**
 * Metadata-only bridge between the existing Raven gateway validator and
 * the proposed fail-closed policy. It never sends inference prompts.
 * Calls to hosted metadata endpoints are opt-in and not a default.
 */
export async function observeRavenInventory({
  trustedSpecs = [],
  now = () => Date.now(),
  createEngine = createInferenceEngine,
  allowCloudMetadataValidation = false,
  credentialStateDir = '',
} = {}) {
  const evaluated_at_ms = now();
  if (!Number.isSafeInteger(evaluated_at_ms) || evaluated_at_ms < 0) {
    throw new Error('trusted_inventory_clock_required');
  }
  if (!Array.isArray(trustedSpecs) || trustedSpecs.length > MAX_SPEC_ENTRIES) {
    throw new Error('trusted_inventory_spec_invalid');
  }
  const inventory = [];
  const holds = [];
  const seen = new Set();
  for (const spec of trustedSpecs) {
    const provider_id = spec?.provider_id;
    const model_id = spec?.model_id;
    const key = String(provider_id) + '/' + String(model_id);
    if (seen.has(key)) {
      holds.push(reason(provider_id, model_id, 'DUPLICATE_MODEL'));
      continue;
    }
    seen.add(key);
    const expectedRuntime = Object.hasOwn(ADAPTER_RUNTIME, provider_id)
      ? ADAPTER_RUNTIME[provider_id] : null;
    if (!expectedRuntime || !name(model_id) || !name(provider_id) ||
        spec.runtime !== expectedRuntime ||
        !Array.isArray(spec.capabilities) || spec.capabilities.length !== 1 ||
        spec.capabilities[0] !== 'text' ||
        !finitePositiveOrZero(spec.estimated_cost_usd) ||
        !['quoted','measured'].includes(spec.cost_estimate_kind) ||
        !name(spec.cost_evidence_ref) ||
        !finitePositiveOrZero(spec.latency_ms) ||
        !name(spec.latency_evidence_ref)) {
      holds.push(reason(provider_id, model_id, 'INCOMPLETE_TRUSTED_SPEC'));
      continue;
    }
    if (expectedRuntime === 'cloud' && !allowCloudMetadataValidation) {
      holds.push(reason(provider_id, model_id, 'CLOUD_METADATA_VALIDATION_NOT_AUTHORIZED'));
      continue;
    }
    if (expectedRuntime === 'cloud' &&
        (spec.credential_ready !== true || spec.retention_policy_verified !== true ||
         spec.provider_metadata_consent !== true)) {
      holds.push(reason(provider_id, model_id, 'CLOUD_POLICY_OR_CREDENTIAL_UNVERIFIED'));
      continue;
    }
    let result;
    try {
      // The existing engine validates model visibility; it does not perform inference.
      const engine = createEngine({ provider: provider_id, model: model_id, credentialStateDir });
      result = await engine.validate();
    } catch {
      // Do not include arbitrary provider error messages: they may contain secrets.
      holds.push(reason(provider_id, model_id, 'MODEL_METADATA_VALIDATION_FAILED'));
      continue;
    }
    if (result?.status !== 'available' || result.provider !== provider_id ||
        result.model !== model_id || result.inference_performed !== false ||
        result.prompt_sent !== false || result.base44_used !== false ||
        result.raw_credential_returned !== false ||
        !name(result.validation_receipt)) {
      holds.push(reason(provider_id, model_id, 'MODEL_METADATA_RECEIPT_UNTRUSTED'));
      continue;
    }
    const validated_at_ms = now();
    if (!Number.isSafeInteger(validated_at_ms) ||
        validated_at_ms < evaluated_at_ms ||
        validated_at_ms - evaluated_at_ms > 300000) {
      holds.push(reason(provider_id, model_id, 'METADATA_CLOCK_INVALID'));
      continue;
    }
    inventory.push({
      provider_id, model_id,
      runtime: expectedRuntime,
      configured: true,
      healthy: true,
      health_scope: 'metadata_only',
      metadata_checked: true,
      metadata_receipt: result.validation_receipt,
      validated_at_ms,
      capabilities: ['text'],
      estimated_cost_usd: spec.estimated_cost_usd,
      cost_estimate_kind: spec.cost_estimate_kind,
      cost_evidence_ref: spec.cost_evidence_ref,
      latency_ms: spec.latency_ms,
      latency_evidence_ref: spec.latency_evidence_ref,
      credential_ready: expectedRuntime === 'local' ? false : true,
      retention_policy_verified: expectedRuntime === 'local' ? false : true,
    });
  }
  return {
    schema: 'evercraft.raven.model-inventory-observation.v0',
    evidence_semantics: 'Metadata-only visibility; NOT live inference or verified cost, performance, privacy compliance, execution, or external effect.',
    evaluated_at_ms,
    inventory,
    holds,
    inference_performed: false,
    external_effect_authorized: false,
  };
}
