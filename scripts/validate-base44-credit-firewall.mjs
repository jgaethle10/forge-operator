import fs from 'node:fs';

const file = new URL('../systemia/migrations/base44-exit/credit-firewall.json', import.meta.url);
const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));

const fail = (message) => {
  console.error(`BASE44_CREDIT_FIREWALL_FAIL: ${message}`);
  process.exit(1);
};

if (cfg.status !== 'active') fail('firewall must be active');
if (cfg.rules?.new_base44_apps_allowed !== false) fail('new Base44 apps must remain frozen');
if (cfg.rules?.new_base44_recurring_workflows_allowed !== false) fail('new Base44 recurring workflows must remain frozen');
if (cfg.rules?.internal_recurring_base44_schedulers_allowed !== false) fail('internal recurring Base44 schedulers must remain prohibited');
if (cfg.rules?.base44_llm_as_default_inference_path_allowed !== false) fail('Base44 LLM cannot be the default inference path');
if (cfg.rules?.base44_as_runtime_authority_allowed !== false) fail('Base44 cannot be runtime authority');
if (cfg.rules?.base44_core_integrations_allowed !== false) fail('Base44 Core integrations must be disabled for new active execution paths');

if (cfg.replacement?.canonical_source !== 'github') fail('replacement source must be GitHub');
if (cfg.replacement?.orchestration !== 'systemia') fail('replacement orchestration must be Systemia');
if (cfg.replacement?.runtime !== 'yard_evercraft_compute') fail('replacement runtime must be Yard / Evercraft Compute');
if (cfg.replacement?.runtime_owner !== 'evercraft') fail('Evercraft must own the runtime/control fabric');
if (cfg.replacement?.named_cloud_dependency !== false) fail('no named cloud provider may be a required Base44-exit dependency');
if (cfg.replacement?.capacity_strategy !== 'authorized_existing_compute_first') fail('capacity strategy must remain authorized-existing-compute-first');
if (cfg.replacement?.capacity_protocol !== 'evercraft.capacity.v1') fail('capacity protocol must remain Evercraft-owned');
if (cfg.replacement?.scheduler !== 'systemia/core/resident-supervisor.mjs') fail('replacement scheduler must be the Systemia Core resident supervisor');
if (cfg.replacement?.scheduler_config !== 'systemia/core/resident-services.json') fail('replacement scheduler config is wrong');
if (cfg.replacement?.integration_gateway !== 'systemia/core/core-gateway.mjs') fail('owned integration gateway is missing');
if (cfg.replacement?.integration_client_shim !== 'systemia/core/core-client.js') fail('owned integration client shim is missing');
if (cfg.replacement?.integration_gateway_owner !== 'evercraft') fail('integration gateway must be Evercraft-owned');
if (cfg.replacement?.integration_gateway_legacy_transport !== false) fail('integration gateway must not route through Base44');
if (Number(cfg.replacement?.kaidance_heartbeat_target_seconds) !== 300) fail('KAIDANCE heartbeat must stay at 300 seconds');

const frozen = new Set(cfg.frozen_internal_workflows || []);
for (const workflow of [
  'systemia_internal_wake_every_5_minutes',
  'systemia_kaidance_internal_wake_v5_every_5_minutes',
  'systemia_capability_verification_every_15_minutes',
  'systemia_collider_hourly',
  'systemia_eps_social_continuity_every_30_minutes',
  'systemia_release_continuity_every_15_minutes',
]) {
  if (!frozen.has(workflow)) fail(`missing frozen internal workflow: ${workflow}`);
}
if (frozen.size !== (cfg.frozen_internal_workflows || []).length) fail('frozen workflow list contains duplicates');

const exceptions = cfg.temporary_legacy_exceptions || [];
if (exceptions.length !== 0) fail('no recurring Base44 scheduler exception may remain after EPS cutover');

const retired = cfg.retired_legacy_workflows || [];
const social = retired.find(
  (row) => row.workflow === 'systemia_eps_social_continuity_every_30_minutes'
);
if (!social) fail('EPS social Base44 scheduler retirement record is missing');
if (!['source_frozen_observation_pending','deployed_schedule_still_firing_bridge_contained','verified_retired'].includes(String(social.state || ''))) {
  fail('EPS social retirement state is invalid');
}
if (!String(social.rollback_checkpoint || '').trim()) {
  fail('EPS social rollback checkpoint is missing');
}
if (!String(social.main_cutover_receipt || '').startsWith('sha256:')) {
  fail('EPS social main cutover receipt is missing');
}
if (!['no_op','published_verified'].includes(String(social.main_cutover_result || ''))) {
  fail('EPS social main cutover result is invalid');
}
if (social.workload_identity !== 'github_oidc') {
  fail('EPS social transition workload must use federated GitHub OIDC identity');
}
if (Number(social.transition_cadence_seconds) !== 1800) {
  fail('EPS social transition cadence must remain 1800 seconds');
}
if (social.state === 'verified_retired' && social.absence_window_verified !== true) {
  fail('verified EPS retirement requires an observed absence window');
}
if (social.state === 'source_frozen_observation_pending' && social.absence_window_verified !== false) {
  fail('pending EPS retirement must not claim the absence window passed');
}
if (social.state === 'deployed_schedule_still_firing_bridge_contained') {
  if (social.absence_window_verified !== false) fail('contained legacy schedule must not claim an absence window');
  if (social.source_freeze_stopped_deployed_schedule !== false) fail('contained legacy schedule must record that source freeze did not stop runtime execution');
  if (!String(social.bridge_containment_checkpoint || '').trim()) fail('contained legacy schedule must preserve a containment rollback checkpoint');
  if (social.runtime_scheduler_removal_pending !== true) fail('contained legacy schedule must remain marked for runtime scheduler removal');
}

const releaseContinuity = retired.find(
  (row) => row.workflow === 'systemia_release_continuity_every_15_minutes'
);
if (!releaseContinuity) fail('Base44 release continuity retirement record is missing');
if (releaseContinuity.source_automation_active !== false) {
  fail('Base44 release continuity source automation must be disabled');
}
if (releaseContinuity.source_fail_closed_guard !== 'LEGACY_BASE44_RELEASE_SWEEP_DISABLED') {
  fail('Base44 release continuity must preserve the fail-closed source guard');
}
if (!String(releaseContinuity.rollback_checkpoint || '').trim()) {
  fail('Base44 release continuity rollback checkpoint is missing');
}
if (releaseContinuity.named_cloud_required !== false) {
  fail('Base44 release continuity replacement must not require a named cloud provider');
}

for (const gate of [
  'core_gateway_proof_pass',
  'replacement_runtime_live',
  'kaidance_pulse_healthy',
  'route_verification_pass',
  'integration_parity_verified',
  'rollback_target_present',
  'observation_window_pass',
]) {
  if (!cfg.cutover_gates?.includes(gate)) fail(`missing cutover gate: ${gate}`);
}

if (cfg.fail_closed?.scheduled_base44_systemia_wake_when_manual_fire_only_active !== true) {
  fail('scheduled Base44 Systemia wakes must fail closed in manual-fire-only mode');
}
if (cfg.fail_closed?.unverified_runtime_must_not_be_called_migrated !== true) {
  fail('unverified runtime must not be called migrated');
}

console.log(JSON.stringify({
  status: 'BASE44_CREDIT_FIREWALL_PASS',
  frozen_internal_workflows: frozen.size,
  temporary_legacy_exceptions: exceptions.length,
  retired_legacy_workflows: retired.length,
  replacement_scheduler: cfg.replacement.scheduler,
  replacement_runtime: cfg.replacement.runtime,
}));
