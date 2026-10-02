import fs from 'node:fs';

const ratchet = JSON.parse(
  fs.readFileSync(new URL('../systemia/migrations/base44-exit/owned-execution-ratchet.json', import.meta.url), 'utf8')
);
const competition = JSON.parse(
  fs.readFileSync(new URL('../systemia/migrations/base44-exit/slices/competition-foundry-raven-runtime.json', import.meta.url), 'utf8')
);

const fail = (message) => {
  console.error(`OWNED_EXECUTION_RATCHET_FAIL: ${message}`);
  process.exit(1);
};

if (ratchet.status !== 'active') fail('owned execution ratchet must be active');

for (const [key, expected] of Object.entries({
  new_base44_dependency_allowed: false,
  base44_internal_execution_allowed: false,
  base44_integration_credit_dependency_allowed: false,
  public_fabric_as_internal_transit_allowed: false,
  internal_execution_must_use_owned_routes: true,
  legacy_kill_requires_external_replacement_receipt: true,
})) {
  if (ratchet.rules?.[key] !== expected) fail(`ratchet rule ${key} must be ${expected}`);
}

if (ratchet.rules?.public_fabric_role !== 'external_doorway_only') {
  fail('public Fabric must remain an external doorway, not internal transit');
}

const expectedCompetitionPath = ['systemia', 'raven_nexus', 'provider_api'];
if (JSON.stringify(ratchet.canonical_paths?.competition_provider_execution) !== JSON.stringify(expectedCompetitionPath)) {
  fail('competition provider execution must be Systemia -> Raven Nexus -> provider API');
}
if (JSON.stringify(ratchet.canonical_paths?.internal_llm_provider_execution) !== JSON.stringify(expectedCompetitionPath)) {
  fail('internal provider execution must be Systemia -> Raven Nexus -> provider API');
}

for (const gate of [
  'replacement_runtime_live',
  'provider_or_destination_response_verified',
  'durable_execution_receipt',
  'rollback_target_present',
  'observation_window_pass',
]) {
  if (!ratchet.receipt_gates?.includes(gate)) fail(`missing ratchet receipt gate: ${gate}`);
}

if (ratchet.protected_compatibility?.openai_reviewed_v1_lane_must_remain_frozen !== true) {
  fail('OpenAI-reviewed compatibility lane must remain frozen');
}
if (ratchet.protected_compatibility?.compatibility_lane_may_not_become_internal_runtime !== true) {
  fail('compatibility lane must not become an internal runtime');
}

if (competition.target?.orchestration !== 'systemia') fail('competition orchestration must be Systemia');
if (competition.target?.secret_boundary !== 'raven_nexus') fail('competition secret boundary must be Raven Nexus');
if (competition.target?.provider_transport !== 'direct_provider_api') fail('competition provider transport must be direct provider API');
if (competition.target?.base44_required !== false) fail('competition path must not require Base44');
if (competition.target?.public_fabric_required !== false) fail('competition path must not require public Fabric');

if (competition.observed?.base44_integration_credit_dependency_allowed !== false) {
  fail('competition path cannot depend on Base44 integration credits');
}
if (competition.observed?.public_fabric_dependency_allowed !== false) {
  fail('competition path cannot depend on public Fabric');
}
if (competition.observed?.credential_values_public !== false) {
  fail('competition credential values must never be public');
}

if (competition.safety_and_authority?.kaggle_terms_or_competition_acceptance_requires_human_action_when_needed !== true) {
  fail('Kaggle terms/competition acceptance must preserve the human gate when needed');
}
if (competition.safety_and_authority?.numerai_staking_default !== false) {
  fail('Numerai staking must remain disabled by default');
}
if (competition.safety_and_authority?.failed_provider_auth_must_fail_closed !== true) {
  fail('provider auth failures must fail closed');
}
if (competition.safety_and_authority?.submission_without_provider_receipt_must_not_be_called_complete !== true) {
  fail('submission without a provider receipt must not be called complete');
}

if (competition.acceptance?.base44_calls_allowed !== false) fail('Base44 calls must remain prohibited');
if (competition.acceptance?.public_fabric_transit_allowed !== false) fail('public Fabric transit must remain prohibited');

if (
  competition.observed?.provider_submission_receipt_verified === true &&
  competition.observed?.github_provider_executor_verified !== true
) {
  fail('a provider submission receipt cannot be claimed without a verified owned executor');
}

console.log(JSON.stringify({
  status: 'OWNED_EXECUTION_RATCHET_PASS',
  public_fabric_role: ratchet.rules.public_fabric_role,
  competition_path: ratchet.canonical_paths.competition_provider_execution.join(' -> '),
  base44_required: competition.target.base44_required,
  public_fabric_required: competition.target.public_fabric_required,
  provider_executor_verified: competition.observed.github_provider_executor_verified,
}));
