#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  assertNoSecretValues,
  buildEvacuationPlan,
  reconcilePortfolioPlans,
  sanitizeSourceRecord
} from './contract.mjs';

const fixtures = [
  {
    name: 'Synthetic Static Door',
    app_id: 'do-not-emit-1',
    entity_count: 0,
    function_count: 0,
    readiness: {
      source_code_captured: true,
      route_inventory_captured: true,
      parity_suite_passed: true,
      observability_ready: true,
      rollback_proven: true,
      post_cutover_sentinel_ready: true
    }
  },
  {
    name: 'Synthetic Operations App',
    app_id: 'do-not-emit-2',
    entities: ['Order', 'Customer', 'User'],
    functions: ['createOrder', 'notifyCustomer'],
    connectors: ['gmail'],
    env_keys: ['CRM_API_KEY', 'MAIL_SHARED_SECRET'],
    auth: true,
    storage: true,
    scheduled_jobs: ['dailyReconcile'],
    webhooks: ['paymentEvent'],
    readiness: {
      source_code_captured: true,
      route_inventory_captured: true,
      schema_mapped: true
    }
  },
  {
    name: 'Synthetic Machine Gateway',
    app_id: 'do-not-emit-3',
    entity_count: 80,
    function_count: 30,
    auth: true,
    payments: true,
    public_machine_access: true,
    public_machine_surfaces: ['mcp', 'openapi'],
    env_keys: ['PAYMENT_SECRET', 'MODEL_API_KEY'],
    PAYMENT_SECRET: 'plaintext-should-never-emit',
    readiness: {}
  }
];

const sanitized = fixtures.map(sanitizeSourceRecord);
assert.ok(sanitized.every((row) => row.source_identifiers_redacted === true));
assert.ok(sanitized.every((row) => !JSON.stringify(row).includes('do-not-emit-')));

const plans = fixtures.map(buildEvacuationPlan);
assert.equal(plans[0].readiness.status, 'cutover_ready');
assert.equal(plans[1].readiness.status, 'not_cutover_ready');
assert.equal(plans[2].readiness.status, 'not_cutover_ready');
assert.ok(plans[1].destination_targets.some((row) => row.key === 'canonical_data'));
assert.ok(plans[1].destination_targets.some((row) => row.key === 'connector_gateway'));
assert.ok(plans[2].destination_targets.some((row) => row.key === 'commerce_boundary'));
assert.ok(plans[2].destination_targets.some((row) => row.key === 'fabric_discovery'));
assert.ok(!JSON.stringify(plans).includes('plaintext-should-never-emit'));
assertNoSecretValues(plans);

const portfolio = reconcilePortfolioPlans(plans);
assert.equal(portfolio.status, 'reconciled');
assert.equal(portfolio.summary.total, 3);
assert.equal(portfolio.summary.cutover_ready, 1);
assert.equal(portfolio.summary.not_cutover_ready, 2);
assert.equal(portfolio.source_mutations_applied, 0);
assert.equal(portfolio.source_decommissions_applied, 0);

console.log(JSON.stringify({
  schema: 'evercraft.base44-evac.proof.v1',
  status: 'pass',
  apps: portfolio.summary.total,
  cutover_ready: portfolio.summary.cutover_ready,
  blocked: portfolio.summary.not_cutover_ready,
  source_mutations_applied: 0,
  source_decommissions_applied: 0,
  secret_values_emitted: false
}));
