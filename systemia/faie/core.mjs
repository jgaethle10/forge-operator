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
  'public_policy'
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

function corpusHasTerm(corpus, term) {
  const normalize = (value) => String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const haystack = normalize(corpus);
  const candidate = normalize(term);
  if (!candidate) return false;
  return (' ' + haystack + ' ').includes(' ' + candidate + ' ');
}

function classifyDimensions(observation) {
  const corpus = textCorpus(observation);
  const dimensions = [];
  for (const [dimension, terms] of Object.entries(DIMENSION_RULES)) {
    if (terms.some((term) => corpusHasTerm(corpus, term))) dimensions.push(dimension);
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
  return Object.values(DIMENSION_RULES).flat().some((term) => corpusHasTerm(corpus, term));
}

function normalizeThesisAssumptions(value) {
  const rows = Array.isArray(value) ? value : [];
  const normalized = [];
  const seen = new Set();

  for (const row of rows.slice(0, 40)) {
    const statement = clean(typeof row === 'string' ? row : row?.statement).slice(0, 500);
    if (!statement) continue;
    const assumptionId = clean(typeof row === 'object' ? row?.assumption_id : '') ||
      ('faie-assumption:' + stableHash(statement.toLowerCase()));
    if (seen.has(assumptionId)) continue;
    seen.add(assumptionId);
    normalized.push({
      assumption_id: assumptionId,
      statement,
      criticality: clean(typeof row === 'object' ? row?.criticality : '').slice(0, 40) || 'material'
    });
  }
  return normalized;
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
    thesis_assumptions: normalizeThesisAssumptions(input.thesis_assumptions || input.assumptions),
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

function expectedDimensionsForScope(scope) {
  const corpus = [
    scope.question,
    scope.crop,
    scope.water_source,
    ...(scope.asset_types || [])
  ].join(' ').toLowerCase();

  const expected = new Set();
  const includesAny = (terms) => terms.some((term) => corpus.includes(term));
  const add = (...dimensions) => dimensions.forEach((dimension) => expected.add(dimension));

  if (includesAny(['greenhouse', 'controlled environment', 'controlled-environment', 'hydroponic', 'indoor farm', 'cea'])) {
    add('water', 'heat', 'energy', 'infrastructure', 'logistics', 'labor', 'crop_health', 'resilience');
  }

  if (includesAny(['food infrastructure', 'regional production', 'regional food', 'native soil', 'living soil', 'sunlight', 'natural light', 'food sovereignty', 'domestic food', 'site selection', 'production campus'])) {
    add('water', 'heat', 'soil', 'energy', 'infrastructure', 'logistics', 'labor', 'economics', 'policy', 'crop_health', 'resilience');
  }

  if (scope.crop) add('crop_health');
  if (scope.water_source || includesAny(['water', 'irrigation', 'aquifer', 'well', 'river', 'reservoir'])) add('water');
  if (includesAny(['heat', 'temperature', 'cooling', 'hvac'])) add('heat');
  if (includesAny(['power', 'electricity', 'energy', 'utility', 'tariff'])) add('energy');
  if (includesAny(['road', 'freight', 'shipping', 'logistics', 'distribution'])) add('logistics');
  if (includesAny(['labor', 'worker', 'workforce', 'staffing'])) add('labor');
  if (includesAny(['infrastructure', 'interconnection', 'service capacity', 'transformer'])) add('infrastructure');

  return [...expected];
}

function evidenceNeedForDimension(dimension) {
  const needs = {
    water: 'Site-specific water source, allocation, reliability, quality, and current operating constraints',
    heat: 'Site-level temperature, solar-load, humidity, cooling-load, and extreme-heat evidence',
    energy: 'Serving-utility tariff, demand charges, outage history, and site electrical capacity',
    infrastructure: 'Site utility, road, communications, drainage, and interconnection constraints',
    logistics: 'Inbound and outbound freight access, cold-chain needs, and market-distance evidence',
    labor: 'Local labor availability, wage pressure, seasonality, and critical-skill constraints',
    crop_health: 'Crop-specific production, yield, quality, pest, disease, and environmental-control evidence',
    resilience: 'Continuity evidence for outages, water interruption, smoke, heat, freeze, and other credible disruptions',
    soil: 'Site-specific soil series, texture, organic matter, drainage, salinity, contamination, biology, and amendment constraints',
    economics: 'Regional land, construction, operating-input, crop-margin, insurance, and distribution-cost evidence',
    policy: 'Zoning, water rights, permitting, food-safety, labor, incentive, grant, and other regulatory constraints relevant to development'
  };
  return needs[dimension] || `Additional current evidence for the ${dimension} dimension`;
}

function buildAssumptionRegister(scope, findings, nowIso) {
  return (scope.thesis_assumptions || []).map((assumption) => {
    const assumptionTokens = tokenSet(assumption.statement);
    const related = findings
      .map((finding) => {
        const findingTokens = tokenSet([
          finding.summary,
          ...(finding.dimensions || []),
          ...(finding.domains || [])
        ].join(' '));
        let overlap = 0;
        for (const token of assumptionTokens) if (findingTokens.has(token)) overlap += 1;
        const relation = assumptionTokens.size ? overlap / Math.min(10, assumptionTokens.size) : 0;
        return { finding, relation };
      })
      .filter((row) => row.relation >= 0.12)
      .sort((a, b) => b.relation - a.relation)
      .slice(0, 8);

    const stateCounts = {};
    for (const row of related) {
      const state = row.finding.evidence_state || 'UNKNOWN';
      stateCounts[state] = (stateCounts[state] || 0) + 1;
    }

    return {
      schema: 'evercraft.faie.thesis-assumption.v1',
      assumption_id: assumption.assumption_id,
      statement: assumption.statement,
      criticality: assumption.criticality,
      evaluation_state: related.length ? 'related_evidence_present' : 'unknown',
      related_signal_ids: related.map((row) => row.finding.signal_id),
      related_evidence_count: related.length,
      evidence_states: stateCounts,
      last_evaluated_at: nowIso,
      verdict_authority: false,
      note: related.length
        ? 'FAIE found evidence related to this assumption. Related evidence is not itself proof that the assumption is true or false.'
        : 'FAIE does not currently hold enough related evidence to evaluate this assumption.'
    };
  });
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
    comparisons: {},
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

  const horizonCutoffMs = new Date(nowIso).getTime() - scope.horizon_days * 24 * 60 * 60 * 1000;
  const ranked = Object.values(state.signals || {})
    .filter((signal) => {
      const observedMs = new Date(signal.observed_at).getTime();
      return Number.isFinite(observedMs) && observedMs >= horizonCutoffMs;
    })
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

  const coveredDimensions = unique(findings.flatMap((item) => item.dimensions || []), 50);
  const expectedDimensions = expectedDimensionsForScope(scope);
  const coveredDimensionSet = new Set(coveredDimensions);
  const missingDimensions = expectedDimensions.filter((dimension) => !coveredDimensionSet.has(dimension));

  const unknowns = [];
  if (!findings.length) unknowns.push('No currently ingested FAIE evidence matched the scope closely enough to support a finding.');
  if (sourceFamilies.length < 2) unknowns.push('Independent source-family corroboration is limited.');
  if (!strongFindings.length) unknowns.push('No high-confidence observed or verified evidence currently clears the strong-evidence gate.');
  if (!scope.region_keys.length) unknowns.push('No explicit region key was provided, so geographic relevance is broader and less precise.');
  if (missingDimensions.length) {
    unknowns.push('Scoped decision coverage is incomplete. Missing evidence dimensions: ' + missingDimensions.join(', ') + '.');
  }

  const evidenceNeeded = unique([
    ...missingDimensions.map(evidenceNeedForDimension),
    'More recent observations for the exact scoped geography',
    ...(sourceFamilies.length < 2 ? ['Independent corroboration from a separate source family'] : []),
    'Field, sensor, operator, or official-source evidence when a consequential decision depends on the result'
  ], 30);

  const evidenceAcquisitionQueue = [
    ...missingDimensions.map((dimension) => ({
      acquisition_id: 'faie-acquisition:' + stableHash([scope.question, dimension, 'dimension_gap']),
      dimension,
      priority: 'P0',
      state: 'OPEN',
      request: evidenceNeedForDimension(dimension),
      preferred_evidence: ['official_source', 'field_measurement', 'operator_authorized_record'],
      external_action_taken: false,
      human_or_separate_authority_required: true
    })),
    {
      acquisition_id: 'faie-acquisition:' + stableHash([scope.question, 'geography_freshness']),
      dimension: 'geography_freshness',
      priority: findings.length ? 'P1' : 'P0',
      state: 'OPEN',
      request: 'Acquire more recent observations for the exact scoped geography.',
      preferred_evidence: ['official_source', 'sensor', 'field_measurement'],
      external_action_taken: false,
      human_or_separate_authority_required: true
    },
    ...(sourceFamilies.length < 2 ? [{
      acquisition_id: 'faie-acquisition:' + stableHash([scope.question, 'independent_corroboration']),
      dimension: 'independent_corroboration',
      priority: 'P0',
      state: 'OPEN',
      request: 'Acquire independent corroboration from a separate source family.',
      preferred_evidence: ['official_source', 'independent_observation', 'operator_authorized_record'],
      external_action_taken: false,
      human_or_separate_authority_required: true
    }] : [])
  ];

  const decisionReadiness = findings.length &&
    !missingDimensions.length &&
    sourceFamilies.length >= 2 &&
    strongFindings.length
      ? 'review_ready'
      : 'evidence_gaps';

  const thesisAssumptionRegister = buildAssumptionRegister(scope, findings, nowIso);

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
      horizon_days: scope.horizon_days,
      horizon_start: new Date(horizonCutoffMs).toISOString(),
      matched_signal_count: findings.length,
      strong_finding_count: strongFindings.length,
      independent_source_family_count: sourceFamilies.length,
      evidence_states: evidenceStates,
      expected_dimensions: expectedDimensions,
      covered_dimensions: coveredDimensions,
      missing_dimensions: missingDimensions,
      decision_readiness: decisionReadiness
    },
    decision_packet: {
      framework: 'SENSE_CHALLENGE_DECIDE',
      sense: {
        finding_count: findings.length,
        covered_dimensions: coveredDimensions,
        strongest_findings: findings.slice(0, 5).map((item) => ({
          signal_id: item.signal_id,
          summary: item.summary,
          evidence_state: item.evidence_state,
          source_family: item.source_family,
          relevance_score: item.relevance_score,
          signal_score: item.signal_score
        }))
      },
      challenge: {
        unknowns: [...unknowns],
        missing_dimensions: missingDimensions,
        independent_source_family_count: sourceFamilies.length,
        strong_finding_count: strongFindings.length
      },
      decide: {
        readiness: decisionReadiness,
        next_evidence: evidenceNeeded,
        evidence_acquisition_queue: evidenceAcquisitionQueue,
        human_review_required: true,
        action_authority: false
      }
    },
    thesis_memory: {
      schema: 'evercraft.faie.thesis-memory.v1',
      assumption_count: thesisAssumptionRegister.length,
      assumptions: thesisAssumptionRegister,
      longitudinal_comparison_ready: thesisAssumptionRegister.length > 0,
      verdict_authority: false
    },
    unknowns,
    evidence_needed: evidenceNeeded,
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

export function buildFaieComparison(inputState, input = {}, { now = new Date().toISOString() } = {}) {
  const question = clean(input.question || input.query);
  if (!question) throw new TypeError('question is required');

  const candidates = Array.isArray(input.candidates) ? input.candidates.slice(0, 8) : [];
  if (candidates.length < 2) throw new TypeError('at least two comparison candidates are required');

  let state = structuredClone(inputState || emptyFaieState());
  const nowIso = iso(now);
  const rows = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index] || {};
    const label = clean(candidate.label || candidate.name || ('Candidate ' + (index + 1))).slice(0, 160);
    const result = buildFaieInvestigation(state, {
      question,
      region_keys: candidate.region_keys || candidate.regions || candidate.region,
      asset_types: candidate.asset_types || candidate.assets || input.asset_types || input.assets,
      crop: candidate.crop || input.crop,
      water_source: candidate.water_source || input.water_source,
      thesis_assumptions: candidate.thesis_assumptions || candidate.assumptions || input.thesis_assumptions || input.assumptions,
      horizon_days: candidate.horizon_days || input.horizon_days,
      include_weak_evidence: candidate.include_weak_evidence ?? input.include_weak_evidence
    }, { now: nowIso });

    state = result.state;
    const investigation = result.investigation;
    const expected = investigation.coverage.expected_dimensions || [];
    const covered = new Set(investigation.coverage.covered_dimensions || []);
    const dimensionCoverage = expected.length
      ? expected.filter((dimension) => covered.has(dimension)).length / expected.length
      : investigation.findings.length ? 1 : 0;

    const evidenceReadinessScore = Number(clamp01(
      (0.35 * investigation.confidence) +
      (0.25 * Math.min(1, investigation.coverage.independent_source_family_count / 4)) +
      (0.20 * Math.min(1, investigation.coverage.strong_finding_count / 3)) +
      (0.20 * dimensionCoverage)
    ).toFixed(3));

    rows.push({
      candidate_id: 'faie-candidate:' + stableHash([label, investigation.scope]),
      label,
      investigation_id: investigation.investigation_id,
      scope: investigation.scope,
      evidence_readiness_score: evidenceReadinessScore,
      decision_readiness: investigation.coverage.decision_readiness,
      confidence: investigation.confidence,
      matched_signal_count: investigation.coverage.matched_signal_count,
      strong_finding_count: investigation.coverage.strong_finding_count,
      independent_source_family_count: investigation.coverage.independent_source_family_count,
      expected_dimensions: expected,
      covered_dimensions: investigation.coverage.covered_dimensions,
      missing_dimensions: investigation.coverage.missing_dimensions,
      unknowns: investigation.unknowns,
      evidence_needed: investigation.evidence_needed,
      evidence_acquisition_queue: investigation.evidence_acquisition_queue,
      thesis_memory: investigation.thesis_memory,
      site_suitability_verdict: null,
      investment_recommendation: null
    });
  }

  const evidenceOrder = [...rows]
    .sort((a, b) =>
      b.evidence_readiness_score - a.evidence_readiness_score ||
      b.independent_source_family_count - a.independent_source_family_count ||
      a.label.localeCompare(b.label)
    )
    .map((row, index) => ({
      evidence_rank: index + 1,
      candidate_id: row.candidate_id,
      label: row.label,
      evidence_readiness_score: row.evidence_readiness_score
    }));

  const dimensionUniverse = unique(rows.flatMap((row) => row.expected_dimensions), 100);
  const comparisonId = 'faie-comparison:' + stableHash([
    question,
    rows.map((row) => [row.candidate_id, row.investigation_id]),
    nowIso
  ]);

  const comparison = {
    schema: 'evercraft.faie.comparison.v1',
    comparison_id: comparisonId,
    created_at: nowIso,
    question,
    candidate_count: rows.length,
    candidates: rows,
    evidence_readiness_order: evidenceOrder,
    dimension_universe: dimensionUniverse,
    interpretation: 'Evidence-readiness rank compares the completeness and corroboration of the current FAIE evidence packet. It is not a site-suitability score, investment recommendation, crop recommendation, or authority to act.',
    boundaries: [
      'A more complete evidence packet does not mean a site is better.',
      'A less complete evidence packet may reflect missing data rather than poor underlying conditions.',
      'Modeled, reported, observed, and verified evidence remain distinct.',
      'Consequential siting, capital, production, regulatory, and operating decisions require human review.'
    ],
    decision_authority: false,
    publication_authority: false
  };

  state.comparisons = {
    ...(state.comparisons || {}),
    [comparisonId]: comparison
  };

  const receipt = {
    schema: 'evercraft.faie.comparison-receipt.v1',
    receipt_id: 'faie-comparison-receipt:' + stableHash([comparisonId, nowIso]),
    comparison_id: comparisonId,
    candidate_count: rows.length,
    created_at: nowIso
  };
  state.receipts = [...(state.receipts || []), receipt].slice(-10000);

  return { state, comparison, receipt };
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
