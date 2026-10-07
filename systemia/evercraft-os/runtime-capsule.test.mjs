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

function root(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), name));
}

function setupInstalled(productKey = "aliev", nodeId = "node-001") {
  const base = root("evercraft-capsule-");
  const passport = new EvercraftPassport({ stateDir: path.join(base, "passport") });
  const ledger = new EvercraftOsInstallLedger({
    stateDir: path.join(base, "ledger"),
    passport
  });
  const subject = "subject:capsule-proof";
  const resource = appResourceRef(productKey, nodeId);
  const now = new Date();
  const ends = new Date(now.getTime() + 60 * 60 * 1000);
  const grant = passport.issueGrant({
    idempotency_key: "capsule-os-grant",
    subject_ref: subject,
    issuer_ref: "proof:identity",
    product: "evercraft-os",
    scopes: ["app.install", "app.uninstall"],
    resource_refs: [resource],
    starts_at: now.toISOString(),
    ends_at: ends.toISOString(),
    max_delegation_depth: 0,
    authority_state: "system_policy_authorized",
    authority_receipt_ref: "proof:capsule-authority"
  }).grant;

  const request = buildAppInstallRequest({ productKey, subjectRef: subject, nodeId });
  const permit = passport.mintActionPermit({
    idempotency_key: "capsule-install-permit",
    grant_id: grant.grant_id,
    actor_ref: subject,
    scope: "app.install",
    resource_ref: resource,
    request_fingerprint: request.request_fingerprint,
    ttl_seconds: 300
  }).permit;
  ledger.install({ request, permitId: permit.permit_id, actorRef: subject });

  return { base, passport, ledger, subject, grant, resource, productKey, nodeId };
}

test("installed app materializes as a mediated capability capsule, not arbitrary code", () => {
  const ctx = setupInstalled();
  const capsules = new EvercraftOsCapabilityCapsules({
    rootDir: path.join(ctx.base, "capsules"),
    installLedger: ctx.ledger
  });

  const result = capsules.materialize(ctx.productKey, ctx.nodeId);
  assert.equal(result.state, "materialized");
  assert.equal(result.executable_materialized, false);
  assert.equal(result.process_started, false);
  assert.equal(result.service_enabled, false);

  const manifest = JSON.parse(
    fs.readFileSync(path.join(result.capsule.path, "manifest.json"), "utf8")
  );
  assert.equal(manifest.runtime_model, "mediated_capability");
  assert.equal(manifest.launch.authority, "systemia");
  assert.equal(manifest.launch.direct_shell_allowed, false);
  assert.equal(manifest.launch.arbitrary_process_spawn_allowed, false);
  assert.equal(manifest.network.direct_socket_access_allowed, false);
  assert.equal(manifest.credentials.raw_provider_credentials_available, false);
  assert.equal(manifest.commerce.authority, "evercraft_payments");
  assert.equal(manifest.commerce.direct_settlement_provider_access_allowed, false);
  assert.equal(manifest.commerce.payment_authority_granted, false);
  assert.deepEqual(manifest.device_capabilities.requested, []);
  assert.deepEqual(manifest.device_capabilities.granted, []);
  assert.equal(manifest.filesystem.arbitrary_host_filesystem_access_allowed, false);
  assert.equal(manifest.runtime_state.runtime_health_claimed, false);

  const inspected = capsules.inspect(ctx.productKey, ctx.nodeId);
  assert.equal(inspected.integrity, "verified");
  assert.equal(inspected.runtime_state.process_started, false);

  const duplicate = capsules.materialize(ctx.productKey, ctx.nodeId);
  assert.equal(duplicate.state, "already_materialized");
  assert.equal(duplicate.mutation_performed, false);
});

test("capsule tampering fails closed", () => {
  const ctx = setupInstalled("aliev", "node-002");
  const capsules = new EvercraftOsCapabilityCapsules({
    rootDir: path.join(ctx.base, "capsules"),
    installLedger: ctx.ledger
  });

  const result = capsules.materialize(ctx.productKey, ctx.nodeId);
  const file = path.join(result.capsule.path, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  manifest.launch.direct_shell_allowed = true;
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");

  assert.throws(
    () => capsules.inspect(ctx.productKey, ctx.nodeId),
    /capsule_integrity_mismatch/
  );
});

test("authorized uninstall allows capsule reconciliation removal while preserving non-claims", () => {
  const ctx = setupInstalled("aliev", "node-003");
  const capsules = new EvercraftOsCapabilityCapsules({
    rootDir: path.join(ctx.base, "capsules"),
    installLedger: ctx.ledger
  });
  const materialized = capsules.materialize(ctx.productKey, ctx.nodeId);
  assert.equal(fs.existsSync(materialized.capsule.path), true);

  const state = ctx.ledger.currentState(ctx.productKey, ctx.nodeId);
  const request = buildAppUninstallRequest({
    productKey: ctx.productKey,
    subjectRef: ctx.subject,
    nodeId: ctx.nodeId,
    installedPackageFingerprint: state.package_fingerprint
  });
  const permit = ctx.passport.mintActionPermit({
    idempotency_key: "capsule-uninstall-permit",
    grant_id: ctx.grant.grant_id,
    actor_ref: ctx.subject,
    scope: "app.uninstall",
    resource_ref: ctx.resource,
    request_fingerprint: request.request_fingerprint,
    ttl_seconds: 300
  }).permit;
  ctx.ledger.uninstall({
    request,
    permitId: permit.permit_id,
    actorRef: ctx.subject
  });

  const reconciled = capsules.reconcile(ctx.productKey, ctx.nodeId);
  assert.equal(reconciled.state, "removed_after_authorized_uninstall");
  assert.equal(reconciled.materialized, false);
  assert.equal(reconciled.binary_removal_claimed, false);
  assert.equal(reconciled.runtime_stop_claimed, false);
  assert.equal(fs.existsSync(materialized.capsule.path), false);
});
