const ROLE_SPECS = Object.freeze({
  soil_system_analyst: {
    dimensions: ['soil', 'crop_health'],
    asks: [
      'What site-specific soil evidence supports the production thesis?',
      'What soil constraints could change crop fit, capital cost, drainage, amendment needs, or long-run productivity?'
    ]
  },
  water_system_analyst: {
    dimensions: ['water'],
    asks: [
      'What is the authoritative water source, right, allocation, reliability, quality, and drought exposure?',
      'Which water assumptions are still modeled, reported, or unverified?'
    ]
  },
  climate_resilience_analyst: {
    dimensions: ['heat', 'freeze', 'wildfire_smoke', 'resilience'],
    asks: [
      'Which heat, freeze, smoke, flood, drought, wind, or other climate exposures materially affect the thesis?',
      'What historical and forward-looking evidence is being confused or over-weighted?'
    ]
  },
  energy_infrastructure_analyst: {
    dimensions: ['energy', 'infrastructure'],
    asks: [
      'What utility, service-capacity, outage, tariff, fuel, road, telecom, drainage, or interconnection constraints matter?',
      'Which infrastructure assumptions could create hidden capital or schedule risk?'
    ]
  },
  logistics_market_analyst: {
    dimensions: ['logistics', 'economics'],
    asks: [
      'What inbound, outbound, cold-chain, market-distance, storage, and distribution evidence supports the site?',
      'Which logistics assumptions are carrying the economics without observed support?'
    ]
  },
  labor_economics_analyst: {
    dimensions: ['labor', 'economics'],
    asks: [
      'What evidence supports labor availability, wage assumptions, critical skills, seasonality, and retention?',
      'Which cost, yield, price, land, insurance, or operating assumptions are most sensitive?'
    ]
  },
  policy_permitting_analyst: {
    dimensions: ['policy', 'infrastructure', 'water'],
    asks: [
      'What zoning, permitting, water-right, food-safety, labor, incentive, grant, and regulatory constraints apply?',
      'Which approvals or legal dependencies are prerequisites rather than afterthoughts?'
    ]
  },
  production_system_analyst: {
    dimensions: ['crop_health', 'soil', 'water', 'heat'],
    asks: [
      'What evidence supports crop fit, rotation, yield, quality, pest and disease resilience, and seasonal windows?',
      'What production assumptions belong to operator expertise versus externally verifiable evidence?'
    ]
  },
  provenance_guard: {
    dimensions: [],
    asks: [
      'Does every material claim preserve source lineage, timestamp, geography, evidence state, and source-family identity?',
      'Are modeled, reported, observed, and verified evidence kept distinct?'
    ]
  },
  adversarial_challenger: {
    dimensions: ['water', 'soil', 'heat', 'energy', 'infrastructure', 'logistics', 'labor', 'economics', 'policy', 'crop_health', 'resilience'],
    asks: [
      'What would have to be true for this site or production thesis to fail?',
      'Which single assumptions could invalidate the decision if they are wrong?'
    ]
  },
  thesis_memory_guard: {
    dimensions: [],
    asks: [
      'Which explicit assumptions justify the decision today?',
      'Can each assumption be re-evaluated later as strengthened, weakened, contradicted, verified, expired, or still unknown?'
    ]
  },
  reconciliation_lead: {
    dimensions: [],
    asks: [
      'What survives after specialist disagreement and deduplication?',
      'What evidence must be acquired next before a consequential human decision?'
    ]
  }
});

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function list(value) {
  return Array.isArray(value) ? [...new Set(value.map(clean).filter(Boolean))] : [];
}

function missionFrom(assignment = {}) {
  const raw = assignment?.item?.raw || {};
  return {
    mission_key: clean(raw.mission_key || assignment?.work?.key || 'faie-review'),
    question: clean(raw.question || raw.summary || raw.description || ''),
    region_keys: list(raw.region_keys),
    asset_types: list(raw.asset_types),
    crop: clean(raw.crop),
    water_source: clean(raw.water_source),
    thesis: clean(raw.thesis),
    desired_outputs: list(raw.desired_outputs),
    source_policy: clean(raw.source_policy || 'public_or_authorized_only')
  };
}

function unique(values) {
  return [...new Set(values.flat().map(clean).filter(Boolean))];
}

function evidenceRequests(role, mission) {
  const spec = ROLE_SPECS[role] || { dimensions: [], asks: ['Review the scoped FAIE evidence problem without inventing certainty.'] };
  const scope = [
    mission.question,
    mission.thesis,
    mission.region_keys.join(' '),
    mission.asset_types.join(' '),
    mission.crop,
    mission.water_source
  ].filter(Boolean).join(' ');

  return {
    focus_dimensions: spec.dimensions,
    challenge_questions: spec.asks,
    acquisition_requests: spec.dimensions.map((dimension) => ({
      dimension,
      request: `Acquire current, site-relevant, independently sourced evidence for ${dimension}; preserve provenance, observed_at, geography, evidence_state, reliability, and source_family.`,
      scope
    }))
  };
}

export async function runAssignment({ assignment, executionContext = {} } = {}) {
  const role = clean(assignment?.role);
  const mission = missionFrom(assignment);
  const review = evidenceRequests(role, mission);

  const receipt = {
    schema: 'evercraft.faie.saban-specialist-review.v1',
    agent_id: assignment?.agent_id || null,
    role,
    mission,
    status: 'TASK_READY',
    ...review,
    boundaries: {
      public_or_authorized_sources_only: true,
      provenance_required: true,
      modeled_is_not_observed: true,
      missing_is_not_zero: true,
      no_consequential_decision_authority: true,
      no_unsolicited_outreach: true,
      no_payment_or_contract_authority: true
    }
  };

  if (typeof executionContext?.faieInvestigate === 'function') {
    const investigation = await executionContext.faieInvestigate({
      question: mission.question,
      region_keys: mission.region_keys,
      asset_types: mission.asset_types,
      crop: mission.crop || undefined,
      water_source: mission.water_source || undefined
    });
    receipt.status = 'INVESTIGATION_REVIEWED';
    receipt.investigation = investigation;
  }

  return receipt;
}

export function reconcile({ results = [] } = {}) {
  const rows = (Array.isArray(results) ? results : []).filter(Boolean);
  const roles = unique(rows.map((row) => row.role));
  const dimensions = unique(rows.flatMap((row) => row.focus_dimensions || []));
  const challengeQuestions = unique(rows.flatMap((row) => row.challenge_questions || []));
  const acquisitionRequests = [];
  const seen = new Set();

  for (const row of rows) {
    for (const request of row.acquisition_requests || []) {
      const key = `${request.dimension}:${request.request}`;
      if (seen.has(key)) continue;
      seen.add(key);
      acquisitionRequests.push(request);
    }
  }

  const requiredRoles = Object.keys(ROLE_SPECS);
  const missingRoles = requiredRoles.filter((role) => !roles.includes(role));

  return {
    schema: 'evercraft.faie.saban-reconciliation.v1',
    status: missingRoles.length ? 'gaps_present' : 'reconciled',
    specialist_role_count: roles.length,
    specialist_roles: roles,
    missing_roles: missingRoles,
    covered_dimensions: dimensions,
    challenge_questions: challengeQuestions,
    evidence_acquisition_queue: acquisitionRequests,
    source_integrity_preserved: rows.every((row) => row?.boundaries?.provenance_required === true),
    thesis_memory_required: true,
    comparative_underwriting_recommended: true,
    decision_authority: false,
    publication_authority: false
  };
}

export { ROLE_SPECS };
