/**
 * Disconnected llama.cpp local inference adapter candidate.
 * Not registered in production Raven or Systemia; no cloud, credentials,
 * service activation, work dispatch, tool calls, or external effects.
 */
import { createHash } from 'node:crypto';
import { normalizeOwnedLocalOrigin } from './owned-local-model-probe.mjs';

const MODEL_ID = /^[A-Za-z0-9./_@+~-][A-Za-z0-9._:/@+~-]{0,255}$/; // llama.cpp may expose a Linux model path as its exact ID
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,119}$/;
const MAX_PROMPT_BYTES = 16000;
const sha = value => 'sha256:' + createHash('sha256').update(String(value)).digest('hex');

const ensureIdentifier = (value, type, rule) => {
  if (typeof value !== 'string' || !rule.test(value)) throw Error(type + '_invalid');
  return value;
};

export function createLlamaCppInferenceCandidate({
  origin = 'http://127.0.0.1:36095',
  model,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  allowLocalInference = false,
  maxTokens = 768,
  timeoutMs = 60000
} = {}) {
  const base = normalizeOwnedLocalOrigin(origin);
  const modelId = ensureIdentifier(model, 'llama_model', MODEL_ID);
  if (typeof fetchImpl !== 'function') throw Error('local_fetch_unavailable');
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 2048) throw Error('token_cap_invalid');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) throw Error('timeout_invalid');
  let metadataVerifiedAtMs = null;
  let metadataReceipt = null;

  const requestJson = async (endpoint, init, purpose) => {
    let response;
    try {
      response = await fetchImpl(base + endpoint, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch {
      throw Error('local_' + purpose + '_unavailable');
    }
    if (!response || response.ok !== true || response.status !== 200) {
      throw Error('local_' + purpose + '_unavailable');
    }
    let payload;
    try { payload = await response.json(); }
    catch { throw Error('local_' + purpose + '_response_invalid'); }
    return payload;
  };

  const clock = () => {
    const at = now();
    if (!(at instanceof Date) || !Number.isFinite(at.getTime())) throw Error('local_clock_invalid');
    return at;
  };

  return {
    provider: 'llama-cpp',
    model: modelId,
    authority: 'internal_local_text_only',
    async validate() {
      const result = await requestJson('/v1/models', {
        method: 'GET', headers: {accept:'application/json'}
      }, 'metadata');
      if (!Array.isArray(result?.data) || result.data.length === 0 || result.data.length > 32) {
        throw Error('local_model_inventory_invalid');
      }
      const matched = result.data.find(row => row?.id === modelId);
      if (!matched) throw Error('local_model_not_loaded');
      const modalities = matched?.architecture?.output_modalities;
      if (Array.isArray(modalities) && !modalities.includes('text')) throw Error('local_text_model_unavailable');
      const at = clock();
      metadataVerifiedAtMs = at.getTime();
      const receiptCore = {
        schema:'evercraft.raven.llamacpp-metadata.candidate.v0',
        provider:'llama-cpp',
        model:modelId,
        endpoint:'/v1/models',
        observed_at:at.toISOString(),
        inference_performed:false,
        prompt_sent:false,
        external_effect_authorized:false
      };
      metadataReceipt = sha(JSON.stringify(receiptCore));
      return {
        status:'available', provider:'llama-cpp', model:modelId,
        validation_receipt:metadataReceipt,
        inference_performed:false, prompt_sent:false,
        external_effect_authorized:false,
        base44_used:false, raw_credential_returned:false
      };
    },
    async infer({request_id,role,input,prompt} = {}) {
      // A privileged caller must explicitly opt in. This does not grant
      // Systemia mission authority or permission for downstream effects.
      if (allowLocalInference !== true) throw Error('local_inference_not_activated');
      const requestId = ensureIdentifier(request_id,'request_id',SAFE_ID);
      const reviewerRole = ensureIdentifier(role,'role',SAFE_ID);
      if (input !== undefined && prompt !== undefined && input !== prompt) {
        throw Error('ambiguous_prompt_input');
      }
      const source = input ?? prompt;
      if (typeof source !== 'string' || !source.trim() ||
          Buffer.byteLength(source,'utf8') > MAX_PROMPT_BYTES) throw Error('local_prompt_invalid');
      const startedAt = clock();
      if (metadataVerifiedAtMs === null ||
          startedAt.getTime() < metadataVerifiedAtMs ||
          startedAt.getTime() - metadataVerifiedAtMs > 300000) {
        throw Error('local_model_metadata_stale');
      }
      const response = await requestJson('/v1/chat/completions', {
        method:'POST',
        headers:{'content-type':'application/json','accept':'application/json'},
        body:JSON.stringify({
          model:modelId,
          messages:[{role:'user',content:source}],
          max_tokens:maxTokens,
          temperature:0,
          stream:false
          // No tools field: never make tools available to untrusted model output.
        })
      }, 'inference');
      if (response?.model && response.model !== modelId) throw Error('local_response_model_mismatch');
      if (!Array.isArray(response?.choices) || response.choices.length !== 1) {
        throw Error('local_inference_response_invalid');
      }
      const choice=response.choices[0];
      if (choice?.finish_reason !== 'stop' ||
          choice?.message?.tool_calls?.length ||
          choice?.message?.function_call ||
          typeof choice?.message?.content !== 'string' ||
          !choice.message.content.trim()) {
        throw Error('local_inference_incomplete_or_untrusted');
      }
      const text = choice.message.content.trim();
      if (Buffer.byteLength(text,'utf8') > 60000) throw Error('local_output_over_limit');
      const endedAt=clock();
      const receiptCore = {
        schema:'evercraft.raven.llamacpp-inference.candidate.v0',
        request_id:requestId,
        role:reviewerRole,
        provider:'llama-cpp',
        model:modelId,
        provider_request_id: typeof response.id === 'string' && SAFE_ID.test(response.id) ? response.id : null,
        metadata_receipt:metadataReceipt,
        prompt_sha256:sha(source),
        output_sha256:sha(text),
        started_at:startedAt.toISOString(),
        completed_at:endedAt.toISOString(),
        external_effect_authorized:false,
        tool_invocation_performed:false,
        base44_used:false,
        provider_receipt_kind:'local_integrity_hash_not_external_attestation'
      };
      return {
        status:'completed',
        text, provider:'llama-cpp', model:modelId,
        provider_receipt:sha(JSON.stringify(receiptCore)),
        receipt:receiptCore,
        started_at:receiptCore.started_at,
        completed_at:receiptCore.completed_at,
        external_effect_authorized:false
      };
    }
  };
}