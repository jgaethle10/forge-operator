import crypto from 'node:crypto';
import { normalizeContextObservation } from '../worldstate/observation-fabric.mjs';
import { buildPropagationCandidates } from './correlation.mjs';

export const TRUTH_STATES = Object.freeze([
  'OBSERVED',
  'CORROBORATED',
  'REPORTED',
  'CONTESTED',
  'INFERRED',
  'PENDING',
  'CLOSED',
  'UNKNOWN'
]);

export const CHANGE_STATES = Object.freeze([
  'NEW',
  'INTENSIFIED',
  'WEAKENED',
  'CORROBORATED',
  'CONTESTED',
  'ROLLED_OFF',
  'CLOSED',
  'UNCHANGED'
]);

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const clamp01 = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
};
const unique = (values = []) => [...new Set((Array.isArray(values) ? values : [values]).map(clean).filter(Boolean))];
const hash = (value) => crypto.createHash('sha256').update(
  typeof value === 'string' ? value : JSON.stringify(value)
).digest('hex').slice(0, 24);

const POLITICAL_DOMAINS = new Set(['politics', 'government', 'public_policy', 'regulation', 'elections']);
const FAST_DOMAINS = new Set(['weather', 'aviation', 'space_weather', 'earth_hazards', 'geophysics', 'maritime']);

function iso(value, field = 'timestamp') {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) throw new TypeError(`${field} must be a valid timestamp`);
  return d.toISOString();
}

function politicalObservation(observation) {
  return (observation.domains || []).some((domain) => POLITICAL_DOMAINS.has(String(domain).toLowerCase()));
}

function lifecycle(observation) {
  return clean(
    observation.facts?.lifecycle ||
    observation.facts?.status ||
    observation.metadata?.lifecycle ||
    observation.metadata?.status
  ).toLowerCase();
}

function isForecast(observation) {
  const kind = clean(observation.kind).toLowerCase();
  return Boolean(
    observation.facts?.forecast === true ||
    observation.metadata?.forecast === true ||
    /forecast|watch|outlook|projection|predicted/.test(kind)
  );
}

function sourceFamilyCount(streamObservations) {
  return new Set(streamObservations.map((row) => clean(row.source_family).toLowerCase()).filter(Boolean)).size;
}

function subjectKey(observation) {
  const explicit = clean(
    observation.metadata?.radar_subject_key ||
    observation.facts?.subject_key ||
    observation.correlation_keys?.[0]
  );
  if (explicit) return explicit.toLowerCase();

  const regions = unique(observation.region_keys).map((x) => x.toLowerCase()).sort();
  const domains = unique(observation.domains).map((x) => x.toLowerCase()).sort();
  const subject = clean(observation.facts?.subject || observation.metadata?.subject).toLowerCase();
  return [regions.join(','), domains.join(','), observation.kind, subject].filter(Boolean).join('|');
}

function truthStateFor(observation, streamObservations) {
  const life = lifecycle(observation);
  if (['closed', 'resolved', 'ended', 'expired', 'cancelled', 'canceled'].includes(life)) return 'CLOSED';
  if (observation.facts?.contested === true || observation.metadata?.contested === true) return 'CONTESTED';

  if (politicalObservation(observation)) {
    const claimType = clean(observation.facts?.claim_type || observation.metadata?.claim_type).toLowerCase();
    if (['statement', 'rhetoric', 'promise', 'position', 'claim'].includes(claimType)) return 'REPORTED';
    if (['forecast', 'predicted_effect', 'projected_outcome'].includes(claimType)) return 'PENDING';
  }

  if (isForecast(observation)) return 'PENDING';

  if (observation.evidence_state === 'modeled') return 'INFERRED';
  if (observation.evidence_state === 'reported') return 'REPORTED';

  const families = sourceFamilyCount(streamObservations);
  if (families >= 2 && ['observed', 'verified'].includes(observation.evidence_state)) {
    return 'CORROBORATED';
  }
  if (['observed', 'verified'].includes(observation.evidence_state)) return 'OBSERVED';
  return 'UNKNOWN';
}

