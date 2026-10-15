import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {executeNodeSeedIntentLanes,withNodeSeedDrainLock,drainNodeSeedExecutionIntents,safeNodeSeedExecutionError} from '../systemia/saban/nodeseed-intent-executor.mjs';

const intent=(intent_id,job_id,node_id)=>({intent_id,job_id,node_id});

test('independent nodes overlap while jobs on each node remain serial and output order stays stable',async()=>{
  const jobs=[
    intent('a1','job-a1','hp-node002'),
    intent('b1','job-b1','chromebook'),
    intent('a2','job-a2','hp-node002'),
    intent('b2','job-b2','chromebook'),
  ];
  const started=[],inflight=new Set();
  let peak=0;
  let release;
  const latch=new Promise(resolve=>{release=resolve;});
  const run=executeNodeSeedIntentLanes({
    intents:jobs,
    maxParallelNodes:2,
    execute:async row=>{
      assert.equal(inflight.has(row.node_id),false,'same node cannot overlap');
      inflight.add(row.node_id);
      peak=Math.max(peak,inflight.size);
      started.push(row.intent_id);
      await latch;
      inflight.delete(row.node_id);
      return {status:'completed',intent_id:row.intent_id};
    },
  });
  assert.deepEqual(started,['a1','b1'],'each host receives exactly one initial job');
  release();
  const result=await run;
  assert.equal(peak,2);
  assert.equal(result.per_node_serial,true);
  assert.equal(result.machine_authority_inferred,false);
  assert.deepEqual(started,['a1','b1','a2','b2']);
  assert.deepEqual(result.rows.map(x=>x.intent_id),['a1','b1','a2','b2']);
  assert.ok(result.rows.every(x=>x.status==='completed'));
});

test('duplicate job across different hosts is held instead of concurrently submitted',async()=>{
  const executed=[];
  const result=await executeNodeSeedIntentLanes({
    intents:[intent('a','same-job','hp'),intent('b','same-job','chromebook')],
    execute:async row=>{executed.push(row.intent_id);return {status:'completed',intent_id:row.intent_id};},
  });
  assert.deepEqual(executed,['a']);
  assert.equal(result.rows[1].status,'held_duplicate_intent');
  assert.equal(result.rows[1].authority_material_persisted,false);
});

test('duplicate exact intent is held even if its job key changed',async()=>{
  let count=0;
  const result=await executeNodeSeedIntentLanes({
    intents:[intent('intent-1','j1','hp'),intent('intent-1','j2','chromebook')],
    execute:async()=>{count++;return {status:'completed'};},
  });
  assert.equal(count,1);
  assert.equal(result.rows[1].status,'held_duplicate_intent');
});

test('missing identity never reaches executor',async()=>{
  let count=0;
  const result=await executeNodeSeedIntentLanes({
    intents:[intent('','job','hp'),intent('id','', 'hp'),intent('id2','job2','')],
    execute:async()=>{count++;return {status:'completed'};},
  });
  assert.equal(count,0);
  assert.ok(result.rows.every(x=>x.status==='held_invalid_intent'));
});

test('maxParallelNodes is capped at two even if someone requests unlimited work',async()=>{
  const started=[];
  let release;
  const latch=new Promise(resolve=>{release=resolve;});
  const running=executeNodeSeedIntentLanes({
    intents:[intent('a','a','n1'),intent('b','b','n2'),intent('c','c','n3')],
    maxParallelNodes:99999,
    execute:async row=>{started.push(row.intent_id);await latch;return {status:'completed',intent_id:row.intent_id};},
  });
  assert.deepEqual(started,['a','b']);
  release();
  const result=await running;
  assert.equal(result.parallel_limit,2);
  assert.deepEqual(result.rows.map(x=>x.intent_id),['a','b','c']);
});

