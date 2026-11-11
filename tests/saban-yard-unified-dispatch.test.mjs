import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';

import { startEvercraftComputeNode } from '../systemia/compute/runtime-node.mjs';
import { AmbientWorkQueue } from '../systemia/saban/ambient-work-queue.mjs';
import { dispatchAmbientJobsOnce } from '../systemia/saban/ambient-job-dispatcher.mjs';
import { drainNodeSeedExecutionIntents, executeNodeSeedExecutionIntent } from '../systemia/saban/nodeseed-intent-executor.mjs';
import { createNodeSeedExecutionIntent, getNodeSeedExecutionIntent } from '../systemia/saban/nodeseed-execution-intent.mjs';
import { runYardSabanIntentDrain } from '../systemia/yard/saban-intent-drain-runner.mjs';

const NODE = 'evercraft-unified-proof-node';
const BROKER = 'evercraft-unified-proof-broker';
const LOOPBACK = 'http://127.0.0.1:8797';
const FP = 'sha256:' + 'a'.repeat(64);

function row(capacity) {
  return {
    node_id: NODE,
    device_fingerprint: FP,
    connected: true,
    last_seen_at: new Date().toISOString(),
    capacity: {
      ...capacity,
      device_fingerprint: FP,
      authorized: true,
      session_attestation_verified: true,
      attestation_supported: true,
      zero_cost: true,
      public_ingress: false,
      placement_labels: ['operator-authorized', 'outbound-only'],
      failure_domain: 'unified-proof',
    },
  };
}

function makeYard({ node, inventory, expectedLoopback = LOOPBACK }) {
  let verified = 0;
  let grants = 0;
  let inventoryCalls = 0;
  const yard = {
    deploymentStatus(id) {
      assert.equal(id, BROKER);
      return { public_route: { scope: 'loopback_proof', verified: false, origin: LOOPBACK } };
    },
    async verifyPublicRoute(id, options) {
      assert.equal(id, BROKER);
      assert.equal(options.origin, expectedLoopback);
      assert.equal(options.allowLoopbackProof, true);
      verified++;
      return {
        scope: 'loopback_proof', verified: false,
        origin: expectedLoopback,
        verification: 'instance_and_deployment_receipt_match',
        receipt_hash: 'sha256:' + 'b'.repeat(64),
      };
    },
    async listRemoteCapacityNodes(id) {
      assert.equal(id, BROKER);
      inventoryCalls++;
      return inventory;
    },
    async remoteCapacityGrant(id, nodeId, { allowLoopbackProof } = {}) {
      assert.equal(id, BROKER);
      assert.equal(nodeId, NODE);
      assert.equal(allowLoopbackProof, true, 'loopback proof cannot be implicit');
      assert.ok(verified > 0, 'reverify broker identity before grant');
      grants++;
      return {
        node_id: NODE,
        device_fingerprint: FP,
        capacity_endpoint: node.endpoint,
        allocator_token: 'test-only-unified-allocator',
      };
    },
    async drainSabanNodeSeedIntents({ sabanRoot, brokerDeploymentId, maxIntents, timeoutMs, allowLoopbackProof, now }) {
      return drainNodeSeedExecutionIntents({
        root: sabanRoot, yard: this, brokerDeploymentId, maxIntents,
        timeoutMs, allowLoopbackProof, now,
      });
    },
    stats() { return { verified, grants, inventoryCalls }; },
  };
  return yard;
}

