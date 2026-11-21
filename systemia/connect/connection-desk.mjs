const ROUTES = new Set(['EXECUTE', 'PARTNER', 'CONNECT', 'MONITOR']);

const REGULATED_CATEGORIES = new Set([
  'securities',
  'real_estate',
  'insurance',
  'lending',
  'legal_services'
]);

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function uniq(values = []) {
  return [...new Set(values.filter(Boolean).map((v) => String(v).trim()).filter(Boolean))];
}

function overlap(left = [], right = []) {
  const a = new Set(uniq(left).map((v) => v.toLowerCase()));
  const b = new Set(uniq(right).map((v) => v.toLowerCase()));
  if (!a.size || !b.size) return 0;
  let hits = 0;
  for (const value of a) if (b.has(value)) hits += 1;
  return hits / Math.max(a.size, b.size);
}

function weighted(parts) {
  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0) || 1;
  return Math.round(parts.reduce((sum, part) => sum + clamp(part.score) * part.weight, 0) / totalWeight);
}

export function createConnectionObject(input = {}) {
  const connection = {
    connection_id: normalizeText(input.connection_id),
    source_candidate_id: normalizeText(input.source_candidate_id),
    owner: normalizeText(input.owner),
    organization: normalizeText(input.organization),
    problem_statement: normalizeText(input.problem_statement),
    protected_summary: normalizeText(input.protected_summary),
    public_safe_summary: normalizeText(input.public_safe_summary),
    capability_needed: uniq(input.capability_needed),
    geography: normalizeText(input.geography),
    industry: normalizeText(input.industry),
    urgency: clamp(input.urgency),
    budget_state: normalizeText(input.budget_state || 'unknown'),
    capital_need: input.capital_need ?? null,
    operating_need: Boolean(input.operating_need),
    technology_need: Boolean(input.technology_need),
    buyer_need: Boolean(input.buyer_need),
    succession_need: Boolean(input.succession_need),
    workforce_need: Boolean(input.workforce_need),
    distribution_need: Boolean(input.distribution_need),
    regulatory_need: Boolean(input.regulatory_need),
    evidence_state: normalizeText(input.evidence_state || 'unknown'),
    consent_state: normalizeText(input.consent_state || 'not_requested'),
    disclosure_tier: Number.isInteger(input.disclosure_tier) ? input.disclosure_tier : 0,
    canonical_relationship_owner: normalizeText(input.canonical_relationship_owner),
    do_not_contact: uniq(input.do_not_contact),
    suggested_matches: Array.isArray(input.suggested_matches) ? input.suggested_matches : [],
    match_confidence: clamp(input.match_confidence),
    why_this_match: normalizeText(input.why_this_match),
    intro_status: normalizeText(input.intro_status || 'not_started'),
    intro_owner: normalizeText(input.intro_owner),
    referral_economics: input.referral_economics ?? { type: 'none', disclosed: true },
    outcome_state: normalizeText(input.outcome_state || 'unknown'),
    outcome_receipt: input.outcome_receipt ?? null
  };

  if (!connection.connection_id) throw new Error('connection_id is required');
  if (!connection.problem_statement) throw new Error('problem_statement is required');
  if (!connection.public_safe_summary) throw new Error('public_safe_summary is required');

  return connection;
}

export function scorePotentialMatch(connection, provider) {
  const capabilityFit = overlap(connection.capability_needed, provider.capabilities) * 100;
  const geographyFit = (
    !connection.geography ||
    provider.remote === true ||
    uniq(provider.geographies).some((g) => g.toLowerCase() === connection.geography.toLowerCase())
  ) ? 100 : 20;

  const capacityFit = clamp(provider.capacity_score ?? 50);
  const timingFit = clamp(provider.timing_score ?? 50);
  const capitalFit = connection.capital_need == null
    ? 100
    : clamp(provider.capital_capacity_score ?? 0);
  const experienceFit = clamp(provider.domain_experience_score ?? 50);
  const trustFit = clamp(provider.trust_score ?? 50);
  const economicsFit = clamp(provider.economic_fit_score ?? 50);
  const communicationFit = clamp(provider.communication_fit_score ?? 50);
  const complementarity = clamp(provider.strategic_complementarity_score ?? 50);

  const conflictPenalty = provider.conflict === true ? 35 : 0;
  const doNotContactPenalty = uniq(connection.do_not_contact)
    .map((v) => v.toLowerCase())
    .includes(String(provider.name || provider.provider_id || '').toLowerCase()) ? 100 : 0;

  const score = weighted([
    { score: capabilityFit, weight: 2.4 },
    { score: geographyFit, weight: 1.0 },
    { score: capacityFit, weight: 1.4 },
    { score: timingFit, weight: 1.0 },
    { score: capitalFit, weight: 1.0 },
    { score: experienceFit, weight: 1.5 },
    { score: trustFit, weight: 1.6 },
    { score: economicsFit, weight: 1.0 },
    { score: communicationFit, weight: 0.7 },
    { score: complementarity, weight: 0.8 }
  ]);

  return {
    provider_id: normalizeText(provider.provider_id),
    name: normalizeText(provider.name),
    score: clamp(score - conflictPenalty - doNotContactPenalty),
    blocked: Boolean(doNotContactPenalty),
    reasons: {
      capability_fit: Math.round(capabilityFit),
      geography_fit: geographyFit,
      capacity_fit: capacityFit,
      timing_fit: timingFit,
      capital_fit: capitalFit,
      domain_experience_fit: experienceFit,
      trust_fit: trustFit,
      economic_fit: economicsFit,
      communication_fit: communicationFit,
      strategic_complementarity: complementarity,
      conflict_penalty: conflictPenalty,
      do_not_contact_penalty: doNotContactPenalty
    }
  };
}

