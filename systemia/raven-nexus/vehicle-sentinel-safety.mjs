import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDefault = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const sourcePaths = Object.freeze({
  inspection_journal: "products/vehicle-sentinel/quickcheck.html",
  ios_scanner_source: "products/vehicle-sentinel/ios/JeepSentinel/BluetoothScanner.swift",
  ios_project: "products/vehicle-sentinel/ios/JeepSentinel.xcodeproj/project.pbxproj",
  privacy_documentation: "products/vehicle-sentinel/PRIVACY.md",
  release_gates: "products/vehicle-sentinel/BETA-RELEASE-CHECKLIST.md",
});

export function readVehicleSentinelSafetyModule(root = rootDefault) {
  const sources = Object.fromEntries(Object.entries(sourcePaths).map(([key, rel]) =>
    [key, fs.existsSync(path.join(root, rel))]));
  const sourceComplete = Object.values(sources).every(Boolean);

  return {
    schema: "evercraft.raven-nexus.vehicle-safety.v1",
    module_key: "vehicle-sentinel",
    parent_product: "raven-nexus",
    os_surface: "evercraft-home",
    os_entrypoint: "/safety/vehicle",
    stage: sourceComplete ? "source_beta" : "held_missing_source",
    source_presence: sources,
    capabilities: {
      guided_vehicle_inspection: sources.inspection_journal,
      local_user_controlled_evidence_export: sources.inspection_journal,
      ios_foreground_ble_observation_source: sources.ios_scanner_source,
      native_scanner_installed_or_running: false,
      apple_unwanted_tracking_alerts_integrated: false,
      unattended_background_monitoring: false,
      gps_or_hardwired_tracker_detection: false,
      confirmed_tracker_identification: false,
      emergency_response: false,
    },
    privacy: {
      report_storage: "ephemeral_tab_memory",
      observation_upload_automatic: false,
      automatic_location_collection: false,
      authorized_export_required: true,
      durable_record_requires_explicit_export: true,
      export_files_not_encrypted_by_app: true,
      inference_or_identity_attribution: false,
    },
    authority: {
      identity_granted: false,
      passport_scope_granted: false,
      device_bluetooth_permission_granted: false,
      server_sensor_access: false,
      execution_authority_granted: false,
      payment_authority_granted: false,
    },
    commercial: {
      state: "release_hold",
      direct_checkout_enabled: false,
      paid_sensor_claims_allowed: false,
      professional_inspection_service: "proposed_not_verified",
      release_requires: [
        "physical_iphone_ble_tests",
        "privacy_and_threat_model_review",
        "accessibility_and_safety_review",
        "customer_support_and_refund_policy",
        "verified_checkout_and_fulfillment",
      ],
    },
    safety_message: "This is an inspection journal and experimental Bluetooth observation aid. It does not establish whether another person is tracking you. Use the iPhone's built-in unwanted-tracker alerts for compatible tags; consider a qualified vehicle inspection for wired, cellular, or hidden GPS devices.",
    runtime_verification: "not_claimed_from_source_presence",
  };
}

// Pure advisory interpretation for a local client. Not an accusation or a detector.
export function assessVehicleSafetyObservation({
  appleAlert = false,
  unfamiliarHardwareObserved = false,
  bleDifferenceObserved = false,
  cleanBleScan = false,
} = {}) {
  const next = [];
  if (appleAlert === true) next.push("Follow Apple's unwanted-tracker alert instructions and preserve the alert details.");
  if (unfamiliarHardwareObserved === true) next.push("If safe, photograph the device and labels without disturbing unknown wiring; consult a trusted mechanic or local authorities.");
  if (bleDifferenceObserved === true) next.push("Review ordinary vehicle electronics, keys, and accessories; radio signal differences do not identify a tracker.");
  if (!appleAlert && !unfamiliarHardwareObserved && !bleDifferenceObserved) next.push("No affirmative finding recorded. A clean or missing Bluetooth observation cannot exclude a tracker.");
  return {
    schema: "evercraft.raven-nexus.vehicle-safety-advisory.v1",
    determination: "inconclusive",
    tracker_identified: false,
    other_person_identified: false,
    safe_to_rule_out_tracking: false,
    evidence_level: (appleAlert || unfamiliarHardwareObserved) ? "review_physical_or_os_alert" : "unverified_or_absent",
    next_steps: next,
    local_only_recommended: true,
    clean_ble_scan: cleanBleScan === true,
  };
}
