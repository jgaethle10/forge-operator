#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createMissionState } from '../organism/kernel.mjs';
import { admitGoalPlan, createGoalState, goalSnapshot } from '../organism/goal-runtime.mjs';
import { YardOperator } from '../yard/operator.mjs';
import {
  listPendingRemoteDeviceReviews,
} from '../yard/remote-device-review.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const contract = JSON.parse(fs.readFileSync(path.join(here, 'machine-contract.json'), 'utf8'));
const sabanRegistry = JSON.parse(fs.readFileSync(path.join(here, '..', 'saban', 'multiplication-registry.json'), 'utf8'));
const publicProductIndex = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'registry', 'public-products.json'), 'utf8'));

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function unique(values, limit = 200) {
  return [...new Set((values || []).flatMap((value) => Array.isArray(value) ? value : [value]).map(clean).filter(Boolean))].slice(0, limit);
}

function slug(value) {
  return lower(value)
    .normalize('NFKC')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'mission';
}

function shortHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function at(now) {
  return now instanceof Date ? now.toISOString() : new Date(now || Date.now()).toISOString();
}

function sabanSoftwareIds() {
  return new Set((sabanRegistry.software || []).map((row) => clean(row.software_id)));
}

function productByKey(productKey) {
  const key = clean(productKey);
  if (!key) return null;
  return (publicProductIndex.products || []).find((row) => clean(row.product_key) === key) || null;
}

function normalizeTask(raw, index) {
  const workType = lower(raw?.work_type || raw?.type || 'execute');
  const title = clean(raw?.title || raw?.objective || raw?.name || `work-${index + 1}`);
  const workKey = clean(raw?.work_key || raw?.key || `${slug(title)}-${index + 1}`);
  return {
    ...raw,
    work_key: workKey,
    title,
    work_type: workType,
    dependency_keys: unique(raw?.dependency_keys || raw?.depends_on || []),
    assigned_agents: unique(raw?.assigned_agents || [], 50),
    authorization_refs: unique(raw?.authorization_refs || [], 50),
  };
}

function consequenceFor(task) {
  const workType = lower(task?.work_type || task?.type);
  const forcedByWorkType = Array.isArray(contract.consequential_work_types) &&
    contract.consequential_work_types.includes(workType);
  const declaredImpact = lower(task?.impact);
  const impact = declaredImpact || (forcedByWorkType ? 'trust_boundary' : '');
  const declared = task?.human_gate_required === true || task?.founder_attention_required === true;
  const consequential = contract.consequential_impacts.includes(impact);
  return {
    impact,
    required: declared || consequential || forcedByWorkType,
    authorized: unique(task?.authorization_refs || []).length > 0 || task?.authorized === true,
  };
}

export function machineInventory(rootDir = process.cwd()) {
  const components = contract.components.map((component) => {
    const sources = component.source_refs.map((ref) => ({
      ref,
      present: fs.existsSync(path.resolve(rootDir, ref)),
    }));
    const present = sources.every((source) => source.present);
    return {
      component_key: component.component_key,
      role: component.role,
      state: present ? 'source_present' : 'source_missing',
      sources,
    };
  });

  return {
    schema: 'evercraft.systemia.machine-inventory.v1',
    contract_version: contract.version,
    observed_at: new Date().toISOString(),
    evidence_semantics: 'Source presence only. This is not a claim of live deployment, healthy runtime, revenue, payment, or customer readiness.',
    components,
    product_graph: {
      schema: publicProductIndex.schema,
      source: 'registry/public-products.json',
      admitted_products: (publicProductIndex.products || []).length,
    },
    summary: {
      total: components.length,
      source_present: components.filter((row) => row.state === 'source_present').length,
      source_missing: components.filter((row) => row.state === 'source_missing').length,
      admitted_public_products: (publicProductIndex.products || []).length,
    },
  };
}

