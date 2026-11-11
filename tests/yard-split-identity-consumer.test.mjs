import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {startNodeSeed} from '../systemia/compute/node-seed.mjs';
import {startOutboundCapacityBroker} from '../systemia/network/outbound-capacity-broker.mjs';
import {startOutboundNodeAgent} from '../systemia/network/outbound-node-agent.mjs';
import {AmbientWorkQueue} from '../systemia/saban/ambient-work-queue.mjs';
import {createNodeSeedExecutionIntent} from '../systemia/saban/nodeseed-execution-intent.mjs';
import {
  publishSplitIdentityRequests,readSplitIdentityRequests,
  importSplitIdentityOutcomes,
} from '../systemia/saban/split-identity-handoff.mjs';
import {runYardSplitIdentityConsumeOnce} from '../systemia/yard/split-identity-request-consumer.mjs';

const NODE='split-consumer-proof-node';
const BROKER='split-consumer-proof-deployment';
const RECEIPT='sha256:'+'b'.repeat(64);
function setup(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-yard-split-consumer-'));
  const sabanRoot=path.join(root,'saban');
  const mailboxRoot=path.join(root,'mailbox');
  const yardStateDir=path.join(root,'yard');
  const journalRoot=path.join(yardStateDir,'claims');
  for(const p of [sabanRoot,mailboxRoot,yardStateDir])
    fs.mkdirSync(p,{recursive:true,mode:0o700});
  fs.mkdirSync(path.join(mailboxRoot,'requests'),{mode:0o750});
  fs.mkdirSync(path.join(mailboxRoot,'outcomes'),{mode:0o750});
  const queue=new AmbientWorkQueue({root:path.join(sabanRoot,'work-queue')});
  const job=queue.submit({workload_class:'systemia.content-hash.v1',
    idempotency_key:'yard-verified-consumer-proof',
    payload:{value:{mission:'split-identity-compute',sequence:1}},
    private_data:false,
  });
  const intent=createNodeSeedExecutionIntent({root:sabanRoot,job,
    task:{schema:'evercraft.saban.fabric-task.v1',resources_per_execution:job.resources},
    placement:{market:'evercraft-nodeseed',provider_id:NODE,unit_id:'unit-1',offer_id:'nodeseed:'+NODE},
    plan:{receipt_hash:'sha256:proof'},
  });
  queue.update(job.job_id,{state:'handoff_wait'});
  const published=publishSplitIdentityRequests({sabanRoot,mailboxRoot});
  assert.equal(published.published,1);
  return {root,sabanRoot,mailboxRoot,yardStateDir,journalRoot,queue,job,intent};
}
function fakeYard({origin,seed,grant,routeValid=true}){
  let grants=0,verifications=0;
  const inventory={schema:'evercraft.yard.remote-capacity-nodes.v1',
    nodes:[{
      node_id:NODE,
      device_fingerprint:seed.device_fingerprint,
      connected:true,
      capacity:{
        protocol:'evercraft.capacity.v1',runtime:'Evercraft Compute',
        authorized:true,session_attestation_verified:true,
        zero_cost:true,
        device_fingerprint:seed.device_fingerprint,
        supported_workloads:['systemia.content-hash.v1'],
      },
    }],
  };
  return {
    async verifyPublicRoute(id,options){
      assert.equal(id,BROKER);
      assert.equal(options.origin,origin);
      assert.equal(options.allowLoopbackProof,true);
      verifications++;
      return {
        scope:'loopback_proof',
        origin:routeValid?origin:'http://127.0.0.1:1',
        verification:'instance_and_deployment_receipt_match',
        receipt_hash:RECEIPT,
      };
    },
    async listRemoteCapacityNodes(id){assert.equal(id,BROKER);return inventory;},
    async remoteCapacityGrant(id,nodeId,options){
      assert.equal(id,BROKER);
      assert.equal(nodeId,NODE);
      assert.equal(options.allowLoopbackProof,true);
      grants++;
      return {...grant,broker_origin:origin,route_scope:'loopback_proof',
        public_route_receipt_hash:RECEIPT,device_fingerprint:seed.device_fingerprint};
    },
    stats(){return {grants,verifications};},
  };
}
function opts(x,origin,yard){
  return {
    yardStateDir:x.yardStateDir,mailboxRoot:x.mailboxRoot,
    journalRoot:x.journalRoot,brokerDeploymentId:BROKER,
    brokerLoopbackOrigin:origin,yardOperator:yard,
    maxRequests:4,timeoutMs:10000,
  };
}