test('single opt-in Saban→Yard cycle dispatches and verifies real local NodeSeed work; non-hash work held', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-unified-saban-'));
  const sabanRoot = path.join(root, 'saban');
  const yardRoot = path.join(root, 'yard');
  fs.mkdirSync(yardRoot, { recursive: true });
  fs.mkdirSync(sabanRoot, { recursive: true });
  const allocatorToken = 'test-only-unified-allocator';
  const node = await startEvercraftComputeNode({
    nodeId: NODE,
    root: path.join(root, 'compute'),
    host: '127.0.0.1',
    port: 0,
    allocatorToken,
    placementLabels: ['operator-authorized'],
    zeroCost: true,
  });
  try {
    const cap = await (await fetch(node.endpoint + '/v1/capacity')).json();
    const inventory = {
      schema: 'evercraft.yard.remote-capacity-nodes.v1',
      count: 1,
      nodes: [row(cap)],
    };
    const yard = makeYard({ node, inventory });
    const queue = new AmbientWorkQueue({ root: path.join(sabanRoot, 'work-queue') });
    const hash = queue.submit({
      workload_class: 'systemia.content-hash.v1',
      payload: { value: { task: 'verified-autonomous-dispatch', sequence: 1 } },
      idempotency_key: 'unified-dispatch-hash',
      private_data: false,
    });
    const other = queue.submit({
      workload_class: 'systemia.telemetry-normalizer.v1',
      payload: { telemetry: { reading: 1 } },
      idempotency_key: 'unified-dispatch-not-approved',
      private_data: false,
    });

    const first = await runYardSabanIntentDrain({
      yardStateDir: yardRoot,
      sabanStateDir: sabanRoot,
      brokerDeploymentId: BROKER,
      yardOperator: yard,
      dispatchQueued: true,
      allowLoopbackProof: true,
      brokerLoopbackOrigin: LOOPBACK,
      maxJobs: 4,
      maxIntents: 4,
    });
    assert.equal(first.unified_dispatch_enabled, true);
    assert.equal(first.content_hash_only, true);
    assert.equal(first.dispatch_cycle?.handoff_wait, 1);
    assert.equal(first.dispatch_cycle?.held, 1);
    assert.equal(first.completed, 1);
    assert.equal(first.verification_hold, 0);
    assert.equal(first.broker_route_scope, 'loopback_proof');
    const completed = queue.get(hash.job_id);
    assert.equal(completed.state, 'completed');
    assert.equal(completed.execution_receipt.worker_receipt_verified, true);
    assert.equal(completed.execution_receipt.content_hash_verified, true);
    assert.match(completed.result.digest, /^sha256:[a-f0-9]{64}$/);
    const held = queue.get(other.job_id);
    assert.equal(held.state, 'held');
    assert.equal(held.last_hold.reason, 'unattended_workload_not_authorized');
    assert.equal(yard.stats().grants, 1);
    assert.equal(yard.stats().verified, 1);
    const inventoryFile = fs.readFileSync(path.join(sabanRoot,'nodeseed-capacity-inventory.json'),'utf8');
    const cycleFile = fs.readFileSync(path.join(sabanRoot,'yard-saban-intent-drain.json'),'utf8');
    for (const saved of [inventoryFile, cycleFile]) {
      assert.doesNotMatch(saved, /test-only-unified-allocator/);
      assert.doesNotMatch(saved, /"allocator_token"\s*:/);
    }

    const second = await runYardSabanIntentDrain({
      yardStateDir: yardRoot, sabanStateDir: sabanRoot, brokerDeploymentId: BROKER,
      yardOperator: yard, dispatchQueued: true, allowLoopbackProof: true,
      brokerLoopbackOrigin: LOOPBACK, maxJobs: 4, maxIntents: 4,
    });
    assert.equal(second.completed, 0, 'must not redispatch previously completed job');
    assert.equal(second.dispatch_cycle?.handoff_wait, 0);
    assert.equal(yard.stats().grants, 1, 'no second grant without new authorized work');
    assert.equal(yard.stats().verified, 2, 'broker is reverified each cycle');
  } finally {
    await node.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('invalid or unverified loopback broker aborts before inventory, dispatch or grant', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-unified-reject-'));
  try {
    const yard = {
      async verifyPublicRoute() { throw new Error('public route health does not match this deployment receipt and instance'); },
      async listRemoteCapacityNodes() { throw new Error('inventory must not be read'); },
      async drainSabanNodeSeedIntents() { throw new Error('must not drain'); },
    };
    const opts = {
      yardStateDir: root,
      sabanStateDir: root,
      brokerDeploymentId: BROKER,
      yardOperator: yard,
      dispatchQueued: true,
      allowLoopbackProof: true,
      maxJobs: 4,
    };
    await assert.rejects(
      runYardSabanIntentDrain({ ...opts, brokerLoopbackOrigin: 'http://192.168.1.2:8797' }),
      /unified_dispatch_requires_explicit_127_0_0_1_broker_origin/,
    );
    await assert.rejects(
      runYardSabanIntentDrain({ ...opts, brokerLoopbackOrigin: LOOPBACK }),
      /public route health does not match/,
    );
    assert.equal(fs.existsSync(path.join(root,'nodeseed-capacity-inventory.json')), false);
  } finally {
    fs.rmSync(root, { recursive:true, force:true });
  }
});

test('unattended broker dispatch never enables ambient-device gateway or arbitrary workloads', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-unified-no-gateway-'));
  try {
    const queue = new AmbientWorkQueue({ root: path.join(root, 'work-queue') });
    const item = queue.submit({
      workload_class: 'systemia.telemetry-normalizer.v1',
      payload: { telemetry: { a: 7 } },
      idempotency_key: 'gateway-must-not-execute',
    });
    const cycle = await dispatchAmbientJobsOnce({
      root,
      maxJobs: 1,
      nodeSeedOnly: true,
      gatewayUrl: 'http://127.0.0.1:1',
      gatewayToken: '',
    });
    assert.equal(cycle.held, 1);
    assert.equal(cycle.unattended_nodeseed_only, true);
    assert.equal(queue.get(item.job_id).last_hold.reason, 'unattended_workload_not_authorized');
  } finally {
    fs.rmSync(root, { recursive:true, force:true });
  }
});


