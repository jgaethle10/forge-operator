import crypto from 'node:crypto';

export const TOWI_STORY_TYPES = Object.freeze(['FLASH', 'REPORT', 'WATCH', 'AFTERMATH']);

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const clamp01 = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
};
const unique = (values = []) => [...new Set((Array.isArray(values) ? values : [values]).map(clean).filter(Boolean))];
const hash = (value) => crypto.createHash('sha256').update(
  typeof value === 'string' ? value : JSON.stringify(value)
).digest('hex').slice(0, 24);

const TRUTH_WEIGHT = Object.freeze({
  UNKNOWN: 0.05,
  INFERRED: 0.18,
  REPORTED: 0.34,
  PENDING: 0.24,
  CONTESTED: 0.3,
  OBSERVED: 0.72,
  CORROBORATED: 0.92,
  CLOSED: 0.45
});

const CHANGE_WEIGHT = Object.freeze({
  NEW: 1,
  INTENSIFIED: 0.95,
  CORROBORATED: 0.86,
  CONTESTED: 0.72,
  WEAKENED: 0.62,
  CLOSED: 0.5,
  ROLLED_OFF: 0.42,
  UNCHANGED: 0.08
});

const POLITICAL_DOMAINS = new Set(['politics', 'government', 'public_policy', 'regulation', 'elections']);

const DOMAIN_QUESTIONS = Object.freeze({
  weather: [
    'Which observed conditions changed, and over what time window?',
    'What infrastructure, transportation, water, agriculture, or health systems sit downstream of the weather signal?'
  ],
  climate: [
    'Is this a short-lived anomaly, a seasonal pattern, or part of a longer observed shift?',
    'Which historical baseline is appropriate for the comparison?'
  ],
  water: [
    'What changed in flow, storage, quality, snowpack, flood stage, or water availability?',
    'Who or what depends on this water system downstream?'
  ],
  earth_hazards: [
    'What is directly observed versus forecast or modeled?',
    'Which secondary hazards could follow, and what evidence would be required to confirm them?'
  ],
  geophysics: [
    'What does the instrument record establish directly?',
    'Which causal or forecasting claims remain unsupported by the observation alone?'
  ],
  infrastructure: [
    'Which physical dependency failed, degraded, or became constrained?',
    'What other services inherit risk from that dependency?'
  ],
  aviation: [
    'What operational constraint changed for aircraft, airports, airspace, or air traffic systems?',
    'Is the disruption local, network-propagating, or already resolved?'
  ],
  maritime: [
    'What changed in port, vessel, weather, routing, or waterway conditions?',
    'Which trade, safety, or logistics dependencies are exposed?'
  ],
  energy: [
    'What changed in generation, transmission, fuel supply, load, price, or permitting conditions?',
    'Which downstream systems depend on the affected energy node?'
  ],
  environment: [
    'What physical or biological change is directly measured?',
    'What competing explanations or confounders remain plausible?'
  ],
  ocean: [
    'What changed in temperature, circulation, chemistry, ice, ecology, or fisheries?',
    'How persistent and geographically broad is the observed change?'
  ],
  public_health: [
    'What outcome is directly observed, for which population, geography, and time period?',
    'Which causal claims require stronger evidence than the current signal provides?'
  ],
  science: [
    'What is newly observed or demonstrated, and what remains hypothesis or interpretation?',
    'Has the result been independently replicated, corroborated, or challenged?'
  ],
  transport: [
    'Which node, corridor, mode, or dependency changed state?',
    'What second-order delays, reroutes, shortages, or access effects are observable?'
  ],
  agriculture: [
    'What changed in water, soil, crop, livestock, labor, input, or market conditions?',
    'What is the likely decision horizon for producers, and which parts are observed versus modeled?'
  ]
});

function sourceFamilyCount(signal) {
  const explicit = Number(signal?.review?.independent_source_families);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  return signal?.source_family ? 1 : 0;
}

function explicitImpactScore(signal) {
  const facts = signal?.observation?.facts || {};
  const values = [
    facts.impact_score,
    facts.severity_score,
    facts.human_impact_score
  ].map(Number).filter(Number.isFinite);
  if (values.length) return clamp01(Math.max(...values));

  let score = 0;
  if (facts.critical_infrastructure === true) score += 0.35;
  if (Number(facts.population_affected) > 0) score += 0.25;
  if (Number(facts.fatalities) > 0) score += 0.2;
  if (Number(facts.injuries) > 0) score += 0.1;
  if (facts.disruption === true || facts.service_disruption === true) score += 0.1;
  return clamp01(score);
}

