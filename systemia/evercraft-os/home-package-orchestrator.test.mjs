import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { EvercraftPassport } from "../passport/passport.mjs";
import {
  buildPackageAttestationBody,
  buildPublisherTrustStore,
  evercraftOsSha256,
  signPackageAttestation,
  verifyPackageAttestation,
} from "./package-trust.mjs";
import { EvercraftOsPackageTransitionLedger } from "./package-transition-ledger.mjs";
import { EvercraftOsPackageStore } from "./package-store.mjs";
import { EvercraftHomePackageLifecycle } from "./home-package-lifecycle.mjs";
import { EvercraftHomePackageOrchestrator } from "./home-package-orchestrator.mjs";
import { createTestAnchoredTrustProvider } from "./publisher-trust-test-helper.mjs";

function temp() { return fs.mkdtempSync(path.join(os.tmpdir(), "evercraft-home-orchestrator-")); }

function releaseFactory() {
  const pair = generateKeyPairSync("ed25519");
  const pub = pair.publicKey.export({ type: "spki", format: "pem" });
  const priv = pair.privateKey.export({ type: "pkcs8", format: "pem" });
  const trust = buildPublisherTrustStore({ keys: [{
    key_id: "orchestrator-key",
    publisher_ref: "publisher:evercraft",
    public_key_pem: pub,
    allowed_products: ["aliev"],
  }]});
  return {
    trust,
    make(bytes, ref) {
      const packageFingerprint = evercraftOsSha256(bytes);
      const body = buildPackageAttestationBody({
        productKey: "aliev", packageFingerprint, contractVersion: "2.0.0", releaseRef: ref,
        publisherRef: "publisher:evercraft", keyId: "orchestrator-key",
        artifactHashes: [evercraftOsSha256(bytes)],
        issuedAt: new Date("2026-10-09T20:00:00Z"), expiresAt: new Date("2026-10-16T20:00:00Z"),
      });
      const attestation = signPackageAttestation({ body, privateKeyPem: priv });
      const verification = verifyPackageAttestation({
        attestation, trustStore: trust, expectedProductKey: "aliev",
        expectedPackageFingerprint: packageFingerprint, now: new Date("2026-10-10T00:00:00Z"),
      });
      return { bytes, packageFingerprint, attestation, verification };
    },
  };
}

function actionPermit(passport, { actor, node, scope, fingerprint, tag }) {
  const now = new Date();
  const resource = `os-app:aliev:node:${node}`;
  const grant = passport.issueGrant({
    idempotency_key: `grant:${tag}`, subject_ref: actor, issuer_ref: "proof:identity",
    product: "evercraft-os", scopes: [scope], resource_refs: [resource], starts_at: now.toISOString(),
    ends_at: new Date(now.getTime() + 3600000).toISOString(), max_delegation_depth: 0,
    authority_state: "system_policy_authorized", authority_receipt_ref: `proof:${tag}`,
  }).grant;
  return passport.mintActionPermit({
    idempotency_key: `permit:${tag}`, grant_id: grant.grant_id, actor_ref: actor,
    scope, resource_ref: resource, request_fingerprint: fingerprint, ttl_seconds: 300,
  }).permit;
}

function rig(root, baseline, trust) {
  const passport = new EvercraftPassport({ stateDir: path.join(root, "passport") });
  const transitions = new EvercraftOsPackageTransitionLedger({
    stateDir: path.join(root, "transitions"), passport,
    installedStateProvider: { currentState() { return { installed: true, package_fingerprint: baseline }; } },
  });
  const { provider } = createTestAnchoredTrustProvider({ stateDir: path.join(root, "publisher-trust"), trustStore: trust });
  const store = new EvercraftOsPackageStore({ rootDir: path.join(root, "store"), trustProvider: provider });
  const lifecycle = new EvercraftHomePackageLifecycle({ transitionLedger: transitions, trustProvider: provider });
  const orchestrator = new EvercraftHomePackageOrchestrator({ lifecycle, packageStore: store, transitionLedger: transitions });
  return { passport, transitions, store, lifecycle, orchestrator };
}

