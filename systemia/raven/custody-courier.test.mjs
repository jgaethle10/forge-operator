import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProviderCredentialVault } from "../evercraft-home/credential-vault.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_RAVEN_FIELDS,
  createPrivateReceiverSession,
  sealCustodyForReceiver,
} from "./custody-courier.mjs";

const makeFixture = () => Object.fromEntries(
  LEGACY_RAVEN_FIELDS.map((name, index) => [name, "SYNTHETIC_TEST_ONLY_" + index + "_NEVER_A_REAL_KEY"])
);

test("six legacy fields can be sealed without exposing plaintext", async () => {
  const receiver = await createPrivateReceiverSession({ now: 1000, ttlMs: 150000 });
  const sample = makeFixture();
  const envelope = await sealCustodyForReceiver(receiver.challenge, sample, { now: 1000 });
  const visible = JSON.stringify(envelope);
  assert.equal(envelope.field_count, 6);
  assert.equal(envelope.plaintext_echoed, false);
  assert.equal(visible.includes("SYNTHETIC_TEST_ONLY"), false);
  for (const value of Object.values(sample)) assert.equal(visible.includes(value), false);
  const unsealed = await receiver.consume(envelope, { now: 1001 });
  assert.deepEqual(unsealed, sample);
  await assert.rejects(() => receiver.consume(envelope, { now: 1002 }), /consumed/);
});

test("wrong challenge, expired offer and unrecognized fields fail closed", async () => {
  const a = await createPrivateReceiverSession({ now: 1000, ttlMs: 1000 });
  const b = await createPrivateReceiverSession({ now: 1000, ttlMs: 1000 });
  const fields = makeFixture();
  await assert.rejects(() => sealCustodyForReceiver(a.challenge, fields, { now: 3000 }), /unusable/);
  await assert.rejects(
    () => sealCustodyForReceiver(a.challenge, { "SECRET_THAT_IS_NOT_ALLOWLISTED": "TEST" }, { now: 1000 }),
    /invalid_custody_fields/,
  );
  const envelope = await sealCustodyForReceiver(a.challenge, fields, { now: 1000 });
  await assert.rejects(() => b.consume(envelope, { now: 1001 }), /mismatch/);
  await assert.rejects(() => a.consume(envelope, { now: 3000 }), /expired/);
});

test("altered encrypted payload is rejected without leaking source secrets", async () => {
  const receiver = await createPrivateReceiverSession({ now: 1000, ttlMs: 1000 });
  const envelope = await sealCustodyForReceiver(receiver.challenge, makeFixture(), { now: 1000 });
  const altered = { ...envelope, ciphertext: (envelope.ciphertext[0] === "A" ? "B" : "A") + envelope.ciphertext.slice(1) };
  await assert.rejects(() => receiver.consume(altered, { now: 1001 }));
});

test("oversized fields are rejected before any encryption or logging", async () => {
  const receiver = await createPrivateReceiverSession({ now: 1000, ttlMs: 1000 });
  await assert.rejects(
    () => sealCustodyForReceiver(receiver.challenge, {
      KAGGLE_API_TOKEN: "X".repeat(16385),
    }, { now: 1000 }),
    /invalid_custody_fields/,
  );
});

test("oversized or malformed encrypted envelopes are rejected before allocation", async () => {
  const receiver = await createPrivateReceiverSession({ now: 1000, ttlMs: 1000 });
  const envelope = await sealCustodyForReceiver(receiver.challenge, makeFixture(), { now: 1000 });
  await assert.rejects(() => receiver.consume({
    ...envelope, ciphertext: "A".repeat(131073),
  }, { now: 1001 }), /custody_envelope_invalid/);
  await assert.rejects(() => receiver.consume(envelope, { now: 1002 }), /consumed/);
});

test("metadata count cannot claim more than six source entries", async () => {
  const receiver = await createPrivateReceiverSession({ now: 1000, ttlMs: 1000 });
  const envelope = await sealCustodyForReceiver(receiver.challenge, makeFixture(), { now: 1000 });
  await assert.rejects(() => receiver.consume({
    ...envelope, field_count: 100,
  }, { now: 1001 }), /custody_envelope_invalid/);
});

test("synthetic six-field recovery can seal into an owned encrypted vault without plaintext files", async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "raven-custody-vault-proof-"));
  try {
    const session = await createPrivateReceiverSession({ now: 1000, ttlMs: 60000 });
    const fixture = makeFixture();
    const envelope = await sealCustodyForReceiver(session.challenge, fixture, { now: 1001 });
    const unsealed = await session.consume(envelope, { now: 1002 });
    // This maps fixture fields ONLY. There is no production importer or source-side
    // adapter; founder identity, source authentication and key mapping remain gates.
    const vault = new ProviderCredentialVault({ stateDir });
    const metadata = [];
    for (const field of LEGACY_RAVEN_FIELDS) {
      const received = vault.put({
        provider: "legacy-raven",
        environment: "live",
        label: field.toLowerCase(),
        apiKeyId: field,
        // Wrap values for the generic vault's 16-byte minimum; no plaintext file.
        apiSecret: JSON.stringify({ value: unsealed[field] }),
        actorRef: "synthetic-test-only",
      });
      metadata.push(received);
    }
    assert.equal(metadata.length, 6);
    assert.ok(metadata.every(item => item.secret_material_stored === true));
    assert.ok(metadata.every(item => item.secret_material_echoed === false));
    const encryptedFiles = fs.readdirSync(stateDir).filter(name => name.endsWith(".json"));
    assert.equal(encryptedFiles.length, 6);
    for (const file of encryptedFiles) {
      const contents = fs.readFileSync(path.join(stateDir, file), "utf8");
      for (const value of Object.values(fixture)) assert.equal(contents.includes(value), false);
      assert.equal(fs.statSync(path.join(stateDir, file)).mode & 0o777, 0o600);
    }
    const reopened = new ProviderCredentialVault({ stateDir, readOnly: true });
    for (const row of metadata) {
      const secret = reopened.readSecret(row.credential_ref);
      assert.equal(secret.api_key_id.length > 0, true);
      assert.equal(JSON.parse(secret.api_secret).value, fixture[secret.api_key_id]);
    }
    assert.equal(fs.statSync(stateDir).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(stateDir, ".vault-key")).mode & 0o777, 0o600);
    await assert.rejects(() => session.consume(envelope, { now: 1003 }), /consumed/);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});
