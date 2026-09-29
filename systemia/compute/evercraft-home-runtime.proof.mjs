import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EvercraftIdentity } from "../identity/identity.mjs";
import { EvercraftPassport } from "../passport/passport.mjs";
import { startEvercraftComputeNode } from "./runtime-node.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "evercraft-home-compute-"));
const identityStateDir = path.join(root, "identity");
const passportStateDir = path.join(root, "passport");
fs.mkdirSync(identityStateDir, { recursive: true, mode: 0o700 });
fs.mkdirSync(passportStateDir, { recursive: true, mode: 0o700 });

const signingSecret = "proof-only-evercraft-home-secret-0123456789";
const previousSecret = process.env.EVERCRAFT_IDENTITY_SECRET;
process.env.EVERCRAFT_IDENTITY_SECRET = signingSecret;

const identity = new EvercraftIdentity({ stateDir: identityStateDir });
const bootstrapped = identity.bootstrapOwner({
  subjectRef: "user:owner-proof",
  login: "owner",
  displayName: "Owner",
  password: "proof password long enough for owner 2026",
  authorityReceiptRef: "manual:proof-owner-bootstrap",
});

const passport = new EvercraftPassport({ stateDir: passportStateDir });
passport.issueGrant({
  idempotency_key: "home-proof-owner",
  subject_ref: "user:owner-proof",
  issuer_ref: "evercraft:identity-authority",
  product: "evercraft-home",
  scopes: ["home.read", "home.systemia.read", "home.systemia.plan", "home.yard.read", "home.network.read", "home.identity.sessions.manage"],
  starts_at: new Date(Date.now() - 1000).toISOString(),
  ends_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  max_delegation_depth: 1,
  authority_state: "verified_identity_authority",
  authority_receipt_ref: bootstrapped.receipt.receipt_hash,
});

let node;
try {
  node = await startEvercraftComputeNode({
    nodeId: "evercraft-home-proof-node",
    root,
    host: "127.0.0.1",
    port: 0,
    leaseTtlMs: 60_000,
  });

  const capacity = await fetch(node.endpoint + "/v1/capacity").then((response) => response.json());
  assert.equal(capacity.protocol, "evercraft.capacity.v1");
  assert.ok(capacity.supported_workloads.includes("systemia.evercraft-home.v1"));

  const leaseResponse = await fetch(node.endpoint + "/v1/leases", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workload_class: "systemia.evercraft-home.v1",
      requested_ttl_ms: 60_000,
    }),
  });
  assert.equal(leaseResponse.status, 201);
  const lease = await leaseResponse.json();

  const jobResponse = await fetch(node.endpoint + "/v1/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      lease_id: lease.lease_id,
      token: lease.token,
      workload_class: "systemia.evercraft-home.v1",
      input: {
        identity_state_dir: identityStateDir,
        passport_state_dir: passportStateDir,
      },
    }),
  });
  assert.equal(jobResponse.status, 200);
  const job = await jobResponse.json();

  assert.equal(job.ok, true);
  assert.equal(job.result.workload_class, "systemia.evercraft-home.v1");
  assert.equal(job.result.auth_mode, "passport");
  assert.equal(job.result.private_origin_only, true);
  assert.equal(job.result.provider_independent_boot, true);
  assert.match(job.result.local_url, /^http:\/\/127\.0\.0\.1:/);

  const managedHealth = await fetch(node.endpoint + job.result.health_path).then((response) => response.json());
  assert.equal(managedHealth.ok, true);
  assert.equal(managedHealth.runtime, "Evercraft Compute");
  assert.equal(managedHealth.workload_class, "systemia.evercraft-home.v1");
  assert.equal(managedHealth.auth_mode, "passport");
  assert.equal(managedHealth.identity_login_configured, true);
  assert.equal(managedHealth.session_revocation_supported, true);
  assert.equal(managedHealth.signing_key_id, "primary");
  assert.equal(managedHealth.accepted_signing_key_count, 1);
  assert.equal(managedHealth.external_ai_required, false);
  assert.equal(managedHealth.legacy_provider_required, false);

  const directHealth = await fetch(job.result.local_url + "/api/health").then((response) => response.json());
  assert.equal(directHealth.ok, true);
  assert.equal(directHealth.authority, "evercraft");
  assert.equal(directHealth.auth_mode, "passport");

  const denied = await fetch(job.result.local_url + "/api/session");
  assert.equal(denied.status, 401);
  assert.equal((await denied.json()).state, "session_required");

  const login = await fetch(job.result.local_url + "/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      login: "owner",
      password: "proof password long enough for owner 2026",
    }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie");
  assert.ok(cookie);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(cookie, /Secure/i);

  const authenticated = await fetch(job.result.local_url + "/api/session", {
    headers: { cookie: cookie.split(";")[0] },
  });
  assert.equal(authenticated.status, 200);
  const session = await authenticated.json();
  assert.equal(session.ok, true);
  assert.equal(session.subject, "user:owner-proof");
  assert.equal(session.authority, "evercraft-identity+passport");

  const logout = await fetch(job.result.local_url + "/api/logout", {
    method: "POST",
    headers: { cookie: cookie.split(";")[0] },
  });
  assert.equal(logout.status, 200);
  const revokedSession = await fetch(job.result.local_url + "/api/session", {
    headers: { cookie: cookie.split(";")[0] },
  });
  assert.equal(revokedSession.status, 401);
  assert.equal((await revokedSession.json()).state, "session_revoked");

  const release = await fetch(node.endpoint + "/v1/leases/" + lease.lease_id + "/release", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: lease.token }),
  });
  assert.equal(release.status, 200);

  console.log(JSON.stringify({
    ok: true,
    schema: "evercraft.home.compute-proof.v1",
    workload_class: job.result.workload_class,
    private_origin_only: job.result.private_origin_only,
    auth_mode: job.result.auth_mode,
    owner_login_verified: true,
    server_side_logout_verified: true,
    provider_independent_boot: job.result.provider_independent_boot,
  }, null, 2));
} finally {
  if (node) await node.close();
  if (previousSecret === undefined) delete process.env.EVERCRAFT_IDENTITY_SECRET;
  else process.env.EVERCRAFT_IDENTITY_SECRET = previousSecret;
  fs.rmSync(root, { recursive: true, force: true });
}
