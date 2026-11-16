import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { startEvercraftHomeServer } from "./server.mjs";

test("Raven Nexus Overview and OS expose the same fail-closed Vehicle Sentinel module", async t => {
  const runtime = await startEvercraftHomeServer({
    host: "127.0.0.1", port: 0, authMode: "local", operator: "Vehicle Sentinel Acceptance"
  });
  t.after(async () => runtime.close());

  const overviewRes = await fetch(runtime.url + "/api/raven/overview");
  assert.equal(overviewRes.status, 200);
  const overview = await overviewRes.json();
  assert.equal(overview.ok, true);
  assert.equal(overview.vehicle_safety.parent_product, "raven-nexus");

  const moduleRes = await fetch(runtime.url + "/api/raven/vehicle-safety");
  assert.equal(moduleRes.status, 200);
  const module = await moduleRes.json();
  assert.equal(module.stage, "source_beta");
  assert.equal(module.os_entrypoint, "/safety/vehicle");
  assert.equal(module.authority.device_bluetooth_permission_granted, false);
  assert.equal(module.commercial.direct_checkout_enabled, false);
  assert.equal(module.privacy.observation_upload_automatic, false);
  assert.equal(module.privacy.report_storage,"ephemeral_tab_memory");

  const journalRes = await fetch(runtime.url + "/safety/vehicle");
  assert.equal(journalRes.status, 200);
  assert.match(journalRes.headers.get("cache-control"), /no-store/);
  const html = await journalRes.text();
  assert.match(html, /Vehicle Sentinel/);
  assert.match(html, /does not scan Bluetooth, detect AirTags, or locate GPS trackers/i);
  assert.equal(/<script\s+src=/.test(html), false);
  assert.doesNotMatch(html,/localStorage|sessionStorage|indexedDB/i);
  assert.match(html,/Resume from a previous JSON report/i);
  const csp=journalRes.headers.get("content-security-policy");
  const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  const sha=createHash("sha256").update(script,"utf8").digest("base64");
  assert.ok(csp.includes("script-src 'sha256-"+sha+"'"));
  assert.match(csp,/connect-src 'none'/);
  assert.match(csp,/form-action 'none'/);
  assert.match(csp,/frame-ancestors 'none'/);
  assert.doesNotMatch(csp,/unsafe-eval/);
  assert.match(journalRes.headers.get("permissions-policy"),/bluetooth=\(\)/);
  assert.match(journalRes.headers.get("permissions-policy"),/geolocation=\(\)/);


  const home = await (await fetch(runtime.url + "/")).text();
  assert.match(home, /href="\/safety\/vehicle"/);
  const apps = await (await fetch(runtime.url + "/apps.html")).text();
  assert.match(apps, /Raven Vehicle Safety \(pilot\)/);
});

test("Raven vehicle module is read-only; it does not accept sensor submissions", async t => {
  const runtime = await startEvercraftHomeServer({
    host: "127.0.0.1", port: 0, authMode: "local", operator: "Vehicle Sentinel Read Only"
  });
  t.after(async () => runtime.close());
  const response = await fetch(runtime.url + "/api/raven/vehicle-safety", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ coordinates: [1, 2], bluetooth_scan: ["private"] })
  });
  assert.equal(response.status, 405);
});
