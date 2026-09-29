import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { EvercraftIdentity, IdentityRateLimiter } from "./identity.mjs";
import { verifyEvercraftSession } from "../evercraft-home/identity.mjs";

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), "evercraft-identity-"));

test("owner bootstrap stores only salted credential material", () => {
  const stateDir = temp();
  try {
    const identity = new EvercraftIdentity({ stateDir });
    const result = identity.bootstrapOwner({
      subjectRef: "user:owner",
      login: "owner",
      displayName: "Owner",
      password: "correct horse battery staple 2026",
      authorityReceiptRef: "manual:owner-bootstrap:001",
      createdAt: "2026-09-29T16:00:00Z",
    });
    assert.equal(result.state, "bootstrapped");
    const stored = identity.getSubject("user:owner");
    assert.equal(stored.credential.scheme, "scrypt-v1");
    assert.notEqual(stored.credential.hash, "correct horse battery staple 2026");
    assert.equal(JSON.stringify(stored).includes("correct horse battery staple 2026"), false);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test("valid credentials issue a Home-compatible signed session", () => {
  const stateDir = temp();
  try {
    const identity = new EvercraftIdentity({ stateDir });
    identity.bootstrapOwner({
      subjectRef: "user:owner",
      login: "owner",
      displayName: "Owner",
      password: "correct horse battery staple 2026",
      authorityReceiptRef: "manual:owner-bootstrap:001",
    });
    const authentication = identity.authenticatePassword({
      login: "owner",
      password: "correct horse battery staple 2026",
    });
    const issued = identity.issueSession(authentication, {
      signingSecret: "identity-test-signing-secret-0123456789",
      ttlSeconds: 900,
      now: new Date("2026-09-29T16:10:00Z"),
    });
    const verified = verifyEvercraftSession(
      issued.token,
      "identity-test-signing-secret-0123456789",
      { now: new Date("2026-09-29T16:11:00Z") }
    );
    assert.equal(verified.subject_ref, "user:owner");
    assert.equal(verified.display_name, "Owner");
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test("invalid credentials fail closed", () => {
  const stateDir = temp();
  try {
    const identity = new EvercraftIdentity({ stateDir });
    identity.bootstrapOwner({
      subjectRef: "user:owner",
      login: "owner",
      displayName: "Owner",
      password: "correct horse battery staple 2026",
      authorityReceiptRef: "manual:owner-bootstrap:001",
    });
    assert.throws(
      () => identity.authenticatePassword({ login: "owner", password: "wrong password that is long enough" }),
      /identity_credentials_invalid/
    );
    assert.throws(
      () => identity.authenticatePassword({ login: "missing", password: "wrong password that is long enough" }),
      /identity_credentials_invalid/
    );
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test("bootstrap is one-time and cannot silently replace the owner", () => {
  const stateDir = temp();
  try {
    const identity = new EvercraftIdentity({ stateDir });
    identity.bootstrapOwner({
      subjectRef: "user:owner",
      login: "owner",
      displayName: "Owner",
      password: "correct horse battery staple 2026",
      authorityReceiptRef: "manual:owner-bootstrap:001",
    });
    assert.throws(() => identity.bootstrapOwner({
      subjectRef: "user:attacker",
      login: "owner2",
      displayName: "Attacker",
      password: "another sufficiently long password 2026",
      authorityReceiptRef: "manual:bad",
    }), /identity_bootstrap_already_completed/);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test("rate limiter blocks repeated failures and clears on success", () => {
  const limiter = new IdentityRateLimiter({ maxFailures: 3, windowMs: 1000, blockMs: 5000 });
  limiter.assertAllowed("owner@127.0.0.1", 100);
  limiter.recordFailure("owner@127.0.0.1", 100);
  limiter.recordFailure("owner@127.0.0.1", 200);
  limiter.recordFailure("owner@127.0.0.1", 300);
  assert.throws(() => limiter.assertAllowed("owner@127.0.0.1", 400), /identity_login_rate_limited/);
  limiter.recordSuccess("owner@127.0.0.1");
  limiter.assertAllowed("owner@127.0.0.1", 500);
});
