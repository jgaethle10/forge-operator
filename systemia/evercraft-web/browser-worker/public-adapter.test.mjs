import test from 'node:test';
import assert from 'node:assert/strict';
import { startBrowserPublicAdapter } from './public-adapter.mjs';

test('public adapter exposes receipt-bound health and bounded render', async()=>{
  let receipt='';
  const runtime={
    instanceId:'browser-test-instance',
    async health(){
      return {
        ok:true,
        service:'evercraft-owned-browser-worker',
        engine:'evercraft-owned-browser-worker-v1',
        runtime:'Evercraft Compute',
        instance_id:'browser-test-instance',
        deployment_receipt_ref:receipt||null,
      };
    },
    async browse(job){
      if(String(job?.url||'').includes('127.0.0.1')) throw new Error('private_or_reserved_target');
      return {
        ok:true,
        mode:'public_read_only',
        final_url:String(job?.url||''),
        evidence_receipt_sha256:'a'.repeat(64),
      };
    },
    setDeploymentReceipt(value){
      receipt=String(value||'');
    }
  };

  const adapter=await startBrowserPublicAdapter({runtime,maxRequestsPerMinute:10});
  try{
    let health=await fetch(adapter.url+'/health').then(r=>r.json());
    assert.equal(health.service,'evercraft-web-browser-edge');
    assert.equal(health.deployment_receipt_bound,false);
    assert.equal(health.raw_worker_publicly_exposed,false);

    runtime.setDeploymentReceipt('b'.repeat(64));
    health=await fetch(adapter.url+'/health').then(r=>r.json());
    assert.equal(health.deployment_receipt_bound,true);
    assert.equal(health.deployment_receipt_ref,'b'.repeat(64));

    const rendered=await fetch(adapter.url+'/v1/browser/render',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({url:'https://example.com/'})
    }).then(r=>r.json());
    assert.equal(rendered.ok,true);
    assert.equal(rendered.result.mode,'public_read_only');
    assert.match(rendered.result.evidence_receipt_sha256,/^[a-f0-9]{64}$/);

    const denied=await fetch(adapter.url+'/v1/browser/render',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({url:'http://127.0.0.1/'})
    });
    assert.equal(denied.status,400);
    const deniedBody=await denied.json();
    assert.equal(deniedBody.error,'private_or_reserved_target');
  }finally{
    await adapter.close();
  }
});
