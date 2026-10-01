import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_LANES = [
  'authority',
  'context',
  'meter',
  'intake',
  'execution',
  'relationship',
  'receipt_reconciliation',
];

const VALID_LANE_STATES = new Set(['declared', 'not_required']);
const VALID_ADOPTION_STAGES = new Set(['shared_runtime', 'private_runtime', 'discovery_only']);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function requiredString(value, field) {
  const text = String(value || '').trim();
  if (!text) throw new Error(field + '_required');
  return text;
}

function validateLane(productKey, laneName, lane, root) {
  if (!lane || typeof lane !== 'object') {
    return {
      lane: laneName,
      state: 'missing',
      declared: false,
      evidence_refs: [],
      evidence_present: [],
      gaps: [laneName + '_contract_missing'],
    };
  }

  const state = String(lane.state || '').trim();
  if (!VALID_LANE_STATES.has(state)) {
    return {
      lane: laneName,
      state: 'invalid',
      declared: false,
      evidence_refs: [],
      evidence_present: [],
      gaps: [laneName + '_state_invalid'],
    };
  }

  if (state === 'not_required') {
    const reason = String(lane.reason || '').trim();
    return {
      lane: laneName,
      state,
      declared: true,
      reason: reason || null,
      evidence_refs: [],
      evidence_present: [],
      gaps: reason ? [] : [laneName + '_not_required_reason_missing'],
    };
  }

  const refs = [...new Set((lane.evidence_refs || []).map((ref) => String(ref || '').trim()).filter(Boolean))];
  const evidencePresent = refs.map((ref) => ({
    ref,
    present: fs.existsSync(path.resolve(root, ref)),
  }));

  const gaps = evidencePresent.filter((row) => !row.present).map((row) => laneName + '_evidence_missing:' + row.ref);

  if (laneName === 'authority') {
    if (!String(lane.passport_product || '').trim()) gaps.push('authority_passport_product_missing');
    if (!Array.isArray(lane.scopes) || lane.scopes.length === 0) gaps.push('authority_scopes_missing');
  }
  if (laneName === 'context') {
    if (!String(lane.namespace || '').trim()) gaps.push('context_namespace_missing');
    if (!String(lane.read_scope || '').trim()) gaps.push('context_read_scope_missing');
    if (!String(lane.write_scope || '').trim()) gaps.push('context_write_scope_missing');
  }
  if (laneName === 'meter') {
    if (!String(lane.product || '').trim()) gaps.push('meter_product_missing');
    if (!Array.isArray(lane.metrics) || lane.metrics.length === 0) gaps.push('meter_metrics_missing');
  }
  if (laneName === 'execution') {
    if (lane.gate_required !== true) gaps.push('execution_gate_required_not_declared');
    if (!Array.isArray(lane.actions) || lane.actions.length === 0) gaps.push('execution_actions_missing');
  }
  if (laneName === 'receipt_reconciliation') {
    if (!String(lane.namespace || '').trim()) gaps.push('receipt_reconciliation_namespace_missing');
  }

  return {
    lane: laneName,
    state,
    declared: true,
    evidence_refs: refs,
    evidence_present: evidencePresent,
    gaps,
  };
}

