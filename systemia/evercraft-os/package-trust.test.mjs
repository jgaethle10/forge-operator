import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  buildPackageAttestationBody,
  buildPackageUpdatePlan,
  buildPublisherTrustStore,
  evercraftOsSha256,
  publisherPublicKeyFingerprint,
  signPackageAttestation,
  verifyPackageAttestation,
} from "./package-trust.mjs";

function keys() {
  const pair = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }),
    privateKeyPem: pair.privateKey.export({ type: "pkcs8", format: "pem" }),
  };
}

function fixture({ state = "active", allowedProducts = ["aliev"], keyWindow = {} } = {}) {
  const pair = keys();
  const keyId = "evercraft-release-2026-01";
  const trust = buildPublisherTrustStore({
    generatedAt: new Date("2026-10-09T20:00:00.000Z"),
    keys: [{
      key_id: keyId,
      publisher_ref: "publisher:evercraft",
      public_key_pem: pair.publicKeyPem,
      public_key_fingerprint: publisherPublicKeyFingerprint(pair.publicKeyPem),
      state,
      allowed_products: allowedProducts,
      revocation_receipt_ref: state === "revoked" ? "receipt:key-revocation:1" : undefined,
      ...keyWindow,
    }],
  });
  const packageHash = evercraftOsSha256("aliev-package-v2");
  const body = buildPackageAttestationBody({
    productKey: "aliev",
    packageFingerprint: packageHash,
    contractVersion: "2.0.0",
    releaseRef: "release:aliev:2.0.0",
    publisherRef: "publisher:evercraft",
    keyId,
    artifactHashes: [evercraftOsSha256("manifest")],
    issuedAt: new Date("2026-10-09T20:00:00.000Z"),
    expiresAt: new Date("2026-10-16T20:00:00.000Z"),
  });
  const signed = signPackageAttestation({ body, privateKeyPem: pair.privateKeyPem });
  return { pair, keyId, trust, packageHash, body, signed };
}

test("valid Ed25519 publisher attestation verifies provenance without granting install authority", () => {
  const f = fixture();
  const result = verifyPackageAttestation({
    attestation: f.signed,
    trustStore: f.trust,
    expectedProductKey: "aliev",
    expectedPackageFingerprint: f.packageHash,
    expectedContractVersion: "2.0.0",
    expectedReleaseRef: "release:aliev:2.0.0",
    now: new Date("2026-10-10T00:00:00.000Z"),
  });
  assert.equal(result.state, "verified");
  assert.equal(result.provenance_verified, true);
  assert.equal(result.install_authority_granted, false);
  assert.equal(result.update_authority_granted, false);
  assert.equal(result.execution_authority_granted, false);
  assert.match(result.receipt.receipt_hash, /^sha256:[a-f0-9]{64}$/);
});

test("tampering signed package body fails signature verification", () => {
  const f = fixture();
  const tampered = structuredClone(f.signed);
  tampered.body.release_ref = "release:aliev:evil";
  tampered.signed_body_hash = evercraftOsSha256(tampered.body);
  const result = verifyPackageAttestation({
    attestation: tampered,
    trustStore: f.trust,
    expectedProductKey: "aliev",
    expectedPackageFingerprint: f.packageHash,
    now: new Date("2026-10-10T00:00:00.000Z"),
  });
  assert.equal(result.state, "held");
  assert.equal(result.reason, "signature_invalid");
});

test("revoked publisher key holds even with a mathematically valid signature", () => {
  const f = fixture({ state: "revoked" });
  const result = verifyPackageAttestation({
    attestation: f.signed,
    trustStore: f.trust,
    expectedProductKey: "aliev",
    expectedPackageFingerprint: f.packageHash,
    now: new Date("2026-10-10T00:00:00.000Z"),
  });
  assert.equal(result.state, "held");
  assert.equal(result.reason, "publisher_key_revoked");
  assert.equal(result.revocation_receipt_ref, "receipt:key-revocation:1");
});

test("publisher trust is product-scoped and cannot sign a different app", () => {
  const f = fixture({ allowedProducts: ["forensiscope"] });
  const result = verifyPackageAttestation({
    attestation: f.signed,
    trustStore: f.trust,
    expectedProductKey: "aliev",
    expectedPackageFingerprint: f.packageHash,
    now: new Date("2026-10-10T00:00:00.000Z"),
  });
  assert.equal(result.state, "held");
  assert.equal(result.reason, "publisher_key_not_authorized_for_product");
});

test("expired package attestation holds", () => {
  const f = fixture();
  const result = verifyPackageAttestation({
    attestation: f.signed,
    trustStore: f.trust,
    expectedProductKey: "aliev",
    expectedPackageFingerprint: f.packageHash,
    now: new Date("2026-10-17T00:00:00.000Z"),
  });
  assert.equal(result.state, "held");
  assert.equal(result.reason, "attestation_expired");
});

test("update planning requires verified provenance and a separate Passport app.update scope", () => {
  const f = fixture();
  const verification = verifyPackageAttestation({
    attestation: f.signed,
    trustStore: f.trust,
    expectedProductKey: "aliev",
    expectedPackageFingerprint: f.packageHash,
    now: new Date("2026-10-10T00:00:00.000Z"),
  });
  const current = evercraftOsSha256("aliev-package-v1");
  const plan = buildPackageUpdatePlan({
    productKey: "aliev",
    nodeId: "node-proof",
    subjectRef: "subject:owner",
    currentPackageFingerprint: current,
    nextVerification: verification,
  });
  assert.equal(plan.operation, "update");
  assert.equal(plan.required_passport_scope, "app.update");
  assert.equal(plan.mutation_performed, false);
  assert.equal(plan.permit_minted, false);
  assert.equal(plan.update_authority_granted, false);
  assert.equal(plan.rollback_pointer.package_fingerprint, current);
  assert.match(plan.request_fingerprint, /^sha256:[a-f0-9]{64}$/);
});

test("update planner refuses unverified or unchanged package", () => {
  const current = evercraftOsSha256("same-package");
  assert.throws(() => buildPackageUpdatePlan({
    productKey: "aliev",
    nodeId: "node-proof",
    subjectRef: "subject:owner",
    currentPackageFingerprint: current,
    nextVerification: { schema: "evercraft.os.package-verification.v1", state: "held" },
  }), /verified_next_package_required/);

  assert.throws(() => buildPackageUpdatePlan({
    productKey: "aliev",
    nodeId: "node-proof",
    subjectRef: "subject:owner",
    currentPackageFingerprint: current,
    nextVerification: {
      schema: "evercraft.os.package-verification.v1",
      state: "verified",
      product_key: "aliev",
      package_fingerprint: current,
      receipt: { receipt_hash: evercraftOsSha256("receipt") },
    },
  }), /update_package_unchanged/);
});

test("mutated trust store is rejected even if its structure still looks valid", () => {
  const f = fixture();
  const tamperedTrust = structuredClone(f.trust);
  tamperedTrust.keys[0].allowed_products.push("forensiscope");
  const result = verifyPackageAttestation({
    attestation: f.signed,
    trustStore: tamperedTrust,
    expectedProductKey: "aliev",
    expectedPackageFingerprint: f.packageHash,
    now: new Date("2026-10-10T00:00:00.000Z"),
  });
  assert.equal(result.state, "held");
  assert.equal(result.reason, "publisher_trust_store_hash_mismatch");
});
