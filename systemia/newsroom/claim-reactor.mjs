import crypto from 'node:crypto';

export const CLAIM_TYPES = Object.freeze([
  'descriptive',
  'statistical',
  'comparative',
  'causal',
  'forecast',
  'attributed_opinion'
]);

export const EVIDENCE_STATES = Object.freeze([
  'observed',
  'derived',
  'estimated',
  'modeled',
  'reported',
  'attributed',
  'correlated',
  'causal_evidence',
  'causal_claim',
  'opinion',
  'unknown'
]);

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const unique = (values = []) => [...new Set((Array.isArray(values) ? values : [values]).map(clean).filter(Boolean))];

function stableId(prefix, value) {
  return `${prefix}:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 20)}`;
}

function normalizeEvidenceState(value) {
  const state = clean(value).toLowerCase().replace(/[ -]+/g, '_');
  return EVIDENCE_STATES.includes(state) ? state : 'unknown';
}

function normalizeClaimType(value, text = '') {
  const explicit = clean(value).toLowerCase().replace(/[ -]+/g, '_');
  if (CLAIM_TYPES.includes(explicit)) return explicit;
  const t = clean(text).toLowerCase();
  if (/\b(caused?|because|led to|drives?|results? in|responsible for|due to)\b/.test(t)) return 'causal';
  if (/\b(will|projected|forecast|expected to|likely to)\b/.test(t)) return 'forecast';
  if (/\b(percent|%|rate|number|count|rose|fell|increased|decreased|higher|lower)\b/.test(t)) return 'statistical';
  return 'descriptive';
}

function normalizeSource(source, index) {
  const url = clean(source?.url);
  const sourceId = clean(source?.source_id) || stableId('source', [url, source?.publisher, index]);
  return {
    source_id: sourceId,
    publisher: clean(source?.publisher) || null,
    url: url || null,
    title: clean(source?.title) || null,
    published_at: clean(source?.published_at) || null,
    retrieved_at: clean(source?.retrieved_at) || null,
    authority: clean(source?.authority).toLowerCase() || 'unknown',
    primary: source?.primary === true,
    notes: clean(source?.notes) || null
  };
}

function normalizeEvidence(evidence, index, sourceIds) {
  const state = normalizeEvidenceState(evidence?.evidence_state);
  const refs = unique(evidence?.source_refs).filter((ref) => sourceIds.has(ref));
  return {
    evidence_id: clean(evidence?.evidence_id) || stableId('evidence', [evidence?.summary, state, refs, index]),
    summary: clean(evidence?.summary),
    evidence_state: state,
    source_refs: refs,
    geography: clean(evidence?.geography) || null,
    population: clean(evidence?.population) || null,
    time_period: clean(evidence?.time_period) || null,
    baseline: clean(evidence?.baseline) || null,
    method: clean(evidence?.method) || null,
    supports: evidence?.supports === true,
    contradicts: evidence?.contradicts === true,
    confidence: Number.isFinite(Number(evidence?.confidence))
      ? Math.max(0, Math.min(1, Number(evidence.confidence)))
      : null
  };
}

function normalizeClaim(claim, index, evidenceById) {
  const text = clean(claim?.claim ?? claim?.text);
  const claimType = normalizeClaimType(claim?.claim_type, text);
  const supporting = unique(claim?.supporting_evidence_refs).filter((ref) => evidenceById.has(ref));
  const contradicting = unique(claim?.contradicting_evidence_refs).filter((ref) => evidenceById.has(ref));
  const confounders = unique(claim?.confounders);
  const openQuestions = unique(claim?.open_questions);
  return {
    claim_id: clean(claim?.claim_id) || stableId('claim', [text, index]),
    claim: text,
    claim_type: claimType,
    geography: clean(claim?.geography) || null,
    population: clean(claim?.population) || null,
    time_period: clean(claim?.time_period) || null,
    baseline: clean(claim?.baseline) || null,
    supporting_evidence_refs: supporting,
    contradicting_evidence_refs: contradicting,
    confounders,
    open_questions: openQuestions,
    attributed_to: clean(claim?.attributed_to) || null,
    political_context: claim?.political_context === true,
    publication_authority: false
  };
}

