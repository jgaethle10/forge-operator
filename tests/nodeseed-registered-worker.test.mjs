import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {startEvercraftComputeNode} from '../systemia/compute/runtime-node.mjs';

async function json(url,options={}){
  const res=await fetch(url,options);
  const body=await res.json();
  if(!res.ok) throw Object.assign(new Error(JSON.stringify(body)),{status:res.status,body});
  return body;
}

test('NodeSeed advertises and executes bounded registered MicroSeed workloads with durable idempotency',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'nodeseed-registered-worker-'));
  const token='registered-worker-test-token';
  const node=await startEvercraftComputeNode({
    nodeId:'nodeseed-worker-proof',
    root,
    host:'127.0.0.1',
    port:0,
    allocatorToken:token,
    placementLabels:['operator-authorized'],
    failureDomain:'proof-domain',
    zeroCost:true,
  });
  try{
    const capacity=await json(node.endpoint+'/v1/capacity');
    assert.ok(capacity.supported_workloads.includes('systemia.content-hash.v1'));
    assert.ok(capacity.supported_workloads.includes('systemia.chunk-transform.v1'));

    const lease=await json(node.endpoint+'/v1/leases',{
      method:'POST',
      headers:{'content-type':'application/json',authorization:'Bearer '+token},
      body:JSON.stringify({
        workload_class:'systemia.content-hash.v1',
        requested_ttl_ms:120000,
      }),
    });

    const body={
      lease_id:lease.lease_id,
      token:lease.token,
      workload_class:'systemia.content-hash.v1',
      idempotency_key:'proof-hash-1',
      input:{payload:{value:{saban:'unified-market',n:1}}},
    };
    const first=await json(node.endpoint+'/v1/jobs',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify(body),
    });
    assert.equal(first.ok,true);
    assert.equal(first.deduplicated,false);
    assert.match(first.result.digest,/^sha256:[a-f0-9]{64}$/);
    assert.equal(first.worker_receipt.registered_workload_only,true);

    const replay=await json(node.endpoint+'/v1/jobs',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify(body),
    });
    assert.equal(replay.deduplicated,true);
    assert.equal(replay.result.digest,first.result.digest);

    const conflict=await fetch(node.endpoint+'/v1/jobs',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        ...body,
        input:{payload:{value:{saban:'different-payload',n:2}}},
      }),
    });
    assert.equal(conflict.status,500);
    const conflictBody=await conflict.json();
    assert.equal(conflictBody.error,'nodeseed_registered_worker_idempotency_conflict');
  }finally{
    await node.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});
