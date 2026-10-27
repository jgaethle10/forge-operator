import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sealEvercraftOsUserSessionBootReceipt } from "./boot-receipt.mjs";
import { observeEvercraftOsUserSupervisorHealth } from "./user-supervisor-health.mjs";

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "evercraft-os-health-"));
}

function writeBoot(root, overrides = {}) {
  const body = {
    schema: "evercraft.os.user-session-boot-receipt.v1",
    boot_id: "os_boot_health_proof",
    state: "ready",
    booted_at: "2026-10-08T18:00:00.000Z",
    node_id: "node-health-proof",
    device_class: "laptop",
    device_profile_evidence: "operator_declared",
    source_release_ref: null,
    source_preflight: "pass",
    missing_required_components: [],
    capsule_reconciliation: { hold_count: 0 },
    home: {
      service: "evercraft-home",
      instance_id: "home-proof",
      auth_mode: "local",
      listen_scope: "loopback",
      url: "http://127.0.0.1:4310",
      health_observed: true
    },
    authority: {
      mission: "systemia",
      authorization: "passport",
      device_identity: "nodeseed",
      execution_granted_by_supervisor: false,
      install_granted_by_supervisor: false,
      payment_authority_granted_by_supervisor: false
    },
    privilege_boundary: {
      root_required: false,
      kernel_replacement_required: false,
      public_ingress_created: false,
      arbitrary_process_launch_added: false
    },
    truth_boundary: {
      home_health_is_full_os_health: false,
      source_presence_is_runtime_health: false,
      capsule_materialized_is_capability_executed: false,
      boot_receipt_is_execution_authority: false
    },
    ...overrides
  };
  const receipt = sealEvercraftOsUserSessionBootReceipt(body);
  const file = path.join(root, "boot", "latest.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
  return { file, receipt };
}

test("health watcher reports healthy only from verified boot receipt and healthy loopback Home", async () => {
  const root = tempRoot();
  writeBoot(root);
  const receipt = await observeEvercraftOsUserSupervisorHealth({
    root,
    fetchImpl: async () => new Response(JSON.stringify({
      ok: true,
      listen_scope: "loopback",
      instance_id: "home-proof"
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }),
    now: () => "2026-10-08T18:01:00.000Z"
  });
  assert.equal(receipt.state, "healthy");
  assert.equal(receipt.boot_receipt_verified, true);
  assert.equal(receipt.home_reachable, true);
  assert.equal(receipt.restart_recommended, false);
  assert.equal(receipt.authority_granted, false);
  fs.rmSync(root, { recursive: true, force: true });
});

test("health watcher recommends restart only when verified boot target is unreachable", async () => {
  const root = tempRoot();
  writeBoot(root);
  const receipt = await observeEvercraftOsUserSupervisorHealth({
    root,
    fetchImpl: async () => { throw new Error("connection_refused"); }
  });
  assert.equal(receipt.state, "home_unreachable");
  assert.equal(receipt.boot_receipt_verified, true);
  assert.equal(receipt.home_reachable, false);
  assert.equal(receipt.restart_recommended, true);
  fs.rmSync(root, { recursive: true, force: true });
});

test("invalid boot receipt holds without restart loop", async () => {
  const root = tempRoot();
  const { file } = writeBoot(root);
  const receipt = JSON.parse(fs.readFileSync(file, "utf8"));
  receipt.home.url = "http://evil.example.test";
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2) + "\n");

  const health = await observeEvercraftOsUserSupervisorHealth({
    root,
    fetchImpl: async () => { throw new Error("must_not_probe"); }
  });
  assert.equal(health.state, "held");
  assert.equal(health.boot_receipt_verified, false);
  assert.equal(health.home_probe_performed, false);
  assert.equal(health.restart_recommended, false);
  fs.rmSync(root, { recursive: true, force: true });
});

test("verified non-loopback boot target holds without probing or restart", async () => {
  const root = tempRoot();
  writeBoot(root, {
    home: {
      service: "evercraft-home",
      instance_id: "home-proof",
      auth_mode: "passport",
      listen_scope: "non_loopback",
      url: "https://example.test",
      health_observed: true
    }
  });
  let probed = false;
  const health = await observeEvercraftOsUserSupervisorHealth({
    root,
    fetchImpl: async () => { probed = true; throw new Error("must_not_probe"); }
  });
  assert.equal(health.state, "held");
  assert.equal(health.reason, "boot_receipt_home_url_not_loopback");
  assert.equal(health.boot_receipt_verified, true);
  assert.equal(health.restart_recommended, false);
  assert.equal(probed, false);
  fs.rmSync(root, { recursive: true, force: true });
});
