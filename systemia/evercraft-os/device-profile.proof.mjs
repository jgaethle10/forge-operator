import assert from "node:assert/strict";
import { buildDeviceProfile, collectLocalFacts, normalizeDeviceClass } from "./device-profile.mjs";

const localFacts = collectLocalFacts();

assert.equal("hostname" in localFacts, false);
assert.equal(typeof localFacts.hostname_present, "boolean");
assert.ok(localFacts.cpu_count >= 0);
assert.ok(localFacts.memory_bytes >= 0);

assert.equal(normalizeDeviceClass("LAPTOP"), "laptop");
assert.equal(normalizeDeviceClass("watch"), "unknown");

const laptop = buildDeviceProfile({
  deviceClassHint: "laptop",
  nodeId: "node-proof-laptop",
  facts: {
    evidence_state: "fixture",
    platform: "linux",
    arch: "x64",
    cpu_count: 8,
    memory_bytes: 16 * 1024 * 1024 * 1024,
    hostname_present: true
  }
});

assert.equal(laptop.device_class, "laptop");
assert.equal(laptop.node_identity.authority, "nodeseed");
assert.equal(laptop.node_identity.established, true);
assert.equal(laptop.candidate_roles.interactive_human_surface, true);
assert.equal(laptop.candidate_roles.compute_capacity, true);
assert.equal(laptop.authority.execution_granted, false);
assert.equal(laptop.authority.compute_lease_granted, false);
assert.equal(laptop.authority.passport_scope_granted, false);
assert.equal(laptop.authority.payment_authority_granted, false);

const phone = buildDeviceProfile({
  deviceClassHint: "phone",
  facts: {
    evidence_state: "fixture",
    platform: "android-like",
    arch: "arm64",
    cpu_count: 8,
    memory_bytes: 8 * 1024 * 1024 * 1024,
    hostname_present: false
  }
});

assert.equal(phone.device_class, "phone");
assert.equal(phone.candidate_roles.interactive_human_surface, true);
assert.equal(phone.candidate_roles.continuous_residency, false);
assert.equal(phone.capability_claims.camera, "not_established");
assert.equal(phone.capability_claims.microphone, "not_established");
assert.equal(phone.capability_claims.location, "not_established");
assert.equal(phone.capability_claims.secure_element, "not_established");

const server = buildDeviceProfile({
  deviceClassHint: "server",
  facts: {
    evidence_state: "fixture",
    platform: "linux",
    arch: "x64",
    cpu_count: 32,
    memory_bytes: 64 * 1024 * 1024 * 1024,
    hostname_present: true
  }
});

assert.equal(server.device_class, "server");
assert.equal(server.candidate_roles.interactive_human_surface, false);
assert.equal(server.candidate_roles.compute_capacity, true);
assert.equal(server.candidate_roles.continuous_residency, true);
assert.equal(server.authority.execution_granted, false);

process.stdout.write(
  JSON.stringify(
    {
      proof: "evercraft.os.device-profile.v1",
      status: "PASS",
      classes_proved: ["laptop", "phone", "server", "unknown"],
      local_fact_collection_sanitized: true,
      fabricated_sensor_claims: false,
      authority_granted: false
    },
    null,
    2
  ) + "\n"
);
