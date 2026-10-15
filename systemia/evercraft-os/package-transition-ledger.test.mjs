import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
import { generateKeyPairSync } from "node:crypto";

function temp() { return fs.mkdtempSync(path.join(os.tmpdir(), "evercraft-os-transition-")); }

function verification(nextHash) {
  const pair = generateKeyPairSync("ed25519");
  const pub = pair.publicKey.export({ type: "spki", format: "pem" });
  const priv = pair.privateKey.export({ type: "pkcs8", format: "pem" });
  const trust = buildPublisherTrustStore({ keys: [{
    key_id: "key-1",
    publisher_ref: "publisher:evercraft",
    public_key_pem: pub,
    allowed_products: ["aliev"],
  }]});
  const body = buildPackageAttestationBody({
    productKey: "aliev",
    packageFingerprint: nextHash,
    contractVersion: "2.0.0",
    releaseRef: "release:2",
    publisherRef: "publisher:evercraft",
    keyId: "key-1",
    issuedAt: new Date("2026-10-09T20:00:00Z"),
    expiresAt: new Date("2026-10-16T20:00:00Z"),
  });
  return verifyPackageAttestation({
    attestation: signPackageAttestation({ body, privateKeyPem: priv }),
    trustStore: trust,
    expectedProductKey: "aliev",
    expectedPackageFingerprint: nextHash,
    now: new Date("2026-10-10T00:00:00Z"),
  });
}

function issuePermit(passport, { actor, node, scope, requestFingerprint, id }) {
  const now = new Date();
  const ends = new Date(now.getTime() + 60 * 60 * 1000);
  const resource = `os-app:aliev:node:${node}`;
  const grant = passport.issueGrant({
    idempotency_key: `grant:${id}`,
    subject_ref: actor,
    issuer_ref: "proof:identity",
    product: "evercraft-os",
    scopes: [scope],
    resource_refs: [resource],
    starts_at: now.toISOString(),
    ends_at: ends.toISOString(),
    max_delegation_depth: 0,
    authority_state: "system_policy_authorized",
    authority_receipt_ref: `proof:authority:${id}`,
  }).grant;
  return passport.mintActionPermit({
    idempotency_key: `permit:${id}`,
    grant_id: grant.grant_id,
    actor_ref: actor,
    scope,
    resource_ref: resource,
    request_fingerprint: requestFingerprint,
    ttl_seconds: 300,
  }).permit;
}