function changeStateFor(previous, current) {
  if (!previous) return 'NEW';
  if (current.truth_state === 'CLOSED') return 'CLOSED';
  if (current.truth_state === 'CONTESTED' && previous.truth_state !== 'CONTESTED') return 'CONTESTED';
  if (current.truth_state === 'CORROBORATED' && previous.truth_state !== 'CORROBORATED') return 'CORROBORATED';

  const anomalyDelta = current.anomaly_score - previous.anomaly_score;
  if (anomalyDelta >= 0.15) return 'INTENSIFIED';
  if (anomalyDelta <= -0.15) return 'WEAKENED';

  const latestLife = lifecycle(current.observation);
  const previousLife = lifecycle(previous.observation);
  if (latestLife && latestLife !== previousLife && ['closed', 'resolved', 'ended', 'expired'].includes(latestLife)) {
    return 'CLOSED';
  }
  return 'UNCHANGED';
}

function freshnessFor(observation, now) {
  const observed = new Date(observation.observed_at).getTime();
  const at = new Date(now).getTime();
  const ageMs = Math.max(0, at - observed);

  let maxAgeHours = 24;
  if ((observation.domains || []).some((domain) => FAST_DOMAINS.has(String(domain).toLowerCase()))) maxAgeHours = 6;
  if (politicalObservation(observation)) maxAgeHours = 72;
  if (observation.facts?.durable_record === true) maxAgeHours = 24 * 30;

  return {
    age_ms: ageMs,
    max_age_hours: maxAgeHours,
    state: ageMs <= maxAgeHours * 60 * 60 * 1000 ? 'fresh' : 'stale'
  };
}

function adversarialReview(observation, truthState, streamObservations, now) {
  const blockers = [];
  const warnings = [];
  const freshness = freshnessFor(observation, now);
  const families = sourceFamilyCount(streamObservations);

  if (!(observation.provenance_refs || []).length) blockers.push('source_lineage_missing');
  if (freshness.state === 'stale' && observation.facts?.durable_record !== true) blockers.push('stale_source_state');

  if (observation.evidence_state === 'modeled' && ['OBSERVED', 'CORROBORATED'].includes(truthState)) {
    blockers.push('modeled_promoted_to_observed');
  }

  if (isForecast(observation) && ['OBSERVED', 'CORROBORATED'].includes(truthState)) {
    blockers.push('forecast_promoted_to_outcome');
  }

  if (politicalObservation(observation)) {
    const claimType = clean(observation.facts?.claim_type || observation.metadata?.claim_type).toLowerCase();
    if (['statement', 'rhetoric', 'promise', 'position', 'claim'].includes(claimType) && truthState !== 'REPORTED') {
      blockers.push('political_statement_promoted_beyond_reported');
    }
  }

  const causal = clean(observation.facts?.causal_state || observation.metadata?.causal_state).toLowerCase();
  if (['claimed', 'suspected', 'single_source'].includes(causal) && families < 2) {
    warnings.push('causal_claim_not_independently_corroborated');
  }

  if (truthState === 'UNKNOWN') warnings.push('truth_state_unknown');

  return {
    status: blockers.length ? 'hold' : 'pass',
    blockers,
    warnings,
    freshness,
    independent_source_families: families
  };
}

function materialityFor(signal) {
  const truthWeight = {
    UNKNOWN: 0.05,
    INFERRED: 0.15,
    REPORTED: 0.28,
    PENDING: 0.3,
    CONTESTED: 0.42,
    OBSERVED: 0.62,
    CORROBORATED: 0.82,
    CLOSED: 0.35
  }[signal.truth_state] ?? 0.05;

  const changeWeight = {
    NEW: 0.85,
    INTENSIFIED: 1,
    WEAKENED: 0.72,
    CORROBORATED: 0.82,
    CONTESTED: 0.72,
    ROLLED_OFF: 0.42,
    CLOSED: 0.55,
    UNCHANGED: 0.1
  }[signal.change_state] ?? 0.1;

  const domainSpread = clamp01((signal.domains?.length || 1) / 4, 0.25);
  const sourceSpread = clamp01(signal.review.independent_source_families / 3, 0.33);

  return Number(clamp01(
    0.27 * signal.anomaly_score +
    0.20 * signal.reliability +
    0.18 * truthWeight +
    0.15 * changeWeight +
    0.10 * domainSpread +
    0.10 * sourceSpread
  ).toFixed(3));
}

