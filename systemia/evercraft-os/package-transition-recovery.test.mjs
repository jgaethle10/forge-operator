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
import { inspectPackageTransitionRecovery } from "./package-transition-recovery-inspector.mjs";
import {
  buildPackageTransitionRecoveryPlan,
  EvercraftOsPackageTransitionRecoveryExecutor,
} from "./package-transition-recovery.mjs";

function temp() { return fs.mkdtempSync(path.join(os.tmpdir(), "evercraft-os-recovery-exec-")); }

function verification(nextHash) {
  const pair = generateKeyPairSync("ed25519");
  const pub = pair.publicKey.export({ type: "spki", format: "pem" });
  const priv = pair.privateKey.export({ type: "pkcs8", format: "pem" });
  const trust = buildPublisherTrustStore({ keys: [{
    key_id: "recover-exec-key", publisher_ref: "publisher:evercraft", public_key_pem: pub, allowed_products: ["aliev"],
  }]});
  const now = new Date();
  const body = buildPackageAttestationBody({
    productKey: "aliev", packageFingerprint: nextHash, contractVersion: "2.0.0", releaseRef: "release:2",
    publisherRef: "publisher:evercraft", keyId: "recover-exec-key",
    issuedAt: new Date(now.getTime() - 60_000), expiresAt: new Date(now.getTime() + 86_400_000),
  });
  return verifyPackageAttestation({
    attestation: signPackageAttestation({ body, privateKeyPem: priv }), trustStore: trust,
    expectedProductKey: "aliev", expectedPackageFingerprint: nextHash, now,
  });
}

function grantAndPermit(passport, { actor, product = "evercraft-os", resource, scope, requestFingerprint, id }) {
  const now = new Date();
  const grant = passport.issueGrant({
    idempotency_key: `recovery-grant:${id}`, subject_ref: actor, issuer_ref: "proof:identity",
    product, scopes: [scope], resource_refs: [resource],
    starts_at: new Date(now.getTime() - 30_000).toISOString(), ends_at: new Date(now.getTime() + 3_600_000).toISOString(),
    max_delegation_depth: 0, authority_state: "system_policy_authorized", authority_receipt_ref: `proof:authority:${id}`,
  }).grant;
  return passport.mintActionPermit({
    idempotency_key: `recovery-permit:${id}`, grant_id: grant.grant_id, actor_ref: actor,
    scope, resource_ref: resource, request_fingerprint: requestFingerprint, ttl_seconds: 300,
  }).permit;
}

function buildUpdatedRig(root, node = "node-recovery-exec") {
  const actor = "subject:owner";
  const v1 = evercraftOsSha256("recovery-exec-v1");
  const v2 = evercraftOsSha256("recovery-exec-v2");
  const passport = new EvercraftPassport({ stateDir: path.join(root, "passport") });
  const stateDir = path.join(root, "transitions");
  const ledger = new EvercraftOsPackageTransitionLedger({
    stateDir, passport,
    installedStateProvider: { currentState() { return { installed: true, package_fingerprint: v1 }; } },
  });
  const update = buildPackageUpdatePlan({
    productKey: "aliev", nodeId: node, subjectRef: actor,
    currentPackageFingerprint: v1, nextVerification: verification(v2),
  });
  const updatePermit = grantAndPermit(passport, {
    actor, resource: update.resource_ref, scope: "app.update", requestFingerprint: update.request_fingerprint, id: node + ":update",
  });
  ledger.applyUpdate({ plan: update, permitId: updatePermit.permit_id, actorRef: actor });
  return { actor, node, v1, v2, passport, stateDir, ledger };
}

function staleWriterLock({ stateDir, node, acquiredAt, schema = "evercraft.os.package-transition-writer-lock.v2" }) {
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const lock = {
    schema,
    lock_token: "stale-lock-token",
    operation: "update",
    product_key: "aliev",
    node_id: node,
    resource_ref: `os-app:aliev:node:${node}`,
    pid: 424242,
    acquired_at: acquiredAt,
  };
  if (schema.endsWith("v2")) {
    lock.process_instance = {
      schema: "evercraft.os.process-instance.v1",
      platform: "linux",
      pid: 424242,
      boot_id: "boot-proof",
      proc_start_ticks: "123456",
    };
  }
  fs.writeFileSync(path.join(stateDir, "package-transition-writer.lock"), JSON.stringify(lock, null, 2) + "\n", { mode: 0o600 });
  return lock;
}

