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
import { EvercraftOsPackageStore } from "./package-store.mjs";
import { createTestAnchoredTrustProvider } from "./publisher-trust-test-helper.mjs";

function temp() { return fs.mkdtempSync(path.join(os.tmpdir(), "evercraft-package-store-")); }

function packageStore(root, trustStore, tag = "default") {
  const { provider } = createTestAnchoredTrustProvider({
    stateDir: path.join(root, `publisher-trust-${tag}`),
    trustStore,
    rootKeyId: `test-root-${tag}`,
  });
  return new EvercraftOsPackageStore({ rootDir: path.join(root, "store"), trustProvider: provider });
}

function release(product, packageBytes, releaseRef) {
  const pair = generateKeyPairSync("ed25519");
  const pub = pair.publicKey.export({ type: "spki", format: "pem" });
  const priv = pair.privateKey.export({ type: "pkcs8", format: "pem" });
  const packageFingerprint = evercraftOsSha256(packageBytes);
  const artifactHash = evercraftOsSha256(packageBytes);
  const trust = buildPublisherTrustStore({ keys: [{
    key_id: "release-key",
    publisher_ref: "publisher:evercraft",
    public_key_pem: pub,
    allowed_products: [product],
  }]});
  const body = buildPackageAttestationBody({
    productKey: product,
    packageFingerprint,
    contractVersion: "2.0.0",
    releaseRef,
    publisherRef: "publisher:evercraft",
    keyId: "release-key",
    artifactHashes: [artifactHash],
    issuedAt: new Date("2026-10-09T20:00:00Z"),
    expiresAt: new Date("2026-10-16T20:00:00Z"),
  });
  const attestation = signPackageAttestation({ body, privateKeyPem: priv });
  const verification = verifyPackageAttestation({
    attestation, trustStore: trust, expectedProductKey: product,
    expectedPackageFingerprint: packageFingerprint,
    now: new Date("2026-10-10T00:00:00Z"),
  });
  return { packageBytes, packageFingerprint, artifactHash, attestation, verification, trust };
}

function updatePermit(passport, actor, node, requestFingerprint) {
  const now = new Date();
  const resource = `os-app:aliev:node:${node}`;
  const grant = passport.issueGrant({
    idempotency_key: "store-update-grant",
    subject_ref: actor,
    issuer_ref: "proof:identity",
    product: "evercraft-os",
    scopes: ["app.update"],
    resource_refs: [resource],
    starts_at: now.toISOString(),
    ends_at: new Date(now.getTime() + 3600000).toISOString(),
    max_delegation_depth: 0,
    authority_state: "system_policy_authorized",
    authority_receipt_ref: "proof:store-update-authority",
  }).grant;
  return passport.mintActionPermit({
    idempotency_key: "store-update-permit",
    grant_id: grant.grant_id,
    actor_ref: actor,
    scope: "app.update",
    resource_ref: resource,
    request_fingerprint: requestFingerprint,
    ttl_seconds: 300,
  }).permit;
}

