import fs from 'node:fs';
import path from 'node:path';

import {
  createConnectionObject,
  decideRoute,
  rankPotentialMatches
} from './connection-desk.mjs';
import { renderCapabilityMesh } from '../capability-mesh/mesh.mjs';

function text(value) {
  return String(value ?? '').trim();
}

function uniq(values = []) {
  return [...new Set(values.filter(Boolean).map((value) => text(value)).filter(Boolean))];
}

function safeJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function productCapabilityTerms(product = {}) {
  return uniq([
    product.name,
    product.class,
    ...(Array.isArray(product.intents) ? product.intents : []),
    ...(Array.isArray(product.aliases) ? product.aliases : [])
  ]);
}

function meshTrustScore(meshRow = {}) {
  if (!meshRow) return 35;
  if (meshRow.contract_state === 'complete_declaration' && meshRow.adoption_stage === 'shared_runtime') return 90;
  if (meshRow.contract_state === 'complete_declaration' && meshRow.adoption_stage === 'private_runtime') return 80;
  if (meshRow.contract_state === 'complete_declaration' && meshRow.adoption_stage === 'discovery_only') return 65;
  if (meshRow.contract_state === 'incomplete_declaration') return 45;
  return 35;
}

function meshCapacityScore(meshRow = {}) {
  if (!meshRow) return 25;
  if (meshRow.adoption_stage === 'shared_runtime') return 85;
  if (meshRow.adoption_stage === 'private_runtime') return 70;
  if (meshRow.adoption_stage === 'discovery_only') return 35;
  return 25;
}

export function buildEvercraftCapabilityProviders({
  products,
  capabilityMesh
} = {}) {
  const publicProducts = Array.isArray(products?.products) ? products.products : [];
  const meshByKey = new Map(
    (capabilityMesh?.products || []).map((row) => [row.product_key, row])
  );

  return publicProducts.map((product) => {
    const meshRow = meshByKey.get(product.product_key) || null;
    const canonicalUrl = text(product.canonical_url);

    return {
      provider_id: 'evercraft:' + product.product_key,
      name: product.name,
      provider_type: 'evercraft_capability',
      product_key: product.product_key,
      product_class: product.class,
      canonical_url: canonicalUrl || null,
      capabilities: productCapabilityTerms(product),
      geographies: [],
      remote: true,
      capacity_score: meshCapacityScore(meshRow),
      timing_score: meshRow?.contract_state === 'complete_declaration' ? 75 : 45,
      domain_experience_score: 75,
      trust_score: meshTrustScore(meshRow),
      economic_fit_score: 60,
      communication_fit_score: 90,
      strategic_complementarity_score: 95,
      evidence: {
        contract_state: meshRow?.contract_state || 'missing',
        adoption_stage: meshRow?.adoption_stage || 'missing',
        runtime_verified: meshRow?.runtime_verified === true,
        truth_boundary: meshRow?.truth_boundary || null
      }
    };
  });
}

export function loadEvercraftCapabilityProviders(root = process.cwd()) {
  const products = safeJson(
    path.join(root, 'public', '.well-known', 'evercraft-products.json')
  );
  const capabilityMesh = renderCapabilityMesh(root);
  return buildEvercraftCapabilityProviders({ products, capabilityMesh });
}

export function recoveryCandidateToConnection(candidate = {}) {
  const capabilityNeeded = uniq([
    ...(candidate.capability_needed || []),
    ...(candidate.operating_need ? ['operator', 'operations'] : []),
    ...(candidate.technology_need ? ['technology', 'automation'] : []),
    ...(candidate.buyer_need ? ['buyer', 'acquisition'] : []),
    ...(candidate.succession_need ? ['succession', 'operator transition'] : []),
    ...(candidate.workforce_need ? ['workforce', 'staffing'] : []),
    ...(candidate.distribution_need ? ['distribution', 'channel'] : []),
    ...(candidate.capital_need != null ? ['capital', 'investment'] : [])
  ]);

  return createConnectionObject({
    connection_id: text(candidate.connection_id || ('recovery:' + candidate.candidate_id)),
    source_candidate_id: text(candidate.candidate_id),
    owner: text(candidate.owner),
    organization: text(candidate.organization),
    problem_statement: text(candidate.problem_statement),
    protected_summary: text(candidate.protected_summary),
    public_safe_summary: text(candidate.public_safe_summary),
    capability_needed: capabilityNeeded,
    geography: text(candidate.geography),
    industry: text(candidate.industry),
    urgency: candidate.urgency,
    budget_state: candidate.budget_state,
    capital_need: candidate.capital_need,
    operating_need: Boolean(candidate.operating_need),
    technology_need: Boolean(candidate.technology_need),
    buyer_need: Boolean(candidate.buyer_need),
    succession_need: Boolean(candidate.succession_need),
    workforce_need: Boolean(candidate.workforce_need),
    distribution_need: Boolean(candidate.distribution_need),
    regulatory_need: Boolean(candidate.regulatory_need),
    evidence_state: candidate.evidence_state,
    consent_state: candidate.consent_state,
    disclosure_tier: 1,
    canonical_relationship_owner: text(candidate.canonical_relationship_owner || 'evercraft-recovery'),
    do_not_contact: candidate.do_not_contact || [],
    referral_economics: { type: 'none', disclosed: true }
  });
}

