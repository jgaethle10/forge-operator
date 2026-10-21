import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, generateKeyPairSync } from "node:crypto";
import { buildPublisherTrustStore } from "./package-trust.mjs";
import {
  buildPublisherTrustEpochBody,
  signPublisherTrustEpoch,
  verifyPublisherTrustEpoch,
  EvercraftOsPublisherTrustEpochStore,
} from "./publisher-trust-epoch.mjs";

function temp() { return fs.mkdtempSync(path.join(os.tmpdir(), "evercraft-publisher-trust-epoch-")); }

function keys() {
  const root = generateKeyPairSync("ed25519");
  const publisher = generateKeyPairSync("ed25519");
  const rootPublic = root.publicKey.export({ type: "spki", format: "pem" });
  const rootPrivate = root.privateKey.export({ type: "pkcs8", format: "pem" });
  const publisherPublic = publisher.publicKey.export({ type: "spki", format: "pem" });
  return { rootPublic, rootPrivate, publisherPublic };
}

function trust(publisherPublic, keyId = "publisher-key") {
  return buildPublisherTrustStore({ keys: [{
    key_id: keyId,
    publisher_ref: "publisher:evercraft",
    public_key_pem: publisherPublic,
    allowed_products: ["aliev"],
  }]});
}

function signedEpoch({ epoch, previousEpochHash = null, store, rootPrivate, rootKeyId = "root-1" }) {
  const body = buildPublisherTrustEpochBody({
    epoch,
    previousEpochHash,
    trustStore: store,
    rootKeyId,
    issuedAt: new Date("2026-10-10T00:00:00Z"),
  });
  return signPublisherTrustEpoch({ body, privateKeyPem: rootPrivate });
}

test("root-signed publisher trust epoch verifies and grants no package mutation authority", () => {
  const k = keys();
  const store = trust(k.publisherPublic);
  const signed = signedEpoch({ epoch: 1, store, rootPrivate: k.rootPrivate });
  const verified = verifyPublisherTrustEpoch({
    signedEpoch: signed,
    pinnedRootKeys: [{ key_id: "root-1", public_key_pem: k.rootPublic }],
    expectedEpoch: 1,
    expectedPreviousEpochHash: null,
  });
  assert.equal(verified.state, "verified");
  assert.equal(verified.trust_store_hash, store.trust_store_hash);
  assert.equal(verified.install_authority_granted, false);
  assert.equal(verified.update_authority_granted, false);
  assert.equal(verified.execution_authority_granted, false);
});

test("rewriting trust store and recomputing its self-hash cannot bypass root signature", () => {
  const k = keys();
  const original = trust(k.publisherPublic);
  const signed = signedEpoch({ epoch: 1, store: original, rootPrivate: k.rootPrivate });
  const attacker = generateKeyPairSync("ed25519");
  const attackerPublic = attacker.publicKey.export({ type: "spki", format: "pem" });
  const rewritten = trust(attackerPublic, "attacker-key");
  const forged = structuredClone(signed);
  forged.body.trust_store = rewritten;
  forged.body.trust_store_hash = rewritten.trust_store_hash;
  // Attacker can recompute unsigned metadata hashes, but not the pinned-root signature.
  const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
  forged.signed_body_hash = "sha256:" + createHash("sha256").update(JSON.stringify(canonical(forged.body))).digest("hex");
  const verified = verifyPublisherTrustEpoch({
    signedEpoch: forged,
    pinnedRootKeys: [{ key_id: "root-1", public_key_pem: k.rootPublic }],
    expectedEpoch: 1,
    expectedPreviousEpochHash: null,
  });
  assert.equal(verified.state, "held");
  assert.match(verified.reason, /signature_invalid/);
});

test("epoch store enforces monotonic next epoch and hash-chain binding", () => {
  const root = temp();
  try {
    const k = keys();
    const epochStore = new EvercraftOsPublisherTrustEpochStore({
      stateDir: root,
      pinnedRootKeys: [{ key_id: "root-1", public_key_pem: k.rootPublic }],
    });
    const one = signedEpoch({ epoch: 1, store: trust(k.publisherPublic), rootPrivate: k.rootPrivate });
    const acceptedOne = epochStore.accept(one);
    assert.equal(acceptedOne.state, "accepted");
    const twoStore = trust(k.publisherPublic, "publisher-key-2");
    const two = signedEpoch({
      epoch: 2,
      previousEpochHash: acceptedOne.epoch_hash,
      store: twoStore,
      rootPrivate: k.rootPrivate,
    });
    const acceptedTwo = epochStore.accept(two);
    assert.equal(acceptedTwo.state, "accepted");
    assert.equal(epochStore.current().epoch, 2);
    assert.equal(epochStore.currentTrustStore().trust_store_hash, twoStore.trust_store_hash);

    const rollback = epochStore.accept(one);
    assert.equal(rollback.state, "duplicate");
    const skipped = signedEpoch({
      epoch: 4,
      previousEpochHash: acceptedTwo.epoch_hash,
      store: twoStore,
      rootPrivate: k.rootPrivate,
    });
    const skippedResult = epochStore.accept(skipped);
    assert.equal(skippedResult.state, "held");
    assert.match(skippedResult.reason, /sequence_mismatch/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("epoch store detects truncation of accepted trust history", () => {
  const root = temp();
  try {
    const k = keys();
    const epochStore = new EvercraftOsPublisherTrustEpochStore({
      stateDir: root,
      pinnedRootKeys: [{ key_id: "root-1", public_key_pem: k.rootPublic }],
    });
    const one = signedEpoch({ epoch: 1, store: trust(k.publisherPublic), rootPrivate: k.rootPrivate });
    const acceptedOne = epochStore.accept(one);
    const two = signedEpoch({
      epoch: 2,
      previousEpochHash: acceptedOne.epoch_hash,
      store: trust(k.publisherPublic, "publisher-key-next"),
      rootPrivate: k.rootPrivate,
    });
    epochStore.accept(two);
    const eventsFile = path.join(root, "publisher-trust-epochs.jsonl");
    const lines = fs.readFileSync(eventsFile, "utf8").trim().split("\n");
    fs.writeFileSync(eventsFile, lines[0] + "\n");
    const integrity = epochStore.verifyIntegrity();
    assert.equal(integrity.state, "held");
    assert.match(integrity.reason, /head_count_mismatch|head_epoch_hash_mismatch|head_record_hash_mismatch/);
    assert.throws(() => epochStore.currentTrustStore(), /publisher_trust_head_/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("epoch signed by an unpinned root is held", () => {
  const k = keys();
  const other = keys();
  const signed = signedEpoch({ epoch: 1, store: trust(k.publisherPublic), rootPrivate: other.rootPrivate, rootKeyId: "root-other" });
  const verified = verifyPublisherTrustEpoch({
    signedEpoch: signed,
    pinnedRootKeys: [{ key_id: "root-1", public_key_pem: k.rootPublic }],
    expectedEpoch: 1,
    expectedPreviousEpochHash: null,
  });
  assert.equal(verified.state, "held");
  assert.match(verified.reason, /root_not_pinned/);
});
