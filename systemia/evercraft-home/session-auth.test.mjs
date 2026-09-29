import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHmac } from "node:crypto";
import { EvercraftPassport } from "../passport/passport.mjs";
import { authorizeEvercraftHome, verifyEvercraftSession } from "./identity.mjs";

function token(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return encoded + "." + signature;
}

test("signed Evercraft session plus Passport grant allows Home entry", () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "evercraft-home-passport-"));
  try {
    const passport = new EvercraftPassport({ stateDir });
    const now = new Date();
    const ends = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

    passport.issueGrant({
      idempotency_key: "home-test-owner",
      authority_state: "manual_authorized",
      authority_receipt_ref: "receipt:test-owner-authority",
      subject_ref: "user:owner-test",
      issuer_ref: "authority:test",
      product: "evercraft-home",
      scopes: ["home.read"],
      starts_at: new Date(now.getTime() - 1000).toISOString(),
      ends_at: ends,
    });

    const secret = "test-only-secret";
    const signed = token({
      schema: "evercraft.identity.session.v1",
      session_id: "session-owner-test",
      subject_ref: "user:owner-test",
      display_name: "Owner",
      issued_at: now.toISOString(),
      expires_at: ends,
      issuer_ref: "evercraft-identity:test",
    }, secret);

    const session = verifyEvercraftSession(signed, secret, { now });
    const decision = authorizeEvercraftHome(passport, session, { at: now.toISOString() });
    assert.equal(decision.decision, "allow");
    assert.equal(decision.subject_ref, "user:owner-test");
    assert.equal(decision.product, "evercraft-home");
    assert.equal(decision.scope, "home.read");
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test("valid identity without Passport authority is denied", () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "evercraft-home-passport-"));
  try {
    const passport = new EvercraftPassport({ stateDir });
    const now = new Date();
    const secret = "test-only-secret";
    const signed = token({
      schema: "evercraft.identity.session.v1",
      session_id: "session-no-grant",
      subject_ref: "user:no-grant",
      display_name: "No Grant",
      issued_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    }, secret);

    const session = verifyEvercraftSession(signed, secret, { now });
    assert.throws(() => authorizeEvercraftHome(passport, session, { at: now.toISOString() }), /home_access_denied/);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test("tampered and expired sessions fail closed", () => {
  const secret = "test-only-secret";
  const now = new Date();
  const signed = token({
    schema: "evercraft.identity.session.v1",
    session_id: "session-test",
    subject_ref: "user:test",
    display_name: "Test",
    issued_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 1000).toISOString(),
  }, secret);

  assert.throws(() => verifyEvercraftSession(signed + "x", secret, { now }), /session_signature_invalid/);
  assert.throws(() => verifyEvercraftSession(signed, secret, { now: new Date(now.getTime() + 2000) }), /session_expired/);
});
