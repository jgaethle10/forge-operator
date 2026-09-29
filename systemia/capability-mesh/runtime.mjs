import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCapabilityMesh } from './mesh.mjs';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function requiredString(value, field) {
  const text = String(value || '').trim();
  if (!text) throw new Error(field + '_required');
  return text;
}

function positiveNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(field + '_invalid');
  return number;
}

function contractMap(root) {
  const file = readJson(path.join(root, 'systemia', 'capability-mesh', 'contracts.json'));
  return new Map((file.contracts || []).map((contract) => [contract.product_key, contract]));
}

function publicProductMap(root) {
  const file = readJson(path.join(root, 'registry', 'public-products.json'));
  return new Map((file.products || []).map((product) => [product.product_key, product]));
}

function directDoorMap(root) {
  const file = readJson(path.join(root, 'public', '.well-known', 'evercraft-direct-door-readiness.json'));
  return new Map((file.products || []).map((door) => [door.slug, door]));
}

function laneCopy(lane) {
  return JSON.parse(JSON.stringify(lane));
}

export function compileProductRuntimePolicy(productKey, root = process.cwd()) {
  const key = requiredString(productKey, 'product_key');
  const contracts = contractMap(root);
  const contract = contracts.get(key);
  if (!contract) throw new Error('product_contract_missing');

  const mesh = renderCapabilityMesh(root);
  const coverage = mesh.products.find((row) => row.product_key === key);
  if (!coverage) throw new Error('product_not_in_public_index');
  if (coverage.contract_state !== 'complete_declaration') {
    throw new Error('product_contract_incomplete:' + coverage.gaps.join(','));
  }

  const product = publicProductMap(root).get(key);
  const door = contract.specialist_slug
    ? directDoorMap(root).get(contract.specialist_slug) || null
    : null;

  return {
    schema: 'evercraft.capability-mesh.runtime-policy.v1',
    product_key: key,
    product_name: product.name,
    product_class: product.class,
    contract_version: contract.contract_version,
    owner: contract.owner,
    authority: laneCopy(contract.authority),
    context: laneCopy(contract.context),
    meter: laneCopy(contract.meter),
    intake: laneCopy(contract.intake),
    execution: laneCopy(contract.execution),
    relationship: laneCopy(contract.relationship),
    receipt_reconciliation: laneCopy(contract.receipt_reconciliation),
    rollback: laneCopy(contract.rollback),
    compatibility: laneCopy(contract.compatibility),
    route: door
      ? {
          specialist_slug: contract.specialist_slug,
          state: door.state,
          direct_callable: door.direct_callable === true,
          registry_published: door.registry_published === true,
          preferred_route: door.preferred_route || null,
          blocking_gates: door.blocking_gates || [],
          next_release_action: door.next_release_action || null,
        }
      : {
          specialist_slug: contract.specialist_slug || null,
          state: 'not_declared',
          direct_callable: false,
          registry_published: false,
          preferred_route: null,
          blocking_gates: [],
          next_release_action: null,
        },
    runtime_verified: false,
    grants_authority: false,
    truth_boundary:
      'This runtime policy compiles declared product semantics. It does not grant Passport authority, entitlement, payment, live runtime readiness, or provider pickup.',
  };
}

