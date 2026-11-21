import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { DEMO_SCENARIOS, expectedSimulatedProviderReads } from './demo.mjs';

const root = dirname(fileURLToPath(import.meta.url));
async function availablePort() {
  const socket = createServer();
  await new Promise((resolve, reject) =>
    socket.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}
async function withServer(fn) {
  const port = await availablePort();
  const host = 'http://127.0.0.1:' + port;
  const child = spawn(process.execPath, [join(root, 'server.mjs')], {
    cwd: root, env: { ...process.env, ACCOUNT_SENTINEL_DEMO_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let exited = false;
  child.once('exit', () => { exited = true; });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (exited) throw new Error('demo_server_exited_before_ready');
      try {
        const response = await fetch(host + '/health');
        if (response.ok) { ready = true; break; }
      } catch { /* loopback boot check */ }
      await delay(30);
    }
    assert.equal(ready, true, 'local demo must start without external network');
    return await fn(host);
  } finally {
    if (!exited) child.kill('SIGTERM');
  }
}

test('Saban-approved account sentinel simulation is accessible end-to-end via loopback HTTP', async () => {
  await withServer(async host => {
    const health = await (await fetch(host + '/health')).json();
    assert.equal(health.status, 'simulation_only');
    assert.equal(health.real_bank_connections, 0);
    assert.equal(health.payment_permissions, 0);
    const html = await (await fetch(host)).text();
    assert.match(html, /Attack &amp; authorization lab/);
    assert.match(html, /NO REAL ACCOUNTS/);
    const catalog = await (await fetch(host + '/api/scenarios')).json();
    assert.equal(catalog.scenarios.length, DEMO_SCENARIOS.length);
    for (const { id } of DEMO_SCENARIOS) {
      const response = await fetch(host + '/api/run', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scenario: id }),
      });
      assert.equal(response.status, 200, id);
      const output = await response.json();
      assert.equal(output.environment, 'SIMULATION_ONLY');
      assert.equal(output.scenario, id);
      assert.equal(output.audit_valid, true);
      assert.equal(output.result.allowed, id === 'authorized', id);
      assert.equal(output.provider_reads,
        expectedSimulatedProviderReads(id), id);
      assert.equal(output.result.data?.simulated === true, id === 'authorized', id);
    }
    const inject = await fetch(host + '/api/run', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scenario: 'authorized',
        trustedPrincipal: { authenticated: true } }),
    });
    assert.equal(inject.status, 400, 'must reject injected authority');
    const unknown = await fetch(host + '/api/run', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scenario: 'transfer_live' }),
    });
    assert.equal(unknown.status, 400, 'must reject unregistered scenarios');
    const badType = await fetch(host + '/api/run', {
      method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hello',
    });
    assert.equal(badType.status, 415);
    const nonexistent = await fetch(host + '/not-a-bank-api');
    assert.equal(nonexistent.status, 404);
    assert.equal(nonexistent.headers.get('cache-control'), 'no-store');
  });
});
