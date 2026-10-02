import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {startEvercraftComputeNode} from '../systemia/compute/runtime-node.mjs';
import {AmbientWorkQueue} from '../systemia/saban/ambient-work-queue.mjs';
import {dispatchAmbientJobsOnce} from '../systemia/saban/ambient-job-dispatcher.mjs';
import {sanitizeNodeSeedInventory} from '../systemia/saban/nodeseed-inventory-ingest.mjs';
import {
  executeNodeSeedExecutionIntent,
} from '../systemia/saban/nodeseed-intent-executor.mjs';

function safeInventory(nodes){
  return sanitizeNodeSeedInventory({
    schema:'evercraft.yard.remote-capacity-nodes.v1',
    count:nodes.length,
    nodes,
  });
}
function writeInventory(root,nodes){
  fs.writeFileSync(
    path.join(root,'nodeseed-capacity-inventory.json'),
    JSON.stringify(safeInventory(nodes),null,2)+'\n',
    {mode:0o600}
  );
}
function brokerRow(node,capacity,{connected=true}={}){
  return {
    node_id:capacity.node_id,
    device_fingerprint:capacity.device_fingerprint,
    connected,
    last_seen_at:new Date().toISOString(),
    capacity:{
      ...capacity,
      authorized:true,
      session_attestation_verified:true,
      zero_cost:true,
      public_ingress:false,
      failure_domain:'failover-'+capacity.node_id,
      device_fingerprint:capacity.device_fingerprint,
    },
  };
}

test('Saban automatically replans a frozen NodeSeed job when selected node disappears before Yard grant',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-nodeseed-failover-'));
  const tokenA='failover-a-allocator';
  const tokenB='failover-b-allocator';
  const nodeA=await startEvercraftComputeNode({
    nodeId:'node-a',
    root:path.join(root,'node-a'),
    host:'127.0.0.1',
    port:0,
    allocatorToken:tokenA,
    placementLabels:['operator-authorized'],
    failureDomain:'failover-a',
    zeroCost:true,
  });
  const nodeB=await startEvercraftComputeNode({
    nodeId:'node-b',
    root:path.join(root,'node-b'),
    host:'127.0.0.1',
    port:0,
    allocatorToken:tokenB,
    placementLabels:['operator-authorized'],
    failureDomain:'failover-b',
    zeroCost:true,
  });
  try{
    const capA=await (await fetch(nodeA.endpoint+'/v1/capacity')).json();
    const capB=await (await fetch(nodeB.endpoint+'/v1/capacity')).json();
    const rowA=brokerRow(nodeA,capA);
    const rowB=brokerRow(nodeB,capB);
    writeInventory(root,[rowA,rowB]);

    const queue=new AmbientWorkQueue({root:path.join(root,'work-queue')});
    const job=queue.submit({
      workload_class:'systemia.content-hash.v1',
      payload:{value:{mission:'automatic-failover',sequence:1}},
      idempotency_key:'automatic-failover-job',
      resources:{cpu_units:0.05,memory_mb:64,storage_gb:0},
      private_data:false,
      preemptible:true,
      checkpointable:true,
    });

    const firstDispatch=await dispatchAmbientJobsOnce({
      root,
      gatewayUrl:'http://127.0.0.1:8791',
      gatewayToken:'not-used-for-nodeseed',
      maxJobs:4,
      now:new Date(),
    });
    assert.equal(firstDispatch.handoff_wait,1);
    const waitingA=queue.get(job.job_id);
    assert.equal(waitingA.state,'handoff_wait');
    assert.equal(waitingA.execution_receipt.node_id,'node-a');
    const intentA=waitingA.execution_receipt.intent_id;

    const yardAfterADeath={
      async listRemoteCapacityNodes(){
        return {
          schema:'evercraft.yard.remote-capacity-nodes.v1',
          count:2,
          nodes:[
            brokerRow(nodeA,capA,{connected:false}),
            rowB,
          ],
        };
      },
      async remoteCapacityGrant(){
        throw new Error('grant_must_not_be_issued_to_dead_node');
      },
    };
    const failedOver=await executeNodeSeedExecutionIntent({
      root,
      intentId:intentA,
      yard:yardAfterADeath,
      brokerDeploymentId:'broker-failover-proof',
      now:new Date(),
    });
    assert.equal(failedOver.status,'replan_required');
    const held=queue.get(job.job_id);
    assert.equal(held.state,'held');
    assert.equal(held.last_hold.reason,'selected_nodeseed_no_longer_eligible');

    writeInventory(root,[rowB]);
    const secondDispatch=await dispatchAmbientJobsOnce({
      root,
      gatewayUrl:'http://127.0.0.1:8791',
      gatewayToken:'not-used-for-nodeseed',
      maxJobs:4,
      now:new Date(),
    });
    assert.equal(secondDispatch.handoff_wait,1);
    const waitingB=queue.get(job.job_id);
    assert.equal(waitingB.state,'handoff_wait');
    assert.equal(waitingB.execution_receipt.node_id,'node-b');
    const intentB=waitingB.execution_receipt.intent_id;
    assert.notEqual(intentB,intentA);

    const yardB={
      async listRemoteCapacityNodes(){
        return {
          schema:'evercraft.yard.remote-capacity-nodes.v1',
          count:1,
          nodes:[rowB],
        };
      },
      async remoteCapacityGrant(_deploymentId,nodeId){
        assert.equal(nodeId,'node-b');
        return {
          node_id:'node-b',
          device_fingerprint:capB.device_fingerprint,
          capacity_endpoint:nodeB.endpoint,
          allocator_token:tokenB,
        };
      },
    };
    const completed=await executeNodeSeedExecutionIntent({
      root,
      intentId:intentB,
      yard:yardB,
      brokerDeploymentId:'broker-failover-proof',
      now:new Date(),
    });
    assert.equal(completed.status,'completed');

    const finalJob=queue.get(job.job_id);
    assert.equal(finalJob.state,'completed');
    assert.equal(finalJob.execution_receipt.node_id,'node-b');
    assert.match(finalJob.result.digest,/^sha256:[a-f0-9]{64}$/);

    const staleIntent=JSON.parse(fs.readFileSync(
      path.join(root,'nodeseed-execution-intents',intentA+'.json'),'utf8'
    ));
    const winningIntent=JSON.parse(fs.readFileSync(
      path.join(root,'nodeseed-execution-intents',intentB+'.json'),'utf8'
    ));
    assert.equal(staleIntent.state,'replan_required');
    assert.equal(winningIntent.state,'completed');
    for(const raw of [JSON.stringify(staleIntent),JSON.stringify(winningIntent)]){
      assert.doesNotMatch(raw,/failover-a-allocator|failover-b-allocator/);
      assert.doesNotMatch(raw,/"allocator_token"\s*:/);
      assert.doesNotMatch(raw,/"control_token"\s*:/);
    }
  }finally{
    await nodeA.close();
    await nodeB.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});
