import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {startNodeSeed} from '../systemia/compute/node-seed.mjs';
import {startOutboundCapacityBroker} from '../systemia/network/outbound-capacity-broker.mjs';
import {startOutboundNodeAgent} from '../systemia/network/outbound-node-agent.mjs';
import {AmbientWorkQueue} from '../systemia/saban/ambient-work-queue.mjs';
import {runSabanSplitIdentityCycle} from '../systemia/saban/split-identity-cycle-runner.mjs';
import {runYardSplitIdentityConsumeOnce} from '../systemia/yard/split-identity-request-consumer.mjs';
import {readSplitIdentityRequests,publishSplitIdentityOutcome} from '../systemia/saban/split-identity-handoff.mjs';
import {importSplitIdentityCapacity,publishSplitIdentityCapacity} from '../systemia/saban/split-identity-capacity.mjs';

const NODE='split-cycle-proof-worker';
const BROKER='split-cycle-proof-broker';
const ROUTE_HASH='sha256:'+'b'.repeat(64);

function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-split-cycle-'));
  const sabanRoot=path.join(root,'saban-private');
  const yardStateDir=path.join(root,'yard-private');
  const mailboxRoot=path.join(root,'mailbox');
  const journalRoot=path.join(yardStateDir,'claims');
  for(const p of [sabanRoot,yardStateDir,mailboxRoot])fs.mkdirSync(p,{recursive:true,mode:0o700});
  fs.mkdirSync(path.join(mailboxRoot,'requests'),{mode:0o750});
  fs.mkdirSync(path.join(mailboxRoot,'outcomes'),{mode:0o750});
  fs.mkdirSync(path.join(mailboxRoot,'capacity'),{mode:0o750});
  return {root,sabanRoot,yardStateDir,mailboxRoot,journalRoot,
    queue:new AmbientWorkQueue({root:path.join(sabanRoot,'work-queue')})};
}
function inventory(capacity,fingerprint){
  return {schema:'evercraft.yard.remote-capacity-nodes.v1',count:1,
    nodes:[{
      node_id:NODE,device_fingerprint:fingerprint,connected:true,
      last_seen_at:new Date().toISOString(),
      capacity:{
        ...capacity,
        device_fingerprint:fingerprint,
        authorized:true,session_attestation_verified:true,attestation_supported:true,
        zero_cost:true,placement_labels:['operator-authorized','outbound-only'],
        supported_workloads:['systemia.content-hash.v1'],
        public_ingress:false,
      },
    }],
  };
}
function fakeYard({origin,capacity,grant,fingerprint}){
  let grants=0,checks=0;
  const activeInventory=inventory(capacity,fingerprint);
  return {
    async verifyPublicRoute(id,options){
      assert.equal(id,BROKER);
      assert.equal(options.origin,origin);
      assert.equal(options.allowLoopbackProof,true);
      checks++;
      return {scope:'loopback_proof',origin,
        verification:'instance_and_deployment_receipt_match',
        receipt_hash:ROUTE_HASH};
    },
    async listRemoteCapacityNodes(id){
      assert.equal(id,BROKER);return activeInventory;
    },
    async remoteCapacityGrant(id,nodeId,options){
      assert.equal(id,BROKER);
      assert.equal(nodeId,NODE);
      assert.equal(options.allowLoopbackProof,true);
      grants++;
      return {...grant,node_id:NODE,broker_origin:origin,
        device_fingerprint:fingerprint,route_scope:'loopback_proof',
        public_route_receipt_hash:ROUTE_HASH};
    },
    stats(){return {grants,checks};},
  };
}
function consume(x,origin,yard){
  return runYardSplitIdentityConsumeOnce({
    yardStateDir:x.yardStateDir,mailboxRoot:x.mailboxRoot,
    journalRoot:x.journalRoot,brokerDeploymentId:BROKER,
    brokerLoopbackOrigin:origin,yardOperator:yard,
    publishCapacity:true,maxRequests:4,
  });
}

