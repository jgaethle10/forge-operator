import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EvercraftIdentity } from "../identity/identity.mjs";
import { EvercraftPassport } from "../passport/passport.mjs";
import { startEvercraftComputeNode } from "./runtime-node.mjs";
import { startRavenPrivateRuntime } from "../raven/private-runtime.mjs";
import { createRavenTeamReviewExecutor } from "../raven/team-review-runtime.mjs";

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
  scopes: ["home.read", "home.systemia.read", "home.systemia.plan", "home.raven.execute", "home.yard.read", "home.network.read", "home.identity.sessions.manage"],
  starts_at: new Date(Date.now() - 1000).toISOString(),
  ends_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  max_delegation_depth: 1,
  authority_state: "verified_identity_authority",
  authority_receipt_ref: bootstrapped.receipt.receipt_hash,
});

const ravenToken = "home-compute-raven-control-token-01234567890123456789";
const ravenTokenFile = path.join(root, "private", "raven-control-token");
fs.mkdirSync(path.dirname(ravenTokenFile), { recursive: true, mode: 0o700 });
fs.writeFileSync(ravenTokenFile, ravenToken + "\n", { mode: 0o600 });

const teamReviewExecutor = createRavenTeamReviewExecutor({
  inferenceAdapter: {
    async infer({ role }) {
      return {
        text: role === "synthesis"
          ? "FINAL VERDICT: GO WITH CHANGES. Compute handoff verified."
          : "VERDICT: GO WITH CHANGES. Bounded proof lane " + role + ".",
        provider: "compute-proof-provider",
        provider_receipt: "provider-proof:" + role,
      };
    },
  },
});

let node;
let raven;
try {
  raven = await startRavenPrivateRuntime({
    stateDir: path.join(root, "private", "raven-state"),
    repoRoot: path.resolve("."),
    port: 0,
    controlToken: ravenToken,
    trustedSubjectRef: "user:owner-proof",
    teamReviewExecutor,
  });
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
        raven_work_url: raven.url,
        raven_work_token_file: ravenTokenFile,
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
  assert.equal(job.result.raven_readonly_execution_configured, true);
  assert.equal(job.result.raven_work_authority_exposed, false);
  assert.match(job.result.local_url, /^http:\/\/127\.0\.0\.1:/);

  const managedHealth = await fetch(node.endpoint + job.result.health_path).then((response) => response.json());
  assert.equal(managedHealth.ok, true);
  assert.equal(managedHealth.runtime, "Evercraft Compute");
  assert.equal(managedHealth.workload_class, "systemia.evercraft-home.v1");
  assert.equal(managedHealth.auth_mode, "passport");
  assert.equal(managedHealth.identity_login_configured, true);
  assert.equal(managedHealth.session_revocation_supported, true);
  assert.equal(managedHealth.provider_credential_vault_configured, true);
  assert.equal(managedHealth.signing_key_id, "primary");
  assert.equal(managedHealth.accepted_signing_key_count, 1);
  assert.equal(managedHealth.external_ai_required, false);
  assert.equal(managedHealth.legacy_provider_required, false);
  assert.equal(managedHealth.raven_readonly_execution_configured, true);
  assert.equal(JSON.stringify(managedHealth).includes(ravenToken), false);

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

  const ravenExecution = await fetch(job.result.local_url + "/api/raven/execute", {
    method: "POST",
    headers: {
      cookie: cookie.split(";")[0],
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message: "Review the Compute handoff before any external action.",
      lane: "operations",
    }),
  });
  // Home credentials and a private Raven bridge are not durable Systemia dispatch
  // authorization. The legacy executor must hold before provider invocation.
  assert.equal(ravenExecution.status, 409);
  const ravenExecutionBody = await ravenExecution.json();
  assert.equal(ravenExecutionBody.ok, false);
  assert.equal(ravenExecutionBody.state, "blocked");
  assert.equal(ravenExecutionBody.execution_performed, false);
  assert.equal(ravenExecutionBody.base44_required, false);
  assert.equal(ravenExecutionBody.external_side_effects_authorized, false);
  assert.equal(ravenExecutionBody.receipt.result, "held");
  assert.equal(ravenExecutionBody.receipt.durable_checkpoint_persisted, false);
  assert.equal(ravenExecutionBody.receipt.external_effect_verified, false);
  assert.equal(ravenExecutionBody.receipt.capability_key, "raven.nexus.readonly-team-review.v1");
  assert.equal(ravenExecutionBody.output, null);
  assert.equal(JSON.stringify(ravenExecutionBody).includes(ravenToken), false);

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
    provider_credential_vault_configured: managedHealth.provider_credential_vault_configured,
    raven_compute_handoff_verified: true,
    raven_secret_exposed: false,
    base44_required: false,
  }, null, 2));
} finally {
  if (node) await node.close();
  if (raven) await raven.close();
  if (previousSecret === undefined) delete process.env.EVERCRAFT_IDENTITY_SECRET;
  else process.env.EVERCRAFT_IDENTITY_SECRET = previousSecret;
  fs.rmSync(root, { recursive: true, force: true });
}