test("Home stages, prepares, consumes update permit, and reconciles desired to active metadata", () => {
  const root = temp();
  try {
    const factory = releaseFactory();
    const v1 = factory.make(Buffer.from("v1"), "release:1");
    const v2 = factory.make(Buffer.from("v2"), "release:2");
    const r = rig(root, v1.packageFingerprint, factory.trust);
    r.store.stage({ attestation: v1.attestation, artifacts: [{ bytes: v1.bytes }], now: new Date("2026-10-10T00:00:00Z") });
    const prepared = r.orchestrator.stageAndPrepareUpdate({
      productKey: "aliev", nodeId: "node-orch", subjectRef: "subject:owner",
      attestation: v2.attestation, artifacts: [{ bytes: v2.bytes }],
      expectedContractVersion: "2.0.0", expectedReleaseRef: "release:2",
      now: new Date("2026-10-10T00:00:00Z"),
    });
    assert.equal(prepared.state, "prepared");
    const p = actionPermit(r.passport, {
      actor: "subject:owner", node: "node-orch", scope: "app.update",
      fingerprint: prepared.preparation.plan.request_fingerprint, tag: "update",
    });
    const result = r.orchestrator.applyPreparedUpdate({
      plan: prepared.preparation.plan, permitId: p.permit_id, actorRef: "subject:owner",
    });
    assert.equal(result.state, "activated_metadata");
    assert.equal(result.runtime_state.desired_active_aligned, true);
    assert.equal(result.runtime_state.active_package_fingerprint, v2.packageFingerprint);
    assert.equal(result.process_started, false);
    assert.equal(result.runtime_health_claimed, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("tamper after staging but before transition holds without consuming the update permit", () => {
  const root = temp();
  try {
    const factory = releaseFactory();
    const v1 = factory.make(Buffer.from("v1"), "release:1");
    const v2 = factory.make(Buffer.from("v2"), "release:2");
    const r = rig(root, v1.packageFingerprint, factory.trust);
    const prepared = r.orchestrator.stageAndPrepareUpdate({
      productKey: "aliev", nodeId: "node-race", subjectRef: "subject:owner",
      attestation: v2.attestation, artifacts: [{ bytes: v2.bytes }], now: new Date("2026-10-10T00:00:00Z"),
    });
    const p = actionPermit(r.passport, {
      actor: "subject:owner", node: "node-race", scope: "app.update",
      fingerprint: prepared.preparation.plan.request_fingerprint, tag: "race-update",
    });
    const staged = r.store.inspect("aliev", v2.packageFingerprint);
    const blob = fs.readdirSync(path.join(staged.path, "blobs"))[0];
    fs.writeFileSync(path.join(staged.path, "blobs", blob), "tampered");
    const result = r.orchestrator.applyPreparedUpdate({
      plan: prepared.preparation.plan, permitId: p.permit_id, actorRef: "subject:owner",
    });
    assert.equal(result.state, "held");
    assert.equal(result.phase, "pre_transition_stage_recheck");
    assert.equal(result.permit_consumed, false);
    assert.equal(r.passport.getActionPermitState(p.permit_id).active, true);
    assert.equal(r.transitions.currentState("aliev", "node-race").transition_count, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Home reports desired-active drift when transition exists but activation cannot reconcile", () => {
  const root = temp();
  try {
    const factory = releaseFactory();
    const v1 = factory.make(Buffer.from("v1"), "release:1");
    const v2 = factory.make(Buffer.from("v2"), "release:2");
    const r = rig(root, v1.packageFingerprint, factory.trust);
    // Build a normal prepared update, then deliberately remove staged target after the orchestrator preflight
    const prepared = r.orchestrator.stageAndPrepareUpdate({
      productKey: "aliev", nodeId: "node-drift", subjectRef: "subject:owner",
      attestation: v2.attestation, artifacts: [{ bytes: v2.bytes }], now: new Date("2026-10-10T00:00:00Z"),
    });
    const p = actionPermit(r.passport, {
      actor: "subject:owner", node: "node-drift", scope: "app.update",
      fingerprint: prepared.preparation.plan.request_fingerprint, tag: "drift-update",
    });
    // We cannot inject a race inside applyPreparedUpdate without changing production code; emulate the post-transition failure directly.
    r.lifecycle.applyUpdate({ plan: prepared.preparation.plan, permitId: p.permit_id, actorRef: "subject:owner" });
    fs.rmSync(r.store.packagePath("aliev", v2.packageFingerprint), { recursive: true, force: true });
    const activation = r.store.reconcileActivation({ productKey: "aliev", nodeId: "node-drift", transitionLedger: r.transitions });
    assert.equal(activation.state, "held");
    const status = r.orchestrator.status({ productKey: "aliev", nodeId: "node-drift" });
    assert.equal(status.state, "desired_active_drift");
    assert.equal(status.desired_package_fingerprint, v2.packageFingerprint);
    assert.equal(status.active_package_fingerprint, null);
    assert.equal(status.runtime_health_claimed, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Home runtime status surfaces package transition writer contention without granting authority", () => {
  const root = temp();
  try {
    const factory = releaseFactory();
    const baseline = factory.make(Buffer.from("v1"), "release:1");
    const r = rig(root, baseline.packageFingerprint, factory.trust);
    const node = "node-home-writer-status";
    const stateDir = path.join(root, "transitions");
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, "package-transition-writer.lock"), JSON.stringify({
      schema: "evercraft.os.package-transition-writer-lock.v1",
      lock_token: "busy-proof",
      operation: "update",
      pid: 515151,
      acquired_at: new Date().toISOString(),
    }) + "\n", { mode: 0o600 });

    const status = r.orchestrator.status({ productKey: "aliev", nodeId: node });
    assert.equal(status.transition_writer.state, "busy");
    assert.equal(status.transition_writer.active, true);
    assert.equal(status.execution_authority_granted, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
