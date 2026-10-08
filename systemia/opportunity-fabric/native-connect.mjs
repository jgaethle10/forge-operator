import { createHash } from 'node:crypto';

// Portable, side-effect-free domain core. Authentication and storage belong to
// a native Systemia/Compute host, NOT to Base44 or this module.
const STATES = new Set(['active', 'hold', 'archived']);
const EVIDENCE = new Set(['unknown', 'public', 'self_reported', 'observed', 'corroborated']);
const CONSENT = new Set(['not_requested', 'safe_routing_approved', 'identity_approved', 'protected_approved']);
const KINDS = new Set(['fabric_member', 'connect_node']);
const text = (v, max = 240) => String(v ?? '').trim().slice(0, max);
const normalized = (v) => text(v).toLowerCase();
const digest = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const tags = (v) => [...new Set((Array.isArray(v) ? v : []).map(normalized).filter(Boolean))].slice(0, 50);
const failure = (reason, status = 409) => ({ ok: false, reason, status, outreach_created: false, protected_material_disclosed: false });
const ownerIs = (record, actor) => text(record?.owner_id, 180) && text(record.owner_id, 180) === text(actor, 180);
const live = (record) => record?.record_state === 'active' && record?.do_not_contact !== true && !['Hold', 'Closed', 'Do not contact'].includes(record?.relationship_state || record?.route_state);
const holds = (v) => String(v || '').toLowerCase() === 'booked';
const capabilityOverlap = (need, provider) => tags(provider.capabilities).includes(normalized(need));

export function normalizeLegacyConnectCase(input = {}, { ownerId } = {}) {
  const caseId = text(input.case_key || input.case_id, 180);
  const owner = text(ownerId, 180);
  const safeSummary = text(input.public_safe_summary, 1500);
  const needs = tags(input.capability_needed);
  if (!caseId || !owner || !safeSummary || !needs.length) {
    throw new Error('case_id_owner_safe_summary_and_capabilities_required');
  }
  const evidence = normalized(input.evidence_state || 'unknown').replaceAll('-', '_');
  if (!EVIDENCE.has(evidence)) throw new Error('invalid_case_evidence_state');
  const consentMap = {
    'not requested': 'not_requested',
    'public-safe routing approved': 'safe_routing_approved',
    'identity disclosure approved': 'identity_approved',
    'protected disclosure approved': 'protected_approved'
  };
  const rawConsent = normalized(input.consent_state || 'not_requested').replaceAll('-', '_');
  const consent = consentMap[rawConsent] || rawConsent;
  if (!CONSENT.has(consent)) throw new Error('invalid_consent_state');
  const state = input.do_not_contact === true || normalized(input.route_state) === 'hold' ? 'hold'
    : normalized(input.record_state || 'active');
  if (!STATES.has(state)) throw new Error('invalid_case_state');
  // Explicitly mark the private payload. No caller may spread this into a
  // matching response, public card, Lineage transaction, or logging receipt.
  return {
    schema: 'evercraft.connect.private-case.v1',
    case_id: caseId,
    owner_id: owner,
    source_system: 'base44_legacy',
    source_record_id: text(input.id, 180) || null,
    public_safe_summary: safeSummary,
    capability_needed: needs,
    geography: text(input.geography, 240) || null,
    evidence_state: evidence,
    consent_state: consent,
    record_state: state,
    route_state: text(input.route_state || 'New', 40),
    do_not_contact: input.do_not_contact === true,
    private: {
      organization_label: text(input.organization_label, 240),
      problem_statement: text(input.problem_statement, 4000),
      private_notes: text(input.private_notes, 4000),
      source_ref: text(input.source_ref, 1200)
    }
  };
}

export function nativeProvider(input = {}) {
  const kind = normalized(input.kind);
  if (!KINDS.has(kind)) throw new Error('provider_kind_invalid');
  const id = text(input.id, 180);
  const owner = text(input.owner_id, 180);
  if (!id || !owner) throw new Error('provider_id_and_owner_required');
  return {
    id, kind, owner_id: owner,
    label: text(input.label, 180),
    capabilities: tags(input.capabilities),
    record_state: normalized(input.record_state || 'active'),
    relationship_state: text(input.relationship_state, 80),
    availability: text(input.availability, 80),
    evidence_state: normalized(input.evidence_state || 'unknown'),
    do_not_contact: input.do_not_contact === true,
    // Deliberately no private email, notes, contact, or source details.
  };
}

