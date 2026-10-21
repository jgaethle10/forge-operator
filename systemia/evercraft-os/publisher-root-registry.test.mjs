import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { buildPublisherTrustStore } from "./package-trust.mjs";
import {
  buildPublisherRootRotationBody,
  signPublisherRootRotation,
  EvercraftOsPublisherRootRegistry,
} from "./publisher-root-registry.mjs";
import {
  buildPublisherTrustEpochBody,
  signPublisherTrustEpoch,
  EvercraftOsPublisherTrustEpochStore,
} from "./publisher-trust-epoch.mjs";

function temp() { return fs.mkdtempSync(path.join(os.tmpdir(), "evercraft-root-registry-")); }
function pair() {
  const p = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: p.publicKey.export({ type: "spki", format: "pem" }),
    privateKeyPem: p.privateKey.export({ type: "pkcs8", format: "pem" }),
  };
}
function trustStore() {
  const publisher = pair();
  return buildPublisherTrustStore({ keys: [{
    key_id: "publisher-key",
    publisher_ref: "publisher:evercraft",
    public_key_pem: publisher.publicKeyPem,
    allowed_products: ["aliev"],
  }]});
}
function rotation({ epoch, previous = null, fromId, fromKey, toId, toKey }) {
  const body = buildPublisherRootRotationBody({
    rotationEpoch: epoch,
    previousRotationHash: previous,
    fromRootKeyId: fromId,
    toRootKeyId: toId,
    toPublicKeyPem: toKey.publicKeyPem,
    issuedAt: new Date("2026-10-10T00:00:00Z"),
  });
  return signPublisherRootRotation({ body, fromPrivateKeyPem: fromKey.privateKeyPem, toPrivateKeyPem: toKey.privateKeyPem });
}
function epoch({ number, previous = null, store, rootId, rootKey }) {
  const body = buildPublisherTrustEpochBody({
    epoch: number,
    previousEpochHash: previous,
    trustStore: store,
    rootKeyId: rootId,
    issuedAt: new Date("2026-10-10T00:00:00Z"),
  });
  return signPublisherTrustEpoch({ body, privateKeyPem: rootKey.privateKeyPem });
}

test("dual-signed root rotation changes the only root authorized for new trust epochs", () => {
  const root = temp();
  try {
    const r1 = pair(), r2 = pair();
    const registry = new EvercraftOsPublisherRootRegistry({
      stateDir: root,
      bootstrapRootKeys: [{ key_id: "root-1", public_key_pem: r1.publicKeyPem }],
      bootstrapSigningRootId: "root-1",
    });
    assert.equal(registry.current().current_signing_root_id, "root-1");
    const signed = rotation({ epoch: 1, fromId: "root-1", fromKey: r1, toId: "root-2", toKey: r2 });
    const accepted = registry.accept(signed);
    assert.equal(accepted.state, "accepted");
    assert.equal(accepted.current_signing_root_id, "root-2");
    assert.equal(registry.current().all_root_keys.length, 2);
    assert.equal(registry.verifyIntegrity().state, "verified");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("old root cannot authorize a later rotation after handoff", () => {
  const root = temp();
  try {
    const r1 = pair(), r2 = pair(), r3 = pair();
    const registry = new EvercraftOsPublisherRootRegistry({
      stateDir: root,
      bootstrapRootKeys: [{ key_id: "root-1", public_key_pem: r1.publicKeyPem }],
    });
    const first = registry.accept(rotation({ epoch: 1, fromId: "root-1", fromKey: r1, toId: "root-2", toKey: r2 }));
    const staleOldRoot = rotation({ epoch: 2, previous: first.rotation_hash, fromId: "root-1", fromKey: r1, toId: "root-3", toKey: r3 });
    const rejected = registry.accept(staleOldRoot);
    assert.equal(rejected.state, "held");
    assert.match(rejected.reason, /from_not_current/);
    assert.equal(registry.current().current_signing_root_id, "root-2");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("rotation requires proof of possession from incoming root", () => {
  const root = temp();
  try {
    const r1 = pair(), r2 = pair(), attacker = pair();
    const registry = new EvercraftOsPublisherRootRegistry({
      stateDir: root,
      bootstrapRootKeys: [{ key_id: "root-1", public_key_pem: r1.publicKeyPem }],
    });
    const body = buildPublisherRootRotationBody({
      rotationEpoch: 1,
      fromRootKeyId: "root-1",
      toRootKeyId: "root-2",
      toPublicKeyPem: r2.publicKeyPem,
      issuedAt: new Date("2026-10-10T00:00:00Z"),
    });
    const forged = signPublisherRootRotation({
      body,
      fromPrivateKeyPem: r1.privateKeyPem,
      toPrivateKeyPem: attacker.privateKeyPem,
    });
    const rejected = registry.accept(forged);
    assert.equal(rejected.state, "held");
    assert.match(rejected.reason, /new_possession_invalid/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("root registry detects rotation history truncation", () => {
  const root = temp();
  try {
    const r1 = pair(), r2 = pair(), r3 = pair();
    const registry = new EvercraftOsPublisherRootRegistry({
      stateDir: root,
      bootstrapRootKeys: [{ key_id: "root-1", public_key_pem: r1.publicKeyPem }],
    });
    const first = registry.accept(rotation({ epoch: 1, fromId: "root-1", fromKey: r1, toId: "root-2", toKey: r2 }));
    registry.accept(rotation({ epoch: 2, previous: first.rotation_hash, fromId: "root-2", fromKey: r2, toId: "root-3", toKey: r3 }));
    const file = path.join(root, "publisher-root-rotations.jsonl");
    const lines = fs.readFileSync(file, "utf8").trim().split("\n");
    fs.writeFileSync(file, lines[0] + "\n");
    const integrity = registry.verifyIntegrity();
    assert.equal(integrity.state, "held");
    assert.match(integrity.reason, /head_count_mismatch|head_rotation_hash_mismatch|head_record_hash_mismatch/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("trust epochs bind to root-registry checkpoint so retired root cannot sign a newer epoch", () => {
  const root = temp();
  try {
    const r1 = pair(), r2 = pair();
    const registry = new EvercraftOsPublisherRootRegistry({
      stateDir: path.join(root, "roots"),
      bootstrapRootKeys: [{ key_id: "root-1", public_key_pem: r1.publicKeyPem }],
    });
    const epochs = new EvercraftOsPublisherTrustEpochStore({
      stateDir: path.join(root, "epochs"),
      rootRegistry: registry,
    });
    const store1 = trustStore();
    const one = epochs.accept(epoch({ number: 1, store: store1, rootId: "root-1", rootKey: r1 }));
    assert.equal(one.state, "accepted");

    const rot = registry.accept(rotation({ epoch: 1, fromId: "root-1", fromKey: r1, toId: "root-2", toKey: r2 }));
    assert.equal(rot.state, "accepted");
    const store2 = trustStore();
    const stale = epochs.accept(epoch({ number: 2, previous: one.epoch_hash, store: store2, rootId: "root-1", rootKey: r1 }));
    assert.equal(stale.state, "held");
    assert.match(stale.reason, /root_not_current/);

    const two = epochs.accept(epoch({ number: 2, previous: one.epoch_hash, store: store2, rootId: "root-2", rootKey: r2 }));
    assert.equal(two.state, "accepted");
    assert.equal(epochs.current().epoch, 2);
    assert.equal(epochs.verifyIntegrity().state, "verified");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
