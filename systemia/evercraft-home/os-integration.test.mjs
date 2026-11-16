import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readEvercraftOsIntegration } from "./os-integration-adapter.mjs";
import { startEvercraftHomeServer } from "./server.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("one OS integration readback keeps source, field and outcome evidence separate", () => {
  const result = readEvercraftOsIntegration({ repoRoot, now: new Date("2026-11-15T23:00:00.000Z") });
  assert.equal(result.schema, "evercraft.home.os-integration.v1");
  assert.equal(result.product, "Evercraft OS");
  assert.equal(result.overall_state, "held_pending_end_to_end_field_proof");
  assert.ok(result.contracts.app_catalog_total >= result.contracts.app_catalog_contract_ready);
  assert.deepEqual(result.stages.map(s => s.key), [
    "foundation", "apps", "admission", "execution", "commerce", "delivery", "publishing", "recovery",
  ]);
  for (const key of ["admission", "execution", "commerce", "delivery"]) {
    assert.equal(result.stages.find(s => s.key === key).state, "unknown");
  }
  assert.equal(result.customer_outcomes_verified, null);
  assert.equal(result.production_runtime_verified, false);
  assert.equal(result.real_settlement_verified_by_this_read, false);
  assert.equal(result.external_delivery_verified_by_this_read, false);
  assert.equal(result.execution_performed, false);
  assert.equal(result.payment_performed, false);
  assert.equal(result.authority_granted, false);
  assert.equal(result.private_tokens_returned, false);
});

test("Home serves the unified truth API and first-party operator surface", async t => {
  const runtime = await startEvercraftHomeServer({
    host: "127.0.0.1", port: 0, authMode: "local", operator: "OS Integration Proof",
  });
  t.after(async () => runtime.close());
  const res = await fetch(runtime.url + "/api/os/integration");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.subject, "local:operator");
  assert.equal(body.overall_state, "held_pending_end_to_end_field_proof");
  assert.equal(body.stages.find(s => s.key === "commerce").state, "unknown");
  assert.equal(body.real_settlement_verified_by_this_read, false);
  const page = await fetch(runtime.url + "/os.html");
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /One OS\. Actual evidence\./);
  assert.match(html, /\/api\/os\/integration/);
  assert.match(html, /No execution, purchase, or publication occurs from this page/);
});
