/**
 * Read-only model route candidate. Offline and disconnected from Raven runtime.
 * Source admission, actual inference, execution and verification are separate.
 * No provider network calls, credentials, logs, or state mutations.
 */
export const POLICY_SCHEMA = 'evercraft.raven.model-route-decision.v0';

const isName = value => typeof value === 'string' && value.length > 0;
const isFiniteNonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function hold(reason_codes) {
  return {
    schema: POLICY_SCHEMA,
    status: 'held',
    reason_codes: [...new Set(reason_codes)],
    primary: null,
    secondary: null,
    estimated_cost_usd: null,
    cost_estimate_kind: 'unknown',
    authority: 'read_only_inference_only',
    inference_performed: false,
    external_effect_authorized: false
  };
}

function qualifies(entry, request) {
  if (!entry || !isName(entry.provider_id) || !isName(entry.model_id)) return false;
  if (!['local', 'cloud'].includes(entry.runtime)) return false;
  if (entry.configured !== true || entry.healthy !== true) return false;
  if (entry.runtime === 'cloud' && entry.credential_ready !== true) return false;
  if (!Array.isArray(entry.capabilities)) return false;
  if (!request.capabilities.every(capability => entry.capabilities.includes(capability))) return false;
  if (!isFiniteNonnegative(entry.estimated_cost_usd)) return false;
  if (!isFiniteNonnegative(entry.latency_ms)) return false;
  if (request.local_only === true && entry.runtime !== 'local') return false;
  if (entry.runtime === 'cloud' && request.cloud_consent !== true) return false;
  if (request.data_classification === 'confidential' && entry.runtime === 'cloud') {
    if (request.confidential_cloud_approved !== true) return false;
    if (entry.retention_policy_verified !== true) return false;
  }
  if (isFiniteNonnegative(request.max_latency_ms) && entry.latency_ms > request.max_latency_ms) return false;
  return true;
}

function summarize(entry) {
  return {
    provider_id: entry.provider_id,
    model_id: entry.model_id,
    runtime: entry.runtime,
    configured: true,
    route_status: 'proposed_only'
  };
}

/**
 * Decision does NOT invoke a model. Secondary is a candidate route, not an
 * independent response or an authenticated model invocation receipt.
 */
export function decideModelRoute({request, inventory} = {}) {
  if (!request || !isName(request.task_id)) return hold(['INVALID_REQUEST']);
  if (!['public', 'internal', 'confidential'].includes(request.data_classification)) return hold(['UNCLASSIFIED_DATA']);
  if (!Array.isArray(request.capabilities) || !request.capabilities.every(isName)) return hold(['INVALID_CAPABILITIES']);
  if (!isFiniteNonnegative(request.cost_ceiling_usd)) return hold(['COST_CEILING_REQUIRED']);
  if (!Array.isArray(inventory)) return hold(['INVENTORY_UNAVAILABLE']);
  if (request.local_only !== true && request.local_only !== false) return hold(['LOCALITY_REQUIREMENT_MISSING']);
  const eligible = inventory.filter(entry => qualifies(entry, request));
  eligible.sort((a, b) =>
    Number(b.runtime === 'local') - Number(a.runtime === 'local') ||
    a.estimated_cost_usd - b.estimated_cost_usd ||
    a.latency_ms - b.latency_ms ||
    a.provider_id.localeCompare(b.provider_id) ||
    a.model_id.localeCompare(b.model_id)
  );
  const affordable = eligible.filter(entry => entry.estimated_cost_usd <= request.cost_ceiling_usd);
  if (affordable.length === 0) {
    if (eligible.length > 0) return hold(['OVER_BUDGET']);
    return hold(['NO_ELIGIBLE_MODEL']);
  }
  const primary = affordable[0];
  let secondary = null;
  if (request.second_opinion_requested === true) {
    const remaining = affordable.filter(entry =>
      !(entry.provider_id === primary.provider_id && entry.model_id === primary.model_id) &&
      entry.estimated_cost_usd + primary.estimated_cost_usd <= request.cost_ceiling_usd
    );
    remaining.sort((a, b) =>
      Number(a.provider_id === primary.provider_id) - Number(b.provider_id === primary.provider_id) ||
      Number(b.runtime === 'local') - Number(a.runtime === 'local') ||
      a.estimated_cost_usd - b.estimated_cost_usd ||
      a.latency_ms - b.latency_ms ||
      a.provider_id.localeCompare(b.provider_id) ||
      a.model_id.localeCompare(b.model_id)
    );
    secondary = remaining[0] || null;
    if (!secondary) return hold(['SECOND_OPINION_ROUTE_UNAVAILABLE']);
  }
  const estimated = primary.estimated_cost_usd + (secondary?.estimated_cost_usd || 0);
  return {
    schema: POLICY_SCHEMA,
    status: 'eligible',
    reason_codes: [],
    primary: summarize(primary),
    secondary: secondary ? summarize(secondary) : null,
    estimated_cost_usd: Number(estimated.toFixed(8)),
    cost_estimate_kind: 'quoted',
    authority: 'read_only_inference_only',
    inference_performed: false,
    external_effect_authorized: false
  };
}