export function normalizeLegacyConnectNode(input = {}, { ownerId } = {}) {
  const owner = text(ownerId, 180);
  const id = text(input.node_key || input.id, 180);
  if (!owner || !id) throw new Error('node_owner_and_id_required');
  if (input.owner_user_id && text(input.owner_user_id, 180) !== owner) {
    throw new Error('cross_owner_legacy_node_rejected');
  }
  if (!tags(input.capabilities).length) throw new Error('legacy_node_capabilities_required');
  return nativeProvider({
    id,
    owner_id: owner,
    kind: 'connect_node',
    label: input.label,
    capabilities: input.capabilities,
    record_state: input.record_state || 'active',
    relationship_state: input.relationship_state || 'Known',
    evidence_state: input.evidence_state || 'unknown',
    do_not_contact: input.do_not_contact === true
  });
}

export function normalizeLegacyFabricMember(input = {}) {
  // Members owned by a different account are NOT silently re-enrolled. This
  // adapter is for a trusted, consented native directory import only.
  const owner = text(input.created_by_id, 180);
  const id = text(input.id, 180);
  if (!owner || !id) throw new Error('legacy_member_owner_and_id_required');
  return nativeProvider({
    id,
    owner_id: owner,
    kind: 'fabric_member',
    label: input.name,
    // A role, vague specialty or generic tag is not proof of actual ability.
    capabilities: input.can_do,
    record_state: 'active',
    availability: input.availability,
    evidence_state: 'self_reported'
  });
}

export function previewNativeConnectMigration({ cases = [], nodes = [], ownerId } = {}) {
  const owner = text(ownerId, 180);
  if (!owner) throw new Error('verified_owner_required');
  if (!Array.isArray(cases) || !Array.isArray(nodes)) throw new Error('migration_arrays_required');
  let invalidCases = 0, invalidNodes = 0, heldCases = 0, heldNodes = 0;
  const caseIds = new Set(), nodeIds = new Set();
  let duplicateCases = 0, duplicateNodes = 0;
  for (const item of cases) {
    try {
      if (item.owner_user_id && text(item.owner_user_id, 180) !== owner) throw new Error('owner_mismatch');
      const record = normalizeLegacyConnectCase(item, { ownerId: owner });
      if (caseIds.has(record.case_id)) duplicateCases += 1;
      caseIds.add(record.case_id);
      if (!live(record)) heldCases += 1;
    } catch { invalidCases += 1; }
  }
  for (const item of nodes) {
    try {
      const node = normalizeLegacyConnectNode(item, { ownerId: owner });
      if (nodeIds.has(node.id)) duplicateNodes += 1;
      nodeIds.add(node.id);
      if (!live(node)) heldNodes += 1;
    } catch { invalidNodes += 1; }
  }
  // Aggregate counts only. Not an export, never a public listing, and no raw
  // business, family, contact or source records leave this function.
  return {
    schema: 'evercraft.connect.migration-preflight.v1',
    source: 'base44_legacy',
    cases_inspected: cases.length,
    nodes_inspected: nodes.length,
    cases_invalid: invalidCases,
    nodes_invalid: invalidNodes,
    cases_on_hold: heldCases,
    nodes_on_hold: heldNodes,
    duplicate_case_ids: duplicateCases,
    duplicate_node_ids: duplicateNodes,
    blockers_present: Boolean(invalidCases || invalidNodes || duplicateCases || duplicateNodes),
    ready_for_production_cutover: false,
    data_exported: false,
    consent_inferred: false,
    requires_authorized_encrypted_export: true,
    requires_tenant_isolation_and_authenticated_import: true
  };
}