export function buildExecutionGateInput({
  product_key,
  actor_ref,
  scope,
  resource_ref = null,
  request,
  request_fingerprint = null,
  meter_subject_ref = null,
  idempotency_key,
  lease_id = null,
  prepared_at = null,
  hold_seconds = null,
  permit_ttl_seconds = null,
  require_direct_specialist = false,
  root = process.cwd(),
} = {}) {
  const policy = compileProductRuntimePolicy(product_key, root);
  const actorRef = requiredString(actor_ref, 'actor_ref');
  const actionScope = requiredString(scope, 'scope');
  const idempotencyKey = requiredString(idempotency_key, 'idempotency_key');

  if (!policy.authority.scopes.includes(actionScope)) {
    throw new Error('scope_not_declared_in_authority_contract');
  }
  if (!policy.execution.scopes.includes(actionScope)) {
    throw new Error('scope_not_declared_in_execution_contract');
  }
  const action = (policy.execution.actions || []).find((row) => row.scope === actionScope);
  if (!action) throw new Error('execution_action_mapping_missing');

  if (policy.execution.gate_required !== true) {
    throw new Error('execution_gate_not_required_by_contract');
  }
  if (require_direct_specialist && policy.route.direct_callable !== true) {
    throw new Error('direct_specialist_not_ready');
  }
  if (!request_fingerprint && request === undefined) {
    throw new Error('request_or_fingerprint_required');
  }

  let meter = null;
  if (action.meter_metric) {
    if (policy.meter.state !== 'declared') throw new Error('meter_contract_not_declared');
    const metric = (policy.meter.metrics || []).find((row) => row.metric === action.meter_metric);
    if (!metric) throw new Error('action_meter_metric_not_declared');
    const meterSubjectRef = requiredString(meter_subject_ref, 'meter_subject_ref');
    meter = {
      subject_ref: meterSubjectRef,
      product: requiredString(policy.meter.product, 'meter.product'),
      metric: metric.metric,
      quantity: positiveNumber(action.meter_quantity ?? 1, 'meter_quantity'),
      unit: action.meter_unit || metric.unit || null,
    };
  }

  return {
    schema: 'evercraft.capability-mesh.execution-preparation.v1',
    product_key: policy.product_key,
    contract_version: policy.contract_version,
    execution_gate_input: {
      ...(lease_id ? { lease_id: requiredString(lease_id, 'lease_id') } : {}),
      idempotency_key: idempotencyKey,
      actor_ref: actorRef,
      passport_product: policy.authority.passport_product,
      scope: actionScope,
      ...(resource_ref ? { resource_ref: requiredString(resource_ref, 'resource_ref') } : {}),
      specialist_slug: requiredString(policy.route.specialist_slug, 'specialist_slug'),
      ...(request_fingerprint
        ? { request_fingerprint: requiredString(request_fingerprint, 'request_fingerprint') }
        : { request }),
      ...(prepared_at ? { prepared_at: String(prepared_at) } : {}),
      ...(meter ? { meter } : {}),
      ...(hold_seconds != null ? { hold_seconds: positiveNumber(hold_seconds, 'hold_seconds') } : {}),
      ...(permit_ttl_seconds != null
        ? { permit_ttl_seconds: positiveNumber(permit_ttl_seconds, 'permit_ttl_seconds') }
        : {}),
      require_direct_specialist: Boolean(require_direct_specialist),
    },
    route_snapshot: policy.route,
    grants_execution_authority: false,
    payment_state_inferred: false,
    runtime_verified: false,
  };
}

export function buildContextBinding(productKey, root = process.cwd()) {
  const policy = compileProductRuntimePolicy(productKey, root);
  if (policy.context.state !== 'declared') throw new Error('context_contract_not_declared');
  return {
    schema: 'evercraft.capability-mesh.context-binding.v1',
    product_key: policy.product_key,
    namespace: policy.context.namespace,
    read_scope: policy.context.read_scope,
    write_scope: policy.context.write_scope,
    receipt_reconciliation_namespace: policy.receipt_reconciliation.namespace,
    grants_context_access: false,
    grants_authority: false,
  };
}

export function renderRuntimePolicies(root = process.cwd()) {
  const contracts = readJson(path.join(root, 'systemia', 'capability-mesh', 'contracts.json'));
  const policies = [];
  for (const contract of contracts.contracts || []) {
    policies.push(compileProductRuntimePolicy(contract.product_key, root));
  }
  return {
    schema: 'evercraft.capability-mesh.runtime-policies.v1',
    generated_from: 'systemia/capability-mesh/contracts.json',
    policy_count: policies.length,
    policies,
    truth_boundary: {
      compiled_policy_is_not_grant:true,
      compiled_policy_is_not_runtime_verification:true,
      undeclared_scope_fails_closed:true,
      undeclared_meter_metric_fails_closed:true,
    },
  };
}

const isCli =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  const root = process.cwd();
  const out = path.join(root, 'systemia', 'capability-mesh', 'runtime-policies.json');
  const rendered = JSON.stringify(renderRuntimePolicies(root), null, 2) + '\n';

  if (process.argv.includes('--check')) {
    if (!fs.existsSync(out)) throw new Error('runtime_policies_missing');
    if (fs.readFileSync(out, 'utf8') !== rendered) throw new Error('runtime_policies_stale');
    console.log('CAPABILITY_MESH_RUNTIME_CURRENT');
  } else {
    fs.writeFileSync(out, rendered);
    console.log(out);
  }
}
