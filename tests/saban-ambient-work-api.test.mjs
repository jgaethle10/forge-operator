import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startAmbientWorkApi } from '../systemia/saban/ambient-work-api.mjs';

test('loopback work API accepts bounded jobs with separate submit authority',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-work-api-'));
  const token='work-api-token';
  let api=null;
  try{
    api=await startAmbientWorkApi({
      queueRoot:root,
      authorizationToken:token,
    });

    const health=await fetch(api.url+'/health').then(r=>r.json());
    assert.equal(health.ok,true);
    assert.equal(health.host_scope,'loopback');
    assert.equal(health.arbitrary_code_execution,false);

    const unauthorized=await fetch(api.url+'/v1/jobs',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        workload_class:'systemia.content-hash.v1',
        idempotency_key:'job-1',
        payload:{value:'hello'},
      }),
    });
    assert.equal(unauthorized.status,401);

    const body={
      workload_class:'systemia.content-hash.v1',
      idempotency_key:'job-1',
      payload:{value:'hello'},
      resources:{cpu_units:0.1,memory_mb:64,storage_gb:0},
      private_data:true,
    };
    const first=await fetch(api.url+'/v1/jobs',{
      method:'POST',
      headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify(body),
    });
    assert.equal(first.status,202);
    const firstBody=await first.json();
    assert.equal(firstBody.ok,true);
    assert.equal(firstBody.deduplicated_submission,false);
    assert.equal(firstBody.commercial_capacity_authorized,false);

    const duplicate=await fetch(api.url+'/v1/jobs',{
      method:'POST',
      headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify(body),
    });
    assert.equal(duplicate.status,200);
    assert.equal((await duplicate.json()).deduplicated_submission,true);

    const read=await fetch(api.url+'/v1/jobs/'+firstBody.job_id,{
      headers:{authorization:'Bearer '+token},
    });
    assert.equal(read.status,200);
    assert.equal((await read.json()).job.state,'queued');

    const summary=await fetch(api.url+'/v1/summary',{
      headers:{authorization:'Bearer '+token},
    }).then(r=>r.json());
    assert.equal(summary.total,1);
    assert.equal(summary.states.queued,1);
  }finally{
    if(api) await api.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('work API rejects conflicting idempotency reuse',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-work-api-conflict-'));
  const token='work-api-token';
  let api=null;
  try{
    api=await startAmbientWorkApi({queueRoot:root,authorizationToken:token});
    const submit=payload=>fetch(api.url+'/v1/jobs',{
      method:'POST',
      headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify({
        workload_class:'systemia.content-hash.v1',
        idempotency_key:'same-key',
        payload,
      }),
    });
    assert.equal((await submit({value:'one'})).status,202);
    const conflict=await submit({value:'two'});
    assert.equal(conflict.status,409);
    assert.match((await conflict.json()).error,/idempotency_conflict/);
  }finally{
    if(api) await api.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('work API refuses non-loopback binding unless explicitly authorized',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-work-api-host-'));
  try{
    await assert.rejects(
      ()=>startAmbientWorkApi({
        queueRoot:root,
        host:'0.0.0.0',
        authorizationToken:'token',
      }),
      /loopback_required/
    );
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});