export function rankPotentialMatches(connection, providers = [], { limit = 5 } = {}) {
  return providers
    .map((provider) => scorePotentialMatch(connection, provider))
    .filter((match) => !match.blocked)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Number(limit) || 5));
}

export function decideRoute({
  evercraft_fit = 0,
  partner_fit = 0,
  external_match_fit = 0,
  timing_readiness = 0,
  evidence_quality = 0,
  owner_willingness = 0,
  evercraft_capacity = 0
} = {}) {
  const execution = weighted([
    { score: evercraft_fit, weight: 2.0 },
    { score: evercraft_capacity, weight: 2.0 },
    { score: timing_readiness, weight: 1.0 },
    { score: evidence_quality, weight: 1.0 },
    { score: owner_willingness, weight: 1.0 }
  ]);

  const partnership = weighted([
    { score: partner_fit, weight: 2.0 },
    { score: evercraft_fit, weight: 1.2 },
    { score: external_match_fit, weight: 1.2 },
    { score: evidence_quality, weight: 1.0 },
    { score: owner_willingness, weight: 1.3 }
  ]);

  const connection = weighted([
    { score: external_match_fit, weight: 2.2 },
    { score: evidence_quality, weight: 1.0 },
    { score: timing_readiness, weight: 1.0 },
    { score: owner_willingness, weight: 1.5 }
  ]);

  const monitor = weighted([
    { score: 100 - timing_readiness, weight: 1.5 },
    { score: 100 - evidence_quality, weight: 1.2 },
    { score: 100 - owner_willingness, weight: 1.0 }
  ]);

  const ranked = [
    ['EXECUTE', execution],
    ['PARTNER', partnership],
    ['CONNECT', connection],
    ['MONITOR', monitor]
  ].sort((a, b) => b[1] - a[1]);

  const route = ranked[0][0];
  if (!ROUTES.has(route)) throw new Error('invalid route');

  return {
    route,
    score: ranked[0][1],
    alternatives: ranked.slice(1).map(([name, score]) => ({ route: name, score }))
  };
}

export function canDisclose(connection, requestedTier) {
  const tier = Number(requestedTier);
  if (!Number.isInteger(tier) || tier < 0 || tier > 4) {
    return { allowed: false, reason: 'invalid_disclosure_tier' };
  }

  if (tier <= 1) return { allowed: true, reason: 'metadata_or_public_safe' };

  const consent = connection.consent_state;
  if (!['approved', 'approved_under_nda'].includes(consent)) {
    return { allowed: false, reason: 'owner_consent_required' };
  }

  if (tier >= 3 && consent !== 'approved_under_nda') {
    return { allowed: false, reason: 'nda_or_equivalent_required' };
  }

  return { allowed: true, reason: 'consent_gate_passed' };
}

export function validateEconomics({ type = 'none', disclosed = false, category = '', compliance_reviewed = false } = {}) {
  const normalized = normalizeText(type).toLowerCase();
  const allowed = new Set(['none', 'free_intro', 'referral_fee', 'success_fee', 'rev_share', 'co_delivery']);

  if (!allowed.has(normalized)) {
    return { allowed: false, reason: 'unsupported_economic_structure' };
  }

  if (!['none', 'free_intro'].includes(normalized) && disclosed !== true) {
    return { allowed: false, reason: 'economics_must_be_disclosed' };
  }

  if (REGULATED_CATEGORIES.has(normalizeText(category).toLowerCase()) && normalized !== 'none' && compliance_reviewed !== true) {
    return { allowed: false, reason: 'regulated_referral_requires_compliance_review' };
  }

  return { allowed: true, reason: 'economic_gate_passed' };
}

export function dedupeOutreach(existing = [], candidate = {}) {
  const org = normalizeText(candidate.organization).toLowerCase();
  const person = normalizeText(candidate.owner).toLowerCase();
  const canonicalOwner = normalizeText(candidate.canonical_relationship_owner).toLowerCase();

  const collision = existing.find((item) => {
    const sameOrg = org && normalizeText(item.organization).toLowerCase() === org;
    const samePerson = person && normalizeText(item.owner).toLowerCase() === person;
    return sameOrg || samePerson;
  });

  if (!collision) {
    return { allowed: true, reason: 'no_existing_relationship_collision' };
  }

  const existingOwner = normalizeText(collision.canonical_relationship_owner).toLowerCase();
  if (canonicalOwner && existingOwner && canonicalOwner === existingOwner) {
    return { allowed: true, reason: 'same_canonical_relationship_owner', collision };
  }

  return {
    allowed: false,
    reason: 'duplicate_outreach_guard',
    collision
  };
}

export function buildIntroPacket(connection, match, { requestedTier = 1 } = {}) {
  const disclosure = canDisclose(connection, requestedTier);
  if (!disclosure.allowed) {
    return {
      status: 'blocked',
      reason: disclosure.reason,
      connection_id: connection.connection_id
    };
  }

  const summary = requestedTier >= 2
    ? connection.protected_summary || connection.public_safe_summary
    : connection.public_safe_summary;

  return {
    status: 'ready_for_human_review',
    connection_id: connection.connection_id,
    provider_id: match.provider_id,
    provider_name: match.name,
    disclosure_tier: requestedTier,
    problem_summary: summary,
    capability_needed: connection.capability_needed,
    geography: connection.geography,
    urgency: connection.urgency,
    match_score: match.score,
    rule: 'Human approval is required before sending any introduction.'
  };
}
