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
} from "./package-trust.mjs";
import { EvercraftOsPackageTransitionLedger } from "./package-transition-ledger.mjs";
import { EvercraftHomePackageLifecycle } from "./home-package-lifecycle.mjs";
import { createTestAnchoredTrustProvider } from "./publisher-trust-test-helper.mjs";

function temp() { return fs.mkdtempSync(path.join(os.tmpdir(), "evercraft-home-lifecycle-")); }

function signedRelease(nextHash) {
  const pair = generateKeyPairSync("ed25519");
  const pub = pair.publicKey.export({ type: "spki", format: "pem" });
  const priv = pair.privateKey.export({ type: "pkcs8", format: "pem" });
  const trust = buildPublisherTrustStore({ keys: [{
    key_id: "release-key",
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
    keyId: "release-key",
    issuedAt: new Date("2026-10-09T20:00:00Z"),
    expiresAt: new Date("2026-10-16T20:00:00Z"),
  });
  return { trust, attestation: signPackageAttestation({ body, privateKeyPem: priv }) };
}

function permit(passport, { actor, node, scope, requestFingerprint, tag }) {
  const now = new Date();
  const grant = passport.issueGrant({
    idempotency_key: `grant:${tag}`,
    subject_ref: actor,
    issuer_ref: "proof:identity",
    product: "evercraft-os",
    scopes: [scope],
    resource_refs: [`os-app:aliev:node:${node}`],
    starts_at: now.toISOString(),
    ends_at: new Date(now.getTime() + 3600000).toISOString(),
    max_delegation_depth: 0,
    authority_state: "system_policy_authorized",
    authority_receipt_ref: `proof:${tag}`,
  }).grant;
  return passport.mintActionPermit({
    idempotency_key: `permit:${tag}`,
    grant_id: grant.grant_id,
    actor_ref: actor,
    scope,
    resource_ref: `os-app:aliev:node:${node}`,
    request_fingerprint: requestFingerprint,
    ttl_seconds: 300,
  }).permit;
}

test("Home prepares verified update without minting authority, then records only with Passport permit", () => {
  const root = temp();
  try {
    const actor = "subject:owner", node = "node-home-update";
    const v1 = evercraftOsSha256("v1"), v2 = evercraftOsSha256("v2");
    const passport = new EvercraftPassport({ stateDir: path.join(root, "passport") });
    const transitions = new EvercraftOsPackageTransitionLedger({
      stateDir: path.join(root, "transitions"), passport,
      installedStateProvider: { currentState() { return { installed: true, package_fingerprint: v1 }; } },
    });
    const release = signedRelease(v2);
    const { provider } = createTestAnchoredTrustProvider({ stateDir: path.join(root, "publisher-trust"), trustStore: release.trust });
    const home = new EvercraftHomePackageLifecycle({ transitionLedger: transitions, trustProvider: provider });
    const prepared = home.prepareUpdate({
      productKey: "aliev", nodeId: node, subjectRef: actor,
      attestation: release.attestation,
      expectedContractVersion: "2.0.0",
      expectedReleaseRef: "release:2",
      now: new Date("2026-10-10T00:00:00Z"),
    });
    assert.equal(prepared.state, "prepared");
    assert.equal(prepared.permit_minted, false);
    assert.equal(prepared.authority_granted, false);
    assert.equal(prepared.passport.scope, "app.update");
    assert.equal(transitions.currentState("aliev", node).transition_count, 0);
    assert.equal(JSON.stringify(prepared).includes("PRIVATE KEY"), false);

    const p = permit(passport, { actor, node, scope: "app.update", requestFingerprint: prepared.plan.request_fingerprint, tag: "update" });
    const result = home.applyUpdate({ plan: prepared.plan, permitId: p.permit_id, actorRef: actor });
    assert.equal(result.state, "update_recorded");
    assert.equal(result.permit_consumed, true);
    assert.equal(result.package_materialized, false);
    assert.equal(result.capsule_reconciliation_required, true);
    assert.equal(result.runtime_restarted, false);
    assert.equal(transitions.currentState("aliev", node).package_fingerprint, v2);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Home refuses untrusted update before permit stage", () => {
  const root = temp();
  try {
    const actor = "subject:owner", node = "node-home-held";
    const v1 = evercraftOsSha256("v1"), v2 = evercraftOsSha256("v2");
    const passport = new EvercraftPassport({ stateDir: path.join(root, "passport") });
    const transitions = new EvercraftOsPackageTransitionLedger({
      stateDir: path.join(root, "transitions"), passport,
      installedStateProvider: { currentState() { return { installed: true, package_fingerprint: v1 }; } },
    });
    const trusted = signedRelease(v2);
    const attacker = signedRelease(v2);
    const { provider } = createTestAnchoredTrustProvider({ stateDir: path.join(root, "publisher-trust"), trustStore: trusted.trust });
    const home = new EvercraftHomePackageLifecycle({ transitionLedger: transitions, trustProvider: provider });
    const prepared = home.prepareUpdate({
      productKey: "aliev", nodeId: node, subjectRef: actor,
      attestation: attacker.attestation,
      now: new Date("2026-10-10T00:00:00Z"),
    });
    assert.equal(prepared.state, "held");
    assert.equal(prepared.reason, "signature_invalid");
    assert.equal(prepared.mutation_performed, false);
    assert.equal(prepared.authority_granted, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Home rollback is a separate prepared action and requires app.rollback permit", () => {
  const root = temp();
  try {
    const actor = "subject:owner", node = "node-home-rollback";
    const v1 = evercraftOsSha256("v1"), v2 = evercraftOsSha256("v2");
    const passport = new EvercraftPassport({ stateDir: path.join(root, "passport") });
    const transitions = new EvercraftOsPackageTransitionLedger({
      stateDir: path.join(root, "transitions"), passport,
      installedStateProvider: { currentState() { return { installed: true, package_fingerprint: v1 }; } },
    });
    const release = signedRelease(v2);
    const { provider } = createTestAnchoredTrustProvider({ stateDir: path.join(root, "publisher-trust"), trustStore: release.trust });
    const home = new EvercraftHomePackageLifecycle({ transitionLedger: transitions, trustProvider: provider });
    const update = home.prepareUpdate({
      productKey: "aliev", nodeId: node, subjectRef: actor, attestation: release.attestation,
      now: new Date("2026-10-10T00:00:00Z"),
    });
    const up = permit(passport, { actor, node, scope: "app.update", requestFingerprint: update.plan.request_fingerprint, tag: "update" });
    home.applyUpdate({ plan: update.plan, permitId: up.permit_id, actorRef: actor });

    const rollback = home.prepareRollback({ productKey: "aliev", nodeId: node, subjectRef: actor });
    assert.equal(rollback.state, "prepared");
    assert.equal(rollback.passport.scope, "app.rollback");
    assert.equal(rollback.permit_minted, false);
    assert.equal(rollback.plan.target_package_fingerprint, v1);
    const rp = permit(passport, { actor, node, scope: "app.rollback", requestFingerprint: rollback.plan.request_fingerprint, tag: "rollback" });
    const result = home.applyRollback({ plan: rollback.plan, permitId: rp.permit_id, actorRef: actor });
    assert.equal(result.state, "rollback_recorded");
    assert.equal(result.package_fingerprint, v1);
    assert.equal(result.package_materialized, false);
    assert.equal(result.runtime_restarted, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
