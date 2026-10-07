import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const resident = JSON.parse(fs.readFileSync("systemia/core/resident-services.json", "utf8"));
const scoutManifest = JSON.parse(fs.readFileSync("systemia/organism/competition-provider-scout.workflow.json", "utf8"));
const submitManifest = JSON.parse(fs.readFileSync("systemia/organism/competition-submission-executor.workflow.json", "utf8"));
const controlManifest = JSON.parse(fs.readFileSync("systemia/organism/competition-control-plane.workflow.json", "utf8"));
const draftManifest = JSON.parse(fs.readFileSync("systemia/organism/competition-browser-draft-executor.workflow.json", "utf8"));
const capacityManifest = JSON.parse(fs.readFileSync("systemia/organism/competition-saban-capacity.workflow.json", "utf8"));
const slice = JSON.parse(fs.readFileSync("systemia/migrations/base44-exit/slices/competition-foundry-raven-runtime.json", "utf8"));

test("competition provider scout is resident-wired without Base44 or public Fabric", () => {
  const service = resident.services.find((row) => row.service_key === "competition-provider-scout");
  assert.ok(service);
  assert.equal(service.mode, "cycle");
  assert.equal(service.cadence_seconds, 900);
  assert.equal(service.optional_when_unconfigured, true);
  assert.equal(service.executable, "systemia/competition/provider-probe-runner.mjs");

  assert.equal(scoutManifest.routing.base44_allowed, false);
  assert.equal(scoutManifest.routing.public_fabric_transit_allowed, false);
  assert.deepEqual(scoutManifest.routing.canonical_path, ["systemia", "raven_nexus", "provider_api"]);
  assert.equal(scoutManifest.authority.staking, "disabled");
  assert.match(scoutManifest.authority.submission, /^delegated_to_/);

  assert.equal(slice.target.base44_required, false);
  assert.equal(slice.target.public_fabric_required, false);
  assert.equal(slice.observed.resident_scout_registered, true);
  assert.equal(slice.safety_and_authority.numerai_staking_default, false);
});

test("competition submission executor is resident and autonomous only for existing accepted terms", () => {
  const service = resident.services.find((row) => row.service_key === "competition-submission-executor");
  assert.ok(service);
  assert.equal(service.mode, "cycle");
  assert.equal(service.cadence_seconds, 300);
  assert.equal(service.executable, "systemia/competition/submission-runner.mjs");
  assert.deepEqual(service.static_args, ["--authority", "authorized_existing_terms_only"]);

  assert.equal(submitManifest.authority.submission, "autonomous_existing_terms_only_after_raven_qa");
  assert.equal(submitManifest.authority.provider_receipt, "required_before_success");
  assert.equal(submitManifest.authority.staking, "disabled");
  assert.equal(submitManifest.authority.payment, "disabled");
  assert.equal(submitManifest.safety.accept_new_terms, false);
  assert.equal(submitManifest.safety.stake_funds, false);
  assert.equal(submitManifest.safety.create_financial_obligation, false);
  assert.equal(submitManifest.routing.base44_allowed, false);
  assert.equal(submitManifest.routing.public_fabric_transit_allowed, false);
  assert.deepEqual(submitManifest.routing.canonical_path, ["systemia", "build_test", "raven_qa", "raven_nexus", "provider_api"]);
});


test("competition control plane makes Jesse an exception handler, not the operator", () => {
  const service = resident.services.find((row) => row.service_key === "competition-control-plane");
  assert.ok(service);
  assert.equal(service.mode, "cycle");
  assert.equal(service.cadence_seconds, 300);
  assert.equal(service.executable, "systemia/competition/control-plane-runner.mjs");

  assert.equal(controlManifest.authority.discovery, "autonomous");
  assert.equal(controlManifest.authority.rules_research, "autonomous");
  assert.equal(controlManifest.authority.build_and_test, "autonomous");
  assert.equal(controlManifest.authority.raven_qa, "autonomous_required");
  assert.equal(controlManifest.authority.new_terms, "human_gate");
  assert.equal(controlManifest.authority.identity_mfa_captcha, "human_gate");
  assert.equal(controlManifest.authority.payment_or_staking, "human_gate");
  assert.equal(controlManifest.safety.accept_new_terms, false);
  assert.equal(controlManifest.safety.bypass_identity_controls, false);
  assert.equal(controlManifest.safety.claim_success_without_provider_receipt, false);
  assert.deepEqual(controlManifest.routing.canonical_path, [
    "systemia",
    "competition_control_plane",
    "saban_capacity",
    "build_test",
    "raven_qa",
    "raven_nexus",
    "provider_executor",
  ]);
});


