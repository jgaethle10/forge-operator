import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const resident = JSON.parse(fs.readFileSync("systemia/core/resident-services.json", "utf8"));
const scoutManifest = JSON.parse(fs.readFileSync("systemia/organism/competition-provider-scout.workflow.json", "utf8"));
const submitManifest = JSON.parse(fs.readFileSync("systemia/organism/competition-submission-executor.workflow.json", "utf8"));
const slice = JSON.parse(fs.readFileSync("systemia/migrations/base44-exit/slices/competition-foundry-raven-runtime.json", "utf8"));

test("competition provider scout is resident-wired without Base44 or public Fabric", () => {
  const service = resident.services.find((row) => row.service_key === "competition-provider-scout");
  assert.ok(service);
  assert.equal(service.mode, "cycle");
  assert.equal(service.cadence_seconds, 900);
  assert.equal(service.optional_when_unconfigured, true);
  assert.equal(service.env_args["--raven-credentials-ready"], "RAVEN_COMPETITION_PROVIDER_CREDENTIALS_READY");
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