test('uncertain broker job submission is held for review, never automatically replayed', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-unified-unknown-'));
  let jobSubmissions = 0;
  let leaseReleases = 0;
  const server = http.createServer((req, res) => {
    req.resume();
    res.setHeader('content-type', 'application/json');
    if (req.method === 'POST' && req.url === '/v1/leases') {
      res.writeHead(201).end(JSON.stringify({
        lease_id: 'lease-proof', token: 'local-test-lease', workload_class: 'systemia.content-hash.v1',
      }));
    } else if (req.method === 'POST' && req.url === '/v1/jobs') {
      jobSubmissions++;
      res.writeHead(504).end(JSON.stringify({ error: 'simulated_network_uncertainty' }));
    } else if (req.method === 'POST' && req.url === '/v1/leases/lease-proof/release') {
      leaseReleases++;
      res.writeHead(200).end(JSON.stringify({ ok: true }));
    } else {
      res.writeHead(404).end(JSON.stringify({ error: 'not_found' }));
    }
  });
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const endpoint = 'http://127.0.0.1:' + server.address().port;
    const queue = new AmbientWorkQueue({root:path.join(root, 'work-queue')});
    const job = queue.submit({
      workload_class: 'systemia.content-hash.v1',
      payload: { value: { mission: 'ambiguous-response' } },
      idempotency_key: 'unified-unknown-job',
    });
    const intent = createNodeSeedExecutionIntent({
      root, job,
      task: { schema: 'evercraft.saban.fabric-task.v1', resources_per_execution: job.resources },
      placement: {market: 'evercraft-nodeseed', provider_id: NODE, unit_id: 'unit-1', offer_id: 'nodeseed:'+NODE},
      plan: { receipt_hash: 'sha256:ambiguous-response' },
    });
    queue.update(job.job_id, {state:'handoff_wait'});
    const yard = {
      async listRemoteCapacityNodes() { return {
        schema: 'evercraft.yard.remote-capacity-nodes.v1',
        count: 1,
        nodes: [{
          node_id:NODE, device_fingerprint:FP, connected:true,
          capacity:{
            authorized:true, session_attestation_verified:true, zero_cost:true,
            supported_workloads:['systemia.content-hash.v1'], device_fingerprint:FP,
          },
        }],
      }; },
      async remoteCapacityGrant(_broker, nodeId, {allowLoopbackProof}={}) {
        assert.equal(nodeId,NODE);
        assert.equal(allowLoopbackProof,true);
        return {
          node_id:NODE, device_fingerprint:FP,
          capacity_endpoint:endpoint, allocator_token:'local-test-control',
        };
      },
    };
    const outcome = await executeNodeSeedExecutionIntent({
      root, intentId:intent.intent_id, yard, brokerDeploymentId:BROKER,
      allowLoopbackProof:true, timeoutMs:2000,
    });
    assert.equal(outcome.status,'verification_hold');
    assert.equal(outcome.reason,'remote_job_outcome_unknown');
    assert.equal(jobSubmissions,1);
    assert.equal(leaseReleases,1);
    assert.equal(queue.get(job.job_id).state,'held');
    assert.equal(queue.get(job.job_id).attempts,0);
    assert.equal(queue.get(job.job_id).last_hold.reason,'unverified_remote_worker_result');
    assert.equal(getNodeSeedExecutionIntent({root,intentId:intent.intent_id}).state,'verification_hold');
    const next=await dispatchAmbientJobsOnce({root,nodeSeedOnly:true,maxJobs:1});
    assert.equal(next.held,1);
    assert.equal(next.rows[0].manual_review_required,true);
    assert.equal(jobSubmissions,1);
  } finally {
    server.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});