test("update then rollback require separate single-use Passport permits and preserve lineage", () => {
  const root = temp();
  try {
    const actor = "subject:owner";
    const node = "node-transition-proof";
    const v1 = evercraftOsSha256("aliev-v1");
    const v2 = evercraftOsSha256("aliev-v2");
    const passport = new EvercraftPassport({ stateDir: path.join(root, "passport") });
    const installed = { currentState() { return { installed: true, package_fingerprint: v1 }; } };
    const ledger = new EvercraftOsPackageTransitionLedger({
      stateDir: path.join(root, "transitions"), passport, installedStateProvider: installed,
    });
    const verified = verification(v2);
    const update = buildPackageUpdatePlan({
      productKey: "aliev", nodeId: node, subjectRef: actor,
      currentPackageFingerprint: v1, nextVerification: verified,
    });
    const updatePermit = issuePermit(passport, {
      actor, node, scope: "app.update", requestFingerprint: update.request_fingerprint, id: "update",
    });
    const updated = ledger.applyUpdate({ plan: update, permitId: updatePermit.permit_id, actorRef: actor });
    assert.equal(updated.state, "update_recorded");
    assert.equal(updated.permit_consumed, true);
    assert.equal(updated.package_materialized_claimed, false);
    assert.equal(ledger.currentState("aliev", node).package_fingerprint, v2);

    const duplicate = ledger.applyUpdate({ plan: update, permitId: updatePermit.permit_id, actorRef: actor });
    assert.equal(duplicate.state, "duplicate");
    assert.equal(duplicate.mutation_performed, false);

    const rollback = ledger.planRollback({ productKey: "aliev", nodeId: node, subjectRef: actor });
    assert.equal(rollback.target_package_fingerprint, v1);
    const rollbackPermit = issuePermit(passport, {
      actor, node, scope: "app.rollback", requestFingerprint: rollback.request_fingerprint, id: "rollback",
    });
    const rolled = ledger.applyRollback({ plan: rollback, permitId: rollbackPermit.permit_id, actorRef: actor });
    assert.equal(rolled.state, "rollback_recorded");
    assert.equal(ledger.currentState("aliev", node).package_fingerprint, v1);
    assert.equal(ledger.eventsFor("aliev", node).length, 2);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("wrong-scope permit cannot authorize package update", () => {
  const root = temp();
  try {
    const actor = "subject:owner";
    const node = "node-wrong-scope";
    const v1 = evercraftOsSha256("v1");
    const v2 = evercraftOsSha256("v2");
    const passport = new EvercraftPassport({ stateDir: path.join(root, "passport") });
    const ledger = new EvercraftOsPackageTransitionLedger({
      stateDir: path.join(root, "transitions"), passport,
      installedStateProvider: { currentState() { return { installed: true, package_fingerprint: v1 }; } },
    });
    const update = buildPackageUpdatePlan({
      productKey: "aliev", nodeId: node, subjectRef: actor,
      currentPackageFingerprint: v1, nextVerification: verification(v2),
    });
    const permit = issuePermit(passport, {
      actor, node, scope: "app.rollback", requestFingerprint: update.request_fingerprint, id: "wrong",
    });
    assert.throws(() => ledger.applyUpdate({ plan: update, permitId: permit.permit_id, actorRef: actor }),
      /package_transition_permit_scope_mismatch/);
    assert.equal(passport.getActionPermitState(permit.permit_id).active, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("tampered update plan fails before permit consumption", () => {
  const root = temp();
  try {
    const actor = "subject:owner";
    const node = "node-tamper";
    const v1 = evercraftOsSha256("v1");
    const v2 = evercraftOsSha256("v2");
    const passport = new EvercraftPassport({ stateDir: path.join(root, "passport") });
    const ledger = new EvercraftOsPackageTransitionLedger({
      stateDir: path.join(root, "transitions"), passport,
      installedStateProvider: { currentState() { return { installed: true, package_fingerprint: v1 }; } },
    });
    const update = buildPackageUpdatePlan({
      productKey: "aliev", nodeId: node, subjectRef: actor,
      currentPackageFingerprint: v1, nextVerification: verification(v2),
    });
    const permit = issuePermit(passport, {
      actor, node, scope: "app.update", requestFingerprint: update.request_fingerprint, id: "tamper",
    });
    const tampered = { ...update, next_package_fingerprint: evercraftOsSha256("evil") };
    assert.throws(() => ledger.applyUpdate({ plan: tampered, permitId: permit.permit_id, actorRef: actor }),
      /package_update_plan_integrity_mismatch/);
    assert.equal(passport.getActionPermitState(permit.permit_id).active, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("transition ledger detects event tampering and refuses derived state", () => {
  const root = temp();
  try {
    const actor = "subject:owner", node = "node-integrity-tamper";
    const v1 = evercraftOsSha256("v1"), v2 = evercraftOsSha256("v2");
    const passport = new EvercraftPassport({ stateDir: path.join(root, "passport") });
    const ledger = new EvercraftOsPackageTransitionLedger({
      stateDir: path.join(root, "transitions"), passport,
      installedStateProvider: { currentState() { return { installed: true, package_fingerprint: v1 }; } },
    });
    const update = buildPackageUpdatePlan({
      productKey: "aliev", nodeId: node, subjectRef: actor,
      currentPackageFingerprint: v1, nextVerification: verification(v2),
    });
    const p = issuePermit(passport, { actor, node, scope: "app.update", requestFingerprint: update.request_fingerprint, id: "integrity" });
    ledger.applyUpdate({ plan: update, permitId: p.permit_id, actorRef: actor });
    assert.equal(ledger.verifyIntegrity().state, "verified");

    const file = path.join(root, "transitions", "package-transition-events.jsonl");
    const event = JSON.parse(fs.readFileSync(file, "utf8").trim());
    event.to_package_fingerprint = evercraftOsSha256("tampered");
    fs.writeFileSync(file, JSON.stringify(event) + "\n");
    assert.equal(ledger.verifyIntegrity().state, "held");
    assert.throws(() => ledger.currentState("aliev", node), /package_transition_event_hash_mismatch/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("transition ledger head detects truncation of append-only history", () => {
  const root = temp();
  try {
    const actor = "subject:owner", node = "node-integrity-truncate";
    const v1 = evercraftOsSha256("v1"), v2 = evercraftOsSha256("v2");
    const passport = new EvercraftPassport({ stateDir: path.join(root, "passport") });
    const ledger = new EvercraftOsPackageTransitionLedger({
      stateDir: path.join(root, "transitions"), passport,
      installedStateProvider: { currentState() { return { installed: true, package_fingerprint: v1 }; } },
    });
    const update = buildPackageUpdatePlan({
      productKey: "aliev", nodeId: node, subjectRef: actor,
      currentPackageFingerprint: v1, nextVerification: verification(v2),
    });
    const up = issuePermit(passport, { actor, node, scope: "app.update", requestFingerprint: update.request_fingerprint, id: "truncate-up" });
    ledger.applyUpdate({ plan: update, permitId: up.permit_id, actorRef: actor });
    const rollback = ledger.planRollback({ productKey: "aliev", nodeId: node, subjectRef: actor });
    const rp = issuePermit(passport, { actor, node, scope: "app.rollback", requestFingerprint: rollback.request_fingerprint, id: "truncate-rb" });
    ledger.applyRollback({ plan: rollback, permitId: rp.permit_id, actorRef: actor });
    assert.equal(ledger.verifyIntegrity().event_count, 2);

    const file = path.join(root, "transitions", "package-transition-events.jsonl");
    const lines = fs.readFileSync(file, "utf8").trim().split("\n");
    fs.writeFileSync(file, lines[0] + "\n");
    const integrity = ledger.verifyIntegrity();
    assert.equal(integrity.state, "held");
    assert.match(integrity.reason, /head_count_mismatch|head_receipt_mismatch/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("writer lock serializes update mutation before permit consumption", () => {
  const root = temp();
  try {
    const actor = "subject:owner", node = "node-writer-lock";
    const v1 = evercraftOsSha256("v1"), v2 = evercraftOsSha256("v2");
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
    const permit = issuePermit(passport, {
      actor, node, scope: "app.update", requestFingerprint: update.request_fingerprint, id: "writer-lock",
    });

    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, "package-transition-writer.lock"), JSON.stringify({
      schema: "evercraft.os.package-transition-writer-lock.v1",
      lock_token: "occupied-by-other-writer",
      operation: "update",
      pid: 424242,
      acquired_at: new Date().toISOString(),
    }) + "\n", { mode: 0o600 });

    assert.equal(ledger.writerLockState().state, "busy");
    assert.throws(
      () => ledger.applyUpdate({ plan: update, permitId: permit.permit_id, actorRef: actor }),
      /package_transition_writer_busy/
    );
    assert.equal(passport.getActionPermitState(permit.permit_id).active, true);
    assert.equal(ledger.events().length, 0);

    fs.unlinkSync(path.join(stateDir, "package-transition-writer.lock"));
    const applied = ledger.applyUpdate({ plan: update, permitId: permit.permit_id, actorRef: actor });
    assert.equal(applied.state, "update_recorded");
    assert.equal(passport.getActionPermitState(permit.permit_id).active, false);
    assert.equal(ledger.writerLockState().state, "free");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("writer lock is released when stale desired state rejects before permit consumption", () => {
  const root = temp();
  try {
    const actor = "subject:owner", node = "node-lock-release";
    const v1 = evercraftOsSha256("v1"), v2 = evercraftOsSha256("v2"), drifted = evercraftOsSha256("drifted");
    const passport = new EvercraftPassport({ stateDir: path.join(root, "passport") });
    let installedFingerprint = v1;
    const ledger = new EvercraftOsPackageTransitionLedger({
      stateDir: path.join(root, "transitions"), passport,
      installedStateProvider: { currentState() { return { installed: true, package_fingerprint: installedFingerprint }; } },
    });
    const update = buildPackageUpdatePlan({
      productKey: "aliev", nodeId: node, subjectRef: actor,
      currentPackageFingerprint: v1, nextVerification: verification(v2),
    });
    const permit = issuePermit(passport, {
      actor, node, scope: "app.update", requestFingerprint: update.request_fingerprint, id: "lock-release",
    });
    installedFingerprint = drifted;

    assert.throws(
      () => ledger.applyUpdate({ plan: update, permitId: permit.permit_id, actorRef: actor }),
      /package_update_current_fingerprint_mismatch/
    );
    assert.equal(passport.getActionPermitState(permit.permit_id).active, true);
    assert.equal(ledger.writerLockState().state, "free");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
