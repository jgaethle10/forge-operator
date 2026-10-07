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

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), name));
}

function issueOsGrant(passport, subject, resource) {
  const now = new Date();
  const ends = new Date(now.getTime() + 60 * 60 * 1000);
  return passport.issueGrant({
    idempotency_key: "grant:" + subject + ":" + resource,
    subject_ref: subject,
    issuer_ref: "proof:identity-authority",
    product: "evercraft-os",
    scopes: ["app.install", "app.uninstall"],
    resource_refs: [resource],
    starts_at: now.toISOString(),
    ends_at: ends.toISOString(),
    max_delegation_depth: 0,
    authority_state: "system_policy_authorized",
    authority_receipt_ref: "proof:os-install-authority"
  }).grant;
}

function mint(passport, grant, actor, scope, resource, fingerprint, suffix) {
  return passport.mintActionPermit({
    idempotency_key: "permit:" + suffix,
    grant_id: grant.grant_id,
    actor_ref: actor,
    scope,
    resource_ref: resource,
    request_fingerprint: fingerprint,
    ttl_seconds: 300
  }).permit;
}

test("OS app install and uninstall require separate single-use Passport permits", () => {
  const root = tempDir("evercraft-os-install-");
  const passport = new EvercraftPassport({ stateDir: path.join(root, "passport") });
  const ledger = new EvercraftOsInstallLedger({
    stateDir: path.join(root, "install-ledger"),
    passport
  });

  const subject = "subject:proof";
  const nodeId = "node-001";
  const resource = appResourceRef("aliev", nodeId);
  const grant = issueOsGrant(passport, subject, resource);

  const installRequest = buildAppInstallRequest({
    productKey: "aliev",
    subjectRef: subject,
    nodeId
  });
  const installPermit = mint(
    passport,
    grant,
    subject,
    "app.install",
    resource,
    installRequest.request_fingerprint,
    "install"
  );

  const installed = ledger.install({
    request: installRequest,
    permitId: installPermit.permit_id,
    actorRef: subject
  });

  assert.equal(installed.state, "installed_recorded");
  assert.equal(installed.installed, true);
  assert.equal(installed.permit_consumed, true);
  assert.equal(installed.runtime_started, false);
  assert.equal(installed.package_materialized, false);
  assert.match(installed.event.package_fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.match(installed.event.receipt_hash, /^sha256:[a-f0-9]{64}$/);

  const state = ledger.currentState("aliev", nodeId);
  assert.equal(state.installed, true);
  assert.equal(state.package_fingerprint, installRequest.package_fingerprint);
  assert.equal(state.runtime_started, false);
  assert.equal(state.package_materialized, false);

  const duplicate = ledger.install({
    request: installRequest,
    permitId: installPermit.permit_id,
    actorRef: subject
  });
  assert.equal(duplicate.state, "duplicate");
  assert.equal(duplicate.mutation_performed, false);

  const uninstallRequest = buildAppUninstallRequest({
    productKey: "aliev",
    subjectRef: subject,
    nodeId,
    installedPackageFingerprint: state.package_fingerprint
  });
  const uninstallPermit = mint(
    passport,
    grant,
    subject,
    "app.uninstall",
    resource,
    uninstallRequest.request_fingerprint,
    "uninstall"
  );

  const uninstalled = ledger.uninstall({
    request: uninstallRequest,
    permitId: uninstallPermit.permit_id,
    actorRef: subject
  });

  assert.equal(uninstalled.state, "uninstalled_recorded");
  assert.equal(uninstalled.installed, false);
  assert.equal(uninstalled.permit_consumed, true);
  assert.equal(uninstalled.runtime_stopped_claimed, false);
  assert.equal(uninstalled.package_removed_claimed, false);
  assert.equal(
    uninstalled.rollback_pointer.prior_package_fingerprint,
    installRequest.package_fingerprint
  );

  const finalState = ledger.currentState("aliev", nodeId);
  assert.equal(finalState.installed, false);
  assert.equal(finalState.history_length, 2);
});

test("app capability scopes cannot authorize OS installation", () => {
  const root = tempDir("evercraft-os-scope-");
  const passport = new EvercraftPassport({ stateDir: path.join(root, "passport") });
  const ledger = new EvercraftOsInstallLedger({
    stateDir: path.join(root, "install-ledger"),
    passport
  });

  const subject = "subject:proof";
  const nodeId = "node-002";
  const resource = appResourceRef("aliev", nodeId);
  const now = new Date();
  const ends = new Date(now.getTime() + 60 * 60 * 1000);

  const appGrant = passport.issueGrant({
    idempotency_key: "rivet-grant",
    subject_ref: subject,
    issuer_ref: "proof:identity-authority",
    product: "rivet",
    scopes: ["report.generate"],
    resource_refs: [resource],
    starts_at: now.toISOString(),
    ends_at: ends.toISOString(),
    max_delegation_depth: 0,
    authority_state: "system_policy_authorized",
    authority_receipt_ref: "proof:rivet-authority"
  }).grant;

  const request = buildAppInstallRequest({
    productKey: "aliev",
    subjectRef: subject,
    nodeId
  });

  assert.throws(
    () => passport.mintActionPermit({
      idempotency_key: "wrong-scope-permit",
      grant_id: appGrant.grant_id,
      actor_ref: subject,
      scope: "app.install",
      resource_ref: resource,
      request_fingerprint: request.request_fingerprint,
      ttl_seconds: 300
    }),
    /permit_scope_not_authorized/
  );

  assert.equal(ledger.currentState("aliev", nodeId).installed, false);
});

test("tampered package or request fingerprints fail closed", () => {
  const root = tempDir("evercraft-os-integrity-");
  const passport = new EvercraftPassport({ stateDir: path.join(root, "passport") });
  const ledger = new EvercraftOsInstallLedger({
    stateDir: path.join(root, "install-ledger"),
    passport
  });

  const subject = "subject:proof";
  const nodeId = "node-003";
  const resource = appResourceRef("aliev", nodeId);
  const grant = issueOsGrant(passport, subject, resource);
  const request = buildAppInstallRequest({
    productKey: "aliev",
    subjectRef: subject,
    nodeId
  });
  const permit = mint(
    passport,
    grant,
    subject,
    "app.install",
    resource,
    request.request_fingerprint,
    "integrity"
  );

  assert.throws(
    () => ledger.install({
      request: { ...request, package_fingerprint: "sha256:" + "0".repeat(64) },
      permitId: permit.permit_id,
      actorRef: subject
    }),
    /install_request_integrity_mismatch|install_package_integrity_mismatch/
  );

  assert.equal(ledger.currentState("aliev", nodeId).installed, false);
});
