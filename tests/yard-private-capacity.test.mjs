import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startNodeSeed } from "../systemia/compute/node-seed.mjs";
import { YardOperator } from "../systemia/yard/operator.mjs";

test("Yard exposes freshly attested private capacity without leaking allocator authority",async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"yard-private-capacity-"));
  const seedRoot=path.join(root,"seed");
  const yardRoot=path.join(root,"yard");
  const allocatorToken="yard-private-proof-secret";
  let seed=null;
  const yard=new YardOperator({stateDir:yardRoot});

  try{
    seed=await startNodeSeed({
      root:seedRoot,
      nodeId:"yard-private-proof-node",
      host:"127.0.0.1",
      port:0,
      advertiseHost:"127.0.0.1",
      allocatorToken,
      placementLabels:[
        "private",
        "personal-compute",
        "persistent-storage",
      ],
      zeroCost:true,
      announce:false,
    });

    const anchor=await yard.deployRelease({
      deploymentId:"yard-private-anchor",
      releaseRef:"0123456789abcdef0123456789abcdef01234567",
      workloadClass:"systemia.fabric-local-mcp.v1",
      capacityEndpoint:seed.endpoint,
      allocatorToken,
      input:{port:0},
      rollbackTarget:"0123456789abcdef0123456789abcdef01234567",
      leaseTtlMs:120_000,
    });
    assert.equal(anchor.state,"ready");

    const inventory=await yard.listPrivateCapacityNodes();
    assert.equal(inventory.nodes.length,1);
    const node=inventory.nodes[0];
    assert.equal(node.node_id,"yard-private-proof-node");
    assert.equal(node.connected,true);
    assert.equal(node.capacity.protocol,"evercraft.capacity.v1");
    assert.equal(node.capacity.runtime,"Evercraft Compute");
    assert.equal(node.capacity.authorized,true);
    assert.equal(node.capacity.session_attestation_verified,true);
    assert.equal(node.capacity.zero_cost,true);
    assert.equal(node.capacity.placement_labels.includes("persistent-storage"),true);
    assert.equal(inventory.receipt.authority_material_exposed,false);
    assert.equal(inventory.receipt.capacity_endpoint_exposed,false);
    assert.equal(JSON.stringify(inventory).includes(allocatorToken),false);
    assert.equal(JSON.stringify(inventory).includes(seed.endpoint),false);

    const grant=await yard.privateCapacityGrant("yard-private-proof-node");
    assert.equal(grant.node_id,"yard-private-proof-node");
    assert.equal(grant.capacity_endpoint,seed.endpoint);
    assert.equal(grant.runtime_authority.allocator_token,allocatorToken);
    assert.equal(grant.authority_material_exposed,false);
    assert.equal(JSON.stringify(grant).includes(allocatorToken),false);
    assert.ok(grant.receipt_hash.startsWith("sha256:"));
  }finally{
    try{
      if(yard.deploymentStatus("yard-private-anchor")){
        await yard.stopDeployment("yard-private-anchor",{reason:"proof_complete"});
      }
    }catch{}
    if(seed){
      try{await seed.close();}catch{}
    }
    fs.rmSync(root,{recursive:true,force:true});
  }
});