function noveltyScore(signal) {
  return CHANGE_WEIGHT[clean(signal?.change_state).toUpperCase()] ?? 0.08;
}

function evidenceScore(signal) {
  return TRUTH_WEIGHT[clean(signal?.truth_state).toUpperCase()] ?? 0.05;
}

function breadthScore(signal) {
  const domains = unique(signal?.domains || []);
  const regions = unique(signal?.region_keys || []);
  return clamp01(0.65 * Math.min(1, domains.length / 4) + 0.35 * Math.min(1, regions.length / 3));
}

export function scoreTowiSignal(signal = {}) {
  const materiality = clamp01(signal.materiality_score, 0);
  const evidence = evidenceScore(signal);
  const novelty = noveltyScore(signal);
  const breadth = breadthScore(signal);
  const sources = clamp01(sourceFamilyCount(signal) / 3);
  const impact = explicitImpactScore(signal);

  const score = clamp01(
    0.34 * materiality +
    0.2 * evidence +
    0.16 * novelty +
    0.1 * breadth +
    0.1 * sources +
    0.1 * impact
  );

  return {
    score: Number(score.toFixed(3)),
    factors: {
      materiality: Number(materiality.toFixed(3)),
      evidence: Number(evidence.toFixed(3)),
      novelty: Number(novelty.toFixed(3)),
      breadth: Number(breadth.toFixed(3)),
      source_diversity: Number(sources.toFixed(3)),
      explicit_impact: Number(impact.toFixed(3))
    }
  };
}

function storyTypeFor(signal, score, priorDossier) {
  const truth = clean(signal?.truth_state).toUpperCase();
  const change = clean(signal?.change_state).toUpperCase();
  const forecast = signal?.observation?.facts?.forecast === true ||
    signal?.observation?.metadata?.forecast === true ||
    /forecast|watch|outlook|projection|predicted/.test(clean(signal?.kind).toLowerCase());

  if (['CLOSED', 'ROLLED_OFF'].includes(change) || truth === 'CLOSED') {
    return priorDossier ? 'AFTERMATH' : 'REPORT';
  }
  if (truth === 'PENDING' || truth === 'INFERRED' || forecast) return 'WATCH';
  if (['NEW', 'INTENSIFIED'].includes(change) && score >= 0.72) return 'FLASH';
  return 'REPORT';
}

function researchQuestions(signal) {
  const questions = [
    'What changed in the physical world, and when?',
    'Which claims are observed, verified, reported, inferred, modeled, contested, or still pending?',
    'Which sources are genuinely independent of one another?',
    'What would change or falsify the current interpretation?',
    'What systems, people, places, or decisions sit downstream of this change?'
  ];

  for (const domain of unique(signal?.domains || []).map((value) => value.toLowerCase())) {
    questions.push(...(DOMAIN_QUESTIONS[domain] || []));
  }
  return unique(questions).slice(0, 14);
}

function publishReadiness(signal, score) {
  const blockers = [];
  const warnings = [];
  const sources = sourceFamilyCount(signal);
  const truth = clean(signal?.truth_state).toUpperCase();
  const freshness = clean(signal?.review?.freshness?.state).toLowerCase();
  const review = clean(signal?.review?.status).toLowerCase();

  if (review && review !== 'pass') blockers.push('upstream_adversarial_review_not_passed');
  if (freshness === 'stale') blockers.push('source_state_stale');
  if (!unique(signal?.provenance_refs || []).length) blockers.push('source_lineage_missing');
  if (truth === 'UNKNOWN') blockers.push('truth_state_unknown');
  if (truth === 'INFERRED') warnings.push('inference_must_not_be_presented_as_observation');
  if (truth === 'PENDING') warnings.push('forecast_or_pending_state_must_not_be_presented_as_outcome');
  if (truth === 'CONTESTED') warnings.push('contested_evidence_requires_explicit_treatment');
  const requiresHumanEditorialReview = unique(signal?.domains || []).some((domain) => POLITICAL_DOMAINS.has(String(domain).toLowerCase()));
  if (requiresHumanEditorialReview) warnings.push('political_or_government_material_requires_explicit_human_editorial_review');
  if (sources < 2) blockers.push('independent_source_family_count_below_two');
  if (score < 0.62) blockers.push('towi_story_score_below_editorial_threshold');

  return {
    status: blockers.length ? 'research_required' : 'editorial_candidate',
    blockers,
    warnings,
    independent_source_families: sources,
    requires_human_editorial_review: requiresHumanEditorialReview,
    publication_authority: false,
    next_gate: blockers.length ? 'towi_research_dossier' : 'journal_editorial_10_of_10_preflight'
  };
}

