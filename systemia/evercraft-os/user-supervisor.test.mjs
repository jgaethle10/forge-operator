import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EvercraftPassport } from "../passport/passport.mjs";
import {
  EvercraftOsInstallLedger,
  appResourceRef,
  buildAppInstallRequest
} from "./install-ledger.mjs";
import { startEvercraftOsUserSupervisor } from "./user-supervisor.mjs";

function tempRoot(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), name));
}

function seedInstalledAliEv(root, nodeId, subject = "subject:boot-proof") {
  const passport = new EvercraftPassport({ stateDir: path.join(root, "passport") });
  const ledger = new EvercraftOsInstallLedger({
    stateDir: path.join(root, "install-ledger"),
    passport
  });
  const resource = appResourceRef("aliev", nodeId);
  const now = new Date();
  const ends = new Date(now.getTime() + 60 * 60 * 1000);
  const grant = passport.issueGrant({
    idempotency_key: "boot-proof-install-grant",
    subject_ref: subject,
    issuer_ref: "proof:identity",
    product: "evercraft-os",
    scopes: ["app.install"],
    resource_refs: [resource],
    starts_at: now.toISOString(),
    ends_at: ends.toISOString(),
    max_delegation_depth: 0,
    authority_state: "system_policy_authorized",
    authority_receipt_ref: "proof:boot-install-authority"
  }).grant;

  const request = buildAppInstallRequest({
    productKey: "aliev",
    subjectRef: subject,
    nodeId
  });
  const permit = passport.mintActionPermit({
    idempotency_key: "boot-proof-install-permit",
    grant_id: grant.grant_id,
    actor_ref: subject,
    scope: "app.install",
    resource_ref: resource,
    request_fingerprint: request.request_fingerprint,
    ttl_seconds: 300
  }).permit;
  ledger.install({
    request,
    permitId: permit.permit_id,
    actorRef: subject
  });
}

test("Evercraft OS user supervisor boots Home on loopback and emits a receipt", async (t) => {
  const root = tempRoot("evercraft-os-supervisor-empty-");
  const runtime = await startEvercraftOsUserSupervisor({
    root,
    nodeId: "node-supervisor-empty",
    deviceClass: "laptop",
    homePort: 0,
    homeAuthMode: "local",
    sourceReleaseRef: "",
    homeOptions: {
      host: "0.0.0.0"
    }
  });
  t.after(async () => {
    await runtime.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  assert.equal(runtime.state, "ready");
  assert.equal(runtime.receipt.source_preflight, "pass");
  assert.equal(runtime.receipt.capsule_reconciliation.hold_count, 0);
  assert.equal(runtime.receipt.home.listen_scope, "loopback");
  assert.equal(runtime.receipt.home.health_observed, true);
  assert.equal(runtime.receipt.authority.execution_granted_by_supervisor, false);
  assert.equal(runtime.receipt.privilege_boundary.root_required, false);
  assert.equal(runtime.receipt.privilege_boundary.public_ingress_created, false);
  assert.match(runtime.receipt.receipt_hash, /^sha256:[a-f0-9]{64}$/);

  const latest = JSON.parse(fs.readFileSync(path.join(root, "boot", "latest.json"), "utf8"));
  assert.equal(latest.receipt_hash, runtime.receipt.receipt_hash);

  const response = await fetch(runtime.home_url + "/api/health");
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.ok, true);
  assert.equal(health.listen_scope, "loopback");
  assert.equal(health.deployment_receipt_bound, true);

  const statusResponse = await fetch(runtime.home_url + "/api/os/status");
  assert.equal(statusResponse.status, 200);
  const status = await statusResponse.json();
  assert.equal(status.user_session_boot.integrity, "verified");
  assert.equal(status.user_session_boot.state, "ready");
  assert.equal(status.user_session_boot.node_id, "node-supervisor-empty");
  assert.equal(status.user_session_boot.receipt_hash, runtime.receipt.receipt_hash);
  assert.equal(status.user_session_boot.execution_authority_granted_by_supervisor, false);

  const latestFile = path.join(root, "boot", "latest.json");
  const tampered = JSON.parse(fs.readFileSync(latestFile, "utf8"));
  tampered.state = "ready-but-tampered";
  fs.writeFileSync(latestFile, JSON.stringify(tampered, null, 2) + "\n", { mode: 0o600 });

  const tamperedResponse = await fetch(runtime.home_url + "/api/os/status");
  assert.equal(tamperedResponse.status, 200);
  const tamperedStatus = await tamperedResponse.json();
  assert.equal(tamperedStatus.user_session_boot.integrity, "hold");
  assert.equal(tamperedStatus.user_session_boot.state, "held");
  assert.match(tamperedStatus.user_session_boot.reason, /boot_receipt_integrity_mismatch/);
});

test("supervisor reconciles an authorized installed app into a verified capsule", async (t) => {
  const root = tempRoot("evercraft-os-supervisor-app-");
  const nodeId = "node-supervisor-app";
  seedInstalledAliEv(root, nodeId);

  const runtime = await startEvercraftOsUserSupervisor({
    root,
    nodeId,
    deviceClass: "desktop",
    homePort: 0,
    homeAuthMode: "local"
  });
  t.after(async () => {
    await runtime.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  assert.equal(runtime.state, "ready");
  assert.equal(runtime.reconciliation.ledger_product_count, 1);
  assert.equal(runtime.reconciliation.reconciled_count, 1);
  assert.equal(runtime.reconciliation.hold_count, 0);
  const row = runtime.reconciliation.results[0];
  assert.equal(row.product_key, "aliev");
  assert.equal(row.ledger_installed, true);
  assert.equal(row.materialized, true);

  const capsule = runtime.capsules.inspect("aliev", nodeId);
  assert.equal(capsule.materialized, true);
  assert.equal(capsule.integrity, "verified");
  assert.equal(capsule.runtime_state.process_started, false);
});

test("tampered installed capsule holds boot readiness while Home remains available for repair", async (t) => {
  const root = tempRoot("evercraft-os-supervisor-tamper-");
  const nodeId = "node-supervisor-tamper";
  seedInstalledAliEv(root, nodeId);

  const first = await startEvercraftOsUserSupervisor({
    root,
    nodeId,
    homePort: 0,
    homeAuthMode: "local"
  });
  const capsule = first.capsules.inspect("aliev", nodeId);
  await first.close();

  const manifestFile = path.join(capsule.path, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  manifest.launch.direct_shell_allowed = true;
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });

  const second = await startEvercraftOsUserSupervisor({
    root,
    nodeId,
    homePort: 0,
    homeAuthMode: "local"
  });
  t.after(async () => {
    await second.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  assert.equal(second.state, "held");
  assert.equal(second.reconciliation.hold_count, 1);
  assert.match(second.reconciliation.holds[0].reason, /capsule_integrity_mismatch/);
  assert.equal(second.receipt.authority.execution_granted_by_supervisor, false);

  const response = await fetch(second.home_url + "/api/health");
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.ok, true);
});

test("supervisor rejects non-loopback Home binding", async () => {
  const root = tempRoot("evercraft-os-supervisor-bind-");
  await assert.rejects(
    () => startEvercraftOsUserSupervisor({
      root,
      nodeId: "node-supervisor-bind",
      homeHost: "0.0.0.0",
      homePort: 0,
      homeAuthMode: "local"
    }),
    /evercraft_os_supervisor_loopback_required/
  );
  fs.rmSync(root, { recursive: true, force: true });
});
