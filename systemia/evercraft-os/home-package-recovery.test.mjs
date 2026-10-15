import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { EvercraftPassport } from "../passport/passport.mjs";
import {
  buildPackageAttestationBody,
  buildPackageUpdatePlan,
  buildPublisherTrustStore,
  evercraftOsSha256,
  signPackageAttestation,
  verifyPackageAttestation,
} from "./package-trust.mjs";
import { EvercraftOsPackageTransitionLedger } from "./package-transition-ledger.mjs";
import { EvercraftHomePackageRecovery } from "./home-package-recovery.mjs";
import { EvercraftHomePackageOrchestrator } from "./home-package-orchestrator.mjs";

function temp() { return fs.mkdtempSync(path.join(os.tmpdir(), "evercraft-home-recovery-")); }

function verification(nextHash) {
  const pair = generateKeyPairSync("ed25519");
  const pub = pair.publicKey.export({ type: "spki", format: "pem" });
  const priv = pair.privateKey.export({ type: "pkcs8", format: "pem" });
  const now = new Date();
  const trust = buildPublisherTrustStore({ keys: [{
    key_id: "home-recovery-key", publisher_ref: "publisher:evercraft", public_key_pem: pub, allowed_products: ["aliev"],
  }]});
  const body = buildPackageAttestationBody({
    productKey: "aliev", packageFingerprint: nextHash, contractVersion: "2.0.0", releaseRef: "release:2",
    publisherRef: "publisher:evercraft", keyId: "home-recovery-key",
    issuedAt: new Date(now.getTime() - 60_000), expiresAt: new Date(now.getTime() + 86_400_000),
  });
  return verifyPackageAttestation({
    attestation: signPackageAttestation({ body, privateKeyPem: priv }), trustStore: trust,
    expectedProductKey: "aliev", expectedPackageFingerprint: nextHash, now,
  });
}

function grantAndPermit(passport, { actor, resource, scope, requestFingerprint, id }) {
  const now = new Date();
  const grant = passport.issueGrant({
    idempotency_key: `home-recovery-grant:${id}`,
    subject_ref: actor,
    issuer_ref: "proof:identity",
    product: "evercraft-os",
    scopes: [scope],
    resource_refs: [resource],
    starts_at: new Date(now.getTime() - 30_000).toISOString(),
    ends_at: new Date(now.getTime() + 3_600_000).toISOString(),
    max_delegation_depth: 0,
    authority_state: "system_policy_authorized",
    authority_receipt_ref: `proof:authority:${id}`,
  }).grant;
  return passport.mintActionPermit({
    idempotency_key: `home-recovery-permit:${id}`,
    grant_id: grant.grant_id,
    actor_ref: actor,
    scope,
    resource_ref: resource,
    request_fingerprint: requestFingerprint,
    ttl_seconds: 300,
  }).permit;
}

function updatedRig(root, node = "node-home-recovery") {
  const actor = "subject:owner";
  const v1 = evercraftOsSha256("home-recovery-v1");
  const v2 = evercraftOsSha256("home-recovery-v2");
  const passport = new EvercraftPassport({ stateDir: path.join(root, "passport") });
  const stateDir = path.join(root, "transitions");
  const ledger = new EvercraftOsPackageTransitionLedger({
    stateDir,
    passport,
    installedStateProvider: { currentState() { return { installed: true, package_fingerprint: v1 }; } },
  });
  const update = buildPackageUpdatePlan({
    productKey: "aliev", nodeId: node, subjectRef: actor,
    currentPackageFingerprint: v1, nextVerification: verification(v2),
  });
  const permit = grantAndPermit(passport, {
    actor, resource: update.resource_ref, scope: "app.update", requestFingerprint: update.request_fingerprint, id: `${node}:update`,
  });
  ledger.applyUpdate({ plan: update, permitId: permit.permit_id, actorRef: actor });
  return { actor, node, passport, stateDir, ledger };
}