export function planNativeConnect({
  caseRecord,
  actorId,
  providers,
  sources = { fabric_members: 'available', private_graph: 'available' }
} = {}) {
  if (!ownerIs(caseRecord, actorId)) return failure('case_owner_required', 403);
  if (!live(caseRecord)) return failure('case_on_hold_or_archived');
  if (sources?.fabric_members !== 'available' || sources?.private_graph !== 'available' || !Array.isArray(providers)) {
    return { ...failure('capability_sources_unavailable', 503), retryable: true };
  }
  const gaps = tags(caseRecord.capability_needed);
  if (!gaps.length) return failure('no_capabilities_needed', 422);
  const eligible = providers.map(nativeProvider).filter((p) => (
    live(p) &&
    !holds(p.availability) &&
    (p.kind !== 'connect_node' || p.owner_id === actorId) &&
    (p.kind !== 'fabric_member' || p.owner_id !== actorId)
  ));
  const packages = gaps.map((capability) => {
    const candidates = eligible.filter((p) => capabilityOverlap(capability, p))
      .map((p) => ({
        provider_id: p.id,
        provider_type: p.kind,
        label: p.label,
        capability,
        evidence_state: p.evidence_state,
        match_basis: 'declared_capability_exact',
        human_decision_required: true
      })).sort((a, b) => a.provider_id.localeCompare(b.provider_id));
    return { capability, candidates };
  });
  const planHashInput = {
    case_id: caseRecord.case_id,
    owner_id: actorId,
    needs: gaps,
    matches: packages.map((p) => ({ capability: p.capability, ids: p.candidates.map((c) => c.provider_id) }))
  };
  const planId = digest(planHashInput).slice(0, 32);
  return {
    schema: 'evercraft.connect.native-route-plan.v1',
    ok: true,
    plan_id: planId,
    case_id: caseRecord.case_id,
    packages: packages.map((p) => ({
      capability: p.capability,
      candidates: p.candidates.map((c) => ({
        ...c,
        case_id: caseRecord.case_id,
        proposal_id: digest([planId, p.capability, c.provider_type, c.provider_id]).slice(0, 32)
      }))
    })),
    unmatched_capabilities: packages.filter((p) => !p.candidates.length).map((p) => p.capability),
    protected_material_disclosed: false,
    private_contact_information_returned: false,
    outreach_created: false,
    payment_created: false,
    authority: 'human_review_only',
    persistence: 'none',
    truth_boundary: 'candidate_ranking_is_not_consent_or_execution_authority'
  };
}

export function reviewNativeConnectProposal({ caseRecord, proposal, currentProvider, actorId, decision } = {}) {
  if (!ownerIs(caseRecord, actorId)) return failure('case_owner_required', 403);
  if (!['Approved', 'Passed', 'Closed'].includes(decision)) return failure('unsupported_review_decision', 422);
  if (!proposal || proposal.case_id !== caseRecord.case_id || !text(proposal.proposal_id)) return failure('proposal_case_mismatch');
  if (decision !== 'Approved') {
    return { ok: true, case_id: caseRecord.case_id, proposal_id: proposal.proposal_id, decision,
      outreach_created: false, protected_material_disclosed: false, next_gate: 'none' };
  }
  if (!live(caseRecord)) return failure('case_on_hold_or_archived');
  if (!tags(caseRecord.capability_needed).includes(normalized(proposal.capability))) return failure('capability_no_longer_needed');
  if (!currentProvider) return failure('provider_unavailable');
  const provider = nativeProvider(currentProvider);
  if (provider.id !== proposal.provider_id || provider.kind !== proposal.provider_type) return failure('proposal_provider_mismatch');
  if (!live(provider) || holds(provider.availability)) return failure('provider_on_hold_or_unavailable');
  if (provider.kind === 'connect_node' && provider.owner_id !== actorId) return failure('private_provider_owner_required', 403);
  if (provider.kind === 'fabric_member' && provider.owner_id === actorId) return failure('self_member_cannot_be_selected');
  if (!capabilityOverlap(proposal.capability, provider)) return failure('provider_capability_no_longer_matches');
  return {
    schema: 'evercraft.connect.native-review.v1',
    ok: true,
    case_id: caseRecord.case_id,
    proposal_id: proposal.proposal_id,
    decision: 'Approved',
    next_gate: 'human_controlled_consent_check_and_connection_request',
    outreach_created: false,
    protected_material_disclosed: false,
    payment_created: false
  };
}

export async function recordSafeNativeConnectTransaction({ lineageStore, actorId, plan } = {}) {
  if (!lineageStore?.recordTransaction || !plan?.ok || !actorId) throw new Error('lineage_store_actor_and_valid_plan_required');
  // Only approved, non-sensitive metadata crosses into lineage. Do not record
  // raw cases, contact details, notes, financials or family circumstances.
  const safeEvidence = {
    plan_id: text(plan.plan_id, 100),
    case_fingerprint: digest([text(plan.case_id), actorId]),
    capability_count: (plan.packages || []).length,
    unmatched_count: (plan.unmatched_capabilities || []).length,
    outreach_created: false,
    protected_material_disclosed: false
  };
  return lineageStore.recordTransaction({
    kind: 'evercraft.connect.plan.proposed.v1',
    actor: { type: 'human', id: text(actorId, 180) },
    scope: { product: 'opportunity-fabric', capability: 'connect-routing' },
    inputs: [],
    outputs: [safeEvidence],
    evidence: [{ kind: 'domain_tested_planning_receipt', plan_id: safeEvidence.plan_id }],
    authority: { mutation: false, publish: false, payment: false, outreach: false },
    rationale: 'Metadata-only native Connect plan submitted for human review'
  });
}