export function routeTask(task) {
  const specialist = contract.routing[task.work_type] || 'systemia-organism';
  const softwareId = clean(task.software_id);
  const productKey = clean(task.product_key);
  const product = productByKey(productKey);
  const parallelRequested = task.parallel === true || Number(task.logical_agents || 0) > 1 || Boolean(softwareId);
  const allowed = sabanSoftwareIds();
  const sabanRequested = parallelRequested && softwareId && allowed.has(softwareId);
  const unsupportedSaban = parallelRequested && softwareId && !allowed.has(softwareId);
  const consequence = consequenceFor(task);

  return {
    schema: 'evercraft.systemia.dispatch-decision.v1',
    work_key: task.work_key,
    mission_authority: contract.authority.mission_authority,
    specialist_component: specialist,
    execution_component: sabanRequested ? 'saban' : specialist,
    software_id: softwareId || null,
    target_product_key: productKey || null,
    target_product_name: product ? clean(product.name) : null,
    target_product_admitted: productKey ? Boolean(product) : null,
    scale_requested: parallelRequested,
    scale_admitted: sabanRequested,
    hold: unsupportedSaban
      ? 'saban_contract_missing'
      : productKey && !product
        ? 'unknown_product'
        : consequence.required && !consequence.authorized
          ? 'human_gate_unresolved'
          : null,
    human_gate_required: consequence.required,
    authorization_refs: unique(task.authorization_refs || []),
    authority_boundary: 'Saban and specialists execute bounded work. Systemia retains mission authority.',
  };
}

export function admitMission({ request, rootDir = process.cwd(), now = new Date() }) {
  if (!request || typeof request !== 'object') throw new Error('mission request object is required');
  const objective = clean(request.objective);
  if (!objective) throw new Error('mission objective is required');

  const rawTasks = Array.isArray(request.tasks) && request.tasks.length
    ? request.tasks
    : [{ title: objective, work_type: request.work_type || 'execute' }];
  const tasks = rawTasks.map(normalizeTask);

  const providedKey = clean(request.mission_key);
  const missionKey = providedKey || `${slug(objective)}-${shortHash(JSON.stringify({
    objective,
    success_condition: clean(request.success_condition),
    tasks: tasks.map((task) => [task.work_key, task.work_type, task.dependency_keys]),
  }))}`;

  const mission = createMissionState({
    missionKey,
    objective,
    successCondition: clean(request.success_condition),
    now: at(now),
  });

  const goalBase = createGoalState({
    goalKey: clean(request.goal_key || missionKey),
    missionKey,
    objective,
    successCondition: clean(request.success_condition),
    contextRefs: unique(request.context_refs || []),
    now,
  });

  const dispatch = tasks.map(routeTask);
  const dispatchByKey = new Map(dispatch.map((row) => [row.work_key, row]));

  const goalPlan = tasks.map((task) => {
    const decision = dispatchByKey.get(task.work_key);
    return {
      work_key: task.work_key,
      title: task.title,
      work_type: task.work_type,
      dependency_keys: task.dependency_keys,
      assigned_agents: task.assigned_agents,
      human_gate_required: decision.human_gate_required,
    };
  });

  let goal = admitGoalPlan({ state: goalBase, plan: goalPlan, now });

  for (const task of goal.tasks) {
    const source = tasks.find((row) => row.work_key === task.work_key);
    if (!source) continue;
    const refs = unique(source.authorization_refs || []);
    if (refs.length && task.human_gate_required) {
      task.human_gate_unresolved = false;
      task.authorization_refs = refs;
    }
  }

  const hardHolds = dispatch.filter((row) => row.hold && row.hold !== 'human_gate_unresolved');
  const humanHolds = dispatch.filter((row) => row.hold === 'human_gate_unresolved');
  const emergency = request.emergency_direct_dispatch === true;

  const receipt = {
    schema: 'evercraft.systemia.mission-admission-receipt.v1',
    mission_key: missionKey,
    admitted_at: at(now),
    admitted: hardHolds.length === 0,
    authority: contract.authority.mission_authority,
    direct_specialist_dispatch_requested: request.direct_specialist_dispatch === true,
    direct_specialist_dispatch_granted: emergency && contract.authority.emergency_direct_dispatch === true,
    emergency_path: emergency,
    task_count: tasks.length,
    dispatch_count: dispatch.length,
    held_count: hardHolds.length + humanHolds.length,
    hard_holds: hardHolds.map((row) => ({ work_key: row.work_key, hold: row.hold })),
    human_holds: humanHolds.map((row) => ({ work_key: row.work_key, hold: row.hold })),
    source_inventory: machineInventory(rootDir).summary,
    evidence_semantics: 'Admission proves routing policy evaluation, not execution or live runtime success.',
  };
  receipt.receipt_hash = shortHash(JSON.stringify(receipt));

  return {
    schema: 'evercraft.systemia.control-plane-plan.v1',
    mission,
    goal,
    goal_snapshot: goalSnapshot(goal),
    dispatch,
    receipt,
  };
}