function evidenceRow(signal) {
  return {
    observation_id: signal.observation_id || null,
    signal_id: signal.signal_id || null,
    observed_at: signal.observed_at || null,
    last_verified_at: signal.last_verified_at || null,
    truth_state: signal.truth_state || 'UNKNOWN',
    change_state: signal.change_state || 'UNCHANGED',
    source_family: signal.source_family || null,
    provenance_refs: unique(signal.provenance_refs || []),
    freshness_state: signal.review?.freshness?.state || 'unknown',
    reliability: clamp01(signal.reliability ?? signal.observation?.reliability, 0.5),
    materiality_score: clamp01(signal.materiality_score, 0),
    adversarial_warnings: unique(signal.review?.warnings || [])
  };
}

function dossierIdFor(signal) {
  return 'towi-dossier:' + hash(signal.subject_key || signal.signal_id || signal.observation_id || signal.summary || 'unknown');
}

function mergeDossier(prior, signal, now) {
  const scored = scoreTowiSignal(signal);
  const storyType = storyTypeFor(signal, scored.score, prior);
  const readiness = publishReadiness(signal, scored.score);
  const row = evidenceRow(signal);
  const evidenceLedger = [
    ...(prior?.evidence_ledger || []),
    row
  ].filter((item, index, all) =>
    all.findIndex((candidate) =>
      candidate.observation_id === item.observation_id &&
      candidate.change_state === item.change_state
    ) === index
  ).slice(-250);

  const status = storyType === 'WATCH' && readiness.status !== 'editorial_candidate'
    ? 'watching'
    : readiness.status === 'editorial_candidate'
      ? 'editorial_candidate'
      : storyType === 'AFTERMATH'
        ? 'aftermath_research'
        : 'researching';

  return {
    schema: 'evercraft.towi.dossier.v1',
    dossier_id: prior?.dossier_id || dossierIdFor(signal),
    subject_key: signal.subject_key || prior?.subject_key || null,
    signal_id: signal.signal_id || prior?.signal_id || null,
    story_type: storyType,
    status,
    title_seed: clean(signal.summary || prior?.title_seed || 'Untitled TOWI investigation'),
    summary: clean(signal.summary || prior?.summary || ''),
    score: scored.score,
    scoring: scored.factors,
    domains: unique([...(prior?.domains || []), ...(signal.domains || [])]),
    region_keys: unique([...(prior?.region_keys || []), ...(signal.region_keys || [])]),
    first_seen_at: prior?.first_seen_at || signal.observed_at || now,
    last_seen_at: signal.observed_at || now,
    updated_at: now,
    truth_state: signal.truth_state || prior?.truth_state || 'UNKNOWN',
    change_state: signal.change_state || prior?.change_state || 'UNCHANGED',
    research_questions: unique([...(prior?.research_questions || []), ...researchQuestions(signal)]).slice(0, 20),
    evidence_ledger: evidenceLedger,
    provenance_refs: unique(evidenceLedger.flatMap((item) => item.provenance_refs || [])),
    readiness,
    distribution_plan: {
      journal: true,
      fallen_explainer: true,
      evercraft_clip: true,
      llm_machine_summary: true,
      evidence_pdf: true,
      map_or_data_visual: true
    },
    publication_authority: false,
    rule: 'TOWI may discover, investigate, score and stage a story. Publication still requires the Journal evidence, rights, production and 10/10 editorial gates.'
  };
}

export function emptyTowiState() {
  return {
    schema: 'evercraft.towi.state.v1',
    dossiers: {},
    processed_editions: [],
    receipts: [],
    last_desk: null
  };
}

export function admitRadarEdition(inputState, edition, { now = new Date().toISOString() } = {}) {
  const state = structuredClone(inputState || emptyTowiState());
  if (!edition?.edition_id) {
    return {
      state,
      receipt: {
        schema: 'evercraft.towi.ingest-receipt.v1',
        status: 'quiet',
        reason: 'radar_edition_missing',
        at: now,
        publication_authority: false
      }
    };
  }

  if ((state.processed_editions || []).includes(edition.edition_id)) {
    return {
      state,
      receipt: {
        schema: 'evercraft.towi.ingest-receipt.v1',
        status: 'deduped',
        edition_id: edition.edition_id,
        at: now,
        publication_authority: false
      }
    };
  }

  const signals = [
    ...(Array.isArray(edition.signals) ? edition.signals : []),
    ...(Array.isArray(edition.rolled_off_signals) ? edition.rolled_off_signals : [])
  ];

  const touched = [];
  for (const signal of signals) {
    if (!signal) continue;
    const id = dossierIdFor(signal);
    state.dossiers[id] = mergeDossier(state.dossiers[id] || null, signal, now);
    touched.push(id);
  }

  state.processed_editions = [...(state.processed_editions || []), edition.edition_id].slice(-2000);
  const receipt = {
    schema: 'evercraft.towi.ingest-receipt.v1',
    status: touched.length ? 'pass' : 'quiet',
    edition_id: edition.edition_id,
    dossier_ids: unique(touched),
    signal_count: signals.length,
    at: now,
    publication_authority: false
  };
  state.receipts = [...(state.receipts || []), receipt].slice(-5000);

  return { state, receipt };
}

