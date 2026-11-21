#!/usr/bin/env node
/**
 * Authenticated, attested two-NodeSeed OS workload proof using localhost only.
 * NEVER contacts real enrolled hardware, acquires paid compute, deploys,
 * sends external messages or changes Evercraft operator permissions.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startNodeSeed } from '../compute/node-seed.mjs';
import {
  loadMultiplicationRegistry,
  resolveMultiplicationContract,
  loadWorkItems,
  buildMultiplicationPlan,
  assignmentForIndex
} from './multiplier.mjs';
import { runNodeSeedAssignmentPool } from './nodeseed-pool.mjs';
import { preflightOsMission } from '../evercraft-os/parallel-mission-bridge.mjs';
import { reconcile } from './evercraft-os-readiness-adapter.mjs';

const rootDir = process.cwd();
const policy = preflightOsMission({ rootDir });
assert.equal(policy.route_count, 12);
assert.equal(policy.durable_systemia_mission_recorded, false);
const registry = loadMultiplicationRegistry();
const contract = resolveMultiplicationContract('evercraft-os-readiness', registry);
const items = loadWorkItems(contract, rootDir);
assert.equal(items.length, 12);
const plan = buildMultiplicationPlan({
  contract,
  logicalAgents: 12,
  physicalWorkers: 2,
  workItems: items
});
const assignments = Array.from({length: plan.logical_agents},(_,i) => assignmentForIndex(plan, items, i));
const scratch = mkdtempSync(join(tmpdir(), 'evercraft-os-node-failover-'));
const allocatorToken = 'ephemeral-proof-token-not-a-real-device-credential';
let a;
let b;
let aClosed = false;
try {
  a = await startNodeSeed({
    root: join(scratch, 'node-a'),
    nodeId: 'ephemeral-os-proof-node-a',
    host: '127.0.0.1',
    advertiseHost: '127.0.0.1',
    port: 0,
    allocatorToken,
    announce: false,
    zeroCost: true
  });
  b = await startNodeSeed({
    root: join(scratch, 'node-b'),
    nodeId: 'ephemeral-os-proof-node-b',
    host: '127.0.0.1',
    advertiseHost: '127.0.0.1',
    port: 0,
    allocatorToken,
    announce: false,
    zeroCost: true
  });
  assert.ok([a.endpoint,b.endpoint].every(url => new URL(url).hostname === '127.0.0.1'));
  const pool = await runNodeSeedAssignmentPool({
    software: contract.software_id,
    assignments,
    endpoints: [a.endpoint,b.endpoint],
    allocatorToken,
    discover: false,
    maxAttempts: 3,
    maxConcurrencyPerNode: 1,
    timeoutMs: 2500,
    assignmentTimeoutMs: 10000,
    resourceProfile: {
      ...contract.resources,
      require_node_attestation: true
    },
    onEvent: async event => {
      if (!aClosed && event.type === 'assignment.completed' &&
          event.node_id === 'ephemeral-os-proof-node-a') {
        aClosed = true;
        await a.close();
      }
    }
  });
  assert.equal(aClosed, true,'node-a did not participate before controlled shutdown');
  assert.equal(pool.nodes.length, 2);
  assert.ok(pool.nodes.every(x => x.node_attestation_verified === true));
  assert.equal(pool.requested_assignments, 12);
  assert.equal(pool.completed_assignments, 12);
  assert.equal(pool.failed_assignments, 0);
  assert.ok(pool.failover_assignments >= 1,'no proven cross-node retry after node-a shutdown');
  const rows = pool.results.map(x => {
    assert.equal(x.status, 'completed');
    assert.equal(x.idempotency_key, x.assignment.idempotency_key);
    assert.equal(x.result?.schema, 'evercraft.saban.registered-worker-receipt.v1');
    assert.equal(x.result.idempotency_key, x.assignment.idempotency_key);
    assert.ok(x.compute_receipt,'missing NodeSeed execution receipt');
    return x.result.result;
  });
  const combined = await reconcile({results: rows,rootDir});
  assert.equal(combined.status,'reconciled',JSON.stringify(combined.findings));
  assert.equal(combined.program_sha256,policy.program_sha256);
  assert.deepEqual(new Set(rows.map(x=>x.lane_id)),new Set(items.map(x=>x.key)));
  assert.ok(pool.events.some(x=>x.type === 'node.assignment.failed' &&
    x.node_id === 'ephemeral-os-proof-node-a'));
  assert.ok(pool.events.some(x=>x.type === 'assignment.failover.completed'));
  assert.ok(rows.every(x=>x.source_ready === true &&
    x.runtime_observed === false && x.systemia_admitted === false &&
    x.payment_received === false && x.customer_delivered === false));
  console.log(JSON.stringify({
    schema: 'evercraft.os.ephemeral-two-node-readiness-proof.v1',
    status: 'PASS',
    systemia_policy_plan_admitted: true,
    durable_systemia_mission_recorded: false,
    signed_node_attestations: pool.nodes.filter(x=>x.node_attestation_verified).length,
    authenticated_ephemeral_nodes: pool.nodes.length,
    local_readonly_assignments_completed: pool.completed_assignments,
    failed_assignments: pool.failed_assignments,
    cross_node_failover_assignments: pool.failover_assignments,
    source_reconciliation: combined.status,
    actual_field_hardware_used: false,
    production_deployment_performed: false,
    payment_or_customer_delivery_proven: false
  },null,2));
} finally {
  if (a && !aClosed) await a.close().catch(()=>{});
  if (b) await b.close().catch(()=>{});
  rmSync(scratch,{recursive:true,force:true});
}
