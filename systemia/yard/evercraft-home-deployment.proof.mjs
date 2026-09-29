import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startEvercraftComputeNode } from "../compute/runtime-node.mjs";
import { YardOperator } from "./operator.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "evercraft-home-yard-"));
const passportStateDir = path.join(root, "passport");
const yardStateDir = path.join(root, "yard");
fs.mkdirSync(passportStateDir, { recursive: true, mode: 0o700 });

const previousSecret = process.env.EVERCRAFT_IDENTITY_SECRET;
process.env.EVERCRAFT_IDENTITY_SECRET = "proof-only-evercraft-home-secret";

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

  console.log(JSON.stringify({
    ok: true,
    schema: "evercraft.home.yard-deployment-proof.v1",
    deployment_id: record.deployment_id,
    health_verification: record.receipt.health_verification,
    route_verification: record.receipt.route_verification,
    public_route_bound: false,
  }, null, 2));
} finally {
  if (node) await node.close();
  if (previousSecret === undefined) delete process.env.EVERCRAFT_IDENTITY_SECRET;
  else process.env.EVERCRAFT_IDENTITY_SECRET = previousSecret;
  fs.rmSync(root, { recursive: true, force: true });
}