test('unattended two-account round-trip: fresh capacity, Saban plan, Yard broker, verified Saban receipt',async()=>{
  const x=fixture(),token='split-cycle-test-local-allocator';
  let seed,broker,agent;
  try{
    seed=await startNodeSeed({
      root:path.join(x.root,'compute'),nodeId:NODE,
      host:'127.0.0.1',port:0,advertiseHost:'127.0.0.1',
      allocatorToken:token,announce:false,
    });
    broker=await startOutboundCapacityBroker({
      stateDir:path.join(x.root,'broker'),authorizedDevices:{[seed.device_fingerprint]:seed.node_id},
      pollWaitMs:75,commandTimeoutMs:8000,capacityFreshMs:1000,
    });
    agent=await startOutboundNodeAgent({
      brokerUrl:broker.endpoint,localCapacityEndpoint:seed.endpoint,
      localAllocatorToken:token,pollBackoffMs:25,
    });
    const grant=broker.controlGrant(NODE);
    assert.ok(grant?.allocator_token);
    const cap=await(await fetch(seed.endpoint+'/v1/capacity')).json();
    const yard=fakeYard({origin:broker.endpoint,capacity:cap,
      grant:{capacity_endpoint:grant.capacity_endpoint,
        allocator_token:grant.allocator_token},
      fingerprint:seed.device_fingerprint,
    });

    const work=x.queue.submit({
      workload_class:'systemia.content-hash.v1',
      idempotency_key:'autonomous-split-cycle-01',
      payload:{value:{task:'saban-yard-dispatch',sequence:1}},
      private_data:false,
    });
    // First Yard cycle is discover/announce. Saban cannot touch private Yard.
    const discover=await consume(x,broker.endpoint,yard);
    assert.equal(discover.safe_capacity_published,true);
    assert.equal(discover.completed,0);
    assert.equal(discover.considered,0);

    const sabanOne=await runSabanSplitIdentityCycle({
      sabanRoot:x.sabanRoot,mailboxRoot:x.mailboxRoot,maxJobs:4,dispatchQueued:true,
    });
    assert.equal(sabanOne.status,'active');
    assert.equal(sabanOne.fresh_capacity_accepted,true);
    assert.equal(sabanOne.created_handoffs,1);
    assert.equal(sabanOne.published_requests,1);
    assert.equal(x.queue.get(work.job_id).state,'handoff_wait');
    const request=readSplitIdentityRequests({mailboxRoot:x.mailboxRoot});
    assert.equal(request.length,1);

    const compute=await consume(x,broker.endpoint,yard);
    assert.equal(compute.completed,1);
    assert.equal(compute.verification_hold,0);

    const sabanTwo=await runSabanSplitIdentityCycle({
      sabanRoot:x.sabanRoot,mailboxRoot:x.mailboxRoot,maxJobs:4,dispatchQueued:true,
    });
    assert.equal(sabanTwo.imported_verified_results,1);
    assert.equal(sabanTwo.created_handoffs,0);
    assert.equal(x.queue.get(work.job_id).state,'completed');
    assert.equal(x.queue.get(work.job_id).execution_receipt.worker_receipt_verified,true);
    assert.equal(x.queue.get(work.job_id).execution_receipt.content_hash_verified,true);
    assert.match(x.queue.get(work.job_id).result.digest,/^sha256:[a-f0-9]{64}$/);

    const sabanThree=await runSabanSplitIdentityCycle({
      sabanRoot:x.sabanRoot,mailboxRoot:x.mailboxRoot,maxJobs:4,dispatchQueued:true,
    });
    assert.equal(sabanThree.imported_verified_results,0);
    assert.equal(sabanThree.published_requests,0);
    assert.equal(yard.stats().grants,1);
    assert.ok(yard.stats().checks>=2);

    const safeCapacity=fs.readFileSync(
      path.join(x.mailboxRoot,'capacity','nodeseed-capacity-inventory.json'),'utf8');
    const outcomes=fs.readFileSync(
      path.join(x.mailboxRoot,'outcomes',request[0].intent_id+'.json'),'utf8');
    for(const output of [safeCapacity,outcomes]){
      assert.doesNotMatch(output,new RegExp(token));
      assert.doesNotMatch(output,new RegExp(grant.allocator_token));
      assert.doesNotMatch(output,/"allocator_token"\s*:|"lease_token"\s*:|"control_token"\s*:/);
    }
  }finally{
    if(agent)await agent.close();
    if(broker)await broker.close();
    if(seed)await seed.close();
    fs.rmSync(x.root,{recursive:true,force:true});
  }
});

test('stale/future snapshot never authorizes dispatch, but previously received outcomes are still imported',()=>{
  const x=fixture();
  try{
    const capacity={
      protocol:'evercraft.capacity.v1',runtime:'Evercraft Compute',
      supported_workloads:['systemia.content-hash.v1'],device_fingerprint:'sha256:'+'a'.repeat(64),
    };
    publishSplitIdentityCapacity({
      mailboxRoot:x.mailboxRoot,
      inventory:inventory(capacity,capacity.device_fingerprint),
    });
    assert.throws(()=>importSplitIdentityCapacity({
      mailboxRoot:x.mailboxRoot,sabanRoot:x.sabanRoot,
      now:new Date(Date.now()+120_000),
    }),/split_capacity_snapshot_stale_or_future/);
    const job=x.queue.submit({
      workload_class:'systemia.content-hash.v1',
      idempotency_key:'stale-snapshot-must-hold',
      payload:{value:{stale:true}},
    });
    return runSabanSplitIdentityCycle({
      sabanRoot:x.sabanRoot,mailboxRoot:x.mailboxRoot,
      now:new Date(Date.now()+120_000),dispatchQueued:true,
    }).then(result=>{
      assert.equal(result.status,'held');
      assert.equal(result.created_handoffs,0);
      assert.equal(result.published_requests,0);
      assert.equal(x.queue.get(job.job_id).state,'queued');
    });
  }finally{
    // Cleanup occurs in the .then() below so async assertions can still read.
  }
});

test('malformed capacity and symlink substitution are refused',()=>{
  const x=fixture();
  try{
    const p=path.join(x.mailboxRoot,'capacity','nodeseed-capacity-inventory.json');
    fs.writeFileSync(p,JSON.stringify({
      schema:'evercraft.saban.nodeseed-safe-inventory.v1',
      source_schema:'evercraft.yard.remote-capacity-nodes.v1',
      nodes:[],count:0,authority_material_exposed:false,
      allocator_tokens_exposed:false,control_tokens_exposed:false,service_relay_tokens_exposed:false,
      sanitized_at:new Date().toISOString(),receipt_hash:'sha256:'+'0'.repeat(64),
    }));
    assert.throws(()=>importSplitIdentityCapacity({
      mailboxRoot:x.mailboxRoot,sabanRoot:x.sabanRoot,
    }),/split_capacity_receipt_hash_invalid/);
    fs.unlinkSync(p);
    fs.symlinkSync(path.join(x.root,'yard-private'),p);
    assert.throws(()=>importSplitIdentityCapacity({
      mailboxRoot:x.mailboxRoot,sabanRoot:x.sabanRoot,
    }));
  }finally{fs.rmSync(x.root,{recursive:true,force:true});}
});
