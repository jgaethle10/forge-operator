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

function temp() { return fs.mkdtempSync(path.join(os.tmpdir(), "evercraft-os-recovery-inspect-")); }

function verification(nextHash) {
  const pair = generateKeyPairSync("ed25519");
  const pub = pair.publicKey.export({ type: "spki", format: "pem" });
  const priv = pair.privateKey.export({ type: "pkcs8", format: "pem" });
  const trust = buildPublisherTrustStore({ keys: [{
    key_id: "recover-key", publisher_ref: "publisher:evercraft", public_key_pem: pub, allowed_products: ["aliev"],
  }]});
  const body = buildPackageAttestationBody({
    productKey: "aliev", packageFingerprint: nextHash, contractVersion: "2.0.0", releaseRef: "release:2",
    publisherRef: "publisher:evercraft", keyId: "recover-key",
    issuedAt: new Date("2026-10-09T20:00:00Z"), expiresAt: new Date("2026-10-16T20:00:00Z"),
  });
  return verifyPackageAttestation({
    attestation: signPackageAttestation({ body, privateKeyPem: priv }), trustStore: trust,
    expectedProductKey: "aliev", expectedPackageFingerprint: nextHash, now: new Date("2026-10-10T00:00:00Z"),
  });
}

function issuePermit(passport, { actor, node, requestFingerprint }) {
  const now = new Date();
  const resource = `os-app:aliev:node:${node}`;
  const grant = passport.issueGrant({
    idempotency_key: "recover-grant:" + node, subject_ref: actor, issuer_ref: "proof:identity",
    product: "evercraft-os", scopes: ["app.update"], resource_refs: [resource],
    starts_at: now.toISOString(), ends_at: new Date(now.getTime() + 3600000).toISOString(),
    max_delegation_depth: 0, authority_state: "system_policy_authorized", authority_receipt_ref: "proof:recover-authority",
  }).grant;
  return passport.mintActionPermit({
    idempotency_key: "recover-permit:" + node, grant_id: grant.grant_id, actor_ref: actor,
    scope: "app.update", resource_ref: resource, request_fingerprint: requestFingerprint, ttl_seconds: 300,
  }).permit;
}

function buildRig(root, node = "node-recovery") {
  const actor = "subject:owner";
  const v1 = evercraftOsSha256("recovery-v1");
  const v2 = evercraftOsSha256("recovery-v2");
  const passport = new EvercraftPassport({ stateDir: path.join(root, "passport") });
  const stateDir = path.join(root, "transitions");
  const ledger = new EvercraftOsPackageTransitionLedger({
    stateDir, passport,
    installedStateProvider: { currentState() { return { installed: true, package_fingerprint: v1 }; } },
  });
  const plan = buildPackageUpdatePlan({
    productKey: "aliev", nodeId: node, subjectRef: actor,
    currentPackageFingerprint: v1, nextVerification: verification(v2),
  });
  const permit = issuePermit(passport, { actor, node, requestFingerprint: plan.request_fingerprint });
  return { actor, node, v1, v2, passport, stateDir, ledger, plan, permit };
}

test("recovery inspector reports clean aligned transition state without granting repair authority", () => {
  const root = temp();
  try {
    const r = buildRig(root, "node-recovery-clean");
    r.ledger.applyUpdate({ plan: r.plan, permitId: r.permit.permit_id, actorRef: r.actor });
    const inspection = inspectPackageTransitionRecovery({ stateDir: r.stateDir, passport: r.passport });
    assert.equal(inspection.state, "clean");
    assert.equal(inspection.raw_event_chain_verified, true);
    assert.equal(inspection.checkpoint_state, "aligned");
    assert.equal(inspection.recovery_candidate, false);
    assert.equal(inspection.recovery_authority_granted, false);
    assert.equal(inspection.mutation_performed, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("recovery inspector identifies one-event head lag only when Passport proves permit consumption", () => {
  const root = temp();
  try {
    const r = buildRig(root, "node-recovery-lag");
    r.ledger.applyUpdate({ plan: r.plan, permitId: r.permit.permit_id, actorRef: r.actor });
    fs.unlinkSync(path.join(r.stateDir, "package-transition-head.json"));
    const inspection = inspectPackageTransitionRecovery({ stateDir: r.stateDir, passport: r.passport });
    assert.equal(inspection.state, "head_checkpoint_lag_candidate");
    assert.equal(inspection.checkpoint_state, "one_event_ahead_candidate");
    assert.equal(inspection.last_event_permit.verified, true);
    assert.equal(inspection.recovery_candidate, true);
    assert.equal(inspection.recovery_requires_explicit_authority, true);
    assert.equal(inspection.automatic_repair_allowed, false);
    assert.equal(inspection.mutation_performed, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("recovery inspector surfaces writer lock without deleting it", () => {
  const root = temp();
  try {
    const r = buildRig(root, "node-recovery-lock");
    fs.mkdirSync(r.stateDir, { recursive: true });
    const lockFile = path.join(r.stateDir, "package-transition-writer.lock");
    fs.writeFileSync(lockFile, JSON.stringify({
      schema: "evercraft.os.package-transition-writer-lock.v1", lock_token: "stale-or-active",
      operation: "update", product_key: "aliev", node_id: r.node,
      resource_ref: `os-app:aliev:node:${r.node}`, pid: 12345, acquired_at: new Date().toISOString(),
    }) + "\n", { mode: 0o600 });
    const inspection = inspectPackageTransitionRecovery({ stateDir: r.stateDir, passport: r.passport });
    assert.equal(inspection.state, "writer_lock_present");
    assert.equal(inspection.writer.present, true);
    assert.equal(inspection.automatic_repair_allowed, false);
    assert.equal(fs.existsSync(lockFile), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("recovery inspector treats tampered history as ambiguous hold, never a repair candidate", () => {
  const root = temp();
  try {
    const r = buildRig(root, "node-recovery-tamper");
    r.ledger.applyUpdate({ plan: r.plan, permitId: r.permit.permit_id, actorRef: r.actor });
    const eventsFile = path.join(r.stateDir, "package-transition-events.jsonl");
    const event = JSON.parse(fs.readFileSync(eventsFile, "utf8").trim());
    event.to_package_fingerprint = evercraftOsSha256("attacker-change");
    fs.writeFileSync(eventsFile, JSON.stringify(event) + "\n", { mode: 0o600 });
    const inspection = inspectPackageTransitionRecovery({ stateDir: r.stateDir, passport: r.passport });
    assert.equal(inspection.state, "held");
    assert.equal(inspection.raw_event_chain_verified, false);
    assert.equal(inspection.automatic_repair_allowed, false);
    assert.equal(inspection.recovery_authority_granted, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
