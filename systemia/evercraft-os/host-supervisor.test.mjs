import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EvercraftPassport } from "../passport/passport.mjs";
import {
  EvercraftOsInstallLedger,
  appResourceRef,
  buildAppInstallRequest,
  buildAppUninstallRequest
} from "./install-ledger.mjs";
import { EvercraftOsCapabilityCapsules } from "./runtime-capsule.mjs";
import { EvercraftOsHostSupervisor } from "./host-supervisor.mjs";

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "evercraft-os-host-"));
}

function setupInstalled(root, nodeId) {
  const passport = new EvercraftPassport({ stateDir: path.join(root, "passport") });
  const ledger = new EvercraftOsInstallLedger({
    stateDir: path.join(root, "install-ledger"),
    passport
  });
  const subject = "subject:host-proof";
  const resource = appResourceRef("aliev", nodeId);
  const now = new Date();
  const ends = new Date(now.getTime() + 60 * 60 * 1000);

  const grant = passport.issueGrant({
    idempotency_key: "host-os-grant",
    subject_ref: subject,
    issuer_ref: "proof:identity",
    product: "evercraft-os",
    scopes: ["app.install", "app.uninstall"],
    resource_refs: [resource],
    starts_at: now.toISOString(),
    ends_at: ends.toISOString(),
    max_delegation_depth: 0,
    authority_state: "system_policy_authorized",
    authority_receipt_ref: "proof:host-authority"
  }).grant;

  const install = buildAppInstallRequest({
    productKey: "aliev",
    subjectRef: subject,
    nodeId
  });
  const permit = passport.mintActionPermit({
    idempotency_key: "host-install-permit",
    grant_id: grant.grant_id,
    actor_ref: subject,
    scope: "app.install",
    resource_ref: resource,
    request_fingerprint: install.request_fingerprint,
    ttl_seconds: 300
  }).permit;

  ledger.install({
    request: install,
    permitId: permit.permit_id,
    actorRef: subject
  });

  return { passport, ledger, subject, resource, grant };
}

