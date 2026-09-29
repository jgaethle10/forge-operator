import { normalizeContextObservation } from './observation-fabric.mjs';

const EVIDENCE_MAP = {
  modeled: 'modeled',
  reported: 'public',
  observed: 'observed',
  verified: 'observed'
};

export function toContextFabricRecord(rawObservation, options = {}) {
  const observation = normalizeContextObservation(rawObservation);
  const visibility = options.visibility || 'internal';
  const sourceRef =
    observation.provenance_refs[0] ||
    `worldstate:${observation.source_system}:${observation.observation_id}`;

  const contextEntity =
    observation.correlation_keys[0] ||
    [observation.region_keys[0] || 'global', observation.domains[0] || 'general', observation.kind].join(':');

  const title =
    observation.summary ||
    `${observation.kind} observation from ${observation.source_family}`;

  return {
    namespace: 'worldstate',
    idempotency_key: `worldstate:${observation.observation_id}`,
    actor_ref: options.actor_ref,
    visibility,
    required_scope: visibility === 'public' ? null : (options.required_scope || 'context.read.worldstate'),
    kind: 'worldstate_observation',
    title: title.slice(0, 300),
    text: JSON.stringify({
      observation_id: observation.observation_id,
      summary: observation.summary,
      source_system: observation.source_system,
      source_family: observation.source_family,
      observed_at: observation.observed_at,
      region_keys: observation.region_keys,
      domains: observation.domains,
      kind: observation.kind,
      worldstate_evidence_state: observation.evidence_state,
      reliability: observation.reliability,
      anomaly_score: observation.anomaly_score,
      provenance_refs: observation.provenance_refs,
      correlation_keys: observation.correlation_keys,
      facts: observation.facts,
      measurements: observation.measurements
    }),
    tags: [
      'worldstate',
      'rockies',
      observation.kind,
      `evidence:${observation.evidence_state}`,
      `source-family:${observation.source_family.toLowerCase()}`,
      ...observation.domains.map((x) => `domain:${x}`),
      ...observation.region_keys.map((x) => `region:${x.toLowerCase()}`)
    ],
    entity_ref: contextEntity,
    predicate: 'worldstate.observation',
    claim_value: {
      observation_id: observation.observation_id,
      worldstate_evidence_state: observation.evidence_state,
      reliability: observation.reliability,
      anomaly_score: observation.anomaly_score
    },
    evidence_state: EVIDENCE_MAP[observation.evidence_state],
    content_trust_state:
      observation.evidence_state === 'verified'
        ? 'verified_external_evidence'
        : observation.evidence_state === 'modeled'
          ? 'derived_summary'
          : 'untrusted_external',
    source_ref: sourceRef,
    observed_at: observation.observed_at
  };
}

export function ingestWorldstateIntoContextFabric({
  fabric,
  observation,
  actor_ref,
  visibility = 'internal',
  required_scope = 'context.read.worldstate'
}) {
  if (!fabric || typeof fabric.ingestRecord !== 'function') {
    throw new TypeError('fabric with ingestRecord is required');
  }
  if (!actor_ref) throw new TypeError('actor_ref is required');

  return fabric.ingestRecord(
    toContextFabricRecord(observation, {
      actor_ref,
      visibility,
      required_scope
    })
  );
}
