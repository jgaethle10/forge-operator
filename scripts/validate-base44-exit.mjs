import fs from 'node:fs';

const policy = JSON.parse(fs.readFileSync(new URL('../systemia/migrations/base44-exit/policy.json', import.meta.url)));
const estate = JSON.parse(fs.readFileSync(new URL('../systemia/migrations/base44-exit/estate-snapshot.json', import.meta.url)));
const liveObservation = JSON.parse(fs.readFileSync(
  new URL('../systemia/migrations/base44-exit/live-page-observation-2026-09-30.json', import.meta.url)
));
const waveOneProfile = JSON.parse(fs.readFileSync(
  new URL('../systemia/migrations/base44-exit/wave-1-source-profile-2026-09-30.json', import.meta.url)
));
const waveOneReplacements = JSON.parse(fs.readFileSync(
  new URL('../systemia/migrations/base44-exit/wave-1-replacement-matrix.json', import.meta.url)
));
const waveOneScheduledWork = JSON.parse(fs.readFileSync(
  new URL('../systemia/migrations/base44-exit/wave-1-scheduled-work.json', import.meta.url)
));
const commandCenterShadowCapture = JSON.parse(fs.readFileSync(
  new URL('../systemia/migrations/base44-exit/wave-1-command-center-shadow-source-capture-2026-10-01.json', import.meta.url)
));
const commandCenterFunctionMap = JSON.parse(fs.readFileSync(
  new URL('../systemia/migrations/base44-exit/wave-1-command-center-function-map.json', import.meta.url)
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
  'connector_gateway',
  'webhook_gateway',
  'commerce_boundary',
  'resident_scheduler',
  'fabric_discovery',
  'object_storage',
  'object_delivery',
  'secret_store',
  'route_registry',
  'active_route_overlay',
  'integration_edge',
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

if (waveOneProfile.schema !== 'evercraft.base44.wave-source-profile.v1' || waveOneProfile.wave !== 1) {
  fail('wave one source profile schema/wave is invalid');
}
const waveOneQueue = (estate.queue || []).filter((row) => Number(row.wave) === 1);
const profiledWaveOne = waveOneProfile.products || [];
if (profiledWaveOne.length !== waveOneQueue.length) {
  fail('wave one source profile must cover every wave one queue product');
}
const waveOneQueueNames = new Set(waveOneQueue.map((row) => row.product));
for (const row of profiledWaveOne) {
  if (!waveOneQueueNames.has(row.product)) fail(`wave one profile contains unknown product: ${row.product}`);
}
const entityTotal = profiledWaveOne.reduce((sum, row) => sum + Number(row.entity_count || 0), 0);
const functionTotal = profiledWaveOne.reduce((sum, row) => sum + Number(row.function_count || 0), 0);
const connectorTotal = profiledWaveOne.reduce((sum, row) => sum + Number(row.connected_connector_count || 0), 0);
if (entityTotal !== Number(waveOneProfile.totals?.entity_schemas)) fail('wave one entity total does not reconcile');
if (functionTotal !== Number(waveOneProfile.totals?.server_functions)) fail('wave one function total does not reconcile');
if (connectorTotal !== Number(waveOneProfile.totals?.connected_connectors)) fail('wave one connector total does not reconcile');
if (waveOneProfile.privacy?.raw_base44_app_ids_emitted !== false) fail('wave one profile must not emit Base44 app IDs');
if (waveOneProfile.privacy?.credentials_emitted !== false) fail('wave one profile must not emit credentials');
for (const row of profiledWaveOne) {
  for (const connector of row.connected_connectors || []) {
    if (connector.credential_values_emitted !== false) fail(`connector credential policy failed for ${row.product}`);
  }
}

if (commandCenterShadowCapture.schema !== 'evercraft.base44.live-shadow-source-capture.v1') {
  fail('Command Center shadow source capture schema is invalid');
}
if (commandCenterShadowCapture.product !== 'Systemia Command Center') {
  fail('Command Center shadow source capture product mismatch');
}
if (commandCenterShadowCapture.hash_algorithm !== 'sha256' ||
    commandCenterShadowCapture.hash_implementation_self_test?.passed !== true) {
  fail('Command Center shadow source capture must use self-tested SHA-256');
}
const shadowEntities = commandCenterShadowCapture.entities || [];
const shadowRows = shadowEntities.reduce((sum, row) => sum + Number(row.row_count || 0), 0);
const shadowPages = shadowEntities.reduce((sum, row) => sum + Number(row.pages || 0), 0);
if (shadowEntities.length !== Number(commandCenterShadowCapture.totals?.entities || 0) ||
    shadowRows !== Number(commandCenterShadowCapture.totals?.rows || 0) ||
    shadowPages !== Number(commandCenterShadowCapture.totals?.pages || 0)) {
  fail('Command Center shadow source capture totals do not reconcile');
}
for (const row of shadowEntities) {
  if (row.terminal_pagination !== true) fail(`shadow capture pagination incomplete for ${row.entity_name}`);
  if (!/^sha256:[a-f0-9]{64}$/.test(String(row.stream_sha256 || ''))) {
    fail(`shadow capture stream hash invalid for ${row.entity_name}`);
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(String(row.field_set_sha256 || ''))) {
    fail(`shadow capture field-set hash invalid for ${row.entity_name}`);
  }
}
if (commandCenterShadowCapture.privacy?.raw_app_id_emitted !== false ||
    commandCenterShadowCapture.privacy?.raw_record_ids_emitted !== false ||
    commandCenterShadowCapture.privacy?.raw_records_emitted !== false ||
    commandCenterShadowCapture.privacy?.field_values_emitted !== false) {
  fail('Command Center shadow source capture privacy boundary failed');
}
if (commandCenterShadowCapture.authority?.source_mutation !== false ||
    commandCenterShadowCapture.authority?.destination_write !== false ||
    commandCenterShadowCapture.authority?.traffic_cutover !== false ||
    commandCenterShadowCapture.authority?.source_decommission !== false) {
  fail('Command Center shadow source capture exceeded read-only authority');
}

if (commandCenterFunctionMap.schema !== 'evercraft.base44.command-center-function-map.v1') {
  fail('Command Center function map schema is invalid');
}
if (commandCenterFunctionMap.product !== 'Systemia Command Center') {
  fail('Command Center function map product mismatch');
}
const commandCenterFunctions = commandCenterFunctionMap.functions || [];
if (Number(commandCenterFunctionMap.source_function_count || 0) !== 8 || commandCenterFunctions.length !== 8) {
  fail('Command Center function map must cover all eight observed source functions');
}
const commandCenterFunctionNames = new Set(commandCenterFunctions.map((row) => row.source_function));
for (const expected of [
  'aqueductOps',
  'evercraftCommerceGateway',
  'evercraftCommerceMcp',
  'evercraftWebGateway',
  'evercraftWebMcp',
  'exactOutputGateOps',
  'firstPartyCapabilityRouter',
  'systemiaCoreGateway'
]) {
  if (!commandCenterFunctionNames.has(expected)) fail(`Command Center function map missing ${expected}`);
}
for (const row of commandCenterFunctions) {
  if (!Array.isArray(row.owned_refs) || row.owned_refs.length === 0) {
    fail(`Command Center function map missing owned refs for ${row.source_function}`);
  }
  for (const ref of row.owned_refs) {
    if (!fs.existsSync(new URL('../' + ref, import.meta.url))) {
      fail(`Command Center function map owned ref missing: ${ref}`);
    }
  }
  if (row.state === 'cutover_ready') fail(`Command Center function prematurely cutover-ready: ${row.source_function}`);
}
if (Number(commandCenterFunctionMap.summary?.stateful_functions_owned_implementation_present || 0) !== 2) {
  fail('Command Center stateful transplant count must remain two until more parity is proven');
}
if (Number(commandCenterFunctionMap.summary?.owned_function_implementations_present || 0) !== 4) {
  fail('Command Center owned function implementation count must be four');
}
if (Number(commandCenterFunctionMap.summary?.functions_with_owned_replacement_path || 0) !== 8) {
  fail('Command Center all eight source functions must retain an owned replacement path');
}
if (Number(commandCenterFunctionMap.summary?.functions_fully_cutover_ready || 0) !== 0) {
  fail('Command Center cannot claim cutover-ready functions yet');
}
if (Number(commandCenterFunctionMap.summary?.legacy_public_registry_routes_remaining || 0) !== 4) {
  fail('Command Center must preserve truth that four public registry files still route through Base44');
}
for (const key of ['source_mutation','traffic_cutover','registry_repoint','source_decommission']) {
  if (commandCenterFunctionMap.authority?.[key] !== false) {
    fail(`Command Center function map exceeded authority boundary: ${key}`);
  }
}

if (waveOneReplacements.schema !== 'evercraft.base44.wave-replacement-matrix.v1' || waveOneReplacements.wave !== 1) {
  fail('wave one replacement matrix schema/wave is invalid');
}
const replacementProducts = new Set((waveOneReplacements.products || []).map((row) => row.product));
if (replacementProducts.size !== waveOneQueueNames.size) fail('wave one replacement matrix product count mismatch');
for (const product of waveOneQueueNames) {
  if (!replacementProducts.has(product)) fail(`wave one replacement matrix missing ${product}`);
}
if ((waveOneReplacements.products || []).some((row) => row.cutover_ready === true)) {
  fail('wave one replacement matrix may not claim cutover readiness before evidence');
}
let implementationPending = 0;
for (const row of waveOneReplacements.products || []) {
  for (const component of row.components || []) {
    if (component.state === 'implementation_present_ci_pending') {
      implementationPending += 1;
      for (const ref of component.refs || []) {
        if (!fs.existsSync(new URL('../' + ref, import.meta.url))) {
          fail(`wave one replacement source ref missing: ${ref}`);
        }
      }
    }
  }
}
if (implementationPending !== Number(waveOneReplacements.summary?.implementations_present_ci_pending || 0)) {
  fail('wave one replacement implementation count does not reconcile');
}
if (Number(waveOneReplacements.summary?.products_cutover_ready || 0) !== 0) {
  fail('wave one replacement summary cannot claim cutover-ready products');
}
if (Number(waveOneReplacements.summary?.destination_data_migrated_products || 0) !== 0) {
  fail('wave one replacement summary cannot claim destination data migration yet');
}
if (waveOneReplacements.authority?.traffic_cutover !== false || waveOneReplacements.authority?.source_decommission !== false) {
  fail('wave one replacement matrix must not carry cutover/decommission authority');
}

if (waveOneScheduledWork.schema !== 'evercraft.base44.wave-scheduled-work.v1' || waveOneScheduledWork.wave !== 1) {
  fail('wave one scheduled work schema/wave is invalid');
}
const scheduledProducts = new Set((waveOneScheduledWork.jobs || []).map((row) => row.product));
for (const expected of ['Systemia Remote Ops', 'Evercraft InternalOps']) {
  if (!scheduledProducts.has(expected)) fail(`wave one scheduled work missing ${expected}`);
}
const scheduledExpectations = {
  'Systemia Remote Ops': {
    service_key: 'remote-ops-auto-clock-out',
    activation_env: 'SYSTEMIA_REMOTE_OPS_AUTO_CLOCK_OUT_ENABLED',
    destination_app_key: 'systemia-remote-ops'
  },
  'Evercraft InternalOps': {
    service_key: 'internal-ops-auto-clock-out',
    activation_env: 'SYSTEMIA_INTERNAL_OPS_AUTO_CLOCK_OUT_ENABLED',
    destination_app_key: 'evercraft-internal-ops'
  }
};
for (const job of waveOneScheduledWork.jobs || []) {
  if (job.automatic_activation !== false) fail(`scheduled work may not auto-activate for ${job.product}`);
  if (job.activation_state !== 'registered_disabled_until_destination_data_live') {
    fail(`scheduled work must remain registered but disabled until destination data is live for ${job.product}`);
  }
  const expected = scheduledExpectations[job.product];
  if (!expected) fail(`unexpected wave one scheduled job product ${job.product}`);
  if (job.service_key !== expected.service_key) fail(`scheduled service key mismatch for ${job.product}`);
  if (job.activation_env !== expected.activation_env) fail(`scheduled activation env mismatch for ${job.product}`);
  if (job.destination_app_key !== expected.destination_app_key) fail(`scheduled destination app key mismatch for ${job.product}`);
  if (job.supervisor_config !== 'systemia/core/resident-services.json') {
    fail(`scheduled supervisor config mismatch for ${job.product}`);
  }
  if (job.workflow_manifest !== 'systemia/operations/auto-clock-out.workflow.json') {
    fail(`scheduled workflow manifest mismatch for ${job.product}`);
  }
  if (!(job.activation_requires || []).includes('explicit_activation_gate_receipt')) {
    fail(`scheduled work missing explicit activation receipt gate for ${job.product}`);
  }
}
const waveOneSnapshot = estate.wave_profiles?.['1'];
if (waveOneSnapshot?.replacement_matrix !== 'systemia/migrations/base44-exit/wave-1-replacement-matrix.json') {
  fail('estate snapshot must bind the wave one replacement matrix');
}
if (waveOneSnapshot?.scheduled_work_spec !== 'systemia/migrations/base44-exit/wave-1-scheduled-work.json') {
  fail('estate snapshot must bind the wave one scheduled work spec');
}
if (waveOneSnapshot?.command_center_function_map !== 'systemia/migrations/base44-exit/wave-1-command-center-function-map.json') {
  fail('estate snapshot must bind the Command Center function map');
}
if (Number(waveOneSnapshot?.command_center_source_functions_mapped || 0) !== 8) {
  fail('estate snapshot must preserve eight mapped Command Center source functions');
}
if (Number(waveOneSnapshot?.command_center_stateful_functions_transplanted || 0) !== 2) {
  fail('estate snapshot must preserve two locally transplanted Command Center stateful functions');
}
if (Number(waveOneSnapshot?.command_center_owned_function_implementations || 0) !== 4) {
  fail('estate snapshot must preserve four owned Command Center function implementations');
}
if (Number(waveOneSnapshot?.implementations_present_ci_pending || 0) !== implementationPending) {
  fail('estate snapshot implementation count must match replacement matrix');
}
if (Number(waveOneSnapshot?.cutover_ready_products || 0) !== 0 || waveOneSnapshot?.cutover_authority !== false) {
  fail('estate snapshot may not claim wave one cutover readiness or authority');
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
  live_untitled_apps: liveObservation.untitled_visible_apps,
  wave_one_profiled_products: profiledWaveOne.length,
  wave_one_entities: entityTotal,
  wave_one_functions: functionTotal,
  wave_one_connected_connectors: connectorTotal,
  wave_one_implementations_present_ci_pending: implementationPending,
  wave_one_cutover_ready_products: waveOneReplacements.summary.products_cutover_ready,
  wave_one_scheduled_jobs: (waveOneScheduledWork.jobs || []).length,
  command_center_shadow_capture_entities: shadowEntities.length,
  command_center_shadow_capture_rows: shadowRows,
  command_center_shadow_capture_pages: shadowPages,
  command_center_source_functions_mapped: commandCenterFunctions.length,
  command_center_stateful_functions_transplanted: commandCenterFunctionMap.summary.stateful_functions_owned_implementation_present,
  command_center_owned_function_implementations: commandCenterFunctionMap.summary.owned_function_implementations_present,
  command_center_legacy_registry_routes_remaining: commandCenterFunctionMap.summary.legacy_public_registry_routes_remaining
}));
