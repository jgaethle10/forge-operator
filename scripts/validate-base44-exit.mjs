import fs from 'node:fs';

const policy = JSON.parse(fs.readFileSync(new URL('../systemia/migrations/base44-exit/policy.json', import.meta.url)));
const estate = JSON.parse(fs.readFileSync(new URL('../systemia/migrations/base44-exit/estate-snapshot.json', import.meta.url)));
const liveObservation = JSON.parse(fs.readFileSync(
  new URL('../systemia/migrations/base44-exit/live-page-observation-2026-09-30.json', import.meta.url)
));

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
if (policy.invariants?.critical_owned_runtime_hardcoded_base44_network_routes !== false) {
  fail('critical owned runtime must prohibit hard-coded Base44 network routes');
}
if (policy.invariants?.route_registry_automatic_cutover !== false) {
  fail('route registry must not allow automatic cutover');
}
if (policy.invariants?.public_migration_queue_is_complete_estate_inventory !== false) {
  fail('public migration queue must not be treated as complete estate inventory');
}
if (policy.invariants?.untitled_apps_may_be_silently_discarded !== false) {
  fail('Untitled apps may not be silently discarded');
}
if (policy.invariants?.capped_source_listing_proves_complete_inventory !== false) {
  fail('capped source listings cannot prove complete inventory');
}

for (const primitive of [
  'source_dependency_scanner',
  'lossless_entity_transfer',
  'identity_challenge_broker',
  'receipt_gated_route_registry',
  'owned_runtime_base44_network_firewall',
  'estate_coverage_ledger',
]) {
  if (!policy.shared_landing_primitives?.includes(primitive)) {
    fail(`missing shared landing primitive ${primitive}`);
  }
  if (!policy.landing_implementations?.[primitive]?.state) {
    fail(`missing landing implementation state for ${primitive}`);
  }
}

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
if (estate.listing_ceiling_hit !== true || Number(estate.listing_limit) !== 100) {
  fail('estate snapshot must preserve the observed 100-app listing ceiling');
}
if (estate.inventory_complete_proven !== false) {
  fail('estate snapshot must not claim inventory completeness from a capped listing');
}
if (estate.queue_is_complete_estate_inventory !== false) {
  fail('estate queue must remain prioritization rather than complete inventory truth');
}
if (estate.untitled_apps_require_classification_before_migration_or_archive !== true) {
  fail('Untitled apps must remain explicitly classification-gated');
}

for (const item of estate.queue || []) {
  if (!item.product || !item.target || !item.state) fail('every migration queue item needs product, target and state');
  if (/base44/i.test(item.target)) fail(`${item.product} points back to Base44`);
}


if (liveObservation.schema !== 'evercraft.base44.live-page-reconciliation.v1') {
  fail('live Base44 page observation schema is invalid');
}
if (liveObservation.observed_apps < estate.observed_apps_minimum) {
  fail('live observation cannot shrink below the established observed minimum');
}
if (liveObservation.listing_ceiling_hit !== true) {
  fail('live observation must preserve the 100-app listing ceiling truth');
}
if (liveObservation.inventory_complete_proven !== false) {
  fail('listing ceiling cannot be represented as complete estate inventory');
}
if (liveObservation.named_queue_products !== (estate.queue || []).length) {
  fail('live observation named queue count must match estate snapshot queue');
}
if (
  Number(liveObservation.exact_queue_app_matches || 0) +
  Number(liveObservation.visible_apps_not_exactly_assigned_to_named_queue || 0) !==
  Number(liveObservation.observed_apps || 0)
) {
  fail('live observation exact/unassigned counts do not reconcile to observed apps');
}
const unresolved = new Set(liveObservation.unresolved_named_queue_products || []);
const queueNames = new Set((estate.queue || []).map((row) => row.product));
for (const product of unresolved) {
  if (!queueNames.has(product)) fail(`live observation unresolved queue product is unknown: ${product}`);
}
if (liveObservation.privacy?.raw_app_ids_emitted !== false) {
  fail('live observation must not emit raw Base44 app IDs');
}
if (liveObservation.privacy?.unmatched_app_names_emitted !== false) {
  fail('live observation must not emit unmatched app names');
}
if (
  Number(liveObservation.untitled_visible_apps || 0) > 0 &&
  estate.untitled_apps_require_classification_before_migration_or_archive !== true
) {
  fail('Untitled sources require explicit classification before retirement');
}

const first = estate.queue?.[0];
if (first?.product !== 'Systemia Command Center' || first?.wave !== 1) {
  fail('Systemia Core / KAIDANCE extraction must remain first');
}

console.log(JSON.stringify({
  status: 'BASE44_EXIT_POLICY_PASS',
  observed_apps_minimum: estate.observed_apps_minimum,
  queued_products: estate.queue.length,
  first_target: first.product,
  live_observed_apps: liveObservation.observed_apps,
  live_exact_queue_matches: liveObservation.exact_queue_app_matches,
  live_visible_not_exactly_assigned: liveObservation.visible_apps_not_exactly_assigned_to_named_queue,
  live_untitled_apps: liveObservation.untitled_visible_apps
}));
