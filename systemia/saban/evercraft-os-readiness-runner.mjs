#!/usr/bin/env node
/**
 * Execute bounded local source checks through the existing Saban scheduler.
 * Results prove SOURCE READINESS ONLY, not Systemia admission, real node
 * execution, product delivery, or production runtime health.
 */
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  loadMultiplicationRegistry,
  resolveMultiplicationContract,
  loadWorkItems,
  buildMultiplicationPlan,
  executeMultiplicationPlan
} from './multiplier.mjs';
import { admitMultiplicationRequest } from './admission.mjs';
import { preflightOsMission } from '../evercraft-os/parallel-mission-bridge.mjs';

export async function runOsReadiness({ rootDir = process.cwd(), outputFile = null } = {}) {
  const registry = loadMultiplicationRegistry(resolve(rootDir, 'systemia/saban/multiplication-registry.json'));
  const contract = resolveMultiplicationContract('evercraft-os-readiness', registry);
  const workItems = loadWorkItems(contract, rootDir);
  if (workItems.length !== 12 || new Set(workItems.map(x => x.key)).size !== 12) {
    throw new Error('os_readiness_incomplete_or_duplicate_work_items');
  }
  const systemiaPolicy = preflightOsMission({ rootDir });
  if (systemiaPolicy.state !== 'systemia_policy_plan_admitted' ||
      systemiaPolicy.route_count !== 12 ||
      systemiaPolicy.durable_systemia_mission_recorded !== false) {
    throw new Error('systemia_os_readiness_policy_held');
  }
  const admission = admitMultiplicationRequest({
    contract,
    requestedLogicalAgents: 12,
    requestedPhysicalWorkers: 4,
    requestedWorkItems: workItems.length,
    requestedAttempts: 1,
    budget: contract.budget
  });
  if (!admission.admitted || admission.grant.logical_agents !== 12 ||
      admission.grant.physical_workers !== 4) {
    throw new Error('saban_local_readiness_budget_denied');
  }
  const plan = buildMultiplicationPlan({
    contract, logicalAgents: admission.grant.logical_agents,
    physicalWorkers: admission.grant.physical_workers, workItems
  });
  const execution = await executeMultiplicationPlan({
    contract, plan, workItems, rootDir, reconcile: true, statePath: null
  });
  const passed = execution.quality?.status === 'pass' &&
      execution.reconciliation?.status === 'reconciled' &&
      execution.reconciliation?.expected_lanes === 12 &&
      execution.reconciliation?.returned_lanes === 12 &&
      systemiaPolicy.program_sha256 === execution.reconciliation?.program_sha256 &&
      execution.sample_results?.every(x => x.source_ready === true &&
        x.systemia_admitted === false && x.runtime_observed === false);
  const receipt = {
    schema: 'evercraft.os.parallel-readiness-receipt.v1',
    generated_at: new Date().toISOString(),
    mission_key: 'evercraft-os-parallel-completion-20261021',
    state: passed ? 'source_ready' : 'held',
    scope: 'read_only_local_saban_source_audit',
    systemia_policy: systemiaPolicy,
    systemia_policy_evaluated: true,
    systemia_policy_plan_admitted: true,
    systemia_policy_matches_reconciled_program: systemiaPolicy.program_sha256 === execution.reconciliation?.program_sha256,
    durable_systemia_mission_recorded: false,
    logical_assignments_executed_locally: execution.quality?.completed || 0,
    logical_assignment_limit: 12,
    local_worker_slots: 4,
    node_seed_capacity_leases_acquired: 0,
    systemia_mission_admitted: false,
    execution_authority_granted: false,
    external_calls_performed_by_adapter: false,
    public_deployment_proven: false,
    money_received: false,
    customer_delivery_proven: false,
    program_sha256: execution.reconciliation?.program_sha256 || null,
    results_digest: execution.results_digest,
    quality: execution.quality,
    reconciliation: execution.reconciliation,
    lanes: execution.sample_results.map(x => ({
      lane_id: x.lane_id,
      source_state: x.state,
      anchors: x.anchors,
      runtime_observed: false
    }))
  };
  if (outputFile) {
    const dest = resolve(rootDir, outputFile);
    // Only allow known artifact directory; never overwrite a source/credential file.
    const prefix = resolve(rootDir, 'artifacts/saban-multiplier/os-readiness') + '/';
    if (!dest.startsWith(prefix) || !dest.endsWith('.json')) throw new Error('receipt_destination_not_admitted');
    mkdirSync(dirname(dest), { recursive: true });
    const temp = join(dirname(dest), '.receipt-' + process.pid + '.tmp');
    try {
      writeFileSync(temp, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
      renameSync(temp, dest);
    } finally { rmSync(temp, { force: true }); }
  }
  if (!passed) throw new Error('saban_os_readiness_held:' + JSON.stringify(execution.reconciliation?.findings || execution.quality?.failures || []));
  return receipt;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runOsReadiness({ outputFile: 'artifacts/saban-multiplier/os-readiness/latest.json' })
    .then(r => console.log(JSON.stringify({
      schema: r.schema,
      state: r.state,
      local_assignments: r.logical_assignments_executed_locally,
      source_lanes: r.lanes.length,
      real_nodes_used: r.node_seed_capacity_leases_acquired,
      authority_granted: r.execution_authority_granted
    })))
    .catch(e => { console.error(e); process.exitCode = 1; });
}