export function buildCapabilityMesh({
  root = process.cwd(),
  publicProducts,
  directDoors,
  contracts,
  ratchetBaseline,
} = {}) {
  if (publicProducts?.schema !== 'evercraft.saban.public-product-index.v1') {
    throw new Error('public_product_index_schema_invalid');
  }
  if (!String(directDoors?.schema || '').startsWith('evercraft.direct-door-readiness.')) {
    throw new Error('direct_door_readiness_schema_invalid');
  }
  if (contracts?.schema !== 'evercraft.capability-mesh.contracts.v1') {
    throw new Error('capability_mesh_contract_schema_invalid');
  }
  if (ratchetBaseline?.schema !== 'evercraft.capability-mesh.ratchet-baseline.v1') {
    throw new Error('capability_mesh_ratchet_baseline_schema_invalid');
  }

  const publicByKey = new Map((publicProducts.products || []).map((row) => [row.product_key, row]));
  const directBySlug = new Map((directDoors.products || []).map((row) => [row.slug, row]));
  const contractByProduct = new Map();

  for (const contract of contracts.contracts || []) {
    const productKey = requiredString(contract.product_key, 'product_key');
    if (contractByProduct.has(productKey)) throw new Error('duplicate_product_contract:' + productKey);
    if (!publicByKey.has(productKey)) throw new Error('contract_product_not_public:' + productKey);
    if (!VALID_ADOPTION_STAGES.has(String(contract.adoption_stage || '').trim())) {
      throw new Error('contract_adoption_stage_invalid:' + productKey);
    }
    contractByProduct.set(productKey, contract);
  }

  const rows = [...publicByKey.values()].map((product) => {
    const contract = contractByProduct.get(product.product_key) || null;
    const specialistSlug = contract?.specialist_slug || product.product_key;
    const directDoor = directBySlug.get(specialistSlug) || null;

    if (!contract) {
      return {
        product_key: product.product_key,
        name: product.name,
        product_class: product.class,
        public_invocation_mode: product.invocation?.mode || null,
        registry_name: product.registry_name || null,
        specialist_slug: directDoor ? specialistSlug : null,
        direct_door: directDoor
          ? {
              state: directDoor.state,
              direct_callable: directDoor.direct_callable === true,
              registry_published: directDoor.registry_published === true,
            }
          : null,
        contract_state: 'missing',
        contract_version: null,
        adoption_stage: 'missing',
        lane_states: Object.fromEntries(REQUIRED_LANES.map((lane) => [lane, 'missing'])),
        gaps: ['product_contract_missing'],
        next_contract_actions: [
          'declare_authority_contract',
          'declare_context_contract',
          'declare_meter_contract_or_not_required',
          'declare_intake_contract_or_not_required',
          'declare_execution_contract',
          'declare_relationship_contract_or_not_required',
          'declare_receipt_reconciliation_contract',
        ],
        runtime_verified: false,
      };
    }

    const laneResults = Object.fromEntries(
      REQUIRED_LANES.map((lane) => [lane, validateLane(product.product_key, lane, contract[lane], root)])
    );
    const gaps = Object.values(laneResults).flatMap((lane) => lane.gaps);
    if (contract.adoption_stage === 'shared_runtime') {
      for (const [index, action] of (contract.execution?.actions || []).entries()) {
        const scope = String(action?.scope || '').trim() || 'action_' + index;
        if (!String(action?.machine_tool || '').trim()) {
          gaps.push('execution_machine_tool_missing:' + scope);
        }
        if (
          !Array.isArray(action?.machine_tool_evidence_refs) ||
          action.machine_tool_evidence_refs.length === 0
        ) {
          gaps.push('execution_machine_tool_evidence_missing:' + scope);
        }
      }
    }
    if (contract.specialist_slug && !directDoor) gaps.push('declared_specialist_door_missing');
    if (!contract.rollback || !String(contract.rollback.policy || '').trim()) gaps.push('rollback_policy_missing');
    if (!contract.compatibility || !Array.isArray(contract.compatibility.intended_product_classes) || contract.compatibility.intended_product_classes.length === 0) {
      gaps.push('compatibility_product_classes_missing');
    }

    return {
      product_key: product.product_key,
      name: product.name,
      product_class: product.class,
      public_invocation_mode: product.invocation?.mode || null,
      registry_name: product.registry_name || null,
      specialist_slug: contract.specialist_slug || null,
      direct_door: directDoor
        ? {
            state: directDoor.state,
            direct_callable: directDoor.direct_callable === true,
            registry_published: directDoor.registry_published === true,
          }
        : null,
      contract_state: gaps.length === 0 ? 'complete_declaration' : 'incomplete_declaration',
      contract_version: contract.contract_version || null,
      adoption_stage: contract.adoption_stage,
      owner: contract.owner || null,
      lane_states: Object.fromEntries(
        Object.entries(laneResults).map(([lane, result]) => [lane, result.state])
      ),
      lane_evidence: Object.fromEntries(
        Object.entries(laneResults).map(([lane, result]) => [lane, result.evidence_present])
      ),
      gaps,
      next_contract_actions: gaps,
      runtime_verified: false,
      truth_boundary:
        'Complete declaration and source evidence do not prove live runtime integration. Runtime verification must be produced by product-specific end-to-end receipts.',
    };
  });

  const publicKeys = new Set(publicByKey.keys());
  const specialistOnly = (directDoors.products || [])
    .filter((door) => !publicKeys.has(door.slug))
    .map((door) => ({
      specialist_slug: door.slug,
      name: door.name,
      direct_door_state: door.state,
      direct_callable: door.direct_callable === true,
      public_product_state: 'not_in_public_product_index',
      action: 'review_before_publication_or_contract_binding',
    }));

  const complete = rows.filter((row) => row.contract_state === 'complete_declaration');
  const incomplete = rows.filter((row) => row.contract_state === 'incomplete_declaration');
  const missing = rows.filter((row) => row.contract_state === 'missing');
  const directPublic = rows.filter((row) => row.direct_door);
  const sharedRuntime = rows.filter(
    (row) => row.contract_state === 'complete_declaration' && row.adoption_stage === 'shared_runtime'
  );
  const privateRuntime = rows.filter(
    (row) => row.contract_state === 'complete_declaration' && row.adoption_stage === 'private_runtime'
  );
  const discoveryOnly = rows.filter(
    (row) => row.contract_state === 'complete_declaration' && row.adoption_stage === 'discovery_only'
  );

  const baselinePublic = new Set(ratchetBaseline.public_product_keys || []);
  const baselineDirectPublic = new Set(ratchetBaseline.direct_door_public_product_keys || []);
  const baselineSpecialistOnly = new Set(ratchetBaseline.specialist_only_slugs || []);

  const newPublicProducts = rows
    .filter((row) => !baselinePublic.has(row.product_key))
    .map((row) => row.product_key)
    .sort();
  const newPublicProductsWithoutContract = rows
    .filter((row) =>
      !baselinePublic.has(row.product_key) &&
      row.contract_state !== 'complete_declaration'
    )
    .map((row) => row.product_key)
    .sort();

  const newDirectDoorPublicProducts = directPublic
    .filter((row) => !baselineDirectPublic.has(row.product_key))
    .map((row) => row.product_key)
    .sort();
  const newDirectDoorWithoutContract = directPublic
    .filter((row) =>
      !baselineDirectPublic.has(row.product_key) &&
      row.contract_state !== 'complete_declaration'
    )
    .map((row) => row.product_key)
    .sort();

  const newSpecialistOnlyDoors = specialistOnly
    .filter((row) => !baselineSpecialistOnly.has(row.specialist_slug))
    .map((row) => row.specialist_slug)
    .sort();

  const blockingRegressions = [
    ...newPublicProductsWithoutContract.map((product_key) => ({
      code: 'new_public_product_without_contract',
      product_key,
    })),
    ...newDirectDoorWithoutContract.map((product_key) => ({
      code: 'new_direct_door_without_contract',
      product_key,
    })),
    ...newSpecialistOnlyDoors.map((specialist_slug) => ({
      code: 'new_specialist_only_door_requires_review',
      specialist_slug,
    })),
  ];

  return {
    schema: 'evercraft.capability-mesh.coverage.v1',
    generated_from: {
      public_products: 'registry/public-products.json',
      direct_doors: 'public/.well-known/evercraft-direct-door-readiness.json',
      contracts: 'systemia/capability-mesh/contracts.json',
    },
    summary: {
      public_product_count: rows.length,
      explicit_contract_count: complete.length + incomplete.length,
      complete_contract_declaration_count: complete.length,
      incomplete_contract_declaration_count: incomplete.length,
      missing_contract_count: missing.length,
      public_products_with_direct_door: directPublic.length,
      direct_callable_public_products: directPublic.filter((row) => row.direct_door.direct_callable).length,
      direct_door_public_products_without_contract: directPublic.filter((row) => row.contract_state === 'missing').length,
      specialist_doors_not_in_public_product_index: specialistOnly.length,
      shared_runtime_contract_count: sharedRuntime.length,
      private_runtime_contract_count: privateRuntime.length,
      discovery_only_contract_count: discoveryOnly.length,
    },
    priority_queues: {
      direct_door_without_contract: directPublic
        .filter((row) => row.contract_state === 'missing')
        .map((row) => row.product_key),
      incomplete_contracts: incomplete.map((row) => row.product_key),
      all_missing_contracts: missing.map((row) => row.product_key),
      contracted_not_shared_runtime: [...privateRuntime, ...discoveryOnly]
        .map((row) => row.product_key)
        .sort(),
    },
    ratchet: {
      schema: 'evercraft.capability-mesh.ratchet-state.v1',
      baseline_captured_at: ratchetBaseline.captured_at,
      state: blockingRegressions.length === 0 ? 'pass' : 'blocked',
      baseline_public_product_count: baselinePublic.size,
      current_public_product_count: rows.length,
      new_public_products: newPublicProducts,
      new_public_products_without_contract: newPublicProductsWithoutContract,
      baseline_direct_door_public_product_count: baselineDirectPublic.size,
      current_direct_door_public_product_count: directPublic.length,
      new_direct_door_public_products: newDirectDoorPublicProducts,
      new_direct_door_without_contract: newDirectDoorWithoutContract,
      new_specialist_only_doors: newSpecialistOnlyDoors,
      blocking_regressions: blockingRegressions,
      doctrine:
        'Grandfathered contract debt remains migration work. New public products and newly direct-door public products may not add uncontracted trust-chain debt.',
    },
    specialist_only: specialistOnly,
    products: rows,
    truth_boundary: contracts.truth_boundary,
  };
}

export function renderCapabilityMesh(root = process.cwd()) {
  return buildCapabilityMesh({
    root,
    publicProducts: readJson(path.join(root, 'registry', 'public-products.json')),
    directDoors: readJson(path.join(root, 'public', '.well-known', 'evercraft-direct-door-readiness.json')),
    contracts: readJson(path.join(root, 'systemia', 'capability-mesh', 'contracts.json')),
    ratchetBaseline: readJson(
      path.join(root, 'systemia', 'capability-mesh', 'ratchet-baseline.json')
    ),
  });
}

const isCli =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  const rendered = renderCapabilityMesh(process.cwd());

  if (process.argv.includes('--check')) {
    if (rendered.summary.incomplete_contract_declaration_count > 0) {
      throw new Error('capability_mesh_incomplete_contracts');
    }
    if (rendered.ratchet.state !== 'pass') {
      throw new Error('capability_mesh_ratchet_blocked');
    }
    console.log(JSON.stringify({
      state: 'CAPABILITY_MESH_CURRENT',
      summary: rendered.summary,
      ratchet: rendered.ratchet,
    }));
  } else {
    console.log(JSON.stringify(rendered, null, 2));
  }
}
