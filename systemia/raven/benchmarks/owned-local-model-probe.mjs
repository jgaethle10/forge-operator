/**
 * Evercraft owned-node, metadata-only local model discovery.
 * No model inference, no credentials, no cloud, no persistent writes.
 * Deliberately NOT a Raven runtime adapter or Systemia mission admission.
 */
import { createHash } from 'node:crypto';

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+~-]{0,159}$/;
const PROVIDERS = Object.freeze({
  ollama: { defaultOrigin:'http://127.0.0.1:11434', modelsPath:'/api/tags' },
  'llama-cpp': { defaultOrigin:'http://127.0.0.1:36095', modelsPath:'/v1/models' }
});
const hold = (reason) => ({
  schema:'evercraft.raven.local-model-probe.v1',
  status:'held',
  reason,
  model_metadata_observed:false,
  inference_performed:false,
  external_effect_authorized:false,
  route_eligible:false,
  cost_estimate_usd:null,
  metadata_receipt:null
});

export function normalizeOwnedLocalOrigin(origin) {
  if (typeof origin !== 'string' || origin.length > 200) throw Error('LOCAL_ORIGIN_INVALID');
  let u;
  try { u = new URL(origin); } catch { throw Error('LOCAL_ORIGIN_INVALID'); }
  if (u.protocol !== 'http:' || !['127.0.0.1','localhost','[::1]'].includes(u.hostname) ||
      u.username || u.password || u.search || u.hash ||
      (u.pathname !== '/' && u.pathname !== '')) {
    throw Error('LOCAL_LOOPBACK_ONLY');
  }
  if (!u.port || !/^\d{2,5}$/.test(u.port)) throw Error('LOCAL_PORT_REQUIRED');
  return u.origin;
}

function safeId(value) {
  if (typeof value !== 'string') return null;
  return MODEL_ID.test(value) ? value : null;
}

export async function probeOwnedLocalModel({
  provider = 'llama-cpp',
  origin = '',
  model = '',
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  timeoutMs = 5000
} = {}) {
  const config = PROVIDERS[provider];
  if (!config) return hold('PROVIDER_NOT_LOCAL_ALLOWLISTED');
  if (model && !safeId(model)) return hold('MODEL_ID_INVALID');
  if (typeof fetchImpl !== 'function') return hold('FETCH_UNAVAILABLE');

  let base;
  try { base = normalizeOwnedLocalOrigin(origin || config.defaultOrigin); }
  catch { return hold('LOCAL_LOOPBACK_ONLY'); }

  let response, payload;
  try {
    response = await fetchImpl(base + config.modelsPath, {
      method:'GET', headers:{accept:'application/json'},
      redirect:'error', signal:AbortSignal.timeout(Math.min(10000, Math.max(1000, timeoutMs)))
    });
    if (response.status !== 200 || response.ok !== true) return hold('LOCAL_METADATA_UNAVAILABLE');
    payload = await response.json();
  } catch { return hold('LOCAL_METADATA_UNAVAILABLE'); }

  const raw = provider === 'ollama' ? payload?.models : payload?.data;
  if (!Array.isArray(raw) || raw.length > 500) return hold('LOCAL_METADATA_INVALID');
  const ids = [...new Set(raw.map(row => safeId(provider === 'ollama' ? (row?.model || row?.name) : row?.id))
    .filter(Boolean))].sort();
  if (ids.length === 0) return hold('NO_VALID_LOCAL_MODEL_ID');

  const matching = !model || ids.includes(model) ||
    (provider === 'ollama' && ids.includes(model + ':latest'));
  const timestamp = now();
  if (!(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime())) return hold('LOCAL_CLOCK_INVALID');

  // Hash is a local integrity fingerprint, NOT cryptographic third-party attestation.
  const core = {
    schema:'evercraft.raven.local-model-probe.v1',
    status: matching ? 'observed' : 'held',
    provider,
    local_only:true,
    origin_kind:'same_device_loopback',
    observed_at: timestamp.toISOString(),
    endpoint:config.modelsPath,
    model_ids:ids,
    requested_model: model || null,
    requested_model_found: Boolean(matching),
    model_metadata_observed:true,
    inference_performed:false,
    external_effect_authorized:false,
    route_eligible:false, // Cost/latency evidence and authorized gateway wiring remain absent.
    cost_estimate_usd:null,
    latency_ms:null,
    evidence_semantics:'Read-only local model-list response; no inference, model health guarantee, cost estimate, or Systemia admission'
  };
  const metadata_receipt='sha256:'+createHash('sha256').update(JSON.stringify(core)).digest('hex');
  return { ...core, metadata_receipt };
}
