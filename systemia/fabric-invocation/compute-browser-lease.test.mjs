import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import http from 'node:http';
import test from 'node:test';
import { once } from 'node:events';
import { createComputeBrowserLeaseRuntime } from './compute-browser-lease.mjs';

const sha = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const token = 'private-lease-secret-' + 'a'.repeat(48);
const serviceId = 'svc_browsertest';
const leaseId = 'lease_foo123456';
const nodeId = 'evercraft-node-test';
const instanceId = 'browser_native_42';
const deploymentReceiptRef = 'sha256:' + sha('trusted-yard-browser-deployment');
const workload = 'systemia.evercraft-web-browser.v1';

async function makeCompute({ tamper = '', healthMismatch = false } = {}) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const buffers = [];
    for await (const part of req) buffers.push(part);
    const body = Buffer.concat(buffers).toString('utf8');
    requests.push({ method: req.method, url: req.url, body });
    let reply;
    if (req.method === 'GET' && req.url === '/v1/services/' + serviceId + '/health') {
      reply = {
        ok: true,
        service: 'evercraft-owned-browser-worker',
        engine: 'evercraft-owned-browser-worker-v1',
        instance_id: healthMismatch ? 'other_browser_instance' : instanceId,
        deployment_receipt_ref: deploymentReceiptRef,
      };
    } else if (req.method === 'POST' && req.url === '/v1/services/' + serviceId + '/browser') {
      const request = JSON.parse(body);
      const evidence = {
        ok: true, engine: 'evercraft-owned-browser-worker-v1',
        mode: 'public_read_only', evidence_receipt_sha256: sha('valid-worker-evidence'),
      };
      if (tamper === 'worker_digest') evidence.evidence_receipt_sha256 = sha('forged');
      const receiptBody = {
        schema: 'evercraft.compute.receipt.v1', node_id: nodeId,
        seq: 8, type: 'browser.render.executed',
        at: '2026-10-07T19:00:00.000Z', previous_hash: 'GENESIS',
        service_id: tamper === 'service_id' ? 'svc_forged' : serviceId,
        lease_id: leaseId, workload_class: workload,
        requested_url_sha256: sha(request.job.url),
        evidence_receipt_sha256: sha('valid-worker-evidence'),
      };
      const receipt = { ...receiptBody, receipt_hash: sha(receiptBody) };
      if (tamper === 'compute_receipt') receipt.receipt_hash = sha('forged');
      reply = { ok: true, service_id: serviceId, result: evidence, receipt };
      if (tamper === 'oversize') reply = { ok: true, data: 'x'.repeat(3 * 1024 * 1024) };
    } else {
      res.writeHead(404).end();
      return;
    }
    const payload = JSON.stringify(reply);
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) });
    res.end(payload);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const origin = 'http://127.0.0.1:' + address.port;
  let expiresAt = Date.now() + 60000;
  let leaseCalls = 0;
  const browser = createComputeBrowserLeaseRuntime({
    origin, serviceId, nodeId, instanceId, deploymentReceiptRef,
    leaseProvider: async () => {
      leaseCalls++;
      return {
        token, lease_id: leaseId, service_id: serviceId,
        node_id: nodeId, workload_class: workload,
        expires_at: new Date(expiresAt).toISOString(),
      };
    },
  });
  return {
    browser, requests, setExpiry: (value) => { expiresAt = value; },
    leaseCalls: () => leaseCalls,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test('private Compute HTTP lease contract verifies node/service/deployment and native Compute receipt', async () => {
  const f = await makeCompute();
  try {
    const health = await f.browser.health();
    assert.equal(health.attested_deployment_receipt_ref, deploymentReceiptRef);
    assert.equal(health.private_lease_transport, true);
    const answer = await f.browser.browse({ url: 'https://example.org/', timeout_ms: 2000 });
    assert.equal(answer.ok, true);
    assert.equal(answer.evidence_receipt_sha256, sha('valid-worker-evidence'));
    assert.equal(f.leaseCalls(), 1);
    assert.equal(f.requests.filter((item) => item.method === 'POST').length, 1);
    assert.equal(JSON.parse(f.requests.at(-1).body).token, token);
    assert.equal(JSON.stringify(answer).includes(token), false);
    assert.ok(f.requests.every((entry) => !entry.url.includes(token)));
  } finally { await f.close(); }
});

test('Compute lease expiry is checked before sending worker job', async () => {
  const f = await makeCompute();
  try {
    f.setExpiry(Date.now() + 100);
    await assert.rejects(
      f.browser.browse({ url: 'https://example.org/', timeout_ms: 2000 }),
      /fabric_compute_lease_expired_or_expiring/,
    );
    assert.equal(f.requests.filter((entry) => entry.method === 'POST').length, 0);
  } finally { await f.close(); }
});

test('mismatched native worker identity is rejected before lease request', async () => {
  const f = await makeCompute({ healthMismatch: true });
  try {
    await assert.rejects(f.browser.browse({
      url: 'https://example.org/', timeout_ms: 2000,
    }), /fabric_compute_browser_health_attestation_mismatch/);
    assert.equal(f.leaseCalls(), 0);
  } finally { await f.close(); }
});

test('forged native Compute receipt, wrong service and wrong worker digest are rejected', async () => {
  for (const tamper of ['compute_receipt', 'service_id', 'worker_digest']) {
    const f = await makeCompute({ tamper });
    try {
      await assert.rejects(f.browser.browse({
        url: 'https://example.org/', timeout_ms: 2000,
      }), /fabric_compute_browser_receipt_unverified/, tamper);
    } finally { await f.close(); }
  }
});

test('private runtime does not accept an arbitrary public host, missing authority or credentials in URL', () => {
  const base = {
    serviceId, nodeId, instanceId, deploymentReceiptRef,
    leaseProvider: async () => ({ token }),
  };
  for (const origin of [
    'https://fabric.systemiacommandcenters.com/',
    'http://192.168.1.100:8787/',
    'http://127.0.0.1:8787/private',
    'http://secret:pass@127.0.0.1:8787/',
  ]) {
    assert.throws(() => createComputeBrowserLeaseRuntime({ ...base, origin }),
      /fabric_compute_private_loopback_required/);
  }
  assert.throws(() => createComputeBrowserLeaseRuntime({
    ...base, origin: 'http://127.0.0.1:8787/', leaseProvider: null,
  }), /fabric_compute_lease_provider_required/);
});


test('Compute response is size-bounded before buffering oversized worker output', async () => {
  const f = await makeCompute({ tamper: 'oversize' });
  try {
    await assert.rejects(
      f.browser.browse({ url: 'https://example.org/', timeout_ms: 2000 }),
      /fabric_compute_response_too_large/,
    );
    assert.equal(f.requests.filter((request) => request.method === 'POST').length, 1);
  } finally { await f.close(); }
});
