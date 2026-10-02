import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {startEvercraftComputeNode} from '../systemia/compute/runtime-node.mjs';
import {AmbientWorkQueue} from '../systemia/saban/ambient-work-queue.mjs';
import {dispatchAmbientJobsOnce} from '../systemia/saban/ambient-job-dispatcher.mjs';
import {sanitizeNodeSeedInventory} from '../systemia/saban/nodeseed-inventory-ingest.mjs';
import {drainNodeSeedExecutionIntents} from '../systemia/saban/nodeseed-intent-executor.mjs';

test('ambient Saban job can flow through secret-free NodeSeed intent and short-lived Yard grant',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-nodeseed-intent-e2e-'));
  const nodeRoot=path.join(root,'node');
  const allocatorToken='intent-e2e-allocator-token';
  const node=await startEvercraftComputeNode({
    nodeId:'evercraft-intent-node',
    root:nodeRoot,
    host:'127.0.0.1',
    port:0,
    allocatorToken,
    placementLabels:['operator-authorized'],
    failureDomain:'intent-domain-b',
    zeroCost:true,
  });
  try{
    const capacity=await (await fetch(node.endpoint+'/v1/capacity')).json();
    assert.ok(capacity.supported_workloads.includes('systemia.content-hash.v1'));

    const fingerprint='sha256:'+'e'.repeat(64);
    const brokerNode={
      node_id:'evercraft-intent-node',
      device_fingerprint:fingerprint,
      connected:true,
      last_seen_at:new Date().toISOString(),
      capacity:{
        ...capacity,
        authorized:true,
        session_attestation_verified:true,
        device_fingerprint:fingerprint,
        failure_domain:'intent-domain-b',
        zero_cost:true,
        public_ingress:false,
      },
    };
    const yardInventory={
      schema:'evercraft.yard.remote-capacity-nodes.v1',
      count:1,
      nodes:[brokerNode],
    };
    const safe=sanitizeNodeSeedInventory(yardInventory);
    fs.writeFileSync(
      path.join(root,'nodeseed-capacity-inventory.json'),
      JSON.stringify(safe,null,2)+'\n',
      {mode:0o600}
    );

    const queue=new AmbientWorkQueue({root:path.join(root,'work-queue')});
    const job=queue.submit({
      workload_class:'systemia.content-hash.v1',
      payload:{value:{evercraft:'saban-intent-e2e',n:42}},
      idempotency_key:'intent-e2e-job',
      resources:{cpu_units:0.05,memory_mb:64,storage_gb:0},
      private_data:false,
      preemptible:true,
      checkpointable:true,
    });

    const dispatch=await dispatchAmbientJobsOnce({
      root,
      gatewayUrl:'http://127.0.0.1:8791',
      gatewayToken:'unused-because-nodeseed-wins',
      maxJobs:4,
      now:new Date(),
    });
    assert.equal(dispatch.handoff_wait,1);
    assert.equal(dispatch.completed,0);
    const afterDispatch=queue.get(job.job_id);
    assert.equal(afterDispatch.state,'handoff_wait');
    const intentId=afterDispatch.execution_receipt.intent_id;
    assert.ok(intentId);
    const intentRaw=fs.readFileSync(
      path.join(root,'nodeseed-execution-intents',intentId+'.json'),
      'utf8'
    );
    assert.doesNotMatch(intentRaw,/intent-e2e-allocator-token/);
    assert.doesNotMatch(intentRaw,/"payload"\s*:/);

    const yard={
      async listRemoteCapacityNodes(deploymentId){
        assert.equal(deploymentId,'broker-proof-deployment');
        return yardInventory;
      },
      async remoteCapacityGrant(deploymentId,nodeId){
        assert.equal(deploymentId,'broker-proof-deployment');
        assert.equal(nodeId,'evercraft-intent-node');
        return {
          node_id:nodeId,
          device_fingerprint:fingerprint,
          capacity_endpoint:node.endpoint,
          allocator_token:allocatorToken,
        };
      },
    };

    const drain=await drainNodeSeedExecutionIntents({
      root,
      yard,
      brokerDeploymentId:'broker-proof-deployment',
      maxIntents:4,
      now:new Date(),
    });
    assert.equal(drain.completed,1);
    assert.equal(drain.retry_wait,0);
    const done=queue.get(job.job_id);
    assert.equal(done.state,'completed');
    assert.match(done.result.digest,/^sha256:[a-f0-9]{64}$/);
    assert.equal(done.execution_receipt.mode,'nodeseed_yard_grant');
    assert.equal(done.execution_receipt.authority_material_persisted,false);

    const finalIntent=JSON.parse(fs.readFileSync(
      path.join(root,'nodeseed-execution-intents',intentId+'.json'),
      'utf8'
    ));
    assert.equal(finalIntent.state,'completed');
    assert.equal(finalIntent.allocator_token_persisted,false);
    assert.equal(finalIntent.control_token_persisted,false);
    assert.equal(finalIntent.payload_persisted,false);
  }finally{
    await node.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});
