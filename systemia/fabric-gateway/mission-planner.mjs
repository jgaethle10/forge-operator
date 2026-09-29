function clean(value) {
  return String(value ?? '').trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function first(...values) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return null;
}

function candidateKey(candidate) {
  return first(
    candidate.capability_id,
    candidate.public_id,
    candidate.product_key,
    candidate.registry_name,
    candidate.mcp,
    candidate.name
  );
}

function normalizeCandidate(candidate, source, rank) {
  const capabilityRef = candidateKey(candidate);
  if (!capabilityRef) return null;

  return {
    stage: rank,
    state: 'candidate_not_admitted',
    capability_ref: capabilityRef,
    capability_id: first(candidate.capability_id),
    public_id: first(candidate.public_id),
    product_key: first(candidate.product_key),
    name: first(candidate.name) || capabilityRef,
    class: first(candidate.class, candidate.kind),
    discovery_source: source,
    discovery_score: Number.isFinite(Number(candidate.score)) ? Number(candidate.score) : null,
    machine_state: first(candidate.machine_state),
    commercial_state: first(candidate.commercial_state),
    invocation_status: first(candidate.invocation_status),
    canonical_url: first(candidate.canonical_url),
    registry_name: first(candidate.registry_name),
    mcp: first(candidate.mcp),
    routing: candidate.routing ?? null,
    pricing: candidate.pricing ?? null,
    human_confirmation_required: candidate.human_confirmation_required === true,
    confirmation: candidate.confirmation ?? null,
  };
}

export function composeEvercraftMission({
  goal,
  discovery,
  limit = 5,
  constraints = [],
} = {}) {
  const normalizedGoal = clean(goal);
  if (!normalizedGoal) throw new Error('goal_required');

  const boundedLimit = Math.min(Math.max(Number(limit || 5), 1), 10);
  const rows = [
    ...list(discovery?.matches).map((candidate) => ({ candidate, source: 'ranked_public_match' })),
    ...list(discovery?.capability_matches).map((candidate) => ({ candidate, source: 'pain_capability_match' })),
  ];

  const seen = new Set();
  const candidates = [];
  for (const row of rows) {
    const normalized = normalizeCandidate(row.candidate, row.source, candidates.length + 1);
    if (!normalized) continue;
    const key = normalized.capability_ref.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(normalized);
    if (candidates.length >= boundedLimit) break;
  }

  const callable = candidates.filter((candidate) =>
    ['live', 'ready', 'callable'].includes(clean(candidate.machine_state).toLowerCase()) ||
    ['live', 'ready', 'callable'].includes(clean(candidate.invocation_status).toLowerCase())
  );

  return {
    schema: 'evercraft.fabric.mission-plan.v1',
    goal: normalizedGoal,
    constraints: list(constraints).map(clean).filter(Boolean).slice(0, 20),
    discovery_schema: first(discovery?.schema),
    discovery_ok: discovery?.ok !== false,
    candidate_count: candidates.length,
    callable_candidate_count: callable.length,
    mission_stages: candidates,
    orchestration: {
      planner_state: candidates.length ? 'candidate_plan_ready' : 'no_truthful_match',
      ranking_is_discovery_evidence_not_execution_order: true,
      systemia_admission_required: true,
      dependency_resolution_required: true,
      deduplication_required: true,
      capacity_check_required: true,
      execution_gate_required: true,
      prepare_tool: 'prepare_evercraft_action',
      no_candidate_is_executed_by_this_plan: true,
    },
    evidence_contract: {
      preserve_source_lineage: true,
      preserve_evidence_state: true,
      preserve_observed_inferred_modeled_unknown: true,
      preserve_conflicts_and_retractions: true,
      retrieved_context_does_not_inherit_authority: true,
    },
    commerce_contract: {
      pricing_is_discovery_metadata_only: true,
      checkout_is_not_payment_proof: true,
      payment_authorized: false,
      human_confirmation_preserved: true,
    },
    host_contract: {
      installation_grants_authority: false,
      private_context_granted: false,
      external_side_effect_created: false,
    },
    next_boundary: candidates.length
      ? 'Systemia must admit, deduplicate, resolve dependencies, verify capacity and authorize each consequential action before execution.'
      : 'No strong Evercraft capability match was found. Do not fabricate a route.',
  };
}
