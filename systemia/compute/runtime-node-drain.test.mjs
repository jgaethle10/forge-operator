import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {startEvercraftComputeNode} from './runtime-node.mjs';
import {startBrowserPublicAdapter} from '../evercraft-web/browser-worker/public-adapter.mjs';

test('shutdown drains in-flight browser registration before closing its localhost listener',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-compute-close-race-'));
  const allocatorToken='test-only-token-for-closed-node';
  let entered;
  const factoryEntered=new Promise(resolve=>{entered=resolve;});
  let releaseFactory;
  const factoryGate=new Promise(resolve=>{releaseFactory=resolve;});
  let adapterCloseCalls=0;
  let node;
  try{
    node=await startEvercraftComputeNode({
      nodeId:'ephemeral-browser-registration-race',
      root:dir,host:'127.0.0.1',port:0,
      allocatorToken,
      browserRuntimeFactory:async()=>{
        entered();
        await factoryGate;
        const underlying={
          instanceId:'race-probe-fixture',
          async browse(){return {ok:true,read_only:true};},
          async health(){return {ok:true,engine:'fixture-browser',instance_id:'race-probe-fixture'};}
        };
        const publicAdapter=await startBrowserPublicAdapter({
          runtime:underlying,host:'127.0.0.1',port:0
        });
        return {
          ...underlying,
          localPublicUrl:publicAdapter.url,
          close:async()=>{
            adapterCloseCalls++;
            await publicAdapter.close();
          }
        };
      }
    });
    const leaseResponse=await fetch(node.endpoint+'/v1/leases',{
      method:'POST',
      headers:{authorization:'Bearer '+allocatorToken,'content-type':'application/json'},
      body:JSON.stringify({workload_class:'systemia.evercraft-web-browser.v1',
        requested_ttl_ms:120000})
    });
    assert.equal(leaseResponse.status,201);
    const lease=await leaseResponse.json();
    const jobPromise=fetch(node.endpoint+'/v1/jobs',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({
        workload_class:'systemia.evercraft-web-browser.v1',
        lease_id:lease.lease_id,token:lease.token,
        input:{max_concurrency:1}
      })
    });
    await factoryEntered;
    // Old shutdown order snapshots services here, *before* the late browser
    // adapter is registered. The new order drains HTTP first, then snapshots.
    const closing=node.close();
    releaseFactory();
    const result=await jobPromise;
    assert.equal(result.status,503);
    assert.equal((await result.json()).error,'compute_node_shutting_down');
    await closing;
    node=null;
    assert.equal(adapterCloseCalls,1,'late browser public adapter must be closed');
    assert.equal(
      (process._getActiveHandles?.()||[])
        .filter(handle=>handle?.constructor?.name==='Server'&&handle.listening===true)
        .length,0,'no remaining localhost HTTP listeners after Compute shutdown'
    );
  }finally{
    releaseFactory?.();
    if(node)await node.close().catch(()=>{});
    fs.rmSync(dir,{recursive:true,force:true});
  }
});


test('one failing resident close does not skip shutdown of later registered services',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-close-aggregate-'));
  const token='test-only-compute-close-aggregate';
  const closed=[];
  let index=0;
  const node=await startEvercraftComputeNode({
    nodeId:'ephemeral-close-all-services',root,host:'127.0.0.1',port:0,
    allocatorToken:token,
    browserRuntimeFactory:async()=>{
      const number=++index;
      return {
        instanceId:'fixture-'+number,
        async health(){return {ok:true};},
        async browse(){return {ok:true};},
        async close(){
          closed.push(number);
          if(number===1)throw Error('synthetic_first_resident_close_failure');
        }
      };
    }
  });
  try{
    for(let i=0;i<2;i++){
      const leaseResponse=await fetch(node.endpoint+'/v1/leases',{
        method:'POST',
        headers:{authorization:'Bearer '+token,'content-type':'application/json'},
        body:JSON.stringify({workload_class:'systemia.evercraft-web-browser.v1'})
      });
      assert.equal(leaseResponse.status,201);
      const lease=await leaseResponse.json();
      const response=await fetch(node.endpoint+'/v1/jobs',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({
          workload_class:'systemia.evercraft-web-browser.v1',
          lease_id:lease.lease_id,token:lease.token,input:{}
        })
      });
      assert.equal(response.status,200);
    }
    await assert.rejects(node.close(),/compute_node_shutdown_incomplete/);
    assert.deepEqual(closed,[1,2],
      'second resident must be closed even when the first raises an error');
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});


test('aborted browser-start request cannot register an orphan after Compute shutdown',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-aborted-browser-start-'));
  const token='test-only-aborted-browser-start-token';
  let entered;
  const inFactory=new Promise(resolve=>{entered=resolve;});
  let release;
  const factoryGate=new Promise(resolve=>{release=resolve;});
  let markClosed;
  const adapterClosed=new Promise(resolve=>{markClosed=resolve;});
  let closes=0;
  const node=await startEvercraftComputeNode({
    root:dir,nodeId:'ephemeral-aborted-browser-job',
    host:'127.0.0.1',port:0,allocatorToken:token,
    browserRuntimeFactory:async()=>{
      entered();
      await factoryGate;
      const browser={
        instanceId:'aborted-start-fixture',
        async browse(){return {ok:true};},
        async health(){return {ok:true,instance_id:'aborted-start-fixture'};}
      };
      const adapter=await startBrowserPublicAdapter({runtime:browser,port:0,host:'127.0.0.1'});
      return {
        ...browser,
        localPublicUrl:adapter.url,
        close:async()=>{closes++;await adapter.close();markClosed();}
      };
    }
  });
  try{
    const leaseResponse=await fetch(node.endpoint+'/v1/leases',{
      method:'POST',
      headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify({workload_class:'systemia.evercraft-web-browser.v1'})
    });
    assert.equal(leaseResponse.status,201);
    const lease=await leaseResponse.json();
    const controller=new AbortController();
    const abandonedRequest=fetch(node.endpoint+'/v1/jobs',{
      method:'POST',
      headers:{'content-type':'application/json'},
      signal:controller.signal,
      body:JSON.stringify({
        workload_class:'systemia.evercraft-web-browser.v1',
        lease_id:lease.lease_id,token:lease.token,input:{}
      })
    }).catch(error=>error);
    await inFactory;
    controller.abort();
    // The socket can be gone while the factory promise still runs.
    const closing=node.close();
    release();
    await closing;
    await abandonedRequest;
    await Promise.race([
      adapterClosed,
      new Promise((_,reject)=>setTimeout(
        ()=>reject(Error('late_browser_adapter_was_not_closed')),2500
      ))
    ]);
    assert.equal(closes,1);
    assert.equal((process._getActiveHandles?.()||[])
      .filter(handle=>handle?.constructor?.name==='Server'&&handle.listening===true)
      .length,0);
  }finally{
    release?.();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