test("Home inspects recovery evidence without granting or minting recovery authority", () => {
  const root = temp();
  try {
    const rig = updatedRig(root, "node-home-inspect");
    fs.unlinkSync(path.join(rig.stateDir, "package-transition-head.json"));
    const home = new EvercraftHomePackageRecovery({ stateDir: rig.stateDir, passport: rig.passport });
    const state = home.inspect();
    assert.equal(state.state, "head_checkpoint_lag_candidate");
    assert.equal(state.inspection.recovery_candidate, true);
    assert.equal(state.authority.home_grants_recovery, false);
    assert.equal(state.authority.home_mints_recovery_permit, false);
    assert.equal(state.authority.passport_permit_required_for_mutation, true);
    assert.equal(state.mutation_performed, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Home prepares exact recovery Passport request but mints no permit", () => {
  const root = temp();
  try {
    const rig = updatedRig(root, "node-home-prepare");
    fs.unlinkSync(path.join(rig.stateDir, "package-transition-head.json"));
    const home = new EvercraftHomePackageRecovery({ stateDir: rig.stateDir, passport: rig.passport });
    const prepared = home.prepare({ actorRef: rig.actor });
    assert.equal(prepared.state, "prepared");
    assert.equal(prepared.operation, "repair_head_checkpoint");
    assert.equal(prepared.passport.product, "evercraft-os");
    assert.equal(prepared.passport.scope, "app.recover.head");
    assert.equal(prepared.passport.request_fingerprint, prepared.plan.request_fingerprint);
    assert.equal(prepared.permit_minted, false);
    assert.equal(prepared.recovery_authority_granted, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Home executes recovery only with caller-supplied exact single-use Passport permit", () => {
  const root = temp();
  try {
    const rig = updatedRig(root, "node-home-execute");
    fs.unlinkSync(path.join(rig.stateDir, "package-transition-head.json"));
    const home = new EvercraftHomePackageRecovery({ stateDir: rig.stateDir, passport: rig.passport });
    const prepared = home.prepare({ actorRef: rig.actor });
    const permit = grantAndPermit(rig.passport, {
      actor: rig.actor,
      resource: prepared.passport.resource_ref,
      scope: prepared.passport.scope,
      requestFingerprint: prepared.passport.request_fingerprint,
      id: "home-execute-recovery",
    });
    const result = home.execute({ plan: prepared.plan, permitId: permit.permit_id, actorRef: rig.actor });
    assert.equal(result.state, "recovery_completed");
    assert.equal(result.permit_consumed, true);
    assert.equal(result.mutation_performed, true);
    assert.equal(result.recovery_authority_granted, true);
    assert.equal(result.install_authority_granted, false);
    assert.equal(result.execution_authority_granted, false);
    assert.equal(result.payment_authority_granted, false);
    assert.equal(home.inspect().state, "clean");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Home holds writer recovery when process identity still resolves to same live writer", () => {
  const root = temp();
  try {
    const actor = "subject:owner", node = "node-home-live-writer";
    const passport = new EvercraftPassport({ stateDir: path.join(root, "passport") });
    const stateDir = path.join(root, "transitions");
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, "package-transition-writer.lock"), JSON.stringify({
      schema: "evercraft.os.package-transition-writer-lock.v2",
      lock_token: "live-writer",
      operation: "update",
      product_key: "aliev",
      node_id: node,
      resource_ref: `os-app:aliev:node:${node}`,
      pid: 42,
      process_instance: {
        schema: "evercraft.os.process-instance.v1", platform: "linux", pid: 42,
        boot_id: "boot-live", proc_start_ticks: "999",
      },
      acquired_at: new Date(Date.now() - 120_000).toISOString(),
    }, null, 2) + "\n", { mode: 0o600 });
    const home = new EvercraftHomePackageRecovery({
      stateDir,
      passport,
      processObserver(expected) {
        return {
          schema: "evercraft.os.process-instance-observation.v1",
          state: "same_process_alive",
          same_process_instance: true,
          pid: expected.pid,
          boot_id: expected.boot_id,
          observed_proc_start_ticks: expected.proc_start_ticks,
          mutation_performed: false,
        };
      },
    });
    const prepared = home.prepare({ actorRef: actor, operation: "clear_writer_lock" });
    assert.equal(prepared.state, "held");
    assert.match(prepared.reason, /writer_still_alive/);
    assert.equal(prepared.permit_minted, false);
    assert.equal(fs.existsSync(path.join(stateDir, "package-transition-writer.lock")), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("package runtime status can surface recovery state without changing package authority", () => {
  const recovery = {
    inspect() {
      return {
        schema: "evercraft.home.os-package-recovery-state.v1",
        state: "writer_lock_present",
        mutation_performed: false,
        recovery_authority_granted: false,
      };
    },
  };
  const orchestrator = new EvercraftHomePackageOrchestrator({
    lifecycle: {},
    packageStore: {
      inspectActivation() { return { schema: "evercraft.os.package-activation.v1", integrity: "verified", package_fingerprint: "sha256:" + "a".repeat(64) }; },
    },
    transitionLedger: {
      currentState() { return { installed: true, package_fingerprint: "sha256:" + "a".repeat(64) }; },
      verifyIntegrity() { return { state: "verified" }; },
      writerLockState() { return { state: "busy", active: true }; },
    },
    recoveryController: recovery,
  });
  const status = orchestrator.status({ productKey: "aliev", nodeId: "node-home-status" });
  // A writer lock is an unresolved authority-bearing operation, so status may
  // surface recovery evidence but must not advertise a settled alignment.
  assert.equal(status.state, "held_transition_writer");
  assert.equal(status.desired_active_aligned, false);
  assert.equal(status.transition_recovery.state, "writer_lock_present");
  assert.equal(status.transition_recovery.recovery_authority_granted, false);
  assert.equal(status.execution_authority_granted, false);
});
