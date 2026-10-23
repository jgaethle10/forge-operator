import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { startOutboundCapacityBroker } from './outbound-capacity-broker.mjs';
import { startOutboundNodeAgent } from './outbound-node-agent.mjs';

// This is a real local NodeSeed and broker, with precisely one simulated
// transport failure type: an interrupted broker poll after admission.
// Empty successful polls MUST clear stale transport errors, even when the
// broker sends no work, or the recovered node looks disconnected forever.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-poll-recovery-'));
const realFetch = globalThis.fetch;
const token = 'proof-local-allocator-' + 'r'.repeat(40);
let seed = null;
let broker = null;
let agent = null;
let injectedFailures = 0;
let injectedPollUrl = '';
let sawError = false;

try {
  seed = await startNodeSeed({
    root: path.join(root, 'compute'),
    nodeId: 'remote-poll-recovery-proof-node',
    host: '127.0.0.1',
    port: 0,
    advertiseHost: '127.0.0.1',
    allocatorToken: token,
    announce: false,
  });
  broker = await startOutboundCapacityBroker({
    host: '127.0.0.1',
    port: 0,
    stateDir: path.join(root, 'broker'),
    authorizedDevices: { [seed.device_fingerprint]: seed.node_id },
    pollWaitMs: 100,
    commandTimeoutMs: 5_000,
    capacityFreshMs: 2_000,
  });

  injectedPollUrl = broker.endpoint + '/v1/remote/agent/poll';
  globalThis.fetch = async (url, options) => {
    if (String(url) === injectedPollUrl && injectedFailures < 3) {
      injectedFailures += 1;
      throw new TypeError('proof_transient_broker_poll_failure');
    }
    return realFetch(url, options);
  };

  agent = await startOutboundNodeAgent({
    brokerUrl: broker.endpoint,
    localCapacityEndpoint: seed.endpoint,
    localAllocatorToken: token,
    pollBackoffMs: 80,
  });
  const originalRegistration = agent.status().registered_at;
  assert.ok(originalRegistration);

  const deadline = Date.now() + 15_000;
  let recovered = false;
  while (Date.now() < deadline) {
    const status = agent.status();
    if (status.last_error === 'proof_transient_broker_poll_failure') {
      sawError = true;
    }
    if (injectedFailures === 3 && sawError && status.last_error === null) {
      // Registration and broker session survived a transient network error.
      assert.equal(status.registered_at, originalRegistration);
      assert.equal(status.running, true);
      recovered = true;
      break;
    }
    await sleep(30);
  }

  assert.equal(injectedFailures, 3, 'expected three injected broker poll failures');
  assert.equal(sawError, true, 'expected the agent to record the transient error');
  assert.equal(recovered, true, 'successful empty broker poll must clear the stale error');
  const registeredNode = broker.snapshot().nodes.find(x => x.node_id === seed.node_id);
  assert.ok(registeredNode?.connected, 'broker must still consider node connected');

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.remote-capacity.poll-recovery-proof.v1',
    transient_failures_injected: injectedFailures,
    last_error_cleared_after_authenticated_empty_poll: true,
    registration_preserved: true,
    no_remote_jobs_run: true,
    public_ingress_created: false,
  }));
} finally {
  if (agent) await agent.close();
  globalThis.fetch = realFetch;
  if (broker) await broker.close();
  if (seed) await seed.close();
  fs.rmSync(root, { recursive: true, force: true });
}
