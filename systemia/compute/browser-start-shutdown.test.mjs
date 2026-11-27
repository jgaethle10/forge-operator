import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {startNodeSeed} from './node-seed.mjs';
import {startBrowserPublicAdapter} from '../evercraft-web/browser-worker/public-adapter.mjs';

const workload='systemia.evercraft-web-browser.v1';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {resolve,promise};};

for(const termination of ['node_shutdown','lease_release']){
  test('late browser listener is closed after '+termination,{timeout:30000},async t=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'browser-start-fence-'));
    const entered=deferred(),proceed=deferred();
    let seed,adapter,closeCount=0;
    t.after(async()=>{
      proceed.resolve();
      try{await seed?.close();}finally{
        if(adapter&&closeCount===0)await adapter.close();
        fs.rmSync(root,{recursive:true,force:true});
      }
    });
    const allocator='synthetic-browser-fence-token';
    seed=await startNodeSeed({root,nodeId:'browser-start-fence-proof',host:'127.0.0.1',
      port:0,advertiseHost:'127.0.0.1',allocatorToken:allocator,announce:false,
      browserRuntimeFactory:async()=>{
        entered.resolve();
        await proceed.promise;
        const runtime={instanceId:'synthetic-browser-fence',async health(){
          return {ok:true,instance_id:'synthetic-browser-fence'};
        }};
        adapter=await startBrowserPublicAdapter({runtime,host:'127.0.0.1',port:0});
        return {...runtime,localPublicUrl:adapter.url,async close(){
          closeCount++;
          await adapter.close();
        }};
      }});
    async function post(route,body,auth=false){
      const res=await fetch(seed.endpoint+route,{method:'POST',
        headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+allocator}:{})},
        body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
      return {status:res.status,body:await res.json()};
    }
    const allocated=await post('/v1/leases',{workload_class:workload,requested_ttl_ms:120000},true);
    assert.equal(allocated.status,201);
    const {lease_id:leaseId,token}=allocated.body;
    const job=post('/v1/jobs',{lease_id:leaseId,token,workload_class:workload,input:{}});
    await entered.promise;
    let stopped;
    if(termination==='node_shutdown'){
      stopped=seed.close();
    }else{
      const released=await post('/v1/leases/'+leaseId+'/release',{token});
      assert.equal(released.status,200);
    }
    proceed.resolve();
    const outcome=await job;
    assert.equal(outcome.status,410,JSON.stringify(outcome.body));
    assert.equal(outcome.body.error,'browser_start_admission_ended');
    if(stopped)await stopped;
    assert.equal(closeCount,1);
    assert.ok(adapter?.url);
    await assert.rejects(fetch(adapter.url+'/health',{signal:AbortSignal.timeout(2000)}));
    // The shutdown method is idempotent, including overlapping close calls.
    await Promise.all([seed.close(),seed.close()]);
    assert.equal(closeCount,1);
  });
}
