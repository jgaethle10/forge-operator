import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readVehicleSentinelSafetyModule, assessVehicleSafetyObservation } from "./vehicle-sentinel-safety.mjs";

test("Raven Vehicle Sentinel is a held commercial beta despite source completeness", () => {
  const module = readVehicleSentinelSafetyModule();
  assert.equal(module.schema, "evercraft.raven-nexus.vehicle-safety.v1");
  assert.equal(module.parent_product, "raven-nexus");
  assert.equal(module.os_surface, "evercraft-home");
  assert.equal(module.stage, "source_beta");
  assert.equal(module.commercial.state, "release_hold");
  assert.equal(module.commercial.direct_checkout_enabled, false);
  assert.equal(module.capabilities.native_scanner_installed_or_running, false);
  assert.equal(module.capabilities.confirmed_tracker_identification, false);
  assert.equal(module.capabilities.gps_or_hardwired_tracker_detection, false);
  assert.equal(module.privacy.observation_upload_automatic, false);
  assert.equal(module.privacy.report_storage, "ephemeral_tab_memory");
  assert.equal(module.privacy.durable_record_requires_explicit_export, true);
  assert.equal(module.privacy.export_files_not_encrypted_by_app, true);
  assert.equal(module.privacy.automatic_location_collection, false);
  assert.equal(module.authority.device_bluetooth_permission_granted, false);
  assert.equal(module.authority.payment_authority_granted, false);
  assert.match(module.safety_message, /does not establish whether/i);
});

test("source disappearance fails closed rather than inventing availability", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vehicle-sentinel-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const module = readVehicleSentinelSafetyModule(root);
  assert.equal(module.stage, "held_missing_source");
  assert.equal(module.capabilities.guided_vehicle_inspection, false);
  assert.equal(module.commercial.direct_checkout_enabled, false);
});

test("advisory is always inconclusive even with BLE difference, Apple alert or clean scan", () => {
  const cases = [
    {},
    { cleanBleScan: true },
    { bleDifferenceObserved: true },
    { appleAlert: true },
    { unfamiliarHardwareObserved: true },
    { appleAlert: true, unfamiliarHardwareObserved: true, bleDifferenceObserved: true },
  ];
  for (const item of cases) {
    const result = assessVehicleSafetyObservation(item);
    assert.equal(result.determination, "inconclusive");
    assert.equal(result.tracker_identified, false);
    assert.equal(result.other_person_identified, false);
    assert.equal(result.safe_to_rule_out_tracking, false);
    assert.equal(result.local_only_recommended, true);
    assert.ok(result.next_steps.length > 0);
  }
});

test("Apple alert routes to Apple guidance, hardware findings to safe physical review", () => {
  assert.match(assessVehicleSafetyObservation({ appleAlert: true }).next_steps.join(" "), /Apple/);
  assert.match(assessVehicleSafetyObservation({ unfamiliarHardwareObserved: true }).next_steps.join(" "), /mechanic/);
  assert.match(assessVehicleSafetyObservation({ bleDifferenceObserved: true }).next_steps.join(" "), /do not identify a tracker/);
  assert.match(assessVehicleSafetyObservation({ cleanBleScan: true }).next_steps.join(" "), /cannot exclude a tracker/);
});