test("persistent host boots Evercraft Home and reconciles installed capability capsules", async (t) => {
  const root = tempRoot();
  const nodeId = "node-host-proof";
  const ctx = setupInstalled(root, nodeId);
  const capsules = new EvercraftOsCapabilityCapsules({
    rootDir: path.join(root, "capsules"),
    installLedger: ctx.ledger
  });

  const host = new EvercraftOsHostSupervisor({
    stateDir: path.join(root, "host"),
    nodeId,
    deviceClass: "laptop",
    installLedger: ctx.ledger,
    capsules,
    homePort: 0,
    reconcileEveryMs: 60_000
  });

  t.after(async () => {
    await host.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const started = await host.start();
  assert.equal(started.state, "running");
  assert.equal(started.home.running, true);
  assert.equal(started.home.loopback_only, true);
  assert.equal(started.boundaries.root_privileges_required, false);
  assert.equal(started.boundaries.kernel_replacement_required, false);
  assert.equal(started.boundaries.app_launch_performed_by_supervisor, false);
  assert.equal(started.reconcile.installed_apps, 1);
  assert.equal(started.reconcile.materialized_capsules, 1);
  assert.equal(started.reconcile.failures, 0);

  const capsule = capsules.inspect("aliev", nodeId);
  assert.equal(capsule.materialized, true);
  assert.equal(capsule.integrity, "verified");

  const osResponse = await fetch(started.home.url + "/api/os/status");
  assert.equal(osResponse.status, 200);
  const osStatus = await osResponse.json();
  assert.equal(osStatus.ok, true);
  assert.equal(osStatus.boot.source_preflight, "pass");
  assert.equal(osStatus.boot.execution_authority_granted, false);

  const appsResponse = await fetch(started.home.url + "/apps.html");
  assert.equal(appsResponse.status, 200);
  const html = await appsResponse.text();
  assert.match(html, /Apps inherit the spine\./);

  const statusFile = path.join(root, "host", "host-status.json");
  assert.equal(fs.existsSync(statusFile), true);
  const persisted = JSON.parse(fs.readFileSync(statusFile, "utf8"));
  assert.equal(persisted.schema, "evercraft.os.host-status.v1");
  assert.match(persisted.receipt_hash, /^sha256:[a-f0-9]{64}$/);
});

test("host reconciliation removes capsule only after authorized uninstall ledger transition", async (t) => {
  const root = tempRoot();
  const nodeId = "node-host-uninstall";
  const ctx = setupInstalled(root, nodeId);
  const capsules = new EvercraftOsCapabilityCapsules({
    rootDir: path.join(root, "capsules"),
    installLedger: ctx.ledger
  });

  const host = new EvercraftOsHostSupervisor({
    stateDir: path.join(root, "host"),
    nodeId,
    deviceClass: "desktop",
    installLedger: ctx.ledger,
    capsules,
    homePort: 0,
    reconcileEveryMs: 60_000
  });

  t.after(async () => {
    await host.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  await host.start();
  assert.equal(capsules.inspect("aliev", nodeId).materialized, true);

  const installed = ctx.ledger.currentState("aliev", nodeId);
  const uninstall = buildAppUninstallRequest({
    productKey: "aliev",
    subjectRef: ctx.subject,
    nodeId,
    installedPackageFingerprint: installed.package_fingerprint
  });
  const permit = ctx.passport.mintActionPermit({
    idempotency_key: "host-uninstall-permit",
    grant_id: ctx.grant.grant_id,
    actor_ref: ctx.subject,
    scope: "app.uninstall",
    resource_ref: ctx.resource,
    request_fingerprint: uninstall.request_fingerprint,
    ttl_seconds: 300
  }).permit;

  ctx.ledger.uninstall({
    request: uninstall,
    permitId: permit.permit_id,
    actorRef: ctx.subject
  });

  const reconciled = host.reconcile();
  assert.equal(reconciled.installed_apps, 0);
  assert.equal(reconciled.materialized_capsules, 0);
  assert.equal(reconciled.failures, 0);
  assert.equal(capsules.inspect("aliev", nodeId).materialized, false);
  assert.equal(ctx.ledger.currentState("aliev", nodeId).installed, false);
});

test("user host installer stays user-mode and creates no public listener contract", () => {
  const file = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "install-user-host.sh"
  );
  const script = fs.readFileSync(file, "utf8");

  assert.equal(/\bsudo\b/.test(script), false);
  assert.match(script, /systemctl --user/);
  assert.match(script, /NoNewPrivileges=true/);
  assert.match(script, /PrivateTmp=true/);
  assert.match(script, /127\.0\.0\.1/);
  assert.doesNotMatch(script, /0\.0\.0\.0/);
  assert.match(script, /evercraft-os-host\.service/);
});


test("host startup fails closed when Evercraft Home cannot start", async () => {
  const root = tempRoot();
  const nodeId = "node-host-start-failure";
  const ctx = setupInstalled(root, nodeId);
  const capsules = new EvercraftOsCapabilityCapsules({
    rootDir: path.join(root, "capsules"),
    installLedger: ctx.ledger
  });

  const host = new EvercraftOsHostSupervisor({
    stateDir: path.join(root, "host"),
    nodeId,
    deviceClass: "laptop",
    installLedger: ctx.ledger,
    capsules,
    homeStarter: async () => {
      throw new Error("proof_home_start_failure");
    },
    homePort: 0,
    reconcileEveryMs: 60_000
  });

  try {
    await assert.rejects(
      () => host.start(),
      /proof_home_start_failure/
    );

    const status = host.status();
    assert.equal(status.state, "stopped");
    assert.equal(status.home.running, false);
    assert.equal(status.started_at, null);
    assert.equal(status.boundaries.app_launch_performed_by_supervisor, false);
  } finally {
    await host.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
