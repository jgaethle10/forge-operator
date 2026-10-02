import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const resident = JSON.parse(fs.readFileSync("systemia/core/resident-services.json", "utf8"));
const manifest = JSON.parse(fs.readFileSync("systemia/organism/competition-provider-scout.workflow.json", "utf8"));
const slice = JSON.parse(fs.readFileSync("systemia/migrations/base44-exit/slices/competition-foundry-raven-runtime.json", "utf8"));

test("competition provider scout is resident-wired without Base44 or public Fabric", () => {
  const service = resident.services.find((row) => row.service_key === "competition-provider-scout");
  assert.ok(service);
  assert.equal(service.mode, "cycle");
  assert.equal(service.cadence_seconds, 900);
  assert.equal(service.optional_when_unconfigured, true);
  assert.equal(service.env_args["--raven-credentials-ready"], "RAVEN_COMPETITION_PROVIDER_CREDENTIALS_READY");
  assert.equal(service.executable, "systemia/competition/provider-probe-runner.mjs");

  assert.equal(manifest.routing.base44_allowed, false);
  assert.equal(manifest.routing.public_fabric_transit_allowed, false);
  assert.deepEqual(manifest.routing.canonical_path, ["systemia", "raven_nexus", "provider_api"]);
  assert.equal(manifest.authority.staking, "disabled");
  assert.match(manifest.authority.submission, /^held_/);

  assert.equal(slice.target.base44_required, false);
  assert.equal(slice.target.public_fabric_required, false);
  assert.equal(slice.observed.resident_scout_registered, true);
  assert.equal(slice.observed.provider_submission_receipt_verified, false);
  assert.equal(slice.safety_and_authority.numerai_staking_default, false);
});
