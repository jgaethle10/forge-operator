import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startHouseholdFabricYakimaRuntime } from './resident-runtime.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'household-resident-'));
const browserResult = {
  ok: true,
  engine: 'evercraft-owned-browser-worker-v1',
  final_url: 'https://www.yvl.org/events/',
  text_sha256: 'resident-text-proof',
  evidence_receipt_sha256: 'resident-browser-receipt',
  finished_at: new Date().toISOString(),
  snapshot: {
    headings: [
      { level: 'h1', text: 'Events' },
      { level: 'h5', text: 'Yakima Central: Family Storytime' },
      { level: 'h6', text: 'Thursday December 24, 2026 | 7:00 pm' },
    ],
  },
};

const runtime = await startHouseholdFabricYakimaRuntime({
  stateDir: root,
  runImmediately: false,
  browserResultProvider: async () => browserResult,
  env: {
    HOUSEHOLD_KROGER_ZIP_CODE: '98902',
  },
});

try {
  const cycle = await runtime.runCycle();
  assert.equal(cycle.ok, true);

  const bound = runtime.setDeploymentReceipt('sha256:resident-proof-deployment');
  assert.equal(bound.deployment_receipt_bound, true);
  assert.equal(bound.deployment_receipt_ref, 'sha256:resident-proof-deployment');

  const health = runtime.health();
  assert.equal(health.ok, true);
  assert.equal(health.service, 'household-fabric-yakima');
  assert.equal(health.runtime, 'Evercraft Compute');
  assert.equal(health.workload_class, 'systemia.household-fabric-yakima.v1');
  assert.equal(health.resident_process_alive, true);
  assert.equal(health.today_available, true);
  assert.equal(health.secret_material_exposed, false);
  assert.equal(health.raw_provider_secrets_required, false);
  assert.equal(health.poverty_score_used, false);
  assert.equal(health.sponsorship_affects_rank, false);
  assert.equal(health.deployment_receipt_bound, true);
  assert.equal(health.deployment_receipt_ref, 'sha256:resident-proof-deployment');
  assert.equal(health.credential_status.raw_secret_override_enabled, false);

  const healthResponse = await fetch(runtime.url + '/health');
  assert.equal(healthResponse.status, 200);
  const healthBody = await healthResponse.json();
  assert.equal(healthBody.instance_id, runtime.instanceId);

  const todayResponse = await fetch(runtime.url + '/today');
  assert.equal(todayResponse.status, 200);
  const today = await todayResponse.json();
  assert.equal(today.ok, true);
  assert.equal(today.opportunities.length, 1);
  assert.equal(today.opportunities[0].title, 'Yakima Central: Family Storytime');

  for (const file of [
    'ledger.json',
    'today.json',
    'mission-snapshot.json',
    'collector-receipts.json',
    'state.json',
  ]) {
    const filePath = path.join(root, file);
    assert.equal(fs.existsSync(filePath), true, file + ' should exist');
    assert.equal(fs.statSync(filePath).mode & 0o777, 0o600, file + ' should be private');
  }
  assert.equal(fs.statSync(root).mode & 0o777, 0o700);

  assert.equal(JSON.stringify(health).includes('HOUSEHOLD_FABRIC_BROWSER_TOKEN'), false);
} finally {
  await runtime.close();
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('HOUSEHOLD_FABRIC_RESIDENT_RUNTIME_PASS');