export function composeExecutionChain(connection, {
  evercraftProviders = [],
  externalProviders = [],
  perCapability = 3
} = {}) {
  const allProviders = [
    ...evercraftProviders.map((provider) => ({ ...provider, source: 'evercraft' })),
    ...externalProviders.map((provider) => ({ ...provider, source: 'external' }))
  ];

  const packages = [];
  const gaps = [];

  for (const capability of connection.capability_needed) {
    const scopedConnection = {
      ...connection,
      capability_needed: [capability]
    };

    const ranked = rankPotentialMatches(scopedConnection, allProviders, {
      limit: Math.max(perCapability * 4, 12)
    })
      .filter((match) => Number(match.reasons?.capability_fit || 0) > 0)
      .slice(0, perCapability);

    if (!ranked.length || ranked[0].score < 45) {
      gaps.push({
        capability,
        state: 'unmatched',
        rule: 'Unmatched capabilities remain explicit gaps. Do not invent a partner.'
      });
      continue;
    }

    packages.push({
      capability,
      candidates: ranked.map((match) => {
        const sourceProvider = allProviders.find(
          (provider) => provider.provider_id === match.provider_id
        );
        return {
          provider_id: match.provider_id,
          name: match.name,
          source: sourceProvider?.source || 'unknown',
          score: match.score,
          product_key: sourceProvider?.product_key || null,
          evidence: sourceProvider?.evidence || null
        };
      })
    });
  }

  return {
    schema: 'evercraft.connect.execution-chain.v1',
    connection_id: connection.connection_id,
    source_candidate_id: connection.source_candidate_id,
    public_safe_summary: connection.public_safe_summary,
    capability_packages: packages,
    unresolved_capabilities: gaps,
    protected_summary_included: false,
    contact_information_included: false,
    rule: 'Candidate suggestions are planning evidence only. They create no outreach, membership, contract, rights, payment or authority.'
  };
}

export function buildOpportunityFabricHandoff(connection, executionChain) {
  return {
    schema: 'evercraft.connect.opportunity-fabric-handoff.v1',
    destination_product_key: 'opportunity-fabric',
    destination_runtime_state: 'verified_private_runtime_not_public_transactional',
    connection_id: connection.connection_id,
    source_candidate_id: connection.source_candidate_id,
    opportunity: {
      title: connection.organization
        ? connection.organization + ' continuity / execution opportunity'
        : 'Execution opportunity',
      description: connection.public_safe_summary,
      location: connection.geography || null,
      needs: connection.capability_needed,
      industry: connection.industry || null
    },
    execution_chain: executionChain,
    disclosure: {
      tier: 1,
      protected_summary_included: false,
      private_contact_information_included: false,
      owner_consent_required_before_identity_or_protected_detail: true
    },
    authority: {
      create_connection_request: false,
      invite_team: false,
      accept_work: false,
      create_payment: false,
      disclose_protected_material: false
    },
    next_gate: 'human_review_before_private_runtime_submission'
  };
}

export function routeRecoveryCandidate(candidate, {
  evercraftProviders = [],
  externalProviders = []
} = {}) {
  const connection = recoveryCandidateToConnection(candidate);
  const evercraftMatches = rankPotentialMatches(connection, evercraftProviders, { limit: 5 });
  const externalMatches = rankPotentialMatches(connection, externalProviders, { limit: 5 });

  const topEvercraft = evercraftMatches[0]?.score || 0;
  const topExternal = externalMatches[0]?.score || 0;

  const decision = decideRoute({
    evercraft_fit: topEvercraft,
    evercraft_capacity: Number(candidate.evercraft_capacity ?? 45),
    partner_fit: Number(candidate.partner_fit ?? 70),
    external_match_fit: topExternal,
    timing_readiness: Number(candidate.timing_readiness ?? 60),
    evidence_quality: Number(candidate.evidence_quality ?? 60),
    owner_willingness: Number(candidate.owner_willingness ?? 50)
  });

  const executionChain = composeExecutionChain(connection, {
    evercraftProviders,
    externalProviders
  });

  return {
    schema: 'evercraft.recovery.connect-routing.v1',
    candidate_id: candidate.candidate_id,
    connection,
    decision,
    evercraft_matches: evercraftMatches,
    external_matches: externalMatches,
    execution_chain: executionChain,
    opportunity_fabric_handoff: buildOpportunityFabricHandoff(connection, executionChain)
  };
}
