#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NODE_RUNTIME = path.join(HERE, 'offline-continuity-proof.mjs');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (value) => createHash('sha256').update(String(value)).digest('hex');
const fingerprint = (nodeId) => sha(`evercraft.offline-node.v1:${nodeId}`);

async function requestJson(url, options = {}, timeoutMs = 1200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {})
      }
    });
    const payload = await response.json();
    return { response, payload };
  } finally {
    clearTimeout(timer);
  }
}

async function expectJson(url, options = {}, timeoutMs = 1200) {
  const { response, payload } = await requestJson(url, options, timeoutMs);
  if (!response.ok) {
    throw new Error(`${response.status}:${payload.error || 'request_failed'} @ ${url}`);
  }
  return payload;
}

async function waitForNode(endpoint) {
  for (let i = 0; i < 50; i += 1) {
    try {
      return await expectJson(`${endpoint}/v1/node`, {}, 250);
    } catch {
      await wait(60);
    }
  }
  throw new Error(`node did not become reachable: ${endpoint}`);
}

function spawnNode(spec) {
  const args = [
    NODE_RUNTIME,
    '--node',
    '--node-id', spec.id,
    '--port', String(spec.port),
    '--roles', spec.roles.join(',')
  ];
  if (spec.localInference) args.push('--local-inference');
  return spawn(process.execPath, args, { stdio: 'ignore' });
}

async function terminate(child) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  await wait(120);
  if (!child.killed) child.kill('SIGKILL');
}

const nodeSpecs = [
  { id: 'nexus-a', port: 47401, roles: ['nexus'], localInference: true },
  { id: 'nexus-b', port: 47402, roles: ['nexus'], localInference: true },
  { id: 'guardian-a', port: 47403, roles: ['guardian'], localInference: false },
  { id: 'guardian-b', port: 47404, roles: ['guardian'], localInference: false },
  { id: 'hearth-a', port: 47405, roles: ['hearth'], localInference: false },
  { id: 'hearth-b', port: 47406, roles: ['hearth'], localInference: false },
  { id: 'hearth-c', port: 47407, roles: ['hearth'], localInference: false },
  { id: 'team-a', port: 47408, roles: ['team'], localInference: true },
  { id: 'team-b', port: 47409, roles: ['team'], localInference: true }
].map((spec) => ({ ...spec, endpoint: `http://127.0.0.1:${spec.port}` }));

const children = new Map();
const events = [];
const outDir = path.resolve(process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : './blackout-resilience-output');

function event(type, data = {}) {
  events.push({
    seq: events.length + 1,
    type,
    at: new Date().toISOString(),
    ...data
  });
}

