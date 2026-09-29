const SOURCE_STATES = new Set(['ok', 'partial', 'error']);

function clean(value, name) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(name + ' must be non-empty');
  return text;
}

function timestamp(value, name) {
  const n = new Date(value).getTime();
  if (!Number.isFinite(n)) throw new TypeError(name + ' must be a valid timestamp');
  return n;
}

export function emptySourceHealthState() {
  return {
    schema: 'systemia.sentinel.source-health-state.v1',
    sources: {}
  };
}

export function normalizeSourceContract(raw = {}) {
  const expectedMaxAgeSeconds = Number(raw.expected_max_age_seconds);
  if (!Number.isFinite(expectedMaxAgeSeconds) || expectedMaxAgeSeconds <= 0) {
    throw new TypeError('expected_max_age_seconds must be positive');
  }

  return {
    source_id: clean(raw.source_id, 'source_id'),
    domain: clean(raw.domain, 'domain'),
    independence_group: clean(raw.independence_group || raw.source_id, 'independence_group'),
    expected_max_age_seconds: expectedMaxAgeSeconds,
    required: raw.required !== false,
    description: String(raw.description || '').slice(0, 280)
  };
}

export function recordSourceReceipt(inputState, rawReceipt) {
  const state = structuredClone(inputState || emptySourceHealthState());
  const sourceId = clean(rawReceipt?.source_id, 'source_id');
  const status = String(rawReceipt?.status || 'ok').toLowerCase();
  if (!SOURCE_STATES.has(status)) {
    throw new TypeError('source receipt status must be ok, partial, or error');
  }

  const checkedAt = new Date(rawReceipt.checked_at).toISOString();
  const prior = state.sources[sourceId] || null;
  const consecutiveFailures = status === 'error'
    ? (prior?.consecutive_failures || 0) + 1
    : 0;

  state.sources[sourceId] = {
    source_id: sourceId,
    status,
    checked_at: checkedAt,
    item_count: Math.max(0, Number(rawReceipt.item_count || 0)),
    latency_ms: Number.isFinite(Number(rawReceipt.latency_ms)) ? Math.max(0, Number(rawReceipt.latency_ms)) : null,
    error_code: rawReceipt.error_code ? String(rawReceipt.error_code).slice(0, 120) : null,
    consecutive_failures: consecutiveFailures,
    last_success_at: status === 'error' ? (prior?.last_success_at || null) : checkedAt
  };

  return state;
}

export function evaluateSourceCoverage(inputState, rawContracts, now = new Date().toISOString()) {
  const state = inputState || emptySourceHealthState();
  const contracts = rawContracts.map(normalizeSourceContract);
  const nowMs = timestamp(now, 'now');
  const sources = [];
  const blindSpots = [];

  for (const contract of contracts) {
    const receipt = state.sources[contract.source_id] || null;
    let health = 'missing';
    let ageSeconds = null;

    if (receipt) {
      ageSeconds = Math.max(0, Math.round((nowMs - timestamp(receipt.checked_at, 'checked_at')) / 1000));
      if (receipt.status === 'error') health = 'error';
      else if (ageSeconds > contract.expected_max_age_seconds) health = 'stale';
      else if (receipt.status === 'partial') health = 'partial';
      else health = 'fresh';
    }

    const usable = health === 'fresh' || health === 'partial';
    const row = {
      ...contract,
      health,
      usable,
      age_seconds: ageSeconds,
      last_checked_at: receipt?.checked_at || null,
      last_success_at: receipt?.last_success_at || null,
      item_count: receipt?.item_count ?? null,
      consecutive_failures: receipt?.consecutive_failures || 0,
      error_code: receipt?.error_code || null
    };
    sources.push(row);

    if (contract.required && !usable) {
      blindSpots.push({
        source_id: contract.source_id,
        domain: contract.domain,
        independence_group: contract.independence_group,
        reason: health
      });
    }
  }

  const domains = [...new Set(contracts.map((c) => c.domain))].sort().map((domain) => {
    const rows = sources.filter((row) => row.domain === domain);
    const usable = rows.filter((row) => row.usable);
    return {
      domain,
      configured_sources: rows.length,
      usable_sources: usable.length,
      usable_independence_groups: [...new Set(usable.map((row) => row.independence_group))].length,
      degraded: rows.some((row) => row.required) && usable.length === 0
    };
  });

  const groups = [...new Set(contracts.map((c) => c.independence_group))].sort().map((group) => {
    const rows = sources.filter((row) => row.independence_group === group);
    return {
      independence_group: group,
      configured_sources: rows.length,
      usable_sources: rows.filter((row) => row.usable).length,
      usable: rows.some((row) => row.usable)
    };
  });

  const requiredCount = contracts.filter((c) => c.required).length;
  const requiredHealthy = sources.filter((row) => row.required && row.usable).length;
  const coverageRatio = requiredCount ? requiredHealthy / requiredCount : 1;

  return {
    schema: 'systemia.sentinel.source-coverage.v1',
    evaluated_at: new Date(nowMs).toISOString(),
    healthy: blindSpots.length === 0,
    required_source_coverage_ratio: Number(coverageRatio.toFixed(3)),
    blind_spots: blindSpots,
    sources,
    domains,
    independence_groups: groups,
    rule: 'Missing or stale telemetry is loss of coverage, not evidence that conditions are normal.'
  };
}

export function coverageToSignal(coverage) {
  const blindSpots = Array.isArray(coverage?.blind_spots) ? coverage.blind_spots : [];
  const degradedDomains = (coverage?.domains || []).filter((row) => row.degraded).map((row) => row.domain);
  const severityHint = blindSpots.length ? 'warning' : 'receipt';

  return {
    schema: 'systemia.signal.v1',
    company: 'Evercraft',
    product: 'Systemia Sentinel',
    source: 'sentinel-source-health',
    kind: 'sensor_coverage',
    component: degradedDomains.length ? degradedDomains.join(',') : 'all-configured-domains',
    status: blindSpots.length ? 'degraded' : 'healthy',
    severity_hint: severityHint,
    evidence_state: 'live_verified',
    impact: blindSpots.length ? 'sensor_coverage_degraded' : 'coverage_healthy',
    created_at: coverage?.evaluated_at || new Date().toISOString(),
    summary: blindSpots.length
      ? String(blindSpots.length) + ' required Sentinel source(s) are unavailable or stale; silence must not be treated as normal.'
      : 'Required Sentinel source coverage is healthy.'
  };
}
