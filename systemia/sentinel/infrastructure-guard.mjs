// Passive, deterministic analysis of telemetry supplied by explicitly authorized adapters.
// No discovery, scanning, controller writes, remote commands, or autonomous isolation.
const STATES = new Set(['normal', 'abnormal', 'safety_alarm', 'error']);
const MAX_FUTURE_SKEW_MS = 30_000;

function timestamp(value) {
  const result = Date.parse(String(value ?? ''));
  return Number.isFinite(result) ? result : null;
}

function identifier(value, label) {
  const result = String(value ?? '').trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/.test(result)) {
    throw new TypeError(label + ' must be a short opaque identifier');
  }
  return result;
}

function normalizeContract(raw) {
  const age = Number(raw?.max_age_seconds);
  if (!Number.isInteger(age) || age < 1 || age > 86400) {
    throw new TypeError('max_age_seconds must be an integer from 1 to 86400');
  }
  return {
    source_id: identifier(raw.source_id, 'source_id'),
    independence_group: identifier(raw.independence_group, 'independence_group'),
    max_age_seconds: age,
    required: raw.required !== false
  };
}

// Receipts represent an ALREADY authenticated adapter's observations, not network requests.
// A receipt's self-reported "safety_alarm" requests inspection, not proof of an unsafe
// condition or malicious action. Independent groups must be physically independent.
export function evaluateInfrastructureGuard(input = {}) {
  const assetId = identifier(input.asset_id, 'asset_id');
  const now = timestamp(input.evaluated_at || new Date().toISOString());
  if (now === null) throw new TypeError('evaluated_at must be a valid timestamp');
  if (!Array.isArray(input.sources) || !input.sources.length || input.sources.length > 64) {
    throw new TypeError('sources must contain 1 to 64 approved source contracts');
  }
  if (!Array.isArray(input.receipts) || input.receipts.length > 1024) {
    throw new TypeError('receipts must be an array of at most 1024 items');
  }
  const contracts = input.sources.map(normalizeContract);
  const IDs = new Set(contracts.map((c) => c.source_id));
  if (IDs.size !== contracts.length) throw new TypeError('duplicate source contracts');

  const rows = [];
  const abnormalGroups = new Set();
  const requiredBlindSpots = [];
  let usableRequiredCount = 0;
  let requestedSafetyReview = false;

  for (const contract of contracts) {
    const candidates = input.receipts.filter((r) => r && r.source_id === contract.source_id);
    const eligible = candidates
      .map((r) => ({ receipt: r, at: timestamp(r.checked_at) }))
      .filter((r) => r.at !== null && r.at <= now + MAX_FUTURE_SKEW_MS)
      .sort((a, b) => b.at - a.at);
    const current = eligible[0] || null;
    const ageSeconds = current ? Math.max(0, Math.floor((now - current.at) / 1000)) : null;
    const state = current && ageSeconds <= contract.max_age_seconds && STATES.has(current.receipt.status)
      ? current.receipt.status
      : current ? 'stale_or_invalid' : 'missing_or_invalid';
    const usable = state === 'normal' || state === 'abnormal' || state === 'safety_alarm';

    if (contract.required && usable) usableRequiredCount += 1;
    if (contract.required && !usable) {
      requiredBlindSpots.push({ source_id: contract.source_id, reason: state });
    }
    if (state === 'abnormal' || state === 'safety_alarm') {
      abnormalGroups.add(contract.independence_group);
    }
    if (state === 'safety_alarm') requestedSafetyReview = true;

    rows.push({
      source_id: contract.source_id,
      independence_group: contract.independence_group,
      required: contract.required,
      state,
      age_seconds: ageSeconds
    });
  }

  const usableCount = rows.filter((r) => ['normal', 'abnormal', 'safety_alarm'].includes(r.state)).length;
  const coverage = usableCount === 0 ? 'blind' : requiredBlindSpots.length ? 'degraded' : 'complete';
  const status = requestedSafetyReview ? 'urgent_review'
    : abnormalGroups.size >= 2 ? 'elevated'
    : abnormalGroups.size === 1 ? 'watch'
    : coverage === 'blind' ? 'blind'
    : coverage === 'degraded' ? 'degraded'
    : 'healthy';

  return {
    schema: 'systemia.sentinel.infrastructure-guard.v1',
    asset_id: assetId,
    evaluated_at: new Date(now).toISOString(),
    status,
    coverage,
    required_usable: usableRequiredCount,
    required_total: contracts.filter((c) => c.required).length,
    abnormal_independence_groups: abnormalGroups.size,
    blind_spots: requiredBlindSpots,
    sources: rows,
    attribution: 'undetermined',
    safety_state: requestedSafetyReview ? 'requires_local_verification' : 'not_confirmed',
    operator_review_required: status !== 'healthy',
    controller_actions_authorized: false,
    rule: 'Coverage loss is not normality. Alerts do not establish cyberattack or authorize actuation.'
  };
}
