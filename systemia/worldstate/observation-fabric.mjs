import fs from 'node:fs';
import crypto from 'node:crypto';

const DEFAULT_SUBSCRIPTIONS = JSON.parse(
  fs.readFileSync(new URL('./subscriptions.json', import.meta.url), 'utf8')
);

const EVIDENCE_STATES = new Set(['modeled', 'reported', 'observed', 'verified']);

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

function unique(values, limit = 500) {
  return [...new Set((values || []).map(clean).filter(Boolean))].slice(0, limit);
}

function clamp01(value, fallback = 0.5) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function stableHash(value) {
  return crypto.createHash('sha256').update(
    typeof value === 'string' ? value : JSON.stringify(value)
  ).digest('hex').slice(0, 24);
}

function requireText(value, name) {
  const out = clean(value);
  if (!out) throw new TypeError(`${name} is required`);
  return out;
}

function timestamp(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('observed_at must be a valid timestamp');
  return date.toISOString();
}

export function normalizeContextObservation(raw = {}) {
  const evidenceState = clean(raw.evidence_state || 'reported').toLowerCase();
  if (!EVIDENCE_STATES.has(evidenceState)) {
    throw new TypeError('evidence_state must be modeled, reported, observed, or verified');
  }

  const sourceSystem = requireText(raw.source_system || raw.source || 'unknown', 'source_system');
  const sourceFamily = requireText(raw.source_family || sourceSystem, 'source_family');
  const regions = unique(raw.region_keys || [raw.region_key || 'global']);
  const domains = unique(raw.domains || [raw.domain || 'general']).map((x) => x.toLowerCase());
  const kind = requireText(raw.kind || 'observation', 'kind').toLowerCase();
  const observedAt = timestamp(raw.observed_at || raw.created_at || new Date().toISOString());
  const provenanceRefs = unique(raw.provenance_refs || [raw.provenance_ref]);
  const correlationKeys = unique(raw.correlation_keys || []);

  const identity = {
    source_system: sourceSystem.toLowerCase(),
    source_family: sourceFamily.toLowerCase(),
    observed_at: observedAt,
    regions,
    domains,
    kind,
    provenance_refs: provenanceRefs
  };

  return {
    schema: 'evercraft.context.observation.v1',
    observation_id: clean(raw.observation_id) || `ctxobs:${stableHash(identity)}`,
    source_system: sourceSystem,
    source_family: sourceFamily,
    observed_at: observedAt,
    region_keys: regions,
    domains,
    kind,
    evidence_state: evidenceState,
    reliability: clamp01(raw.reliability, 0.5),
    anomaly_score: clamp01(raw.anomaly_score, 0),
    summary: clean(raw.summary).slice(0, 1000),
    provenance_refs: provenanceRefs,
    correlation_keys: correlationKeys,
    facts: raw.facts && typeof raw.facts === 'object' ? structuredClone(raw.facts) : {},
    measurements: Array.isArray(raw.measurements) ? structuredClone(raw.measurements) : [],
    metadata: raw.metadata && typeof raw.metadata === 'object' ? structuredClone(raw.metadata) : {}
  };
}

export function emptyContextState() {
  return {
    schema: 'evercraft.context-fabric.state.v1',
    observations: {},
    contexts: {},
    dispatch_queue: []
  };
}

function contextKeysFor(observation) {
  if (observation.correlation_keys.length > 0) return observation.correlation_keys;
  const keys = [];
  for (const region of observation.region_keys) {
    for (const domain of observation.domains) {
      keys.push(`${region.toLowerCase()}::${domain}::${observation.kind}`);
    }
  }
  return unique(keys);
}

function consumersFor(observation, subscriptions = DEFAULT_SUBSCRIPTIONS) {
  const consumers = [...(subscriptions.always || [])];
  for (const domain of observation.domains) {
    consumers.push(...(subscriptions.by_domain?.[domain] || []));
  }
  return unique(consumers, 200);
}

function priorityFor(observation) {
  if (observation.evidence_state === 'verified' && observation.anomaly_score >= 0.8) return 'high';
  if (observation.anomaly_score >= 0.6) return 'normal';
  return 'background';
}

function mergeContext(node, observation) {
  const observationIds = unique([...(node?.observation_ids || []), observation.observation_id], 1000);
  const sourceFamilies = unique([...(node?.source_families || []), observation.source_family], 100);
  const evidenceStates = unique([...(node?.evidence_states || []), observation.evidence_state], 20);
  const provenanceRefs = unique([...(node?.provenance_refs || []), ...observation.provenance_refs], 1000);

  return {
    schema: 'evercraft.context.node.v1',
    context_key: node?.context_key,
    first_seen_at: node?.first_seen_at || observation.observed_at,
    last_seen_at: observation.observed_at,
    latest_observation_id: observation.observation_id,
    observation_ids: observationIds,
    source_families: sourceFamilies,
    evidence_states: evidenceStates,
    provenance_refs: provenanceRefs,
    observation_count: observationIds.length,
    independent_source_family_count: sourceFamilies.length
  };
}

export function ingestContextObservation(inputState, rawObservation, options = {}) {
  const state = structuredClone(inputState || emptyContextState());
  const observation = normalizeContextObservation(rawObservation);

  if (state.observations[observation.observation_id]) {
    return {
      state,
      decision: {
        action: 'deduped',
        duplicate: true,
        observation_id: observation.observation_id,
        context_keys: contextKeysFor(observation),
        consumers: []
      }
    };
  }

  state.observations[observation.observation_id] = observation;
  const contextKeys = contextKeysFor(observation);

  for (const key of contextKeys) {
    const prior = state.contexts[key] || null;
    state.contexts[key] = mergeContext(
      prior ? { ...prior, context_key: key } : { context_key: key },
      observation
    );
  }

  const subscriptions = options.subscriptions || DEFAULT_SUBSCRIPTIONS;
  const consumers = consumersFor(observation, subscriptions);
  const priority = priorityFor(observation);
  const dispatches = consumers.map((consumer) => ({
    schema: 'evercraft.context.dispatch.v1',
    dispatch_key: `ctxdispatch:${stableHash(`${consumer}|${observation.observation_id}`)}`,
    consumer,
    observation_id: observation.observation_id,
    context_keys: contextKeys,
    priority,
    evidence_state: observation.evidence_state,
    provenance_refs: observation.provenance_refs,
    created_at: observation.observed_at
  }));

  const existing = new Set((state.dispatch_queue || []).map((row) => row.dispatch_key));
  for (const dispatch of dispatches) {
    if (!existing.has(dispatch.dispatch_key)) {
      state.dispatch_queue.push(dispatch);
      existing.add(dispatch.dispatch_key);
    }
  }

  return {
    state,
    decision: {
      action: 'propagate',
      duplicate: false,
      observation_id: observation.observation_id,
      context_keys: contextKeys,
      consumers,
      dispatches,
      priority
    }
  };
}

export function contextSnapshot(state, contextKey) {
  const node = state?.contexts?.[contextKey];
  if (!node) return null;
  return {
    ...structuredClone(node),
    observations: node.observation_ids
      .map((id) => state.observations[id])
      .filter(Boolean)
      .map((observation) => structuredClone(observation))
  };
}

export function pendingContextForConsumer(state, consumer) {
  const key = clean(consumer);
  return (state?.dispatch_queue || [])
    .filter((row) => row.consumer === key)
    .map((row) => ({
      ...structuredClone(row),
      observation: structuredClone(state.observations[row.observation_id])
    }));
}
