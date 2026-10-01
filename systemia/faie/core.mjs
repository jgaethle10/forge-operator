import crypto from 'node:crypto';
import { normalizeContextObservation } from '../worldstate/observation-fabric.mjs';

export const FAIE_RELEVANT_DOMAINS = Object.freeze([
  'agriculture',
  'water',
  'weather',
  'climate',
  'environment',
  'earth_hazards',
  'geophysics',
  'disaster',
  'infrastructure',
  'transport',
  'energy',
  'economy',
  'ocean',
  'space_weather',
  'aviation',
  'maritime',
  'telecom',
  'robotics',
  'semiconductors',
  'industrial',
  'supply_chain',
  'food',
  'science',
  'labor',
  'housing',
  'construction',
  'regulation',
  'public_policy',
  'general'
]);

const DOMAIN_SET = new Set(FAIE_RELEVANT_DOMAINS);
const EVIDENCE_WEIGHT = Object.freeze({
  verified: 1,
  observed: 0.9,
  reported: 0.62,
  modeled: 0.5
});

const DIMENSION_RULES = Object.freeze({
  water: ['water', 'drought', 'river', 'reservoir', 'irrigation', 'aquifer', 'precipitation', 'snowpack', 'flood'],
  heat: ['heat', 'temperature', 'hot', 'heatwave', 'degree day'],
  freeze: ['freeze', 'frost', 'cold', 'snow', 'ice'],
  wildfire_smoke: ['wildfire', 'fire', 'smoke', 'air quality', 'pm2.5'],
  soil: ['soil', 'moisture', 'erosion', 'salinity', 'nutrient'],
  crop_health: ['crop', 'orchard', 'vineyard', 'yield', 'plant', 'vegetation', 'harvest', 'growing'],
  pest_disease: ['pest', 'disease', 'blight', 'fungus', 'insect', 'pathogen'],
  infrastructure: ['infrastructure', 'power', 'grid', 'road', 'bridge', 'canal', 'pump', 'telecom'],
  logistics: ['transport', 'freight', 'port', 'shipping', 'rail', 'truck', 'aviation', 'maritime', 'supply chain'],
  energy: ['energy', 'electricity', 'fuel', 'diesel', 'gas', 'power'],
  labor: ['labor', 'worker', 'workforce', 'employment'],
  economics: ['economy', 'price', 'market', 'cost', 'inflation', 'commodity'],
  policy: ['regulation', 'public_policy', 'permit', 'rule', 'policy'],
  resilience: ['resilience', 'disaster', 'hazard', 'outage', 'disruption']
});

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

function unique(values = [], limit = 500) {
  return [...new Set((Array.isArray(values) ? values : [values]).map(clean).filter(Boolean))].slice(0, limit);
}