export function emptyRadarState() {
  return {
    schema: 'evercraft.systemia-radar.state.v1',
    observations: {},
    streams: {},
    receipts: [],
    last_edition: null
  };
}

export function ingestRadarObservation(inputState, rawObservation, { now = new Date().toISOString() } = {}) {
  const state = structuredClone(inputState || emptyRadarState());
  const observation = normalizeContextObservation(rawObservation);
  const nowIso = iso(now, 'now');

  if (state.observations[observation.observation_id]) {
    return {
      state,
      decision: {
        action: 'deduped',
        observation_id: observation.observation_id,
        publication_authority: false
      }
    };
  }

  const key = subjectKey(observation);
  const priorStream = state.streams[key] || {
    subject_key: key,
    observation_ids: [],
    current: null
  };
  const priorSignal = priorStream.current || null;
  const streamObservations = [
    ...priorStream.observation_ids.map((id) => state.observations[id]).filter(Boolean),
    observation
  ];

  const truthState = truthStateFor(observation, streamObservations);
  const review = adversarialReview(observation, truthState, streamObservations, nowIso);
  const signal = {
    schema: 'evercraft.systemia-radar.signal.v1',
    signal_id: `radar:${hash(key)}`,
    subject_key: key,
    observation_id: observation.observation_id,
    observed_at: observation.observed_at,
    last_verified_at: nowIso,
    domains: [...observation.domains],
    region_keys: [...observation.region_keys],
    correlation_keys: [...observation.correlation_keys],
    kind: observation.kind,
    summary: observation.summary,
    source_family: observation.source_family,
    provenance_refs: [...observation.provenance_refs],
    reliability: observation.reliability,
    anomaly_score: observation.anomaly_score,
    truth_state: truthState,
    change_state: 'UNCHANGED',
    review,
    observation
  };

  signal.change_state = changeStateFor(priorSignal, signal);
  signal.materiality_score = materialityFor(signal);
  signal.publication_state = review.status === 'pass' ? 'eligible_for_editorial_selection' : 'held';

  state.observations[observation.observation_id] = observation;
  state.streams[key] = {
    subject_key: key,
    observation_ids: [...priorStream.observation_ids, observation.observation_id].slice(-200),
    current: signal
  };

  const receipt = {
    schema: 'evercraft.systemia-radar.ingest-receipt.v1',
    receipt_id: `radar-receipt:${hash([observation.observation_id, nowIso])}`,
    observation_id: observation.observation_id,
    signal_id: signal.signal_id,
    truth_state: signal.truth_state,
    change_state: signal.change_state,
    materiality_score: signal.materiality_score,
    review_status: review.status,
    created_at: nowIso
  };
  state.receipts = [...(state.receipts || []), receipt].slice(-5000);

  return {
    state,
    decision: {
      action: review.status === 'pass' ? 'admitted' : 'held',
      signal,
      receipt,
      publication_authority: false
    }
  };
}

export function ingestWorldstateDispatch(state, { dispatch, observation } = {}, options = {}) {
  if (!dispatch || dispatch.consumer !== 'systemia_radar') {
    return {
      state: structuredClone(state || emptyRadarState()),
      decision: { action: 'ignored', reason: 'not_radar_consumer', publication_authority: false }
    };
  }
  if (!observation) {
    return {
      state: structuredClone(state || emptyRadarState()),
      decision: { action: 'held', reason: 'observation_missing', publication_authority: false }
    };
  }
  return ingestRadarObservation(state, observation, options);
}

