import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(currentDir, '../cli.mjs');
const fixture = path.resolve(currentDir, 'fixtures/math-server.mjs');

test('operator CLI end-to-end: metadata registration, explicit probe, approved call, removal', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-operator-e2e-'));
  const env = { ...process.env, XDG_CONFIG_HOME: temp };
  const invoke = (...args) => spawnSync(process.execPath, [cli, ...args], {
    cwd: temp,
    env,
    encoding: 'utf8',
    timeout: 10_000
  });

  try {
    const manifest = path.join(temp, 'math-tool.json');
    fs.writeFileSync(manifest, JSON.stringify({
      id: 'sample.math',
      name: 'Independent local math fixture',
      transport: 'mcp-stdio',
      command: process.execPath,
      args: [fixture]
    }));

    const registration = invoke('tool', 'add', manifest);
    assert.equal(registration.status, 0, registration.stderr);
    assert.deepEqual(JSON.parse(registration.stdout), { registered: 'sample.math', executed: false });

    const doctor = invoke('doctor');
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.equal(JSON.parse(doctor.stdout).registeredTools, 1);

    const blockedProbe = invoke('tool', 'probe', 'sample.math');
    assert.equal(blockedProbe.status, 1);
    assert.match(blockedProbe.stderr, /requires --run/);

    const probe = invoke('tool', 'probe', 'sample.math', '--run');
    assert.equal(probe.status, 0, probe.stderr);
    assert.equal(JSON.parse(probe.stdout).status, 'local_probe_succeeded');
    assert.equal(JSON.parse(probe.stdout).tools[0].name, 'sum');

    const blockedCall = invoke('tool', 'call', 'sample.math', 'sum', '--input', '{"a":2,"b":5}');
    assert.equal(blockedCall.status, 1);
    assert.match(blockedCall.stderr, /requires --approve/);

    const syntheticSensitiveInput = 'SYNTHETIC_TEST_SECRET_DO_NOT_LOG_9f8a';
    const approvedCall = invoke('tool', 'call', 'sample.math', 'sum', '--input', JSON.stringify({
      a: 2,
      b: 5,
      synthetic_secret: syntheticSensitiveInput
    }), '--approve');
    assert.doesNotMatch(approvedCall.stderr, /SYNTHETIC_TEST_SECRET_DO_NOT_LOG_9f8a/);
    assert.doesNotMatch(approvedCall.stdout, /SYNTHETIC_TEST_SECRET_DO_NOT_LOG_9f8a/);
    assert.match(approvedCall.stderr, /input omitted from logs/);
    assert.equal(approvedCall.status, 0, approvedCall.stderr);
    const response = JSON.parse(approvedCall.stdout);
    assert.equal(response.status, 'tool_returned');
    assert.equal(response.result.content[0].text, '7');

    const removal = invoke('tool', 'remove', 'sample.math');
    assert.equal(removal.status, 0, removal.stderr);
    assert.equal(JSON.parse(removal.stdout).executableDeleted, false);

    const finalList = invoke('tool', 'list');
    assert.equal(finalList.status, 0, finalList.stderr);
    assert.deepEqual(JSON.parse(finalList.stdout), []);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
