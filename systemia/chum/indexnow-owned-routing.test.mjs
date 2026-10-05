import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const script = path.resolve('systemia/chum/indexnow.mjs');

function run(extraEnv = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chum-indexnow-owned-'));
  const artifacts = path.join(root, 'artifacts');
  const env = { ...process.env, CHUM_ARTIFACTS_DIR: artifacts, ...extraEnv };
  delete env.CHUM_INDEXNOW_GATEWAY_URL;
  delete env.EVERCRAFT_MACHINE_COMMERCE_GATEWAY_URL;
  delete env.CHUM_INDEXNOW_PAIN_INDEX_URL;
  Object.assign(env, extraEnv);
  const result = spawnSync(process.execPath, [script], {
    cwd: path.resolve('.'),
    env,
    encoding: 'utf8'
  });
  const receiptPath = path.join(artifacts, 'indexnow-latest.json');
  const receipt = fs.existsSync(receiptPath)
    ? JSON.parse(fs.readFileSync(receiptPath, 'utf8'))
    : null;
  fs.rmSync(root, { recursive: true, force: true });
  return { result, receipt };
}

test('IndexNow holds without owned public routes and makes no Base44 claim', () => {
  const { result, receipt } = run();
  assert.equal(result.status, 0);
  assert.ok(receipt);
  assert.equal(receipt.status, 'held');
  assert.equal(receipt.route_state, 'held_no_owned_public_origin');
  assert.equal(receipt.base44_used, false);
  assert.equal(receipt.submitted, 0);
  assert.equal(receipt.pain_index.status, 'held');
  assert.match(result.stdout, /"status":"held"/);
});

test('IndexNow rejects a Base44 gateway injected through configuration', () => {
  const { result, receipt } = run({
    CHUM_INDEXNOW_GATEWAY_URL: 'https://legacy.base44.app/functions/machineCommerceGateway',
    CHUM_INDEXNOW_PAIN_INDEX_URL: 'https://journal.evercraft.global/pain'
  });
  assert.notEqual(result.status, 0);
  assert.ok(receipt);
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.route_state, 'rejected_non_owned_route');
  assert.equal(receipt.base44_used, false);
  assert.match(receipt.error, /retired Base44 infrastructure/);
});

test('IndexNow source has no hard-coded Base44 public URL', () => {
  const source = fs.readFileSync(script, 'utf8');
  const hardCodedLegacyUrls = source
    .split('\n')
    .filter((line) => line.includes('://') && line.includes('base44.app'));
  assert.deepEqual(hardCodedLegacyUrls, []);
  assert.match(source, /gatewayHost/);
  assert.match(source, /painIndexHost/);
});
