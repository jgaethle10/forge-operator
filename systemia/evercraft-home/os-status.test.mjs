import test from "node:test";
import assert from "node:assert/strict";
import { startEvercraftHomeServer } from "./server.mjs";
import { readEvercraftOsStatus } from "./os-adapter.mjs";

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