export async function listRemoteDeviceTrustCandidates({
  yard = null,
  yardStateDir = '',
  brokerDeploymentId,
} = {}) {
  const broker = clean(brokerDeploymentId);
  if (!broker) throw new Error('broker deployment id is required');

  const operator = yard || new YardOperator({
    stateDir: path.resolve(String(yardStateDir || '')),
  });
  if (!yard && !clean(yardStateDir)) {
    throw new Error('yard state directory is required');
  }

  const result = await listPendingRemoteDeviceReviews({
    yard: operator,
    brokerDeploymentId: broker,
  });

  return {
    ...result,
    authority: 'read_only',
    trust_change_executed: false,
  };
}

export function prepareRemoteDeviceTrustChange({
  brokerDeploymentId,
  candidateRef,
  action = 'authorize',
} = {}) {
  const broker = clean(brokerDeploymentId);
  const candidate = clean(candidateRef);
  const normalizedAction = lower(action);

  if (!broker) throw new Error('broker deployment id is required');
  if (!candidate) throw new Error('candidate ref is required');
  if (!['authorize'].includes(normalizedAction)) {
    throw new Error('unsupported remote device trust action');
  }

  return {
    schema: 'evercraft.systemia.remote-device-trust-change-plan.v1',
    action: normalizedAction,
    broker_deployment_id: broker,
    candidate_ref: candidate,
    impact: 'trust_boundary',
    specialist_component: 'yard-operator',
    human_gate_required: true,
    explicit_candidate_confirmation_required: true,
    explicit_approval_reference_required: true,
    executable_by_control_plane: false,
    next_action:
      'Execute the separate Yard trust-review authorization only after explicit human confirmation of this exact candidate.',
  };
}

export function assertControlPlane(plan) {
  if (!plan || plan.schema !== 'evercraft.systemia.control-plane-plan.v1') {
    throw new Error('valid control-plane plan required');
  }
  if (plan.receipt.authority !== 'systemia-organism') {
    throw new Error('Systemia must remain mission authority');
  }
  for (const decision of plan.dispatch) {
    if (decision.execution_component === 'saban' && decision.mission_authority !== 'systemia-organism') {
      throw new Error(`Saban authority escalation detected for ${decision.work_key}`);
    }
    if (!decision.specialist_component) {
      throw new Error(`missing specialist route for ${decision.work_key}`);
    }
  }
  return true;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--inventory')) {
    console.log(JSON.stringify(machineInventory(process.cwd()), null, 2));
    return;
  }

  if (argv.includes('--pending-remote-devices')) {
    const yardIndex = argv.indexOf('--yard-state');
    const brokerIndex = argv.indexOf('--broker-deployment');
    const yardStateDir = yardIndex >= 0 ? argv[yardIndex + 1] : '';
    const brokerDeploymentId = brokerIndex >= 0 ? argv[brokerIndex + 1] : '';
    const result = await listRemoteDeviceTrustCandidates({
      yardStateDir,
      brokerDeploymentId,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (argv.includes('--prepare-remote-device-authorization')) {
    const brokerIndex = argv.indexOf('--broker-deployment');
    const candidateIndex = argv.indexOf('--candidate');
    const result = prepareRemoteDeviceTrustChange({
      brokerDeploymentId: brokerIndex >= 0 ? argv[brokerIndex + 1] : '',
      candidateRef: candidateIndex >= 0 ? argv[candidateIndex + 1] : '',
      action: 'authorize',
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const requestIndex = argv.indexOf('--request');
  const requestPath = requestIndex >= 0 ? argv[requestIndex + 1] : null;
  if (!requestPath) throw new Error('use --inventory or --request <file>');

  const request = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), requestPath), 'utf8'));
  const plan = admitMission({ request, rootDir: process.cwd() });
  assertControlPlane(plan);
  console.log(JSON.stringify(plan, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
