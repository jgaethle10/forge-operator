import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { startEvercraftHomeServer } from "./server.mjs";

test("one-time owner claim bootstraps Evercraft Identity and Passport without an external identity provider", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evercraft-home-claim-"));
  const identityStateDir = path.join(root, "identity");
  const passportStateDir = path.join(root, "passport");
  const claimCode = "private-one-time-claim-code-proof";
  const claimSha256 = createHash("sha256").update(claimCode).digest("hex");
  let runtime;
  try {
    runtime = await startEvercraftHomeServer({
      port: 0,
      authMode: "passport",
      identitySecret: "owner-claim-proof-signing-secret-012345678901",
      identityStateDir,
      passportStateDir,
      credentialStateDir: path.join(root, "credentials"),
      cookieSecure: false,
      ownerClaimSha256: claimSha256,
      ownerSubjectRef: "user:claim-proof",
      ownerLogin: "jesse",
      ownerDisplayName: "Jesse",
      serviceOrigins: {},
    });

    let response = await fetch(runtime.url + "/api/bootstrap-status");
    let body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.state, "claim_required");
    assert.equal(body.external_identity_provider_required, false);

    response = await fetch(runtime.url + "/api/owner-claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ claim_code: "wrong-code", password: "this password is sufficiently long" }),
    });
    assert.equal(response.status, 401);

    response = await fetch(runtime.url + "/api/owner-claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ claim_code: claimCode, password: "this password is sufficiently long" }),
    });
    body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.state, "claimed");
    assert.equal(body.claim_reusable, false);
    assert.equal(body.external_identity_provider_used, false);

    response = await fetch(runtime.url + "/api/owner-claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ claim_code: claimCode, password: "another sufficiently long password" }),
    });
    assert.equal(response.status, 409);

    response = await fetch(runtime.url + "/api/bootstrap-status");
    body = await response.json();
    assert.equal(body.state, "claimed");
    assert.equal(body.claim_available, false);

    response = await fetch(runtime.url + "/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login: "jesse", password: "this password is sufficiently long" }),
    });
    body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.authority, "evercraft-identity+passport");
    assert.match(response.headers.get("set-cookie") || "", /evercraft_session=/);
  } finally {
    if (runtime) await runtime.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