export function compileTowiDesk(inputState, { now = new Date().toISOString(), max_items = 24 } = {}) {
  const state = structuredClone(inputState || emptyTowiState());
  const dossiers = Object.values(state.dossiers || {})
    .sort((a, b) =>
      Number(b.score || 0) - Number(a.score || 0) ||
      String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
    )
    .slice(0, Math.max(1, Math.min(100, Number(max_items) || 24)));

  const desk = {
    schema: 'evercraft.towi.desk.v1',
    generated_at: now,
    title: 'TOWI',
    tagline: 'Open the machine. Show the whole system.',
    dossier_count: dossiers.length,
    editorial_candidate_count: dossiers.filter((row) => row.status === 'editorial_candidate').length,
    watch_count: dossiers.filter((row) => row.story_type === 'WATCH').length,
    aftermath_count: dossiers.filter((row) => row.story_type === 'AFTERMATH').length,
    dossiers,
    publication_authority: false
  };
  state.last_desk = desk;
  return { state, desk };
}

export function publicTowiProjection(desk) {
  if (!desk) {
    return {
      schema: 'evercraft.towi.public-desk.v1',
      status: 'no_desk',
      dossiers: [],
      publication_authority: false
    };
  }
  return {
    schema: 'evercraft.towi.public-desk.v1',
    generated_at: desk.generated_at,
    title: desk.title,
    tagline: desk.tagline,
    dossier_count: desk.dossier_count,
    editorial_candidate_count: desk.editorial_candidate_count,
    watch_count: desk.watch_count,
    aftermath_count: desk.aftermath_count,
    dossiers: (desk.dossiers || []).map((row) => ({
      dossier_id: row.dossier_id,
      story_type: row.story_type,
      status: row.status,
      title_seed: row.title_seed,
      summary: row.summary,
      score: row.score,
      domains: row.domains,
      region_keys: row.region_keys,
      truth_state: row.truth_state,
      change_state: row.change_state,
      updated_at: row.updated_at,
      independent_source_families: row.readiness?.independent_source_families || 0,
      research_evidence_count: (row.research_evidence || []).length,
      next_gate: row.readiness?.next_gate || null
    })),
    publication_authority: false
  };
}

export function editorialPacketForDossier(dossier) {
  if (!dossier) return null;
  return {
    schema: 'evercraft.towi.editorial-packet.v1',
    dossier_id: dossier.dossier_id,
    story_type: dossier.story_type,
    title_seed: dossier.title_seed,
    summary: dossier.summary,
    score: dossier.score,
    domains: dossier.domains,
    region_keys: dossier.region_keys,
    truth_state: dossier.truth_state,
    change_state: dossier.change_state,
    research_questions: dossier.research_questions,
    evidence_ledger: dossier.evidence_ledger,
    research_evidence: dossier.research_evidence || [],
    provenance_refs: dossier.provenance_refs,
    readiness: dossier.readiness,
    distribution_plan: dossier.distribution_plan,
    required_next_gate: dossier.readiness?.next_gate || 'towi_research_dossier',
    publication_authority: false
  };
}


const TOWI_EVIDENCE_RELATIONSHIPS = new Set(['supports', 'challenges', 'context', 'supersedes']);

