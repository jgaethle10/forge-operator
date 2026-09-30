import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readNetworkOverview, readYardOverview } from "./operations-adapter.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

test("Yard overview sanitizes persisted deployment state and ignores secrets", () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"evercraft-yard-view-"));
  try{
    fs.mkdirSync(path.join(dir,".lease-secrets"),{recursive:true});
    fs.writeFileSync(path.join(dir,".lease-secrets","dep-1.json"),JSON.stringify({token:"SUPER-SECRET"}));
    fs.writeFileSync(path.join(dir,"dep-1.json"),JSON.stringify({
      deployment_id:"dep-1",
      state:"ready",
      updated_at:"2026-09-28T20:00:00Z",
      receipt:{
        workload_class:"systemia.private-core-origin.v1",
        runtime_fabric:"Evercraft Compute",
        capacity_node_id:"node-001",
        receipt_hash:"receipt:deployment-1",
        health_verification:"healthy",
        route_verification:"private_route_verified"
      }
    }));

    const result=readYardOverview(dir);
    assert.equal(result.state,"observed_local_state");
    assert.equal(result.summary.deployments,1);
    assert.equal(result.summary.ready,1);
    assert.equal(result.deployments[0].deployment_id,"dep-1");
    assert.equal(result.deployments[0].health_verification,"healthy");
    assert.equal(result.deployments[0].route_verification,"private_route_verified");
    assert.equal(JSON.stringify(result).includes("SUPER-SECRET"),false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test("Network overview stays on evidence-safe public declarations", () => {
  const result=readNetworkOverview(repoRoot);
  assert.equal(result.schema,"evercraft.home.network-overview.v1");
  assert.equal(result.product_key,"evercraft-network");
  assert.match(result.evidence_semantics,/not private node telemetry/i);
  assert.equal(JSON.stringify(result).includes("network-control.base44.app"),false);
});