test("canonical competition registry is present and carries live money targets", () => {
  const registry = JSON.parse(fs.readFileSync("systemia/competition/opportunity-registry.json", "utf8"));
  assert.equal(registry.schema, "evercraft.systemia.competition-opportunity-registry.v1");
  assert.ok(Array.isArray(registry.opportunities));
  const ids = new Set(registry.opportunities.map((row) => row.opportunity_id));
  assert.ok(ids.has("qloo-agentic-hackathon-2026"));
  assert.ok(ids.has("nebius-nvidia-global-ai-hackathon-2026"));
  assert.ok(ids.has("paypal-ai-hackathon-2026"));
  assert.ok(ids.has("google-gemma-4-developer-agent-2026"));
  for (const row of registry.opportunities) {
    assert.ok(row.evidence?.source);
    assert.ok(row.deadline);
    assert.equal(row.build?.submission_package_ready, false);
  }
});


test("competition browser draft executor is resident and cannot become final submit authority", () => {
  const service = resident.services.find((row) => row.service_key === "competition-browser-draft-executor");
  assert.ok(service);
  assert.equal(service.mode, "cycle");
  assert.equal(service.cadence_seconds, 300);
  assert.equal(service.executable, "systemia/competition/browser-draft-runner.mjs");
  assert.equal(draftManifest.authority.fill_draft_fields, "autonomous_after_raven_qa");
  assert.equal(draftManifest.authority.save_draft, "autonomous_after_raven_qa");
  assert.match(draftManifest.authority.final_submission, /^human_gate_/);
  assert.equal(draftManifest.safety.human_claim_token_to_agent, false);
  assert.equal(draftManifest.safety.accept_new_terms, false);
  assert.equal(draftManifest.safety.final_submit_without_human_gate, false);
  assert.equal(draftManifest.safety.call_draft_a_submission, false);
  assert.deepEqual(draftManifest.routing.canonical_path, [
    "systemia",
    "raven_qa",
    "yard",
    "evercraft_compute",
    "authenticated_browser_delegation",
  ]);
});


test("competition capacity is resident-routed through Saban and remains zero-spend", () => {
  const service = resident.services.find((row) => row.service_key === "competition-saban-capacity");
  assert.ok(service);
  assert.equal(service.mode, "cycle");
  assert.equal(service.cadence_seconds, 300);
  assert.equal(service.executable, "systemia/competition/saban-capacity-runner.mjs");
  assert.equal(service.optional_when_unconfigured, true);
  assert.equal(capacityManifest.authority.capacity_discovery, "autonomous");
  assert.equal(capacityManifest.authority.owned_or_authorized_zero_cost_lease, "autonomous");
  assert.equal(capacityManifest.authority.paid_lease, "human_gate");
  assert.equal(capacityManifest.safety.zero_spend_default, true);
  assert.equal(capacityManifest.safety.create_financial_obligation, false);
  assert.equal(capacityManifest.safety.paid_market_order, false);
  assert.equal(capacityManifest.safety.persist_allocator_token, false);
  assert.deepEqual(capacityManifest.routing.canonical_path, [
    "systemia",
    "competition_control_plane",
    "saban",
    "yard",
    "evercraft_compute",
    "competition_browser_worker",
  ]);
  assert.equal(controlManifest.authority.capacity_discovery, "delegated_to_saban");
  assert.equal(controlManifest.authority.zero_spend_capacity_acquisition, "autonomous_via_saban");
  assert.equal(controlManifest.authority.paid_capacity, "human_gate");
  assert.equal(controlManifest.safety.paid_capacity_without_human_authority, false);
});
