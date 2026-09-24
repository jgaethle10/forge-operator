import fs from 'node:fs';

const policy = JSON.parse(fs.readFileSync(new URL('../systemia/migrations/base44-exit/policy.json', import.meta.url)));
const estate = JSON.parse(fs.readFileSync(new URL('../systemia/migrations/base44-exit/estate-snapshot.json', import.meta.url)));

const fail = (message) => {
  console.error(`BASE44_EXIT_POLICY_FAIL: ${message}`);
  process.exit(1);
};

if (policy.status !== 'active') fail('policy must be active');
if (policy.destinations?.canonical_source !== 'github') fail('canonical source must be github');
if (policy.destinations?.orchestration !== 'systemia') fail('orchestration must be systemia');
if (policy.destinations?.runtime !== 'yard_evercraft_compute') fail('runtime must be yard_evercraft_compute');
if (policy.destinations?.base44 !== 'legacy_extraction_compatibility_only') fail('Base44 must be extraction/compatibility only');
if (policy.invariants?.new_base44_apps !== false) fail('new Base44 apps must be frozen');
if (policy.invariants?.base44_as_new_runtime_target !== false) fail('Base44 cannot be a new runtime target');
if (policy.invariants?.base44_as_canonical_source !== false) fail('Base44 cannot be canonical source');

const required = new Set([
  'source_extracted',
  'dependencies_enumerated',
  'data_reconciled',
  'auth_parity_verified',
  'integration_parity_verified',
  'tests_pass',
  'immutable_release_ref',
  'yard_deployment_receipt',
  'health_pass',
  'route_verification_pass',
  'rollback_target_present',
  'observation_window_pass'
]);
for (const gate of required) {
  if (!policy.cutover_required_evidence?.includes(gate)) fail(`missing cutover gate ${gate}`);
}

if (!Number.isInteger(estate.observed_apps_minimum) || estate.observed_apps_minimum < 100) {
  fail('estate snapshot must preserve the observed minimum app count');
}

for (const item of estate.queue || []) {
  if (!item.product || !item.target || !item.state) fail('every migration queue item needs product, target and state');
  if (/base44/i.test(item.target)) fail(`${item.product} points back to Base44`);
}

const first = estate.queue?.[0];
if (first?.product !== 'Systemia Command Center' || first?.wave !== 1) {
  fail('Systemia Core / KAIDANCE extraction must remain first');
}

console.log(JSON.stringify({
  status: 'BASE44_EXIT_POLICY_PASS',
  observed_apps_minimum: estate.observed_apps_minimum,
  queued_products: estate.queue.length,
  first_target: first.product
}));
