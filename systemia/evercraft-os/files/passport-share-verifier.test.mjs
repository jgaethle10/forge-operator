import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EvercraftPassport } from "../../passport/passport.mjs";
import { buildOsFileShareIntent, evaluateOsFileShare } from "./share-gate.mjs";
import { createPassportFileShareVerifier } from "./passport-share-verifier.mjs";

const NOW = Date.parse("2026-10-16T18:00:00Z");
const actor = "subject:verified-operator";
const hash = "sha256:" + "f".repeat(64);
const publicIntent = () => buildOsFileShareIntent({
  artifactRef: "graphics:approved:shot-001",
  artifactSha256: hash,
  classification: "public_release",
  audience: "external_public_link",
  ttlSeconds: 600,
  purpose: "approved public clip"
});
const scopedIntent = (recipient = "recipient:client-01") => buildOsFileShareIntent({
  artifactRef: "shipment:proposal-01",
  artifactSha256: hash,
  classification: "recipient_delivery",
  audience: "external_scoped_link",
  recipientRef: recipient,
  ttlSeconds: 600,
  purpose: "authorized customer delivery"
});
function fixture(intent = publicIntent(), { subject = actor, grantResource = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "os-file-passport-"));
  const passport = new EvercraftPassport({ stateDir: root });
  const scope = intent.audience === "external_public_link" ? "files.share_public" : "files.share_scoped";
  const resource = grantResource || "os-file:" + intent.artifact_ref;
  const grant = passport.issueGrant({
    idempotency_key: "files-grant:" + resource,
    subject_ref: subject,
    issuer_ref: "proof:trusted-identity",
    product: "evercraft-os",
    scopes: [scope],
    resource_refs: [resource],
    starts_at: new Date(NOW - 60_000).toISOString(),
    ends_at: new Date(NOW + 3600_000).toISOString(),
    max_delegation_depth: 0,
    authority_state: "system_policy_authorized",
    authority_receipt_ref: "proof:verified-grant"
  }).grant;
  const permit = passport.mintActionPermit({
    idempotency_key: "files-permit:" + resource,
    grant_id: grant.grant_id,
    actor_ref: subject,
    scope,
    resource_ref: resource,
    request_fingerprint: intent.request_fingerprint,
    minted_at: new Date(NOW).toISOString(),
    ttl_seconds: 300
  }).permit;
  return {
    passport, grant, permit, intent,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
    verifier: (who = subject) => createPassportFileShareVerifier({
      passport,
      actorRef: who,
      permitId: permit.permit_id,
      now: () => NOW + 1000
    })
  };
}
function proof(issuer, intent) {
  return async () => ({
    issuer, authorized: true, request_fingerprint: intent.request_fingerprint,
    artifact_sha256: intent.artifact_sha256, audience: intent.audience,
    recipient_ref: intent.recipient_ref, checked_at: new Date(NOW + 1000).toISOString(),
    expires_at: new Date(NOW + 90_000).toISOString(), independently_verified: true
  });
}
test("real Passport grant and permit are validated before READY_FOR_LINK_ISSUANCE", async () => {
  const f = fixture();
  try {
    const verified = await f.verifier()(f.intent);
    assert.equal(verified.passport_permit_id, f.permit.permit_id);
    assert.equal(verified.permit_consumed, false);
    const state = await evaluateOsFileShare(f.intent, {
      passport: f.verifier(),
      systemia: proof("systemia", f.intent),
      shipping: proof("shipping", f.intent)
    }, { now: NOW + 1000 });
    assert.equal(state.state, "READY_FOR_LINK_ISSUANCE");
    assert.equal(state.link_created, false);
  } finally { f.cleanup(); }
});
test("non-granted actor cannot use the permit", async () => {
  const f = fixture();
  try {
    await assert.rejects(f.verifier("subject:intruder")(f.intent), /authorization_denied/);
  } finally { f.cleanup(); }
});
test("different file resource is not authorized", async () => {
  const f = fixture(publicIntent(), { grantResource: "os-file:different" });
  try {
    await assert.rejects(f.verifier()(f.intent), /authorization_denied/);
  } finally { f.cleanup(); }
});
test("revoking the grant immediately invalidates the sharing action", async () => {
  const f = fixture();
  try {
    f.passport.revokeGrant({
      idempotency_key: "revoke:one",
      grant_id: f.grant.grant_id,
      actor_ref: actor,
      authority_state: "subject_self_revocation",
      authority_receipt_ref: "proof:revoked",
      revoked_at: new Date(NOW + 500).toISOString()
    });
    await assert.rejects(f.verifier()(f.intent), /authorization_denied/);
  } finally { f.cleanup(); }
});
test("consumed one-time permit is not reusable", async () => {
  const f = fixture();
  try {
    f.passport.consumeActionPermit({
      idempotency_key: "use:one",
      permit_id: f.permit.permit_id,
      actor_ref: actor,
      request_fingerprint: f.intent.request_fingerprint,
      evidence_ref: "receipt:issued-link",
      consumed_at: new Date(NOW + 500).toISOString()
    });
    await assert.rejects(f.verifier()(f.intent), /permit_invalid/);
  } finally { f.cleanup(); }
});
test("recipient changes cannot borrow scoped approval", async () => {
  const intent = scopedIntent();
  const f = fixture(intent);
  try {
    const differentRecipient = scopedIntent("recipient:other");
    await assert.rejects(f.verifier()(differentRecipient), /permit_invalid/);
    const p = await f.verifier()(intent);
    assert.equal(p.recipient_ref, "recipient:client-01");
  } finally { f.cleanup(); }
});
test("actual Passport proof cannot override absent Shipping or Systemia approval", async () => {
  const f = fixture();
  try {
    const result = await evaluateOsFileShare(f.intent, { passport: f.verifier() }, { now: NOW + 1000 });
    assert.equal(result.state, "HOLD");
    assert.equal(result.reason, "independent_verifier_missing");
  } finally { f.cleanup(); }
});
