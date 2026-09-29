import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const b64u = (bytes) => Buffer.from(bytes).toString("base64url");
const fromB64u = (value) => new Uint8Array(Buffer.from(value, "base64url"));

const apiKeyId = "PKTESTKEY12345678";
const apiSecret = "alpaca-live-secret-example-1234567890";
const handoffId = webcrypto.randomUUID();
const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
const iv = webcrypto.getRandomValues(new Uint8Array(12));
const aadText = "evercraft.raven.emergency-handoff.v1:" + handoffId;
const cryptoKey = await webcrypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
const plaintext = encoder.encode(JSON.stringify({
  provider: "alpaca",
  environment: "live",
  label: "daytrade-lens",
  api_key_id: apiKeyId,
  api_secret: apiSecret,
}));
const ciphertext = await webcrypto.subtle.encrypt({
  name: "AES-GCM",
  iv,
  additionalData: encoder.encode(aadText),
  tagLength: 128,
}, cryptoKey, plaintext);

const envelope = {
  schema: "evercraft.raven.emergency-handoff.v1",
  handoff_id: handoffId,
  created_at: new Date().toISOString(),
  provider: "alpaca",
  environment: "live",
  label: "daytrade-lens",
  encryption: {
    algorithm: "AES-256-GCM",
    iv: b64u(iv),
    aad: b64u(encoder.encode(aadText)),
    ciphertext: b64u(ciphertext),
  },
  plaintext_in_envelope: false,
};
const packageText = "RAVEN1." + b64u(encoder.encode(JSON.stringify(envelope)));
const recoveryText = "RAVEN-KEY1." + b64u(rawKey);

assert.equal(packageText.includes(apiKeyId), false);
assert.equal(packageText.includes(apiSecret), false);
assert.equal(recoveryText.includes(apiKeyId), false);
assert.equal(recoveryText.includes(apiSecret), false);

const decodedEnvelope = JSON.parse(decoder.decode(fromB64u(packageText.slice(7))));
const decrypted = await webcrypto.subtle.decrypt({
  name: "AES-GCM",
  iv: fromB64u(decodedEnvelope.encryption.iv),
  additionalData: fromB64u(decodedEnvelope.encryption.aad),
  tagLength: 128,
}, cryptoKey, fromB64u(decodedEnvelope.encryption.ciphertext));
const recovered = JSON.parse(decoder.decode(decrypted));
assert.equal(recovered.api_key_id, apiKeyId);
assert.equal(recovered.api_secret, apiSecret);

const tampered = fromB64u(decodedEnvelope.encryption.ciphertext);
tampered[0] ^= 1;
await assert.rejects(() => webcrypto.subtle.decrypt({
  name: "AES-GCM",
  iv: fromB64u(decodedEnvelope.encryption.iv),
  additionalData: fromB64u(decodedEnvelope.encryption.aad),
  tagLength: 128,
}, cryptoKey, tampered));

console.log(JSON.stringify({
  ok: true,
  schema: "evercraft.raven.emergency-handoff-proof.v1",
  algorithm: "AES-256-GCM",
  plaintext_in_handoff: false,
  tamper_detection: true,
  separate_recovery_key: true,
}));