test('Yard consumes Saban-exported request through authenticated outbound broker and returns verified worker receipt',async()=>{
  const x=setup(),token='split-consumer-local-allocator-test';
  let seed,broker,agent;
  try{
    seed=await startNodeSeed({root:path.join(x.root,'compute'),
      nodeId:NODE,host:'127.0.0.1',port:0,advertiseHost:'127.0.0.1',
      allocatorToken:token,announce:false});
    broker=await startOutboundCapacityBroker({
      stateDir:path.join(x.root,'broker'),
      authorizedDevices:{[seed.device_fingerprint]:seed.node_id},
      pollWaitMs:75,commandTimeoutMs:8000,capacityFreshMs:1000,
    });
    agent=await startOutboundNodeAgent({
      brokerUrl:broker.endpoint,localCapacityEndpoint:seed.endpoint,
      localAllocatorToken:token,pollBackoffMs:25,
    });
    const raw=broker.controlGrant(NODE);
    assert.ok(raw?.allocator_token);
    const yard=fakeYard({origin:broker.endpoint,seed,
      grant:{node_id:NODE,capacity_endpoint:raw.capacity_endpoint,
        allocator_token:raw.allocator_token}});
    const first=await runYardSplitIdentityConsumeOnce(opts(x,broker.endpoint,yard));
    assert.equal(first.considered,1);
    assert.equal(first.completed,1);
    assert.equal(first.verification_hold,0);
    assert.equal(first.authority_material_persisted,false);
    assert.equal(first.saban_private_state_read,false);
    const mailbox=fs.readFileSync(
      path.join(x.mailboxRoot,'outcomes',x.intent.intent_id+'.json'),'utf8');
    const journal=fs.readFileSync(
      path.join(x.journalRoot,x.intent.intent_id+'.json'),'utf8');
    for(const body of [mailbox,journal]){
      assert.doesNotMatch(body,new RegExp(token));
      assert.doesNotMatch(body,new RegExp(raw.allocator_token));
      assert.doesNotMatch(body,/"allocator_token"|"lease_token"|"control_token"/);
    }
    assert.equal(fs.statSync(path.join(x.journalRoot,x.intent.intent_id+'.json')).mode&0o777,0o600);
    assert.equal(importSplitIdentityOutcomes(x).applied,1);
    assert.equal(x.queue.get(x.job.job_id).state,'completed');
    assert.equal(x.queue.get(x.job.job_id).execution_receipt.worker_receipt_verified,true);
    const second=await runYardSplitIdentityConsumeOnce(opts(x,broker.endpoint,yard));
    assert.equal(second.considered,0);
    assert.equal(yard.stats().grants,1,'no duplicate network execution');
    assert.equal(yard.stats().verifications,2,'broker identity checked on every cycle');
    assert.equal(fs.existsSync(path.join(x.journalRoot,'.split-consumer-active')),false,
      'successful consumer must release its execution lock');
  }finally{
    if(agent)await agent.close();
    if(broker)await broker.close();
    if(seed)await seed.close();
    fs.rmSync(x.root,{recursive:true,force:true});
  }
});

