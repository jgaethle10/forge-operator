import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startNodeSeed } from '../compute/node-seed.mjs';

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${response.status}: ${body.error || 'request_failed'}`);
  }
  return body;
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saban-multiplier-nodeseed-'));
const allocatorToken = 'saban-multiplier-proof-token';

const seed = await startNodeSeed({
  root,
  nodeId: 'saban-multiplier-proof-node',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken,
  announce: false
});

try {
  const capacity = await requestJson(`${seed.endpoint}/v1/capacity`);
  assert.ok(capacity.supported_workloads.includes('saban.multiplier-assignment.v1'));

  const lease = await requestJson(`${seed.endpoint}/v1/leases`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${allocatorToken}`
    },
    body: JSON.stringify({
      workload_class: 'saban.multiplier-assignment.v1',
      requested_ttl_ms: 30000
    })
  });

  const execution = await requestJson(`${seed.endpoint}/v1/jobs`, {
    method: 'POST',
    body: JSON.stringify({
      lease_id: lease.lease_id,
      token: lease.token,
      workload_class: 'saban.multiplier-assignment.v1',
      agent_id: 'nodeseed-registered-proof',
      checkpoint: {
        step: 0,
        state: null
      },
      input: {
        software: 'chum',
        assignment: {
          agent_id: 'nodeseed-registered-proof',
          role: 'surface_auditor',
          work: {
            kind: 'product',
            key: 'proof-product',
            source_file: null
          },
          item: {
            kind: 'product',
            key: 'proof-product',
            raw: {
              canonical_url: 'https://example.com',
              intents: ['one', 'two', 'three'],
              authority: 'proof',
              boundaries: ['public only']
            }
          }
        }
      }
    })
  });

  assert.equal(execution.ok, true);
  assert.equal(execution.result.schema, 'evercraft.saban.registered-worker-receipt.v1');
  assert.equal(execution.result.software_id, 'chum');
  assert.equal(execution.result.result.status, 'finding');
  assert.equal(execution.checkpoint.step, 1);
  assert.equal(execution.checkpoint.last_node, 'saban-multiplier-proof-node');

  await requestJson(`${seed.endpoint}/v1/leases/${lease.lease_id}/release`, {
    method: 'POST',
    body: JSON.stringify({
      token: lease.token
    })
  });

  console.log(JSON.stringify({
    schema: 'evercraft.saban.nodeseed-multiplier-proof.v1',
    status: 'pass',
    node_id: execution.node_id,
    software_id: execution.result.software_id,
    registered_only: true,
    checkpoint_step: execution.checkpoint.step
  }));
} finally {
  await seed.close();
  fs.rmSync(root, { recursive: true, force: true });
}
