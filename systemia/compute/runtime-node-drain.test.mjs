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
    assert.equal(result.status,200,JSON.stringify(await result.json()));
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