test('unhandled executor error is never recorded as completed and secret error text is not returned',async()=>{
  const result=await executeNodeSeedIntentLanes({
    intents:[intent('e','job-e','hp'),intent('success','job-ok','chromebook')],
    execute:async row=>{
      if(row.intent_id==='e')throw new Error('sensitive-allocator-token');
      return {status:'completed',intent_id:row.intent_id};
    },
  });
  assert.equal(result.rows[0].status,'executor_error');
  assert.equal(result.rows[0].reason,'unexpected_executor_failure');
  assert.equal(result.rows[0].authority_material_persisted,false);
  assert.doesNotMatch(JSON.stringify(result),/sensitive-allocator-token/);
  assert.equal(result.rows[1].status,'completed');
});

test('root lock excludes simultaneous resident drainers even across independent calls',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-two-drainers-'));
  let release;
  const hold=new Promise(resolve=>{release=resolve;});
  let ran=0;
  try{
    const first=withNodeSeedDrainLock({root,work:async()=>{ran++;await hold;return 'first-done';}});
    assert.equal(ran,1);
    await assert.rejects(
      withNodeSeedDrainLock({root,work:async()=>{ran++;}}),
      /nodeseed_intent_drainer_busy_or_stale_lock/
    );
    assert.equal(ran,1);
    release();
    assert.equal(await first,'first-done');
    assert.equal(await withNodeSeedDrainLock({root,work:async()=>{ran++;return 'next-wave';}}),'next-wave');
    assert.equal(ran,2);
  }finally{
    release?.();
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('stale or ambiguous lock must not auto-expire into duplicate remote execution',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-stale-drain-'));
  const lock=path.join(root,'.nodeseed-intent-drain.lock');
  try{
    fs.writeFileSync(lock,'{"token":"operator-recovery-required","claimed_at":"1999-01-01T00:00:00Z"}');
    let called=false;
    await assert.rejects(
      withNodeSeedDrainLock({root,work:async()=>{called=true;}}),
      /nodeseed_intent_drainer_busy_or_stale_lock/
    );
    assert.equal(called,false);
    assert.match(fs.readFileSync(lock,'utf8'),/operator-recovery-required/);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('unexpected failure releases only the current owner lock',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-release-drain-'));
  const lock=path.join(root,'.nodeseed-intent-drain.lock');
  try{
    await assert.rejects(withNodeSeedDrainLock({
      root,work:async()=>{throw new Error('synthetic_work_failure');}
    }),/synthetic_work_failure/);
    assert.equal(fs.existsSync(lock),false);
    assert.equal(await withNodeSeedDrainLock({root,work:async()=>42}),42);
    await withNodeSeedDrainLock({root,work:async()=>{
      fs.unlinkSync(lock);
      fs.writeFileSync(lock,JSON.stringify({token:'different-owner'}));
    }});
    assert.equal(fs.existsSync(lock),true,'original owner may not delete replacement lock');
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('actual empty drainer is root-locked and returns zero without broker calls',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-empty-drain-'));
  let granted=0;
  try{
    const yard={
      async listRemoteCapacityNodes(){granted++;throw new Error('unexpected_broker_call');},
      async remoteCapacityGrant(){granted++;throw new Error('unexpected_grant_call');}
    };
    const done=await drainNodeSeedExecutionIntents({
      root,yard,brokerDeploymentId:'synthetic-proof-only'
    });
    assert.equal(done.considered,0);
    assert.equal(done.completed,0);
    assert.equal(done.machine_authority_inferred,false);
    assert.equal(granted,0);
    assert.equal(fs.existsSync(path.join(root,'.nodeseed-intent-drain.lock')),false);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('remote broker errors are redacted before persistence',()=>{
  assert.equal(safeNodeSeedExecutionError(new Error('Bearer super-secret-key')),'nodeseed_executor_failure_redacted');
  assert.equal(safeNodeSeedExecutionError({message:'secret provider response',status:503}),'nodeseed_remote_http_503');
  assert.equal(safeNodeSeedExecutionError(new Error('nodeseed_registered_worker_receipt_hash_required')),
    'nodeseed_registered_worker_receipt_hash_required');
  assert.equal(safeNodeSeedExecutionError({status:0,message:'payment token secret'}),'nodeseed_executor_failure_redacted');
});
