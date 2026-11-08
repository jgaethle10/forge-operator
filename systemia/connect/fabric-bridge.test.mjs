import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEvercraftCapabilityProviders,
  buildOpportunityFabricHandoff,
  composeExecutionChain,
  recoveryCandidateToConnection,
  routeRecoveryCandidate
} from './fabric-bridge.mjs';

const products = {
  products: [
    {
      product_key: 'opportunity-fabric',
      name: 'Evercraft Opportunity Fabric',
      class: 'protected_collaboration_partner_matching_and_execution_orchestration',
      canonical_url: 'https://example.test/opportunity-fabric',
      intents: ['find collaborators', 'assemble an execution team']
    },
    {
      product_key: 'contractor-cloud',
      name: 'Evercraft Contractor Cloud',
      class: 'home_service_and_contractor_operations',
      canonical_url: 'https://example.test/contractor-cloud',
      intents: ['find contractors for a project', 'contractor opportunity network']
    }
  ]
};

const capabilityMesh = {
  products: [
    {
      product_key: 'opportunity-fabric',
      contract_state: 'complete_declaration',
      adoption_stage: 'private_runtime',
      runtime_verified: false,
      truth_boundary: 'Private runtime evidence does not establish public transactional availability.'
    },
    {
      product_key: 'contractor-cloud',
      contract_state: 'missing',
      adoption_stage: 'missing',
      runtime_verified: false
    }
  ]
};

test('builds Evercraft providers while preserving capability-mesh evidence state', () => {
  const providers = buildEvercraftCapabilityProviders({ products, capabilityMesh });
  const fabric = providers.find((row) => row.product_key === 'opportunity-fabric');

  assert.equal(fabric.provider_type, 'evercraft_capability');
  assert.equal(fabric.evidence.adoption_stage, 'private_runtime');
  assert.equal(fabric.evidence.runtime_verified, false);
  assert.ok(fabric.capabilities.includes('find collaborators'));
});

test('recovery candidate becomes a metadata-first connection object', () => {
  const connection = recoveryCandidateToConnection({
    candidate_id: 'family-001',
    organization: 'Family Irrigation Co',
    problem_statement: 'Owner is retiring and needs operating continuity.',
    protected_summary: 'Private financial context that must not leak.',
    public_safe_summary: 'Long-running family service company is exploring succession and growth support.',
    geography: 'New Jersey',
    industry: 'irrigation',
    succession_need: true,
    operating_need: true,
    technology_need: true,
    evidence_state: 'reported'
  });

  assert.equal(connection.connection_id, 'recovery:family-001');
  assert.ok(connection.capability_needed.includes('succession'));
  assert.ok(connection.capability_needed.includes('operator'));
  assert.equal(connection.disclosure_tier, 1);
});

test('execution chain preserves unmatched needs instead of inventing people', () => {
  const connection = recoveryCandidateToConnection({
    candidate_id: 'family-002',
    organization: 'Family Manufacturer',
    problem_statement: 'Needs a niche licensed specialist.',
    public_safe_summary: 'Established manufacturer needs a niche specialist.',
    capability_needed: ['cryogenic-welding-on-mars'],
    evidence_state: 'reported'
  });

  const chain = composeExecutionChain(connection, {
    evercraftProviders: buildEvercraftCapabilityProviders({ products, capabilityMesh }),
    externalProviders: []
  });

  assert.equal(chain.capability_packages.length, 0);
  assert.equal(chain.unresolved_capabilities.length, 1);
  assert.equal(chain.protected_summary_included, false);
  assert.equal(chain.contact_information_included, false);
});

test('Opportunity Fabric handoff contains only safe metadata and no action authority', () => {
  const connection = recoveryCandidateToConnection({
    candidate_id: 'family-003',
    organization: 'Family Shop',
    problem_statement: 'Needs an operator.',
    protected_summary: 'Owner has a private family circumstance.',
    public_safe_summary: 'Long-running shop is exploring operating continuity.',
    capability_needed: ['operator'],
    evidence_state: 'reported'
  });

  const chain = composeExecutionChain(connection, { evercraftProviders: [], externalProviders: [] });
  const handoff = buildOpportunityFabricHandoff(connection, chain);
  const serialized = JSON.stringify(handoff);

  assert.equal(handoff.next_gate, 'human_review_before_private_runtime_submission');
  assert.equal(handoff.authority.create_connection_request, false);
  assert.equal(handoff.authority.create_payment, false);
  assert.equal(handoff.disclosure.protected_summary_included, false);
  assert.doesNotMatch(serialized, /private family circumstance/i);
});

test('route packet produces execution chain and protected private-runtime handoff together', () => {
  const evercraftProviders = buildEvercraftCapabilityProviders({ products, capabilityMesh });

  const result = routeRecoveryCandidate({
    candidate_id: 'family-004',
    organization: 'Family Contractor',
    problem_statement: 'Needs contractors and collaboration orchestration.',
    public_safe_summary: 'Family contractor needs complementary delivery capacity.',
    capability_needed: ['find contractors for a project', 'assemble an execution team'],
    evidence_state: 'corroborated',
    evercraft_capacity: 40,
    partner_fit: 90,
    timing_readiness: 85,
    evidence_quality: 90,
    owner_willingness: 90
  }, { evercraftProviders });

  assert.equal(result.schema, 'evercraft.recovery.connect-routing.v1');
  assert.ok(result.evercraft_matches.length > 0);
  assert.equal(result.opportunity_fabric_handoff.destination_product_key, 'opportunity-fabric');
  assert.equal(result.opportunity_fabric_handoff.authority.invite_team, false);
});