test('existing durable claim holds an unresolved request and never obtains a new grant',async()=>{
  const x=setup();
  try{
    const origin='http://127.0.0.1:8797';
    const seed={device_fingerprint:'sha256:'+'a'.repeat(64)};
    const yard=fakeYard({origin,seed,grant:{}});
    fs.mkdirSync(x.journalRoot,{recursive:true,mode:0o700});
    fs.writeFileSync(path.join(x.journalRoot,x.intent.intent_id+'.json'),'{"claimed":true}\n',{mode:0o600});
    const result=await runYardSplitIdentityConsumeOnce(opts(x,origin,yard));
    assert.equal(result.completed,0);
    assert.equal(result.verification_hold,1);
    assert.equal(result.rows[0].reason,'previous_claim_requires_review');
    assert.equal(yard.stats().grants,0);
    assert.equal(importSplitIdentityOutcomes(x).applied,1);
    assert.equal(x.queue.get(x.job.job_id).state,'held');
    assert.equal(readSplitIdentityRequests({mailboxRoot:x.mailboxRoot}).length,0);
  }finally{fs.rmSync(x.root,{recursive:true,force:true});}
});

test('invalid broker identity fails before claim and leaves request pending',async()=>{
  const x=setup();
  try{
    const origin='http://127.0.0.1:8797';
    const seed={device_fingerprint:'sha256:'+'a'.repeat(64)};
    const yard=fakeYard({origin,seed,grant:{},routeValid:false});
    await assert.rejects(runYardSplitIdentityConsumeOnce(opts(x,origin,yard)),
      /yard_split_broker_identity_invalid/);
    assert.equal(yard.stats().grants,0);
    assert.equal(readSplitIdentityRequests({mailboxRoot:x.mailboxRoot}).length,1);
    assert.equal(fs.readdirSync(x.journalRoot).length,0);
    await assert.rejects(runYardSplitIdentityConsumeOnce(opts(x,'http://0.0.0.0:8797',yard)),
      /yard_split_explicit_loopback_origin_required/);
  }finally{fs.rmSync(x.root,{recursive:true,force:true});}
});

test('grant mismatch after claim creates immutable manual-review hold, not a retry',async()=>{
  const x=setup();
  try{
    const origin='http://127.0.0.1:8797';
    const seed={device_fingerprint:'sha256:'+'a'.repeat(64)};
    const yard=fakeYard({origin,seed,
      grant:{node_id:NODE,capacity_endpoint:'http://127.0.0.1:1',
        allocator_token:'fake-test-control'}});
    const first=await runYardSplitIdentityConsumeOnce(opts(x,origin,yard));
    assert.equal(first.completed,0);
    assert.equal(first.verification_hold,1);
    assert.equal(yard.stats().grants,1);
    assert.equal(importSplitIdentityOutcomes(x).applied,1);
    const second=await runYardSplitIdentityConsumeOnce(opts(x,origin,yard));
    assert.equal(second.considered,0);
    assert.equal(yard.stats().grants,1);
  }finally{fs.rmSync(x.root,{recursive:true,force:true});}
});


test('existing consumer lock blocks duplicate processor before any broker call',async()=>{
  const x=setup();
  try{
    const origin='http://127.0.0.1:8797';
    const seed={device_fingerprint:'sha256:'+'a'.repeat(64)};
    const yard=fakeYard({origin,seed,grant:{}});
    fs.mkdirSync(x.journalRoot,{recursive:true,mode:0o700});
    const lock=path.join(x.journalRoot,'.split-consumer-active');
    fs.mkdirSync(lock,{mode:0o700});
    await assert.rejects(runYardSplitIdentityConsumeOnce(opts(x,origin,yard)),
      /yard_split_cycle_active_or_crashed_requires_review/);
    assert.equal(yard.stats().verifications,0);
    assert.equal(yard.stats().grants,0);
    assert.equal(fs.readdirSync(x.journalRoot).length,1,'lock must not be stolen');
    assert.equal(fs.existsSync(path.join(x.mailboxRoot,'outcomes',x.intent.intent_id+'.json')),false,
      'an overlapping invocation cannot forge an early uncertain outcome');
  }finally{fs.rmSync(x.root,{recursive:true,force:true});}
});