export function compileRadarEdition(inputState, {
  now = new Date().toISOString(),
  materiality_threshold = 0.58,
  max_signals = 8
} = {}) {
  const state = structuredClone(inputState || emptyRadarState());
  const nowIso = iso(now, 'now');
  const priorEdition = state.last_edition || null;
  const priorEmissions = new Map(
    (priorEdition?.signals || []).map((signal) => [
      signal.signal_id,
      `${signal.observation_id || ''}::${signal.change_state || ''}`
    ])
  );

  const currentSignals = Object.values(state.streams || {})
    .map((stream) => stream.current)
    .filter(Boolean)
    .map((signal) => {
      const maxAgeHours = Number(signal.review?.freshness?.max_age_hours || 24);
      const ageMs = Math.max(0, new Date(nowIso).getTime() - new Date(signal.observed_at).getTime());
      const freshnessState = ageMs <= maxAgeHours * 60 * 60 * 1000 ? 'fresh' : 'stale';
      return {
        ...signal,
        review: {
          ...signal.review,
          freshness: {
            ...(signal.review?.freshness || {}),
            age_ms: ageMs,
            max_age_hours: maxAgeHours,
            state: freshnessState
          }
        }
      };
    });

  const candidates = currentSignals
    .filter((signal) => signal.review?.status === 'pass')
    .filter((signal) => signal.review?.freshness?.state === 'fresh')
    .filter((signal) => signal.change_state !== 'UNCHANGED')
    .filter((signal) => signal.materiality_score >= materiality_threshold)
    .filter((signal) => {
      const priorKey = priorEmissions.get(signal.signal_id);
      const currentKey = `${signal.observation_id || ''}::${signal.change_state || ''}`;
      return priorKey !== currentKey;
    })
    .sort((a, b) =>
      b.materiality_score - a.materiality_score ||
      b.observed_at.localeCompare(a.observed_at)
    )
    .slice(0, Math.max(1, Math.min(25, Number(max_signals) || 8)));

  const candidateSignalIds = new Set(candidates.map((signal) => signal.signal_id));
  const streamBySignalId = new Map(
    currentSignals.map((signal) => [signal.signal_id, signal])
  );
  const rolloffs = (priorEdition?.signals || [])
    .map((previous) => ({
      previous,
      current: streamBySignalId.get(previous.signal_id) || null
    }))
    .filter(({ previous }) => !candidateSignalIds.has(previous.signal_id))
    .filter(({ current }) =>
      !current ||
      current.truth_state === 'CLOSED' ||
      current.review?.freshness?.state === 'stale'
    )
    .map(({ previous, current }) => ({
      signal_id: previous.signal_id,
      subject_key: previous.subject_key,
      observation_id: current?.observation_id || previous.observation_id || null,
      change_state: current?.truth_state === 'CLOSED' ? 'CLOSED' : 'ROLLED_OFF',
      truth_state: current?.truth_state || previous.truth_state,
      summary: current?.summary || previous.summary,
      materiality_score: current?.materiality_score ?? previous.materiality_score,
      observed_at: current?.observed_at || previous.observed_at,
      last_verified_at: nowIso,
      domains: current?.domains || previous.domains || [],
      region_keys: current?.region_keys || previous.region_keys || [],
      correlation_keys: current?.correlation_keys || previous.correlation_keys || [],
      source_family: current?.source_family || previous.source_family || null,
      provenance_refs: current?.provenance_refs || previous.provenance_refs || [],
      review: current?.review || previous.review || {}
    }));

  const activeSignals = candidates.map((signal) => ({
    signal_id: signal.signal_id,
    subject_key: signal.subject_key,
    observation_id: signal.observation_id,
    summary: signal.summary,
    truth_state: signal.truth_state,
    change_state: signal.change_state,
    materiality_score: signal.materiality_score,
    observed_at: signal.observed_at,
    last_verified_at: signal.last_verified_at,
    domains: signal.domains,
    region_keys: signal.region_keys,
    correlation_keys: signal.correlation_keys || [],
    kind: signal.kind,
    source_family: signal.source_family,
    provenance_refs: signal.provenance_refs,
    review: signal.review
  }));

  const propagationCandidates = buildPropagationCandidates(activeSignals);
  const sourceFamilies = [...new Set(activeSignals.map((row) => row.source_family))];
  const domains = [...new Set(activeSignals.flatMap((row) => row.domains || []))];
  const changeWall = [
    ...activeSignals.map((signal) => ({
      signal_id: signal.signal_id,
      change_state: signal.change_state,
      truth_state: signal.truth_state,
      summary: signal.summary,
      materiality_score: signal.materiality_score
    })),
    ...rolloffs.map((signal) => ({
      signal_id: signal.signal_id,
      change_state: signal.change_state,
      truth_state: signal.truth_state,
      summary: signal.summary,
      materiality_score: signal.materiality_score
    }))
  ];

  const edition = {
    schema: 'evercraft.systemia-radar.edition.v1',
    edition_id: `radar-edition:${hash({
      at: nowIso,
      signals: activeSignals.map((row) => [row.signal_id, row.observation_id]),
      rolloffs: rolloffs.map((row) => [row.signal_id, row.change_state])
    })}`,
    generated_at: nowIso,
    title: 'Systemia Radar',
    tagline: 'Reality Before Narrative',
    status: activeSignals.length || rolloffs.length ? 'editorial_candidate' : 'quiet',
    publication_authority: false,
    materiality_threshold,
    signal_count: activeSignals.length,
    rolled_off_count: rolloffs.filter((row) => row.change_state === 'ROLLED_OFF').length,
    closed_count: rolloffs.filter((row) => row.change_state === 'CLOSED').length,
    independent_source_families: sourceFamilies.length,
    domains,
    signals: activeSignals,
    change_wall: changeWall,
    rolled_off_signals: rolloffs,
    propagation_candidates: propagationCandidates,
    evidence_ledger: activeSignals.map((signal) => ({
      signal_id: signal.signal_id,
      evidence_state: signal.truth_state,
      source_family: signal.source_family,
      provenance_refs: signal.provenance_refs,
      observed_at: signal.observed_at,
      last_verified_at: signal.last_verified_at,
      freshness_state: signal.review.freshness.state,
      adversarial_warnings: signal.review.warnings
    })),
    next_gate: activeSignals.length || rolloffs.length ? 'radar_editorial_compiler' : null,
    rule: 'A Radar edition is a timestamped evidence state, not a permanent description of reality.'
  };

  state.last_edition = edition;
  return { state, edition };
}