test("signed package artifacts stage content-addressed but do not become active by themselves", () => {
  const root = temp();
  try {
    const r = release("aliev", Buffer.from("package-v2"), "release:2");
    const store = packageStore(root, r.trust);
    const staged = store.stage({
      attestation: r.attestation,
      artifacts: [{ bytes: r.packageBytes, sha256: r.artifactHash }],
      now: new Date("2026-10-10T00:00:00Z"),
    });
    assert.equal(staged.state, "staged");
    assert.equal(staged.package.integrity, "verified");
    assert.equal(staged.package.executable_bits_materialized, false);
    assert.equal(staged.package.process_started, false);
    assert.equal(store.inspectActivation("aliev", "node-1").active, false);
    const duplicate = store.stage({
      attestation: r.attestation,
      artifacts: [{ bytes: r.packageBytes, sha256: r.artifactHash }],
      now: new Date("2026-10-10T00:00:00Z"),
    });
    assert.equal(duplicate.state, "already_staged");
    assert.equal(duplicate.mutation_performed, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("activation requires both verified staged package and authorized transition receipt", () => {
  const root = temp();
  try {
    const actor = "subject:owner", node = "node-store-activation";
    const v1 = evercraftOsSha256("package-v1");
    const r2 = release("aliev", Buffer.from("package-v2"), "release:2");
    const store = packageStore(root, r2.trust);
    store.stage({ attestation: r2.attestation, artifacts: [{ bytes: r2.packageBytes }], now: new Date("2026-10-10T00:00:00Z") });
    const passport = new EvercraftPassport({ stateDir: path.join(root, "passport") });
    const ledger = new EvercraftOsPackageTransitionLedger({
      stateDir: path.join(root, "transitions"), passport,
      installedStateProvider: { currentState() { return { installed: true, package_fingerprint: v1 }; } },
    });
    const before = store.reconcileActivation({ productKey: "aliev", nodeId: node, transitionLedger: ledger });
    assert.equal(before.state, "held");
    assert.equal(before.reason, "authorized_transition_required_for_activation");

    const plan = buildPackageUpdatePlan({
      productKey: "aliev", nodeId: node, subjectRef: actor,
      currentPackageFingerprint: v1, nextVerification: r2.verification,
    });
    const p = updatePermit(passport, actor, node, plan.request_fingerprint);
    ledger.applyUpdate({ plan, permitId: p.permit_id, actorRef: actor });
    const activated = store.reconcileActivation({ productKey: "aliev", nodeId: node, transitionLedger: ledger });
    assert.equal(activated.state, "activated_metadata");
    assert.equal(activated.activation.integrity, "verified");
    assert.equal(activated.activation.package_fingerprint, r2.packageFingerprint);
    assert.equal(activated.activation.process_started, false);
    assert.equal(activated.activation.execution_authority_granted, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("tampered staged blob holds activation even after an authorized transition", () => {
  const root = temp();
  try {
    const actor = "subject:owner", node = "node-store-tamper";
    const v1 = evercraftOsSha256("package-v1");
    const r2 = release("aliev", Buffer.from("package-v2"), "release:2");
    const store = packageStore(root, r2.trust);
    const staged = store.stage({ attestation: r2.attestation, artifacts: [{ bytes: r2.packageBytes }], now: new Date("2026-10-10T00:00:00Z") });
    const blobDir = path.join(staged.package.path, "blobs");
    const blob = fs.readdirSync(blobDir)[0];
    fs.writeFileSync(path.join(blobDir, blob), "tampered");
    assert.equal(store.inspect("aliev", r2.packageFingerprint).integrity, "held");

    const passport = new EvercraftPassport({ stateDir: path.join(root, "passport") });
    const ledger = new EvercraftOsPackageTransitionLedger({
      stateDir: path.join(root, "transitions"), passport,
      installedStateProvider: { currentState() { return { installed: true, package_fingerprint: v1 }; } },
    });
    const plan = buildPackageUpdatePlan({
      productKey: "aliev", nodeId: node, subjectRef: actor,
      currentPackageFingerprint: v1, nextVerification: r2.verification,
    });
    const p = updatePermit(passport, actor, node, plan.request_fingerprint);
    ledger.applyUpdate({ plan, permitId: p.permit_id, actorRef: actor });
    const activation = store.reconcileActivation({ productKey: "aliev", nodeId: node, transitionLedger: ledger });
    assert.equal(activation.state, "held");
    assert.equal(activation.reason, "target_package_not_verified_staged");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("package store independently re-verifies signature and rejects an attacker-signed package", () => {
  const root = temp();
  try {
    const trusted = release("aliev", Buffer.from("trusted-v2"), "release:2");
    const attacker = release("aliev", Buffer.from("attacker-v2"), "release:evil");
    const store = packageStore(root, trusted.trust);
    const result = store.stage({
      attestation: attacker.attestation,
      artifacts: [{ bytes: attacker.packageBytes }],
      now: new Date("2026-10-10T00:00:00Z"),
    });
    assert.equal(result.state, "held");
    assert.equal(result.reason, "signature_invalid");
    assert.equal(result.mutation_performed, false);
    assert.equal(store.inspect("aliev", attacker.packageFingerprint).materialized, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("authorized rollback reconciles activation back to a previously verified staged package", () => {
  const root = temp();
  try {
    const actor = "subject:owner", node = "node-store-rollback";
    const pair = generateKeyPairSync("ed25519");
    const pub = pair.publicKey.export({ type: "spki", format: "pem" });
    const priv = pair.privateKey.export({ type: "pkcs8", format: "pem" });
    const trust = buildPublisherTrustStore({ keys: [{
      key_id: "shared-release-key",
      publisher_ref: "publisher:evercraft",
      public_key_pem: pub,
      allowed_products: ["aliev"],
    }]});
    const makeRelease = (bytes, ref) => {
      const packageFingerprint = evercraftOsSha256(bytes);
      const body = buildPackageAttestationBody({
        productKey: "aliev",
        packageFingerprint,
        contractVersion: "2.0.0",
        releaseRef: ref,
        publisherRef: "publisher:evercraft",
        keyId: "shared-release-key",
        artifactHashes: [evercraftOsSha256(bytes)],
        issuedAt: new Date("2026-10-09T20:00:00Z"),
        expiresAt: new Date("2026-10-16T20:00:00Z"),
      });
      const attestation = signPackageAttestation({ body, privateKeyPem: priv });
      const verification = verifyPackageAttestation({
        attestation, trustStore: trust, expectedProductKey: "aliev",
        expectedPackageFingerprint: packageFingerprint,
        now: new Date("2026-10-10T00:00:00Z"),
      });
      return { bytes, packageFingerprint, attestation, verification };
    };
    const v1 = makeRelease(Buffer.from("package-v1"), "release:1");
    const v2 = makeRelease(Buffer.from("package-v2"), "release:2");
    const store = packageStore(root, trust);
    assert.equal(store.stage({ attestation: v1.attestation, artifacts: [{ bytes: v1.bytes }], now: new Date("2026-10-10T00:00:00Z") }).state, "staged");
    assert.equal(store.stage({ attestation: v2.attestation, artifacts: [{ bytes: v2.bytes }], now: new Date("2026-10-10T00:00:00Z") }).state, "staged");

    const passport = new EvercraftPassport({ stateDir: path.join(root, "passport") });
    const ledger = new EvercraftOsPackageTransitionLedger({
      stateDir: path.join(root, "transitions"), passport,
      installedStateProvider: { currentState() { return { installed: true, package_fingerprint: v1.packageFingerprint }; } },
    });
    const update = buildPackageUpdatePlan({
      productKey: "aliev", nodeId: node, subjectRef: actor,
      currentPackageFingerprint: v1.packageFingerprint, nextVerification: v2.verification,
    });
    const now = new Date();
    const resource = `os-app:aliev:node:${node}`;
    const updateGrant = passport.issueGrant({
      idempotency_key: "rollback-path-update-grant",
      subject_ref: actor, issuer_ref: "proof:identity", product: "evercraft-os",
      scopes: ["app.update"], resource_refs: [resource], starts_at: now.toISOString(),
      ends_at: new Date(now.getTime() + 3600000).toISOString(), max_delegation_depth: 0,
      authority_state: "system_policy_authorized", authority_receipt_ref: "proof:update",
    }).grant;
    const updateAction = passport.mintActionPermit({
      idempotency_key: "rollback-path-update-permit", grant_id: updateGrant.grant_id,
      actor_ref: actor, scope: "app.update", resource_ref: resource,
      request_fingerprint: update.request_fingerprint, ttl_seconds: 300,
    }).permit;
    ledger.applyUpdate({ plan: update, permitId: updateAction.permit_id, actorRef: actor });
    assert.equal(store.reconcileActivation({ productKey: "aliev", nodeId: node, transitionLedger: ledger }).activation.package_fingerprint, v2.packageFingerprint);

    const rollback = ledger.planRollback({ productKey: "aliev", nodeId: node, subjectRef: actor });
    const rollbackGrant = passport.issueGrant({
      idempotency_key: "rollback-path-rollback-grant",
      subject_ref: actor, issuer_ref: "proof:identity", product: "evercraft-os",
      scopes: ["app.rollback"], resource_refs: [resource], starts_at: now.toISOString(),
      ends_at: new Date(now.getTime() + 3600000).toISOString(), max_delegation_depth: 0,
      authority_state: "system_policy_authorized", authority_receipt_ref: "proof:rollback",
    }).grant;
    const rollbackAction = passport.mintActionPermit({
      idempotency_key: "rollback-path-rollback-permit", grant_id: rollbackGrant.grant_id,
      actor_ref: actor, scope: "app.rollback", resource_ref: resource,
      request_fingerprint: rollback.request_fingerprint, ttl_seconds: 300,
    }).permit;
    ledger.applyRollback({ plan: rollback, permitId: rollbackAction.permit_id, actorRef: actor });
    const reconciled = store.reconcileActivation({ productKey: "aliev", nodeId: node, transitionLedger: ledger });
    assert.equal(reconciled.state, "activated_metadata");
    assert.equal(reconciled.activation.package_fingerprint, v1.packageFingerprint);
    assert.equal(reconciled.activation.process_started, false);
    assert.equal(reconciled.activation.service_enabled, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("tampered activation pointer is held even when staged package remains valid", () => {
  const root = temp();
  try {
    const actor = "subject:owner", node = "node-pointer-tamper";
    const v1 = evercraftOsSha256("package-v1");
    const r2 = release("aliev", Buffer.from("package-v2"), "release:2");
    const store = packageStore(root, r2.trust);
    store.stage({ attestation: r2.attestation, artifacts: [{ bytes: r2.packageBytes }], now: new Date("2026-10-10T00:00:00Z") });
    const passport = new EvercraftPassport({ stateDir: path.join(root, "passport") });
    const ledger = new EvercraftOsPackageTransitionLedger({
      stateDir: path.join(root, "transitions"), passport,
      installedStateProvider: { currentState() { return { installed: true, package_fingerprint: v1 }; } },
    });
    const plan = buildPackageUpdatePlan({
      productKey: "aliev", nodeId: node, subjectRef: actor,
      currentPackageFingerprint: v1, nextVerification: r2.verification,
    });
    const p = updatePermit(passport, actor, node, plan.request_fingerprint);
    ledger.applyUpdate({ plan, permitId: p.permit_id, actorRef: actor });
    store.reconcileActivation({ productKey: "aliev", nodeId: node, transitionLedger: ledger });
    const activationFile = store.activationPath("aliev", node);
    const pointer = JSON.parse(fs.readFileSync(activationFile, "utf8"));
    pointer.transition_receipt_hash = evercraftOsSha256("forged-transition");
    fs.writeFileSync(activationFile, JSON.stringify(pointer, null, 2) + "\n");
    const state = store.inspectActivation("aliev", node);
    assert.equal(state.integrity, "held");
    assert.match(state.reason, /package_activation_hash_mismatch/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
