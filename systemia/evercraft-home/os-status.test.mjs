import test from "node:test";
import assert from "node:assert/strict";
import { startEvercraftHomeServer } from "./server.mjs";
import { readEvercraftOsApps, readEvercraftOsStatus } from "./os-adapter.mjs";

test("OS adapter preserves authority and evidence boundaries", () => {
  const status = readEvercraftOsStatus({
    deviceClassHint: "laptop",
    nodeId: "node-test-home"
  });

  assert.equal(status.schema, "evercraft.home.os-status.v1");
  assert.equal(status.boot.source_preflight, "pass");
  assert.equal(status.boot.runtime_health_claimed, false);
  assert.equal(status.boot.execution_authority_granted, false);
  assert.equal(status.device.device_class, "laptop");
  assert.equal(status.device.node_identity.established, true);
  assert.equal(status.device.authority.compute_lease_granted, false);
  assert.equal(status.authority.execution_granted_by_status_surface, false);
});

test("Evercraft Home exposes the OS status surface through local-loopback auth", async (t) => {
  const runtime = await startEvercraftHomeServer({
    host: "127.0.0.1",
    port: 0,
    authMode: "local",
    operator: "OS Proof"
  });
  t.after(async () => runtime.close());

  const response = await fetch(runtime.url + "/api/os/status");
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.subject, "local:operator");
  assert.equal(body.schema, "evercraft.home.os-status.v1");
  assert.equal(body.boot.source_preflight, "pass");
  assert.equal(body.boot.runtime_health_claimed, false);
  assert.equal(body.boot.execution_authority_granted, false);
  assert.equal(body.authority.execution_granted_by_status_surface, false);
});


test("OS app adapter exposes contract readiness without installation or authority", () => {
  const catalog = readEvercraftOsApps();

  assert.equal(catalog.schema, "evercraft.home.os-app-catalog.v1");
  assert.equal(catalog.installation_performed, false);
  assert.equal(catalog.authority_granted, false);
  assert.ok(catalog.product_count >= 4);
  assert.equal(catalog.contract_ready_count, 4);

  const aliev = readEvercraftOsApps({ productKey: "aliev" });
  assert.equal(aliev.schema, "evercraft.home.os-app.v1");
  assert.equal(aliev.app.product_key, "aliev");
  assert.equal(aliev.app.package_state, "contract_ready");
  assert.equal(aliev.app.authority.execution_granted, false);
  assert.equal(aliev.installation_performed, false);
  assert.equal(aliev.authority_granted, false);
});

test("Evercraft Home exposes authenticated OS app catalog and app detail surfaces", async (t) => {
  const runtime = await startEvercraftHomeServer({
    host: "127.0.0.1",
    port: 0,
    authMode: "local",
    operator: "OS Apps Proof"
  });
  t.after(async () => runtime.close());

  const catalogResponse = await fetch(runtime.url + "/api/os/apps");
  assert.equal(catalogResponse.status, 200);
  const catalog = await catalogResponse.json();
  assert.equal(catalog.ok, true);
  assert.equal(catalog.schema, "evercraft.home.os-app-catalog.v1");
  assert.equal(catalog.installation_performed, false);
  assert.equal(catalog.authority_granted, false);
  assert.equal(catalog.contract_ready_count, 4);

  const appResponse = await fetch(runtime.url + "/api/os/apps?product=aliev");
  assert.equal(appResponse.status, 200);
  const app = await appResponse.json();
  assert.equal(app.ok, true);
  assert.equal(app.schema, "evercraft.home.os-app.v1");
  assert.equal(app.app.product_key, "aliev");
  assert.equal(app.app.package_state, "contract_ready");
  assert.equal(app.app.authority.passport_scopes_granted, false);

  const missingResponse = await fetch(runtime.url + "/api/os/apps?product=does-not-exist");
  assert.equal(missingResponse.status, 404);
  const missing = await missingResponse.json();
  assert.equal(missing.ok, false);
  assert.equal(missing.installation_performed, false);
  assert.equal(missing.authority_granted, false);
});


test("Evercraft Home plans OS app installation without performing installation or issuing grants", async (t) => {
  const runtime = await startEvercraftHomeServer({
    host: "127.0.0.1",
    port: 0,
    authMode: "local",
    operator: "OS Install Plan Proof"
  });
  t.after(async () => runtime.close());

  const response = await fetch(runtime.url + "/api/os/apps/install-plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      product_key: "aliev",
      target_device_class: "laptop",
      node_id: "node-home-proof"
    })
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.schema, "evercraft.os.app-install-plan.v1");
  assert.equal(body.state, "plan_ready");
  assert.equal(body.product_key, "aliev");
  assert.equal(body.subject_ref, "local:operator");
  assert.equal(body.requested_authorization.passport_product, "rivet");
  assert.equal(body.requested_authorization.grant_issued, false);
  assert.equal(body.context_binding.access_granted, false);
  assert.equal(body.execution_binding.authority_granted, false);
  assert.equal(body.commerce_binding.payment_authority_granted, false);
  assert.equal(body.capacity_binding.compute_lease_granted, false);
  assert.equal(body.install_performed, false);
  assert.equal(body.grants_issued, false);
  assert.equal(body.runtime_started, false);

  const heldResponse = await fetch(runtime.url + "/api/os/apps/install-plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      product_key: "evernest-atlas",
      target_device_class: "phone"
    })
  });
  assert.equal(heldResponse.status, 409);
  const held = await heldResponse.json();
  assert.equal(held.ok, false);
  assert.equal(held.state, "held");
  assert.equal(held.install_performed, false);
  assert.equal(held.grants_issued, false);
});
