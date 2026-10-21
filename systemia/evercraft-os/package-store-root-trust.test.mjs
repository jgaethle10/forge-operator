import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import {
  buildPackageAttestationBody,
  buildPublisherTrustStore,
  evercraftOsSha256,
  signPackageAttestation,
} from "./package-trust.mjs";
import {
  buildPublisherTrustEpochBody,
  signPublisherTrustEpoch,
} from "./publisher-trust-epoch.mjs";
import { createTestAnchoredTrustProvider } from "./publisher-trust-test-helper.mjs";
import { EvercraftOsPackageStore } from "./package-store.mjs";

function temp() { return fs.mkdtempSync(path.join(os.tmpdir(), "evercraft-store-root-trust-")); }

function publisherRelease() {
  const pair = generateKeyPairSync("ed25519");
  const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" });
  const privateKeyPem = pair.privateKey.export({ type: "pkcs8", format: "pem" });
  const bytes = Buffer.from("root-anchored-package-v2");
  const packageFingerprint = evercraftOsSha256(bytes);
  const trustStore = buildPublisherTrustStore({ keys: [{
    key_id: "publisher-key",
    publisher_ref: "publisher:evercraft",
    public_key_pem: publicKeyPem,
    allowed_products: ["aliev"],
  }]});
  const body = buildPackageAttestationBody({
    productKey: "aliev",
    packageFingerprint,
    contractVersion: "2.0.0",
    releaseRef: "release:root-trust-v2",
    publisherRef: "publisher:evercraft",
    keyId: "publisher-key",
    artifactHashes: [evercraftOsSha256(bytes)],
    issuedAt: new Date("2026-10-09T20:00:00Z"),
    expiresAt: new Date("2026-10-16T20:00:00Z"),
  });
  return {
    publicKeyPem,
    bytes,
    packageFingerprint,
    trustStore,
    attestation: signPackageAttestation({ body, privateKeyPem }),
  };
}

test("package store refuses unanchored raw trust store configuration", () => {
  const root = temp();
  try {
    const release = publisherRelease();
    assert.throws(
      () => new EvercraftOsPackageStore({ rootDir: path.join(root, "store"), trustStore: release.trustStore }),
      /root_anchored_trust_provider_required/
    );
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("package staged under epoch one becomes held after publisher key revocation in epoch two", () => {
  const root = temp();
  try {
    const release = publisherRelease();
    const anchored = createTestAnchoredTrustProvider({
      stateDir: path.join(root, "publisher-trust"),
      trustStore: release.trustStore,
      rootKeyId: "root-1",
    });
    const store = new EvercraftOsPackageStore({ rootDir: path.join(root, "store"), trustProvider: anchored.provider });
    const staged = store.stage({
      attestation: release.attestation,
      artifacts: [{ bytes: release.bytes }],
      now: new Date("2026-10-10T00:00:00Z"),
    });
    assert.equal(staged.state, "staged");
    assert.equal(store.inspect("aliev", release.packageFingerprint).integrity, "verified");

    const revoked = buildPublisherTrustStore({ keys: [{
      key_id: "publisher-key",
      publisher_ref: "publisher:evercraft",
      public_key_pem: release.publicKeyPem,
      allowed_products: ["aliev"],
      state: "revoked",
      revocation_receipt_ref: "receipt:publisher-compromise-20261010",
    }]});
    const epoch2Body = buildPublisherTrustEpochBody({
      epoch: 2,
      previousEpochHash: anchored.accepted.epoch_hash,
      trustStore: revoked,
      rootKeyId: "root-1",
      issuedAt: new Date("2026-10-10T01:00:00Z"),
    });
    const epoch2 = signPublisherTrustEpoch({ body: epoch2Body, privateKeyPem: anchored.rootPrivateKeyPem });
    const accepted2 = anchored.provider.accept(epoch2);
    assert.equal(accepted2.state, "accepted");

    const after = store.inspect("aliev", release.packageFingerprint);
    assert.equal(after.integrity, "held");
    assert.match(after.reason, /publisher_trust_reverification_hold:publisher_key_revoked/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