const absentObserver = (expected) => ({
  schema: "evercraft.os.process-instance-observation.v1",
  state: "process_absent",
  same_process_instance: false,
  pid: expected.pid,
  boot_id: expected.boot_id,
  mutation_performed: false,
});

const aliveObserver = (expected) => ({
  schema: "evercraft.os.process-instance-observation.v1",
  state: "same_process_alive",
  same_process_instance: true,
  pid: expected.pid,
  boot_id: expected.boot_id,
  expected_proc_start_ticks: expected.proc_start_ticks,
  observed_proc_start_ticks: expected.proc_start_ticks,
  mutation_performed: false,
});

test("explicit app.recover.head permit repairs one-event checkpoint lag and records recovery completion", () => {
  const root = temp();
  try {
    const rig = buildUpdatedRig(root, "node-head-repair");
    fs.unlinkSync(path.join(rig.stateDir, "package-transition-head.json"));
    const plan = buildPackageTransitionRecoveryPlan({
      stateDir: rig.stateDir, passport: rig.passport, actorRef: rig.actor, operation: "repair_head_checkpoint",
    });
    assert.equal(plan.required_passport_scope, "app.recover.head");
    const permit = grantAndPermit(rig.passport, {
      actor: rig.actor, resource: plan.resource_ref, scope: "app.recover.head", requestFingerprint: plan.request_fingerprint, id: "head-repair",
    });
    const executor = new EvercraftOsPackageTransitionRecoveryExecutor({ stateDir: rig.stateDir, passport: rig.passport });
    const result = executor.execute({ plan, permitId: permit.permit_id, actorRef: rig.actor });
    assert.equal(result.state, "recovery_completed");
    assert.equal(result.mutation_state, "performed");
    assert.equal(result.recovery_authority_granted, true);
    assert.equal(rig.passport.getActionPermitState(permit.permit_id).consumed, true);
    const inspection = inspectPackageTransitionRecovery({ stateDir: rig.stateDir, passport: rig.passport });
    assert.equal(inspection.state, "clean");
    assert.equal(inspection.checkpoint_state, "aligned");
    const recoveryEvents = fs.readFileSync(path.join(rig.stateDir, "package-transition-recovery-events.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    assert.deepEqual(recoveryEvents.map((event) => event.phase), ["intent", "completed"]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("wrong recovery scope cannot repair head and leaves permit unconsumed", () => {
  const root = temp();
  try {
    const rig = buildUpdatedRig(root, "node-head-wrong-scope");
    fs.unlinkSync(path.join(rig.stateDir, "package-transition-head.json"));
    const plan = buildPackageTransitionRecoveryPlan({ stateDir: rig.stateDir, passport: rig.passport, actorRef: rig.actor });
    const permit = grantAndPermit(rig.passport, {
      actor: rig.actor, resource: plan.resource_ref, scope: "app.recover.writer", requestFingerprint: plan.request_fingerprint, id: "head-wrong-scope",
    });
    const executor = new EvercraftOsPackageTransitionRecoveryExecutor({ stateDir: rig.stateDir, passport: rig.passport });
    assert.throws(() => executor.execute({ plan, permitId: permit.permit_id, actorRef: rig.actor }), /permit_scope_mismatch/);
    assert.equal(rig.passport.getActionPermitState(permit.permit_id).active, true);
    assert.equal(fs.existsSync(path.join(rig.stateDir, "package-transition-head.json")), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("tampered recovery plan fails before permit consumption", () => {
  const root = temp();
  try {
    const rig = buildUpdatedRig(root, "node-head-tamper");
    fs.unlinkSync(path.join(rig.stateDir, "package-transition-head.json"));
    const plan = buildPackageTransitionRecoveryPlan({ stateDir: rig.stateDir, passport: rig.passport, actorRef: rig.actor });
    const permit = grantAndPermit(rig.passport, {
      actor: rig.actor, resource: plan.resource_ref, scope: plan.required_passport_scope, requestFingerprint: plan.request_fingerprint, id: "head-tamper",
    });
    const tampered = { ...plan, evidence_receipt_hash: evercraftOsSha256("evil") };
    const executor = new EvercraftOsPackageTransitionRecoveryExecutor({ stateDir: rig.stateDir, passport: rig.passport });
    assert.throws(() => executor.execute({ plan: tampered, permitId: permit.permit_id, actorRef: rig.actor }), /plan_integrity_mismatch/);
    assert.equal(rig.passport.getActionPermitState(permit.permit_id).active, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("writer-lock recovery requires process-instance evidence and confirmed absence", () => {
  const root = temp();
  try {
    const actor = "subject:owner", node = "node-writer-recover";
    const passport = new EvercraftPassport({ stateDir: path.join(root, "passport") });
    const stateDir = path.join(root, "transitions");
    staleWriterLock({ stateDir, node, acquiredAt: new Date(Date.now() - 120_000).toISOString() });
    assert.throws(() => buildPackageTransitionRecoveryPlan({
      stateDir, passport, actorRef: actor, operation: "clear_writer_lock", processObserver: aliveObserver,
    }), /writer_still_alive/);
    const plan = buildPackageTransitionRecoveryPlan({
      stateDir, passport, actorRef: actor, operation: "clear_writer_lock", processObserver: absentObserver,
    });
    assert.equal(plan.required_passport_scope, "app.recover.writer");
    const permit = grantAndPermit(passport, {
      actor, resource: plan.resource_ref, scope: "app.recover.writer", requestFingerprint: plan.request_fingerprint, id: "writer-clear",
    });
    const executor = new EvercraftOsPackageTransitionRecoveryExecutor({
      stateDir, passport, processObserver: absentObserver,
    });
    const result = executor.execute({ plan, permitId: permit.permit_id, actorRef: actor });
    assert.equal(result.state, "recovery_completed");
    assert.equal(result.mutation_state, "performed");
    assert.equal(fs.existsSync(path.join(stateDir, "package-transition-writer.lock")), false);
    assert.equal(passport.getActionPermitState(permit.permit_id).consumed, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("legacy v1 writer lock is deliberately non-recoverable", () => {
  const root = temp();
  try {
    const actor = "subject:owner", node = "node-legacy-lock";
    const passport = new EvercraftPassport({ stateDir: path.join(root, "passport") });
    const stateDir = path.join(root, "transitions");
    staleWriterLock({
      stateDir, node, acquiredAt: new Date(Date.now() - 120_000).toISOString(), schema: "evercraft.os.package-transition-writer-lock.v1",
    });
    assert.throws(() => buildPackageTransitionRecoveryPlan({
      stateDir, passport, actorRef: actor, operation: "clear_writer_lock", processObserver: absentObserver,
    }), /process_identity_required/);
    assert.equal(fs.existsSync(path.join(stateDir, "package-transition-writer.lock")), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("recovery plan refuses a fresh writer lock even when observer reports process absent", () => {
  const root = temp();
  try {
    const actor = "subject:owner", node = "node-fresh-lock";
    const passport = new EvercraftPassport({ stateDir: path.join(root, "passport") });
    const stateDir = path.join(root, "transitions");
    staleWriterLock({ stateDir, node, acquiredAt: new Date(Date.now() - 1_000).toISOString() });
    assert.throws(() => buildPackageTransitionRecoveryPlan({
      stateDir, passport, actorRef: actor, operation: "clear_writer_lock", processObserver: absentObserver, minimumWriterAgeMs: 30_000,
    }), /writer_lock_too_fresh/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("crash after recovery permit consumption resumes same authorized head repair without new permit", () => {
  const root = temp();
  try {
    const rig = buildUpdatedRig(root, "node-head-resume");
    fs.unlinkSync(path.join(rig.stateDir, "package-transition-head.json"));
    const plan = buildPackageTransitionRecoveryPlan({ stateDir: rig.stateDir, passport: rig.passport, actorRef: rig.actor });
    const permit = grantAndPermit(rig.passport, {
      actor: rig.actor, resource: plan.resource_ref, scope: plan.required_passport_scope, requestFingerprint: plan.request_fingerprint, id: "head-resume",
    });
    const failing = new EvercraftOsPackageTransitionRecoveryExecutor({
      stateDir: rig.stateDir, passport: rig.passport,
      faultInjector({ phase }) { if (phase === "after_permit_consumption") throw new Error("simulated_power_loss"); },
    });
    assert.throws(() => failing.execute({ plan, permitId: permit.permit_id, actorRef: rig.actor }), /simulated_power_loss/);
    assert.equal(rig.passport.getActionPermitState(permit.permit_id).consumed, true);
    assert.equal(fs.existsSync(path.join(rig.stateDir, "package-transition-head.json")), false);

    const resumed = new EvercraftOsPackageTransitionRecoveryExecutor({ stateDir: rig.stateDir, passport: rig.passport });
    const result = resumed.execute({ plan, permitId: permit.permit_id, actorRef: rig.actor });
    assert.equal(result.state, "recovery_completed");
    assert.equal(result.mutation_state, "performed");
    assert.equal(inspectPackageTransitionRecovery({ stateDir: rig.stateDir, passport: rig.passport }).state, "clean");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("crash after mutation resumes as observed-already-applied and closes receipt chain", () => {
  const root = temp();
  try {
    const rig = buildUpdatedRig(root, "node-head-after-mutation");
    fs.unlinkSync(path.join(rig.stateDir, "package-transition-head.json"));
    const plan = buildPackageTransitionRecoveryPlan({ stateDir: rig.stateDir, passport: rig.passport, actorRef: rig.actor });
    const permit = grantAndPermit(rig.passport, {
      actor: rig.actor, resource: plan.resource_ref, scope: plan.required_passport_scope, requestFingerprint: plan.request_fingerprint, id: "head-after-mutation",
    });
    const failing = new EvercraftOsPackageTransitionRecoveryExecutor({
      stateDir: rig.stateDir, passport: rig.passport,
      faultInjector({ phase }) { if (phase === "after_mutation") throw new Error("simulated_power_loss_after_mutation"); },
    });
    assert.throws(() => failing.execute({ plan, permitId: permit.permit_id, actorRef: rig.actor }), /simulated_power_loss_after_mutation/);
    assert.equal(inspectPackageTransitionRecovery({ stateDir: rig.stateDir, passport: rig.passport }).state, "clean");

    const resumed = new EvercraftOsPackageTransitionRecoveryExecutor({ stateDir: rig.stateDir, passport: rig.passport });
    const result = resumed.execute({ plan, permitId: permit.permit_id, actorRef: rig.actor });
    assert.equal(result.state, "recovery_completed");
    assert.equal(result.mutation_state, "observed_already_applied");
    assert.equal(result.mutation_performed, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("recovery writer lock serializes recovery before permit consumption", () => {
  const root = temp();
  try {
    const rig = buildUpdatedRig(root, "node-recovery-serialize");
    fs.unlinkSync(path.join(rig.stateDir, "package-transition-head.json"));
    const plan = buildPackageTransitionRecoveryPlan({ stateDir: rig.stateDir, passport: rig.passport, actorRef: rig.actor });
    const permit = grantAndPermit(rig.passport, {
      actor: rig.actor, resource: plan.resource_ref, scope: plan.required_passport_scope, requestFingerprint: plan.request_fingerprint, id: "recovery-serialize",
    });
    fs.writeFileSync(path.join(rig.stateDir, "package-transition-recovery-writer.lock"), JSON.stringify({
      schema: "evercraft.os.package-transition-recovery-writer-lock.v1", lock_token: "other-recovery", pid: 9,
      acquired_at: new Date().toISOString(),
    }) + "\n", { mode: 0o600 });
    const executor = new EvercraftOsPackageTransitionRecoveryExecutor({ stateDir: rig.stateDir, passport: rig.passport });
    assert.throws(() => executor.execute({ plan, permitId: permit.permit_id, actorRef: rig.actor }), /recovery_writer_busy/);
    assert.equal(rig.passport.getActionPermitState(permit.permit_id).active, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
