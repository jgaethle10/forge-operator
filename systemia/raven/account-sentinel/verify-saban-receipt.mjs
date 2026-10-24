#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const file = resolve(process.argv[2] ||
  'artifacts/saban-multiplier/account-sentinel-latest.json');
const receipt = JSON.parse(fs.readFileSync(file, 'utf8'));
const roles = ['identity_guard', 'consent_guard', 'provider_gate_guard', 'audit_guard'];
const expected = 48;
assert.equal(receipt.schema, 'evercraft.saban.multiplication-receipt.v1');
assert.equal(receipt.software_id, 'account-sentinel');
assert.equal(receipt.mode, 'execute_and_reconcile');
assert.equal(receipt.logical_agents, expected);
assert.equal(receipt.work_item_count, 12);
assert.ok(receipt.physical_workers >= 1 && receipt.physical_workers <= 4);
assert.match(receipt.results_digest || '', /^sha256:[a-f0-9]{64}$/);
assert.equal(receipt.scheduler_summary?.counts?.completed, expected);
assert.equal(receipt.scheduler_summary?.total, expected);
assert.equal(receipt.scheduler_summary?.counts?.dead_letter || 0, 0);
assert.equal(receipt.quality?.status, 'pass');
assert.equal(receipt.quality?.completion_ratio, 1);
assert.equal(receipt.quality?.missing_roles?.length, 0);
assert.equal(receipt.quality?.failures?.length, 0);
for (const role of roles) assert.equal(receipt.quality?.role_counts?.[role], 12);
assert.equal(receipt.reconciliation?.schema,
  'evercraft.account-sentinel.saban-reconciliation.v1');
assert.equal(receipt.reconciliation?.status, 'reconciled');
assert.equal(receipt.reconciliation?.scenario_count, 12);
assert.equal(receipt.reconciliation?.verified_assignments, expected);
assert.equal(receipt.reconciliation?.denied_scenarios, 11);
assert.equal(receipt.reconciliation?.live_bank_connections, 0);
assert.equal(receipt.reconciliation?.transaction_authorizations, 0);
assert.equal(receipt.reconciliation?.all_provider_boundaries_verified, true);
assert.equal(receipt.reconciliation?.synthetic_only, true);
assert.ok(Array.isArray(receipt.sample_results) && receipt.sample_results.length > 0);
assert.ok(receipt.sample_results.every(row =>
  row.passed === true && row.synthetic_only === true && row.external_bank_contacted === false));
process.stdout.write(JSON.stringify({
  schema: 'evercraft.account-sentinel.saban-ci-proof.v1',
  status: 'pass', software: receipt.software_id,
  verified_assignments: receipt.reconciliation.verified_assignments,
  roles: roles.length, scenarios: receipt.reconciliation.scenario_count,
  bank_connections: 0, financial_writes: 0,
  digest: receipt.results_digest,
})+'\n');