try {
  for (const spec of nodeSpecs) {
    children.set(spec.id, spawnNode(spec));
  }

  const manifests = [];
  for (const spec of nodeSpecs) {
    const manifest = await waitForNode(spec.endpoint);
    assert.equal(manifest.node_id, spec.id);
    assert.equal(manifest.trust.identity_fingerprint, fingerprint(spec.id));
    manifests.push(manifest);
  }
  event('fabric.ready', { nodes: manifests.map((m) => m.node_id) });

  const byId = new Map(nodeSpecs.map((spec) => [spec.id, spec]));
  const missionId = `blackout_${randomBytes(8).toString('hex')}`;

  const primaryExecution = await expectJson(`${byId.get('nexus-a').endpoint}/v1/jobs`, {
    method: 'POST',
    body: JSON.stringify({
      mission_id: missionId,
      job_id: 'mission-primary',
      requires_local_inference: true,
      payload: {
        mission: 'maintain-evercraft-continuity',
        phase: 'primary',
        internet_required: false
      },
      checkpoint: { step: 0, state: { admitted: true, phase: 'primary' } }
    })
  });
  assert.equal(primaryExecution.ok, true);
  assert.equal(primaryExecution.node_id, 'nexus-a');
  event('mission.primary.executed', { node_id: 'nexus-a', checkpoint_step: primaryExecution.checkpoint.step });

  const checkpointId = `${missionId}:critical`;
  for (const hearthId of ['hearth-a', 'hearth-b', 'hearth-c']) {
    const hearth = byId.get(hearthId);
    const stored = await expectJson(`${hearth.endpoint}/v1/checkpoints`, {
      method: 'POST',
      body: JSON.stringify({
        checkpoint_id: checkpointId,
        mission_id: missionId,
        state: primaryExecution.checkpoint
      })
    });
    assert.equal(stored.checkpoint_id, checkpointId);
  }
  event('hearth.checkpoint.replicated', { checkpoint_id: checkpointId, replicas: 3 });

  const envelope = {
    message_id: `${missionId}:continuity-envelope`,
    mission_id: missionId,
    kind: 'continuity.state',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    payload: { checkpoint_id: checkpointId, phase: 'primary' }
  };

  for (const hearthId of ['hearth-a', 'hearth-b', 'hearth-c']) {
    const hearth = byId.get(hearthId);
    const first = await expectJson(`${hearth.endpoint}/v1/messages`, {
      method: 'POST',
      body: JSON.stringify(envelope)
    });
    assert.equal(first.queued, true);
    assert.equal(first.duplicate, false);

    const duplicate = await expectJson(`${hearth.endpoint}/v1/messages`, {
      method: 'POST',
      body: JSON.stringify(envelope)
    });
    assert.equal(duplicate.queued, false);
    assert.equal(duplicate.duplicate, true);
  }
  event('store_forward.replay_protection.verified', { replicas: 3 });

  const expired = await requestJson(`${byId.get('hearth-c').endpoint}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({
      ...envelope,
      message_id: `${missionId}:expired`,
      expires_at: new Date(Date.now() - 1000).toISOString()
    })
  });
  assert.equal(expired.response.status, 410);
  assert.equal(expired.payload.error, 'message_expired');
  event('store_forward.expiry.verified');

  const guardianPrimary = await expectJson(`${byId.get('guardian-a').endpoint}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({
      message_id: `${missionId}:guardian-primary`,
      mission_id: missionId,
      kind: 'guardian.continuity.check',
      payload: { internet_required: false, phase: 'primary' }
    })
  });
  assert.equal(guardianPrimary.ok, true);

  const teamPrimary = await expectJson(`${byId.get('team-a').endpoint}/v1/jobs`, {
    method: 'POST',
    body: JSON.stringify({
      mission_id: missionId,
      job_id: 'team-primary',
      requires_local_inference: true,
      payload: { phase: 'primary', internet_required: false },
      checkpoint: primaryExecution.checkpoint
    })
  });
  assert.equal(teamPrimary.ok, true);
  event('services.primary.reached', { guardian: 'guardian-a', team: 'team-a' });

  // Cascading loss: primary compute, primary Guardian, primary team runtime,
  // and two of three Hearth replicas disappear at once.
  for (const nodeId of ['nexus-a', 'guardian-a', 'team-a', 'hearth-a', 'hearth-b']) {
    await terminate(children.get(nodeId));
    event('node.lost', { node_id: nodeId });
  }

  const survivingCheckpoint = await expectJson(
    `${byId.get('hearth-c').endpoint}/v1/checkpoints/${encodeURIComponent(checkpointId)}`
  );
  assert.equal(survivingCheckpoint.checkpoint_id, checkpointId);
  assert.equal(survivingCheckpoint.state.step, primaryExecution.checkpoint.step);
  event('hearth.last_replica.recovered_checkpoint', {
    node_id: 'hearth-c',
    checkpoint_id: checkpointId
  });

  const failoverExecution = await expectJson(`${byId.get('nexus-b').endpoint}/v1/jobs`, {
    method: 'POST',
    body: JSON.stringify({
      mission_id: missionId,
      job_id: 'mission-failover',
      requires_local_inference: true,
      payload: { phase: 'failover', internet_required: false },
      checkpoint: survivingCheckpoint.state
    })
  });
  assert.equal(failoverExecution.ok, true);
  assert.equal(failoverExecution.node_id, 'nexus-b');
  assert.equal(failoverExecution.checkpoint.step, primaryExecution.checkpoint.step + 1);
  event('mission.failover.executed', {
    from: 'nexus-a',
    to: 'nexus-b',
    checkpoint_step: failoverExecution.checkpoint.step
  });

  const guardianFailover = await expectJson(`${byId.get('guardian-b').endpoint}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({
      message_id: `${missionId}:guardian-failover`,
      mission_id: missionId,
      kind: 'guardian.continuity.check',
      payload: { internet_required: false, phase: 'failover' }
    })
  });
  assert.equal(guardianFailover.ok, true);

  const teamFailover = await expectJson(`${byId.get('team-b').endpoint}/v1/jobs`, {
    method: 'POST',
    body: JSON.stringify({
      mission_id: missionId,
      job_id: 'team-failover',
      requires_local_inference: true,
      payload: { phase: 'failover', internet_required: false },
      checkpoint: failoverExecution.checkpoint
    })
  });
  assert.equal(teamFailover.ok, true);
  event('services.failover.reached', { guardian: 'guardian-b', team: 'team-b' });

  const duplicateAfterLoss = await expectJson(`${byId.get('hearth-c').endpoint}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify(envelope)
  });
  assert.equal(duplicateAfterLoss.duplicate, true);
  assert.equal(duplicateAfterLoss.queued, false);
  event('store_forward.replay_protection.survived_partition');

  const finalCheckpointId = `${missionId}:final`;
  const finalStored = await expectJson(`${byId.get('hearth-c').endpoint}/v1/checkpoints`, {
    method: 'POST',
    body: JSON.stringify({
      checkpoint_id: finalCheckpointId,
      mission_id: missionId,
      state: teamFailover.checkpoint
    })
  });
  assert.equal(finalStored.ok, true);

  const survivingNodes = ['nexus-b', 'guardian-b', 'hearth-c', 'team-b'];
  for (const nodeId of survivingNodes) {
    const spec = byId.get(nodeId);
    const health = await expectJson(`${spec.endpoint}/v1/health`);
    assert.equal(health.ok, true);
  }

  const summary = {
    schema: 'evercraft.blackout-resilience-proof.v1',
    status: 'PASS',
    internet_required: false,
    external_cloud_used: false,
    simulated_failure_class: 'cascading_node_loss_in_isolated_fabric',
    initial_nodes: nodeSpecs.length,
    lost_nodes: ['nexus-a', 'guardian-a', 'team-a', 'hearth-a', 'hearth-b'],
    surviving_nodes: survivingNodes,
    invariants: {
      mission_survived_primary_nexus_loss: true,
      checkpoint_survived_two_of_three_hearth_loss: true,
      guardian_survived_primary_loss: true,
      team_runtime_survived_primary_loss: true,
      local_inference_survived_primary_loss: true,
      duplicate_delivery_suppressed: true,
      expired_delivery_rejected: true,
      cloud_dependency_required: false
    },
    recovery: {
      primary_execution_node: 'nexus-a',
      failover_execution_node: 'nexus-b',
      checkpoint_replication_factor: 3,
      surviving_checkpoint_node: 'hearth-c',
      final_checkpoint_id: finalCheckpointId
    },
    field_proof_still_required: [
      'separate physical machines',
      'LAN multicast or equivalent peer discovery',
      'Wi-Fi Direct peer formation',
      'BLE discovery and store-forward',
      'encrypted destination envelopes and key rotation',
      'radio gateway adapters',
      'battery and thermal endurance',
      'real local model runtime quality under constrained hardware',
      'long-duration partition and reconciliation testing',
      'power-loss-safe durable storage'
    ],
    event_count: events.length,
    completed_at: new Date().toISOString()
  };

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'events.jsonl'), events.map(JSON.stringify).join('\n') + '\n');
  console.log(JSON.stringify(summary, null, 2));
} finally {
  for (const child of children.values()) {
    await terminate(child);
  }
}
