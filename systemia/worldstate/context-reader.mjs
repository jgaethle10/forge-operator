import { normalizeContextObservation } from './observation-fabric.mjs';
import { normalizeWorldstateScope, projectWorldstate, realityDelta } from './worldstate.mjs';

const clean = (value) => String(value ?? '').trim();

function queryForScope(scope) {
  const terms = [
    ...scope.region_keys,
    ...scope.domains,
    ...scope.assets,
    ...scope.facilities,
    ...scope.routes,
    ...scope.dependencies,
    ...scope.industries,
    ...scope.topics
  ].map(clean).filter(Boolean);

  return terms.length ? [...new Set(terms)].join(' ') : 'worldstate';
}

export function readAuthorizedObservationState({
  fabric,
  scope: scopeInput,
  actor_ref,
  at = new Date().toISOString(),
  max_results = 100
} = {}) {
  if (!fabric || typeof fabric.query !== 'function' || typeof fabric.getRecord !== 'function') {
    throw new TypeError('Passport-aware Context Fabric instance is required');
  }
  if (!clean(actor_ref)) throw new TypeError('actor_ref is required');

  const scope = normalizeWorldstateScope(scopeInput);
  const packet = fabric.query({
    query: queryForScope(scope),
    actor_ref,
    namespaces: ['worldstate'],
    max_results: Math.max(1, Math.min(100, Number(max_results || 100))),
    max_chars: 50000,
    at
  });

  const observations = {};
  const rejected_records = [];

  for (const result of packet.results || []) {
    const record = fabric.getRecord(result.record_id, { actor_ref, at });
    if (!record) continue;

    try {
      const payload = JSON.parse(record.text);
      const observation = normalizeContextObservation({
        ...payload,
        evidence_state:
          payload.worldstate_evidence_state ||
          payload.evidence_state ||
          record.claim_value?.worldstate_evidence_state ||
          'reported',
        provenance_refs:
          payload.provenance_refs?.length
            ? payload.provenance_refs
            : [record.source_ref].filter(Boolean)
      });
      observations[observation.observation_id] = observation;
    } catch {
      rejected_records.push({
        record_id: record.record_id,
        reason: 'invalid_worldstate_observation_payload'
      });
    }
  }

  return {
    schema: 'evercraft.worldstate.authorized-observation-state.v1',
    scope,
    actor_ref,
    queried_at: at,
    context_packet_receipt: packet.receipt_hash || null,
    authorized_record_count: packet.result_count || 0,
    usable_observation_count: Object.keys(observations).length,
    rejected_records,
    state: {
      schema: 'evercraft.context-fabric.state.v1',
      observations,
      contexts: {},
      dispatch_queue: []
    }
  };
}

export function worldstateSnapshotFromContextFabric({
  fabric,
  scope,
  actor_ref,
  at = new Date().toISOString(),
  max_results = 100
} = {}) {
  const authorized = readAuthorizedObservationState({
    fabric,
    scope,
    actor_ref,
    at,
    max_results
  });

  const snapshot = projectWorldstate(authorized.state, authorized.scope, { as_of: at });

  return {
    ...snapshot,
    authority: {
      actor_ref,
      context_packet_receipt: authorized.context_packet_receipt,
      authorized_record_count: authorized.authorized_record_count,
      usable_observation_count: authorized.usable_observation_count,
      rejected_record_count: authorized.rejected_records.length
    }
  };
}

export function realityDeltaFromContextFabric({
  fabric,
  previous_snapshot,
  scope,
  actor_ref,
  at = new Date().toISOString(),
  max_results = 100,
  materiality_threshold
} = {}) {
  const current_snapshot = worldstateSnapshotFromContextFabric({
    fabric,
    scope,
    actor_ref,
    at,
    max_results
  });

  return {
    current_snapshot,
    delta: realityDelta(previous_snapshot, current_snapshot, {
      materiality_threshold
    })
  };
}
