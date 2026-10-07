import assert from "node:assert/strict";
import { buildBootEnvelope, loadManifest } from "./runtime.mjs";

const manifest = loadManifest();
const envelope = buildBootEnvelope({
  deviceClass: "proof_linux_device",
  mode: "source_preflight"
});

const requiredIds = [
  "nodeseed",
  "evercraft_compute",
  "yard",
  "evercraft_network",
  "evercraft_identity",
  "passport",
  "context_fabric",
  "systemia",
  "saban",
  "evercraft_payments",
  "evercraft_home"
];

for (const id of requiredIds) {
  assert.ok(
    manifest.components.some((component) => component.id === id && component.required === true),
    `required OS component missing from manifest: ${id}`
  );
}

assert.equal(manifest.privileged_kernel_replacement_required, false);
assert.equal(manifest.mission_authority, "systemia");
assert.equal(manifest.authorization_authority, "passport");
assert.equal(manifest.identity_authority, "evercraft_identity");
assert.equal(manifest.commerce_authority, "evercraft_payments");

assert.equal(envelope.source_preflight, "pass", JSON.stringify(envelope.missing_required_components));
assert.deepEqual(envelope.missing_required_components, []);
assert.equal(envelope.execution_authority_granted, false);
assert.equal(envelope.runtime_health_claimed, false);
assert.equal(envelope.external_provider_dependency_claimed, false);

assert.equal(envelope.invariants.execution_authority_from_source_presence, false);
assert.equal(envelope.invariants.missing_evidence_is_healthy, false);
assert.equal(envelope.invariants.external_provider_is_root_authority, false);
assert.equal(envelope.invariants.ungranted_compute_may_be_used, false);
assert.equal(envelope.invariants.memory_is_execution_authority, false);
assert.equal(envelope.invariants.settlement_provider_is_commerce_authority, false);

process.stdout.write(
  JSON.stringify(
    {
      proof: "evercraft.os.phase0.composition.v1",
      status: "PASS",
      required_components: requiredIds.length,
      source_preflight: envelope.source_preflight,
      execution_authority_granted: envelope.execution_authority_granted,
      runtime_health_claimed: envelope.runtime_health_claimed,
      kernel_replacement_required: manifest.privileged_kernel_replacement_required
    },
    null,
    2
  ) + "\n"
);
