import assert from "node:assert/strict";
import { planEvercraftOsAppInstall } from "./app-install-plan.mjs";

const plan = planEvercraftOsAppInstall({
  productKey: "aliev",
  subjectRef: "subject:proof",
  targetDeviceClass: "laptop",
  nodeId: "node-proof"
});

assert.equal(plan.schema, "evercraft.os.app-install-plan.v1");
assert.equal(plan.state, "plan_ready");
assert.equal(plan.product_key, "aliev");
assert.equal(plan.requested_authorization.passport_product, "rivet");
assert.ok(plan.requested_authorization.scopes.includes("report.generate"));
assert.equal(plan.requested_authorization.grant_issued, false);
assert.equal(plan.context_binding.namespace, "aliev");
assert.equal(plan.context_binding.access_granted, false);
assert.equal(plan.execution_binding.gate_required, true);
assert.equal(plan.execution_binding.authority_granted, false);
assert.equal(plan.commerce_binding.service, "evercraft_payments");
assert.equal(plan.commerce_binding.payment_authority_granted, false);
assert.deepEqual(plan.device_capability_binding.requested, []);
assert.deepEqual(plan.device_capability_binding.granted, []);
assert.equal(plan.capacity_binding.compute_lease_granted, false);
assert.equal(plan.install_performed, false);
assert.equal(plan.grants_issued, false);
assert.equal(plan.runtime_started, false);

const held = planEvercraftOsAppInstall({
  productKey: "evernest-atlas",
  subjectRef: "subject:proof",
  targetDeviceClass: "phone"
});

assert.equal(held.state, "held");
assert.equal(held.install_performed, false);
assert.equal(held.grants_issued, false);
assert.equal(held.execution_authority_granted, false);
assert.ok(held.hold_reasons.includes("adoption_stage_not_shared_runtime:discovery_only"));

process.stdout.write(JSON.stringify({
  proof: "evercraft.os.app-install-plan.v1",
  status: "PASS",
  ready_product: plan.product_key,
  held_product: held.product_key,
  install_performed: false,
  grants_issued: false,
  payment_authority_granted: false,
  implicit_device_permissions: false
}, null, 2) + "\n");
