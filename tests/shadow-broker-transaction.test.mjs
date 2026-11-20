import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {startNodeSeed} from '../systemia/compute/node-seed.mjs';
import {
  runRehearsalShadowBrokerTransaction,
} from '../systemia/yard/shadow-broker-transaction.mjs';

function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-transaction-'));
  fs.chmodSync(root,0o700);
  return root;
}
async function withNodeSeed(run){
  const root=fixture();
  let seed;
  try{
    const seedRoot=path.join(root,'compute');
    const parent=path.join(seedRoot,'shadow-journals');
    seed=await startNodeSeed({
      root:seedRoot,nodeId:'shadow-transaction-worker',
      host:'127.0.0.1',port:0,advertiseHost:'127.0.0.1',
      allocatorToken:'synthetic-shadow-transaction-key',
      announce:false,
    });
    fs.mkdirSync(parent,{mode:0o700});
    return await run({root,seed,parent});
  }finally{
    if(seed)await seed.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
}
async function count(origin){
  const res=await fetch(origin+'/v1/health');
  assert.equal(res.status,200);
  return (await res.json()).resident_services;
}
test('journaled broker transaction starts, verifies empty authority, and releases',async()=>{
  await withNodeSeed(async({seed,parent})=>{
    assert.equal(await count(seed.endpoint),0);
    const result=await runRehearsalShadowBrokerTransaction({
      nodeSeedReceipt:seed,journalParent:parent,
      allocatorToken:'synthetic-shadow-transaction-key',
    });
    assert.equal(result.ok,true,JSON.stringify(result));
    assert.equal(result.broker_start_confirmed_by_response,true);
    assert.equal(result.broker_identity_verified,true);
    assert.equal(result.release_confirmed,true);
    assert.equal(result.journal_phase,'released');
    assert.equal(result.authorized_devices,0);
    assert.equal(result.public_route_created,false);
    assert.equal(result.historical_grants_imported,false);
    assert.equal(await count(seed.endpoint),0);
  });
});
test('lost broker response cannot orphan service when lease was recorded first',async()=>{
  await withNodeSeed(async({seed,parent})=>{
    let jobSeen=false;
    const request=async(url,init)=>{
      const res=await fetch(url,init);
      if(String(url).endsWith('/v1/jobs')){
        assert.equal(res.status,200);
        jobSeen=true;
        throw Error('simulated_job_result_lost_after_start');
      }
      return res;
    };
    const result=await runRehearsalShadowBrokerTransaction({
      nodeSeedReceipt:seed,journalParent:parent,
      allocatorToken:'synthetic-shadow-transaction-key',
      request,
    });
    assert.equal(jobSeen,true);
    assert.equal(result.ok,false);
    assert.equal(result.broker_start_outcome_uncertain,true);
    assert.equal(result.release_confirmed,true);
    assert.equal(result.journal_phase,'released');
    assert.equal(result.manual_review_required,false);
    assert.equal(await count(seed.endpoint),0);
  });
});
test('transaction refuses mismatched on-disk NodeSeed identity before leases',async()=>{
  await withNodeSeed(async({seed,parent})=>{
    await assert.rejects(
      runRehearsalShadowBrokerTransaction({
        nodeSeedReceipt:{...seed,node_id:'spoofed-node-id'},
        journalParent:parent,
        allocatorToken:'synthetic-shadow-transaction-key',
      }),/on_disk_nodeseed_receipt_mismatch/
    );
    assert.equal(await count(seed.endpoint),0);
    assert.equal(fs.readdirSync(parent).length,0);
  });
});


test('failed midflight observer still releases the broker lease and restores zero residents',async()=>{
  await withNodeSeed(async({seed,parent})=>{
    let observed=false;
    const result=await runRehearsalShadowBrokerTransaction({
      nodeSeedReceipt:seed,
      journalParent:parent,
      allocatorToken:'synthetic-shadow-transaction-key',
      onBrokerVerified:async evidence=>{
        assert.equal(evidence.broker_zero_authority_verified,true);
        assert.equal(evidence.public_route_created,false);
        assert.equal(await count(seed.endpoint),1);
        observed=true;
        throw Error('injected_midflight_observer_failure');
      },
    });
    assert.equal(observed,true);
    assert.equal(result.ok,false);
    assert.equal(result.release_confirmed,true);
    assert.equal(result.journal_phase,'released');
    assert.equal(await count(seed.endpoint),0);
  });
});

test('rehearsal rejects a copied fixture receipt pointing at Penguin production port',async()=>{
  const root=fixture();
  try{
    const nodeRoot=path.join(root,'compute');
    const parent=path.join(nodeRoot,'shadow-journals');
    fs.mkdirSync(parent,{recursive:true,mode:0o700});
    const receipt={
      schema:'evercraft.compute.nodeseed-receipt.v1',
      root:nodeRoot,
      node_id:'shadow-fake-live-node',
      endpoint:'http://127.0.0.1:42420',
      // Valid synthetic identity reaches the independent live-port guard.
      device_fingerprint:'sha256:'+'a'.repeat(64),
    };
    fs.writeFileSync(
      path.join(nodeRoot,'nodeseed-receipt.json'),
      JSON.stringify(receipt),
      {mode:0o600}
    );
    let requests=0;
    await assert.rejects(
      runRehearsalShadowBrokerTransaction({
        nodeSeedReceipt:receipt,
        journalParent:parent,
        allocatorToken:'synthetic-shadow-transaction-key',
        request:async()=>{requests+=1;throw Error('must_not_contact_live_node')},
      }),/live_node_endpoint_not_disposable/
    );
    assert.equal(requests,0);
    assert.equal(fs.readdirSync(parent).length,0);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
