import assert from "node:assert/strict";
import { buildEvercraftOsAppCatalog, compileEvercraftOsApp } from "./app-package.mjs";

const catalog = buildEvercraftOsAppCatalog();

assert.equal(catalog.schema, "evercraft.os.app-catalog.v1");
assert.ok(catalog.product_count >= 4);
assert.equal(catalog.authority_granted_by_catalog, false);
assert.equal(catalog.install_performed_by_catalog, false);

const readyKeys = catalog.apps
  .filter((app) => app.package_state === "contract_ready")
  .map((app) => app.product_key)
  .sort();

assert.deepEqual(
  readyKeys,
  ["aliev", "evercraft-clip", "findmypart", "forensiscope"].sort()
);

for (const app of catalog.apps) {
  assert.equal(app.authority.identity_granted, false);
  assert.equal(app.authority.passport_scopes_granted, false);
  assert.equal(app.authority.execution_granted, false);
  assert.equal(app.authority.compute_lease_granted, false);
  assert.equal(app.authority.payment_authority_granted, false);
  assert.equal(app.authority.device_capability_granted, false);
  assert.equal(app.device_capabilities.requested.length, 0);
}

const aliev = compileEvercraftOsApp("aliev");
assert.equal(aliev.package_state, "contract_ready");
assert.equal(aliev.installability, "eligible_for_os_install_flow");
assert.equal(aliev.os_services.identity.inherited, true);
assert.equal(aliev.os_services.authorization.passport_product, "rivet");
assert.ok(aliev.os_services.authorization.requested_scopes.includes("report.generate"));
assert.equal(aliev.os_services.authorization.scopes_granted_by_package, false);
assert.equal(aliev.os_services.context.namespace, "aliev");
assert.equal(aliev.os_services.execution.gate_required, true);
assert.equal(aliev.os_services.capacity.ungranted_compute_allowed, false);
assert.equal(aliev.os_services.payments.canonical_commerce_layer_available, true);
assert.equal(aliev.os_services.payments.payment_authority_granted_by_package, false);

const discoveryOnly = compileEvercraftOsApp("evernest-atlas");
assert.equal(discoveryOnly.package_state, "not_contract_ready");
assert.equal(discoveryOnly.installability, "held");
assert.ok(discoveryOnly.hold_reasons.includes("adoption_stage_not_shared_runtime:discovery_only"));

const missingContract = catalog.apps.find((app) => app.adoption_stage === "missing");
assert.ok(missingContract);
assert.equal(missingContract.package_state, "not_contract_ready");
assert.ok(missingContract.hold_reasons.includes("product_contract_missing"));

assert.throws(
  () => compileEvercraftOsApp("does-not-exist"),
  /public_product_not_found/
);

process.stdout.write(JSON.stringify({
  proof: "evercraft.os.app-package.v1",
  status: "PASS",
  public_products: catalog.product_count,
  contract_ready_apps: catalog.contract_ready_count,
  held_apps: catalog.held_count,
  contract_ready_keys: readyKeys,
  authority_granted: false,
  installation_performed: false,
  implicit_device_permissions: false
}, null, 2) + "\n");
