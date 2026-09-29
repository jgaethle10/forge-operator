import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EvercraftIdentity } from "../identity/identity.mjs";
import { EvercraftPassport } from "../passport/passport.mjs";
import { startEvercraftComputeNode } from "../compute/runtime-node.mjs";
import { YardOperator } from "./operator.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "evercraft-home-yard-"));
const identityStateDir = path.join(root, "identity");
const passportStateDir = path.join(root, "passport");
const yardStateDir = path.join(root, "yard");
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
  scopes: ["home.read", "home.systemia.read", "home.systemia.plan", "home.yard.read", "home.network.read"],
  starts_at: new Date(Date.now() - 1000).toISOString(),
  ends_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  max_delegation_depth: 1,
  authority_state: "verified_identity_authority",
  authority_receipt_ref: bootstrapped.receipt.receipt_hash,
});

let node;
try {
  node = await startEvercraftComputeNode({
    nodeId: "evercraft-home-yard-proof-node",
    root,
    host: "127.0.0.1",
    port: 0,
    leaseTtlMs: 60_000,
  });

  const yard = new YardOperator({ stateDir: yardStateDir });
  const record = await yard.deployRelease({
    deploymentId: "evercraft-home-proof",
    releaseRef: "a".repeat(40),
    workloadClass: "systemia.evercraft-home.v1",
    capacityEndpoint: node.endpoint,
    input: {
      identity_state_dir: identityStateDir,
      passport_state_dir: passportStateDir,
      yard_state_dir: yardStateDir,
    },
    rollbackTarget: "none:first_install",
    leaseTtlMs: 60_000,
  });

  assert.equal(record.state, "ready");
  assert.equal(record.result.workload_class, "systemia.evercraft-home.v1");
  assert.equal(record.result.auth_mode, "passport");
  assert.equal(record.result.private_origin_only, true);
  assert.equal(record.receipt.health_verification, "healthy");
  assert.equal(
    record.receipt.route_verification,
    "private_home_health_verified_public_route_unbound"
  );

  const verified = yard.verifyDeployment("evercraft-home-proof");
  assert.equal(verified.ok, true);
  assert.equal(verified.state, "verified");

  const edge = await yard.deployRelease({
    deploymentId: "evercraft-home-edge-proof",
    releaseRef: "b".repeat(40),
    workloadClass: "systemia.public-edge.v1",
    capacityEndpoint: node.endpoint,
    input: {
      mode: "proof_loopback",
      control_host: "127.0.0.1",
      control_port: 0,
    },
    rollbackTarget: "none:first_install",
    leaseTtlMs: 60_000,
  });
  assert.equal(edge.state, "ready");
  assert.equal(edge.receipt.health_verification, "healthy");

  const edgeClient = yard.publicRouteProviderClient("evercraft-home-edge-proof");
  const capabilities = await edgeClient.capabilities();
  assert.equal(capabilities.protocol, "evercraft.public-route.v1");
  assert.equal(capabilities.proof_only, true);

  const route = await edgeClient.createLease({
    upstream_origin: record.result.local_url,
    deployment_id: record.deployment_id,
    deployment_receipt_hash: record.receipt.receipt_hash,
    instance_id: record.result.instance_id,
    requested_hostname: "home-proof",
  });

  assert.match(route.origin, /^http:\/\/127\.0\.0\.1:/);
  const routedHealth = await fetch(route.origin + "/api/health").then((response) => response.json());
  assert.equal(routedHealth.ok, true);
  assert.equal(routedHealth.service, "evercraft-home");
  assert.equal(routedHealth.authority, "evercraft");
  assert.equal(routedHealth.auth_mode, "passport");

  const routedSession = await fetch(route.origin + "/api/session");
  assert.equal(routedSession.status, 401);

  const login = await fetch(route.origin + "/api/login", {
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

  const authenticated = await fetch(route.origin + "/api/session", {
    headers: { cookie: cookie.split(";")[0] },
  });
  assert.equal(authenticated.status, 200);
  const authenticatedBody = await authenticated.json();
  assert.equal(authenticatedBody.subject, "user:owner-proof");
  assert.equal(authenticatedBody.authority, "evercraft-identity+passport");

  const releasedRoute = await edgeClient.releaseLease(route.lease_id, "proof_complete");
  assert.equal(releasedRoute.released, true);

  console.log(JSON.stringify({
    ok: true,
    schema: "evercraft.home.yard-deployment-proof.v1",
    deployment_id: record.deployment_id,
    health_verification: record.receipt.health_verification,
    route_verification: record.receipt.route_verification,
    owner_login_verified_through_edge: true,
    public_route_bound: true,
    public_route_mode: "proof_loopback",
    trusted_public_dns_claimed: false,
  }, null, 2));
} finally {
  if (node) await node.close();
  if (previousSecret === undefined) delete process.env.EVERCRAFT_IDENTITY_SECRET;
  else process.env.EVERCRAFT_IDENTITY_SECRET = previousSecret;
  fs.rmSync(root, { recursive: true, force: true });
}