function normalizeResearchEvidence(rawEvidence = {}, now = new Date().toISOString()) {
  const sourceFamily = clean(rawEvidence.source_family);
  if (!sourceFamily) throw new TypeError('source_family is required');
  const refs = unique(rawEvidence.provenance_refs || rawEvidence.provenance_ref || []);
  if (!refs.length) throw new TypeError('provenance_refs are required');
  const summary = clean(rawEvidence.summary);
  if (!summary) throw new TypeError('summary is required');
  const relationship = clean(rawEvidence.relationship || 'context').toLowerCase();
  if (!TOWI_EVIDENCE_RELATIONSHIPS.has(relationship)) {
    throw new TypeError('relationship must be supports, challenges, context, or supersedes');
  }
  const observedAt = new Date(rawEvidence.observed_at || now);
  if (!Number.isFinite(observedAt.getTime())) throw new TypeError('observed_at must be a valid timestamp');
  const evidenceState = clean(rawEvidence.evidence_state || 'reported').toLowerCase();
  if (!['verified', 'observed', 'reported', 'modeled', 'inferred', 'contested'].includes(evidenceState)) {
    throw new TypeError('evidence_state is invalid');
  }

  const row = {
    evidence_id: clean(rawEvidence.evidence_id) || 'towi-evidence:' + hash({
      source_family: sourceFamily,
      independence_group: clean(rawEvidence.independence_group || sourceFamily),
      refs,
      summary,
      observed_at: observedAt.toISOString()
    }),
    source_family: sourceFamily,
    independence_group: clean(rawEvidence.independence_group || sourceFamily),
    observed_at: observedAt.toISOString(),
    added_at: new Date(now).toISOString(),
    evidence_state: evidenceState,
    relationship,
    summary,
    provenance_refs: refs,
    claims: Array.isArray(rawEvidence.claims) ? rawEvidence.claims.slice(0, 50) : [],
    reliability: clamp01(rawEvidence.reliability, 0.7)
  };
  return row;
}

function dossierIndependenceCount(dossier) {
  const groups = new Set();
  for (const row of dossier.evidence_ledger || []) {
    const group = clean(row.independence_group || row.source_family).toLowerCase();
    if (group) groups.add(group);
  }
  for (const row of dossier.research_evidence || []) {
    const group = clean(row.independence_group || row.source_family).toLowerCase();
    if (group) groups.add(group);
  }
  return Math.max(Number(dossier.readiness?.independent_source_families || 0), groups.size);
}

function refreshReadinessFromResearch(dossier) {
  const readiness = structuredClone(dossier.readiness || {});
  const blockers = new Set(readiness.blockers || []);
  const warnings = new Set(readiness.warnings || []);
  const independentSources = dossierIndependenceCount(dossier);

  if (independentSources >= 2) blockers.delete('independent_source_family_count_below_two');
  else blockers.add('independent_source_family_count_below_two');

  if ((dossier.research_evidence || []).some((row) => row.relationship === 'challenges')) {
    warnings.add('contradictory_or_challenging_evidence_present');
    readiness.requires_human_editorial_review = true;
  }

  readiness.independent_source_families = independentSources;
  readiness.blockers = [...blockers];
  readiness.warnings = [...warnings];
  readiness.status = readiness.blockers.length ? 'research_required' : 'editorial_candidate';
  readiness.next_gate = readiness.blockers.length
    ? 'towi_research_dossier'
    : 'journal_editorial_10_of_10_preflight';
  readiness.publication_authority = false;
  return readiness;
}

export function addEvidenceToDossier(inputState, dossierId, rawEvidence, { now = new Date().toISOString() } = {}) {
  const state = structuredClone(inputState || emptyTowiState());
  const id = clean(dossierId);
  const dossier = state.dossiers?.[id];
  if (!dossier) throw new Error('TOWI dossier not found');

  const row = normalizeResearchEvidence(rawEvidence, now);
  const existing = (dossier.research_evidence || []).find((item) => item.evidence_id === row.evidence_id);
  if (existing) {
    return {
      state,
      receipt: {
        schema: 'evercraft.towi.evidence-receipt.v1',
        status: 'deduped',
        dossier_id: id,
        evidence_id: row.evidence_id,
        publication_authority: false
      }
    };
  }

  dossier.research_evidence = [...(dossier.research_evidence || []), row].slice(-500);
  dossier.provenance_refs = unique([
    ...(dossier.provenance_refs || []),
    ...row.provenance_refs
  ]);
  dossier.updated_at = new Date(now).toISOString();
  dossier.readiness = refreshReadinessFromResearch(dossier);
  dossier.status = dossier.readiness.status === 'editorial_candidate'
    ? 'editorial_candidate'
    : dossier.story_type === 'WATCH'
      ? 'watching'
      : dossier.story_type === 'AFTERMATH'
        ? 'aftermath_research'
        : 'researching';

  state.dossiers[id] = dossier;
  const receipt = {
    schema: 'evercraft.towi.evidence-receipt.v1',
    status: 'pass',
    dossier_id: id,
    evidence_id: row.evidence_id,
    relationship: row.relationship,
    independent_source_families: dossier.readiness.independent_source_families,
    readiness_status: dossier.readiness.status,
    at: new Date(now).toISOString(),
    publication_authority: false
  };
  state.receipts = [...(state.receipts || []), receipt].slice(-5000);
  return { state, receipt };
}