function clamp01(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

function stableHash(value) {
  return crypto.createHash('sha256').update(
    typeof value === 'string' ? value : JSON.stringify(value)
  ).digest('hex').slice(0, 24);
}

function iso(value, fallback = new Date().toISOString()) {
  const d = new Date(value || fallback);
  if (!Number.isFinite(d.getTime())) throw new TypeError('timestamp must be valid');
  return d.toISOString();
}

function textCorpus(observation) {
  return [
    observation.summary,
    observation.kind,
    ...(observation.domains || []),
    ...Object.keys(observation.facts || {}),
    ...Object.values(observation.facts || {}).map((value) =>
      typeof value === 'string' || typeof value === 'number' ? String(value) : ''
    )
  ].join(' ').toLowerCase();
}

function classifyDimensions(observation) {
  const corpus = textCorpus(observation);
  const dimensions = [];
  for (const [dimension, terms] of Object.entries(DIMENSION_RULES)) {
    if (terms.some((term) => corpus.includes(term))) dimensions.push(dimension);
  }
  if (!dimensions.length && (observation.domains || []).includes('agriculture')) dimensions.push('crop_health');
  if (!dimensions.length && (observation.domains || []).includes('water')) dimensions.push('water');
  if (!dimensions.length) dimensions.push('resilience');
  return unique(dimensions, 20);
}

function severityFrom(observation) {
  const declared = Number(
    observation.facts?.severity ??
    observation.metadata?.severity ??
    observation.facts?.risk_score
  );
  if (Number.isFinite(declared)) return clamp01(declared);
  return clamp01(observation.anomaly_score, 0.25);
}

function evidenceStateLabel(state) {
  return String(state || 'reported').toUpperCase();
}

function hoursOld(timestamp, now) {
  return Math.max(0, (new Date(now).getTime() - new Date(timestamp).getTime()) / 3600000);
}

function freshnessWeight(observedAt, now) {
  const age = hoursOld(observedAt, now);
  if (age <= 6) return 1;
  if (age <= 24) return 0.92;
  if (age <= 72) return 0.78;
  if (age <= 168) return 0.62;
  if (age <= 720) return 0.45;
  return 0.3;
}

function signalScore(observation, now) {
  const evidence = EVIDENCE_WEIGHT[observation.evidence_state] ?? 0.4;
  const reliability = clamp01(observation.reliability, 0.5);
  const severity = severityFrom(observation);
  const freshness = freshnessWeight(observation.observed_at, now);
  return Number(clamp01(
    (0.28 * evidence) +
    (0.27 * reliability) +
    (0.30 * severity) +
    (0.15 * freshness)
  ).toFixed(3));
}

function signalRelevant(observation) {
  if ((observation.domains || []).some((domain) => DOMAIN_SET.has(domain))) return true;
  const corpus = textCorpus(observation);
  return Object.values(DIMENSION_RULES).flat().some((term) => corpus.includes(term));
}

function normalizeScope(input = {}) {
  const question = clean(input.question || input.query);
  if (!question) throw new TypeError('question is required');
  return {
    question: question.slice(0, 1200),
    region_keys: unique(input.region_keys || input.regions || input.region, 50),
    asset_types: unique(input.asset_types || input.assets, 30),
    crop: clean(input.crop).slice(0, 120),
    water_source: clean(input.water_source).slice(0, 120),
    horizon_days: Math.max(1, Math.min(3650, Number(input.horizon_days) || 90)),
    include_weak_evidence: Boolean(input.include_weak_evidence)
  };
}

function tokenSet(text) {
  return new Set(
    clean(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 3)
      .slice(0, 120)
  );
}

function relevanceScore(signal, scope) {
  const queryTokens = tokenSet([
    scope.question,
    scope.crop,
    scope.water_source,
    ...scope.asset_types,
    ...scope.region_keys
  ].join(' '));
  const signalTokens = tokenSet([
    signal.summary,
    signal.kind,
    ...signal.domains,
    ...signal.dimensions,
    ...signal.region_keys
  ].join(' '));

  let overlap = 0;
  for (const token of queryTokens) if (signalTokens.has(token)) overlap += 1;
  const tokenScore = queryTokens.size ? overlap / Math.min(12, queryTokens.size) : 0;

  const scopeRegions = new Set(scope.region_keys.map((x) => x.toLowerCase()));
  const regionMatch = !scopeRegions.size
    ? 0.25
    : signal.region_keys.some((x) => scopeRegions.has(String(x).toLowerCase()))
      ? 1
      : signal.region_keys.includes('global')
        ? 0.35
        : 0;

  const cropMatch = scope.crop && signal.summary.toLowerCase().includes(scope.crop.toLowerCase()) ? 1 : 0;
  return Number(clamp01((0.55 * tokenScore) + (0.3 * regionMatch) + (0.15 * cropMatch)).toFixed(3));
}

function investigationFinding(signal, relevance) {
  return {
    signal_id: signal.signal_id,
    summary: signal.summary,
    dimensions: signal.dimensions,
    domains: signal.domains,
    region_keys: signal.region_keys,
    observed_at: signal.observed_at,
    evidence_state: signal.evidence_state,
    reliability: signal.reliability,
    severity: signal.severity,
    signal_score: signal.signal_score,
    relevance_score: relevance,
    source_family: signal.source_family,
    provenance_refs: signal.provenance_refs,
    interpretation: 'This is evidence relevant to the scoped question. It is not by itself a causal finding or an instruction to act.'
  };
}

export function emptyFaieState() {
  return {
    schema: 'evercraft.faie.state.v1',
    observations: {},
    signals: {},
    investigations: {},
    receipts: [],
    last_cycle: null
  };
}

export function ingestFaieObservation(inputState, rawObservation, { now = new Date().toISOString() } = {}) {
  const state = structuredClone(inputState || emptyFaieState());
  const observation = normalizeContextObservation(rawObservation);
  const nowIso = iso(now);

  if (!signalRelevant(observation)) {
    return {
      state,
      decision: {
        action: 'ignored',
        reason: 'not_faie_relevant',
        observation_id: observation.observation_id,
        publication_authority: false,
        decision_authority: false
      }
    };
  }

  if (state.observations[observation.observation_id]) {
    return {
      state,
      decision: {
        action: 'deduped',
        observation_id: observation.observation_id,
        signal_id: 'faie:' + stableHash(observation.observation_id),
        publication_authority: false,
        decision_authority: false
      }
    };
  }

  const signal = {
    schema: 'evercraft.faie.signal.v1',
    signal_id: 'faie:' + stableHash(observation.observation_id),
    observation_id: observation.observation_id,
    summary: observation.summary || observation.kind,
    kind: observation.kind,
    domains: [...observation.domains],
    dimensions: classifyDimensions(observation),
    region_keys: [...observation.region_keys],
    source_system: observation.source_system,
    source_family: observation.source_family,
    provenance_refs: [...observation.provenance_refs],
    observed_at: observation.observed_at,
    ingested_at: nowIso,
    evidence_state: evidenceStateLabel(observation.evidence_state),
    worldstate_evidence_state: observation.evidence_state,
    reliability: clamp01(observation.reliability, 0.5),
    anomaly_score: clamp01(observation.anomaly_score, 0),
    severity: severityFrom(observation),
    signal_score: signalScore(observation, nowIso),
    facts: structuredClone(observation.facts || {}),
    measurements: structuredClone(observation.measurements || {}),
    publication_authority: false,
    decision_authority: false
  };

  state.observations[observation.observation_id] = observation;
  state.signals[signal.signal_id] = signal;

  const receipt = {
    schema: 'evercraft.faie.ingest-receipt.v1',
    receipt_id: 'faie-receipt:' + stableHash([signal.signal_id, nowIso]),
    observation_id: observation.observation_id,
    signal_id: signal.signal_id,
    evidence_state: signal.evidence_state,
    signal_score: signal.signal_score,
    created_at: nowIso
  };
  state.receipts = [...(state.receipts || []), receipt].slice(-10000);

  return {
    state,
    decision: {
      action: 'admitted',
      signal,
      receipt,
      publication_authority: false,
      decision_authority: false
    }
  };
}

export function ingestWorldstateDispatch(state, { dispatch, observation } = {}, options = {}) {
  if (!dispatch || dispatch.consumer !== 'faie') {
    return {
      state: structuredClone(state || emptyFaieState()),
      decision: {
        action: 'ignored',
        reason: 'not_faie_consumer',
        publication_authority: false,
        decision_authority: false
      }
    };
  }
  if (!observation) {
    return {
      state: structuredClone(state || emptyFaieState()),
      decision: {
        action: 'held',
        reason: 'observation_missing',
        publication_authority: false,
        decision_authority: false
      }
    };
  }
  return ingestFaieObservation(state, observation, options);
}

export function buildFaieInvestigation(inputState, input, { now = new Date().toISOString() } = {}) {
  const state = structuredClone(inputState || emptyFaieState());
  const scope = normalizeScope(input);
  const nowIso = iso(now);

  const ranked = Object.values(state.signals || {})
    .map((signal) => ({ signal, relevance: relevanceScore(signal, scope) }))
    .filter(({ signal, relevance }) =>
      relevance >= (scope.include_weak_evidence ? 0.08 : 0.16) &&
      (scope.include_weak_evidence || signal.signal_score >= 0.42)
    )
    .sort((a, b) =>
      (b.relevance * b.signal.signal_score) - (a.relevance * a.signal.signal_score) ||
      b.signal.observed_at.localeCompare(a.signal.observed_at)
    )
    .slice(0, 20);

  const findings = ranked.map(({ signal, relevance }) => investigationFinding(signal, relevance));
  const strongFindings = findings.filter((item) =>
    ['VERIFIED', 'OBSERVED'].includes(item.evidence_state) &&
    item.reliability >= 0.7 &&
    item.relevance_score >= 0.2
  );

  const evidenceLedger = findings.map((item) => ({
    signal_id: item.signal_id,
    evidence_state: item.evidence_state,
    source_family: item.source_family,
    provenance_refs: item.provenance_refs,
    observed_at: item.observed_at
  }));

  const sourceFamilies = unique(findings.map((item) => item.source_family), 200);
  const evidenceStates = {};
  for (const item of findings) evidenceStates[item.evidence_state] = (evidenceStates[item.evidence_state] || 0) + 1;

  const averageScore = findings.length
    ? findings.reduce((sum, item) => sum + item.signal_score, 0) / findings.length
    : 0;
  const averageRelevance = findings.length
    ? findings.reduce((sum, item) => sum + item.relevance_score, 0) / findings.length
    : 0;

  const confidence = Number(clamp01(
    0.35 * averageScore +
    0.30 * averageRelevance +
    0.20 * Math.min(1, sourceFamilies.length / 4) +
    0.15 * Math.min(1, strongFindings.length / 3)
  ).toFixed(3));

  const unknowns = [];
  if (!findings.length) unknowns.push('No currently ingested FAIE evidence matched the scope closely enough to support a finding.');
  if (sourceFamilies.length < 2) unknowns.push('Independent source-family corroboration is limited.');
  if (!strongFindings.length) unknowns.push('No high-confidence observed or verified evidence currently clears the strong-evidence gate.');
  if (!scope.region_keys.length) unknowns.push('No explicit region key was provided, so geographic relevance is broader and less precise.');

  const investigationId = 'faie-investigation:' + stableHash([
    scope,
    findings.map((item) => item.signal_id),
    nowIso
  ]);

  const investigation = {
    schema: 'evercraft.faie.investigation.v1',
    investigation_id: investigationId,
    created_at: nowIso,
    scope,
    status: findings.length ? 'evidence_available' : 'insufficient_evidence',
    confidence,
    summary: findings.length
      ? 'FAIE found ' + findings.length + ' relevant evidence signal' + (findings.length === 1 ? '' : 's') +
        ' across ' + sourceFamilies.length + ' independent source famil' + (sourceFamilies.length === 1 ? 'y' : 'ies') + '.'
      : 'FAIE does not currently have enough matching evidence to support a scoped finding.',
    findings,
    evidence_ledger: evidenceLedger,
    coverage: {
      matched_signal_count: findings.length,
      strong_finding_count: strongFindings.length,
      independent_source_family_count: sourceFamilies.length,
      evidence_states: evidenceStates
    },
    unknowns,
    evidence_needed: [
      'More recent observations for the exact scoped geography',
      'Independent corroboration when only one source family is represented',
      'Field, sensor, operator, or official-source evidence when a consequential decision depends on the result'
    ],
    boundaries: [
      'FAIE provides evidence support, not autonomous consequential authority.',
      'Modeled, reported, observed, and verified evidence remain distinct.',
      'Absence of evidence is not evidence of absence.',
      'A correlation or co-occurrence is not a causal claim.'
    ],
    publication_authority: false,
    decision_authority: false
  };

  state.investigations[investigationId] = investigation;
  const receipt = {
    schema: 'evercraft.faie.investigation-receipt.v1',
    receipt_id: 'faie-investigation-receipt:' + stableHash([investigationId, nowIso]),
    investigation_id: investigationId,
    matched_signal_count: findings.length,
    source_family_count: sourceFamilies.length,
    confidence,
    created_at: nowIso
  };
  state.receipts = [...(state.receipts || []), receipt].slice(-10000);

  return { state, investigation, receipt };
}

export function publicFaieSnapshot(inputState, { limit = 50 } = {}) {
  const state = inputState || emptyFaieState();
  const signals = Object.values(state.signals || {})
    .sort((a, b) => b.observed_at.localeCompare(a.observed_at))
    .slice(0, Math.max(1, Math.min(200, Number(limit) || 50)))
    .map((signal) => ({
      signal_id: signal.signal_id,
      summary: signal.summary,
      kind: signal.kind,
      domains: signal.domains,
      dimensions: signal.dimensions,
      region_keys: signal.region_keys,
      source_family: signal.source_family,
      observed_at: signal.observed_at,
      evidence_state: signal.evidence_state,
      reliability: signal.reliability,
      severity: signal.severity,
      signal_score: signal.signal_score,
      publication_authority: false,
      decision_authority: false
    }));

  return {
    schema: 'evercraft.faie.public-snapshot.v1',
    generated_at: new Date().toISOString(),
    signal_count: signals.length,
    signals
  };
}
