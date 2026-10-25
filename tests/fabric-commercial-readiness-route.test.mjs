import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {startFabricLocalRuntime} from '../systemia/mcp/fabric-local-runtime.mjs';
test('owned Fabric serves source-controlled commerce readiness without expanding purchase authority',async()=>{
  const runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[]});
  try{
    const res=await fetch(runtime.url+'/.well-known/evercraft-commercial-readiness.json');
    assert.equal(res.status,200);
    assert.match(res.headers.get('content-type')||'',/application\/json/);
    const served=await res.json();
    const source=JSON.parse(readFileSync(new URL('../public/.well-known/evercraft-commercial-readiness.json',import.meta.url)));
    assert.deepEqual(served,source);
    assert.equal(served.commercial_checkout_ready,false);
    assert.equal(served.may_charge_customers,false);
    assert.equal(served.separate_systemia_hosted_stripe.verified_active_live_exact_sku_links,7);
    assert.equal(served.separate_systemia_hosted_stripe.verified_payment_observed,false);
  }finally{await runtime.close();}
});
test('owned Fabric llms.txt returns corrected separate payment rails rather than stale blanket hold',async()=>{
  const runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[]});
  try{
    const res=await fetch(runtime.url+'/llms.txt');
    assert.equal(res.status,200);
    const text=await res.text();
    assert.match(text,/native Evercraft Payments \/ Raven Nexus checkout rail remains HELD/);
    assert.match(text,/seven existing Systemia Stripe-hosted Payment Links/);
    assert.doesNotMatch(text,/\*\*Payment checkout is HELD\.\*\*/);
  }finally{await runtime.close();}
});
