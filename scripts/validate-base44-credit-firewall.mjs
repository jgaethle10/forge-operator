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

if (cfg.replacement?.canonical_source !== 'github') fail('replacement source must be GitHub');
if (cfg.replacement?.orchestration !== 'systemia') fail('replacement orchestration must be Systemia');
if (cfg.replacement?.runtime !== 'yard_evercraft_compute') fail('replacement runtime must be Yard / Evercraft Compute');
if (cfg.replacement?.scheduler !== 'systemia/core/resident-supervisor.mjs') fail('replacement scheduler must be the Systemia Core resident supervisor');
if (cfg.replacement?.scheduler_config !== 'systemia/core/resident-services.json') fail('replacement scheduler config is wrong');
if (Number(cfg.replacement?.kaidance_heartbeat_target_seconds) !== 300) fail('KAIDANCE heartbeat must stay at 300 seconds');

const frozen = new Set(cfg.frozen_internal_workflows || []);
for (const workflow of [
  'systemia_internal_wake_every_5_minutes',
  'systemia_kaidance_internal_wake_v5_every_5_minutes',
  'systemia_capability_verification_every_15_minutes',
  'systemia_collider_hourly',
]) {
  if (!frozen.has(workflow)) fail(`missing frozen internal workflow: ${workflow}`);
}
if (frozen.size !== (cfg.frozen_internal_workflows || []).length) fail('frozen workflow list contains duplicates');

const exceptions = cfg.temporary_legacy_exceptions || [];
if (exceptions.length > 1) fail('legacy schedule exception count expanded without review');
const social = exceptions[0];
if (!social || social.workflow !== 'systemia_eps_social_continuity_every_30_minutes') {
  fail('only the bounded EPS social continuity exception is currently permitted');
}
if (social.new_internal_work_fanout_allowed !== false) fail('legacy exception may not fan out new internal work');
if (social.replacement_workflow !== 'systemia/organism/eps-social-continuity.workflow.json') {
  fail('EPS social exception must point to the Systemia Core replacement workflow');
}
if (social.replacement_scheduler !== 'systemia/core/resident-supervisor.mjs') {
  fail('EPS social exception must point to the Systemia Core resident supervisor');
}
if (social.replacement_state !== 'source_and_supervisor_wiring_present_not_live') {
  fail('EPS social replacement must remain explicitly unverified until Yard runtime proof exists');
}
if (social.retirement_gate !== 'yard_cycle_live_plus_verified_clip_response_plus_observation_window') {
  fail('EPS social Base44 schedule retirement gate is incomplete');
}

for (const gate of [
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
  replacement_scheduler: cfg.replacement.scheduler,
  replacement_runtime: cfg.replacement.runtime,
}));