export function publicRadarProjection(edition) {
  if (!edition) {
    return {
      schema: 'evercraft.systemia-radar.public.v1',
      status: 'no_edition',
      publication_authority: false,
      signals: [],
      change_wall: []
    };
  }

  return {
    schema: 'evercraft.systemia-radar.public.v1',
    edition_id: edition.edition_id,
    generated_at: edition.generated_at,
    title: edition.title,
    tagline: edition.tagline,
    status: edition.status,
    signal_count: edition.signal_count,
    domains: edition.domains,
    independent_source_families: edition.independent_source_families,
    signals: (edition.signals || []).map((signal) => ({
      signal_id: signal.signal_id,
      summary: signal.summary,
      truth_state: signal.truth_state,
      change_state: signal.change_state,
      materiality_score: signal.materiality_score,
      observed_at: signal.observed_at,
      last_verified_at: signal.last_verified_at,
      domains: signal.domains,
      region_keys: signal.region_keys,
      source_family: signal.source_family,
      freshness_state: signal.review?.freshness?.state || 'unknown'
    })),
    change_wall: edition.change_wall || [],
    propagation_candidates: (edition.propagation_candidates || []).map((candidate) => ({
      propagation_id: candidate.propagation_id,
      relationship_state: candidate.relationship_state,
      truth_state: candidate.truth_state,
      causal_claim: candidate.causal_claim,
      signal_ids: candidate.signal_ids,
      domains: candidate.domains,
      region_keys: candidate.region_keys,
      independent_source_families: candidate.independent_source_families,
      explanation: candidate.explanation
    })),
    rolled_off_count: edition.rolled_off_count || 0,
    closed_count: edition.closed_count || 0,
    publication_authority: false,
    rule: edition.rule
  };
}