function assessClaim(claim, evidenceById) {
  const supporting = claim.supporting_evidence_refs.map((id) => evidenceById.get(id)).filter(Boolean);
  const contradicting = claim.contradicting_evidence_refs.map((id) => evidenceById.get(id)).filter(Boolean);
  const causalEvidence = supporting.filter((item) => item.evidence_state === 'causal_evidence');
  const sourceBound = [...supporting, ...contradicting].every((item) => item.source_refs.length > 0);
  const missingDimensions = [];

  if (claim.claim_type === 'statistical' || claim.claim_type === 'comparative') {
    if (!claim.time_period && !supporting.some((item) => item.time_period)) missingDimensions.push('time_period');
    if (!claim.geography && !supporting.some((item) => item.geography)) missingDimensions.push('geography');
    if (!claim.population && !supporting.some((item) => item.population)) missingDimensions.push('population');
  }

  if (claim.claim_type === 'causal') {
    if (!claim.confounders.length) missingDimensions.push('confounders');
    if (!causalEvidence.length) missingDimensions.push('causal_evidence');
  }

  let evidenceStatus = 'unresolved';
  if (supporting.length && !contradicting.length && sourceBound) evidenceStatus = 'supported_by_cited_evidence';
  if (supporting.length && contradicting.length && sourceBound) evidenceStatus = 'contested';
  if (!supporting.length && contradicting.length && sourceBound) evidenceStatus = 'contradicted_by_cited_evidence';
  if (!sourceBound) evidenceStatus = 'source_lineage_incomplete';
  if (claim.claim_type === 'causal' && !causalEvidence.length && supporting.length) evidenceStatus = 'association_only';

  const publicationBlockers = [];
  if (!claim.claim) publicationBlockers.push('claim_text_missing');
  if (!supporting.length && !contradicting.length) publicationBlockers.push('evidence_missing');
  if (!sourceBound) publicationBlockers.push('source_lineage_missing');
  publicationBlockers.push(...missingDimensions.map((item) => `required_context_missing:${item}`));

  return {
    ...claim,
    evidence_status: evidenceStatus,
    evidence_semantics: unique(supporting.map((item) => item.evidence_state)),
    publication_blockers: unique(publicationBlockers),
    ready_for_editorial_use: publicationBlockers.length === 0,
    required_review: claim.political_context ? 'political_neutrality_and_attribution_review' : null
  };
}

function framingAudit(claims) {
  const supportedFacts = claims.filter((claim) =>
    ['supported_by_cited_evidence', 'contested', 'contradicted_by_cited_evidence'].includes(claim.evidence_status)
  );
  const causalClaims = claims.filter((claim) => claim.claim_type === 'causal');
  const weakCausal = causalClaims.filter((claim) => claim.evidence_status !== 'supported_by_cited_evidence');
  const statisticalFacts = supportedFacts.filter((claim) => ['statistical', 'comparative', 'descriptive'].includes(claim.claim_type));

  return {
    framing_risk: weakCausal.length && statisticalFacts.length ? 'causal_implication_exceeds_demonstrated_evidence' : 'no_specific_framing_gap_detected',
    supported_fact_count: supportedFacts.length,
    causal_claim_count: causalClaims.length,
    weak_causal_claim_count: weakCausal.length,
    note: weakCausal.length && statisticalFacts.length
      ? 'Some underlying facts may be source-supported while the causal story connecting them remains unresolved or association-only.'
      : 'The packet does not currently show a specific gap between supported facts and causal framing.'
  };
}

export function buildClaimReactorPacket({ artifact = {}, sources = [], evidence = [], claims = [] } = {}) {
  const normalizedSources = sources.map(normalizeSource);
  const sourceIds = new Set(normalizedSources.map((source) => source.source_id));
  const normalizedEvidence = evidence.map((item, index) => normalizeEvidence(item, index, sourceIds));
  const evidenceById = new Map(normalizedEvidence.map((item) => [item.evidence_id, item]));
  const assessedClaims = claims.map((claim, index) => assessClaim(normalizeClaim(claim, index, evidenceById), evidenceById));
  const packetId = clean(artifact?.artifact_id) || stableId('claim-packet', [artifact?.url, artifact?.captured_at, assessedClaims.map((c) => c.claim)]);

  const blockers = unique(assessedClaims.flatMap((claim) => claim.publication_blockers));
  const politicalContext = assessedClaims.some((claim) => claim.political_context);

  return {
    schema: 'evercraft.systemia.claim-reactor.v1',
    packet_id: packetId,
    artifact: {
      artifact_id: clean(artifact?.artifact_id) || stableId('artifact', [artifact?.url, artifact?.captured_at, artifact?.publisher]),
      kind: clean(artifact?.kind) || 'unknown',
      publisher: clean(artifact?.publisher) || null,
      url: clean(artifact?.url) || null,
      captured_at: clean(artifact?.captured_at) || null,
      original_text: clean(artifact?.original_text) || null,
      immutable_original: true
    },
    sources: normalizedSources,
    evidence: normalizedEvidence,
    claims: assessedClaims,
    framing_audit: framingAudit(assessedClaims),
    packet_blockers: blockers,
    publication_authority: false,
    political_context: politicalContext,
    required_gates: unique([
      'source_lineage_complete',
      'claim_evidence_semantics_preserved',
      'causal_language_review',
      politicalContext ? 'political_neutrality_and_attribution_review' : '',
      'freshness_recheck',
      'journal_editorial_10_of_10_preflight'
    ]),
    ready_for_editorial_preflight: blockers.length === 0,
    truth_boundary: {
      sourced_facts_do_not_establish_causation_by_proximity: true,
      reported_or_modeled_material_is_not_observed_fact: true,
      disagreement_is_preserved_when_evidence_conflicts: true,
      packet_does_not_choose_a_political_side: true
    }
  };
}
