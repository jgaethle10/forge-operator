import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkLocalOrganismHealth } from '../systemia/compute/local-organism-health-watch.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-organism-watch-'));
  fs.mkdirSync(path.join(root, 'compute'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'compute', 'nodeseed-receipt.json'),
    JSON.stringify({
      schema: 'evercraft.compute.nodeseed-receipt.v1',
      node_id: 'penguin-proof',
      endpoint: 'http://127.0.0.1:42420',
      device_fingerprint: 'sha256:' + 'a'.repeat(64),
    })
  );
  fs.writeFileSync(
    path.join(root, 'local-organism-receipt.json'),
    JSON.stringify({
      schema: 'evercraft.local-organism-receipt.v1',
      node_id: 'penguin-proof',
      device_fingerprint: 'sha256:' + 'a'.repeat(64),
      release_ref: 'b'.repeat(40),
      remote_admission: {
        configured: true,
        state: 'connecting_or_degraded',
      },
      remote_operator: {
        enabled: true,
      },
      receipt_hash: 'sha256:' + 'c'.repeat(64),
    })
  );
  return root;
}

function fakeSystemctl(state) {
  return (program, args) => {
    assert.equal(program, 'systemctl');
    if (args.includes('is-active')) {
      return (state.active ? 'active' : 'inactive') + '\n';
    }
    if (args.includes('restart')) {
      state.restart_count += 1;
      state.active = true;
      state.restarted = true;
      return '';
    }
    throw new Error('unexpected command');
  };
}

test('health watch records a healthy local organism without restarting it', async () => {
  const root = fixture();
  const state = { active: true, restarted: false, restart_count: 0 };
  try {
    const result = await checkLocalOrganismHealth({
      stateRoot: root,
      execImpl: fakeSystemctl(state),
      requestImpl: async () => ({
        ok: true,
        status: 200,
        body: {
          ok: true,
          runtime: 'Evercraft Compute',
          node_id: 'penguin-proof',
        },
        error: null,
      }),
      now: () => new Date('2026-10-01T02:30:00.000Z'),
    });

    assert.equal(result.state, 'healthy');
    assert.equal(result.action, 'none');
    assert.equal(result.remote_operator_enabled, true);
    assert.equal(result.remote_admission_configured, true);
    assert.equal(result.secret_material_exposed, false);
    assert.equal(state.restart_count, 0);
    assert.ok(fs.existsSync(path.join(root, 'health-watch.json')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('health watch restarts and proves recovery when NodeSeed becomes unhealthy', async () => {
  const root = fixture();
  const state = { active: true, restarted: false, restart_count: 0 };
  try {
    const result = await checkLocalOrganismHealth({
      stateRoot: root,
      execImpl: fakeSystemctl(state),
      requestImpl: async () => state.restarted
        ? {
            ok: true,
            status: 200,
            body: {
              ok: true,
              runtime: 'Evercraft Compute',
              node_id: 'penguin-proof',
            },
            error: null,
          }
        : {
            ok: false,
            status: null,
            body: null,
            error: 'connection_refused',
          },
      recoveryWaitMs: 1000,
      now: () => new Date('2026-10-01T02:31:00.000Z'),
    });

    assert.equal(result.state, 'recovered');
    assert.equal(result.action, 'restart');
    assert.equal(result.after.nodeseed_health.ok, true);
    assert.equal(result.secret_material_exposed, false);
    assert.equal(state.restart_count, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('health watch refuses a non-loopback NodeSeed receipt', async () => {
  const root = fixture();
  const state = { active: true, restarted: false, restart_count: 0 };
  try {
    const seedFile = path.join(root, 'compute', 'nodeseed-receipt.json');
    const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
    seed.endpoint = 'http://192.168.1.50:42420';
    fs.writeFileSync(seedFile, JSON.stringify(seed));

    const result = await checkLocalOrganismHealth({
      stateRoot: root,
      execImpl: fakeSystemctl(state),
      requestImpl: async () => {
        throw new Error('request must not be attempted for non-loopback endpoint');
      },
      restartOnFailure: false,
      now: () => new Date('2026-10-01T02:32:00.000Z'),
    });

    assert.equal(result.state, 'degraded');
    assert.equal(result.action, 'observe_only');
    assert.equal(result.nodeseed_endpoint_scope, 'unavailable_or_rejected');
    assert.equal(state.restart_count, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test('local organism installer wires the self-healing timer and initial receipt gate', () => {
  const installer = fs.readFileSync(
    new URL('../systemia/compute/install-local-organism-user.sh', import.meta.url),
    'utf8'
  );
  assert.match(installer, /evercraft-local-organism-health\.service/);
  assert.match(installer, /evercraft-local-organism-health\.timer/);
  assert.match(installer, /OnUnitActiveSec=60s/);
  assert.match(installer, /StartLimitIntervalSec=0/);
  assert.match(installer, /health-watch\.json/);
  assert.match(installer, /local-organism-health-watch\.mjs/);
  assert.match(installer, /--observe-only/);
  assert.doesNotMatch(installer, /sudo|ListenStream|0\.0\.0\.0/);
});
