import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startFabricLocalRuntime } from '../systemia/mcp/fabric-local-runtime.mjs';
import { validateCloseoutInquiry, closeoutInquiryReadiness } from '../systemia/mcp/closeout-public-inquiry.mjs';

const origin='https://jgaethle10.github.io';
const payload={
  name:'Test Contractor', email:'worker@example.com', company:'Sample Services',
  job_type:'maintenance',note:'One completed property maintenance job needing customer handoff',
  company_website_honey:'',consent:true
};
const fresh=()=>fs.mkdtempSync(path.join(os.tmpdir(),'closeout-intake-'));

test('Closeout consent, bounds and buyer-only scope validation',()=>{
  assert.equal(validateCloseoutInquiry({...payload,consent:false}).error,'consent_required');
  assert.equal(validateCloseoutInquiry({...payload,job_type:'transfer_money'}).error,'invalid_fields');
  assert.equal(validateCloseoutInquiry({...payload,note:'x'.repeat(451)}).error,'invalid_fields');
  assert.equal(validateCloseoutInquiry({...payload,company_website_honey:'bot'}).honeypot,true);
  assert.equal(validateCloseoutInquiry(payload).value.email,'worker@example.com');
});

test('Closeout readiness must fail closed when alert delivery not configured',()=>{
  const dir=fresh();
  try{
    const read=closeoutInquiryReadiness({storeDir:dir,notificationReady:false});
    assert.equal(read.intake_available,false);
    assert.equal(read.checkout_available,false);
    assert.equal(read.payment_verified,false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Owned Closeout captures only explicit inquiries, never an order',async()=>{
  const dir=fresh(),events=[];
  const runtime=await startFabricLocalRuntime({
    host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false,
    closeoutLeadsDir:dir,closeoutRecipient:'qa-operator',
    closeoutNotify:async body=>{events.push(body);return {inboxed:1};},
    purchaseIntentFetch:async()=>{throw Error('Payment must not be called');}
  });
  const send=(values,headers={})=>fetch(runtime.url+'/api/closeout/inquiry',{
    method:'POST',
    headers:{'content-type':'application/json',origin,...headers},
    body:JSON.stringify(values)
  });
  try{
    const ready=await fetch(runtime.url+'/api/closeout/readiness',{headers:{origin}});
    assert.equal(ready.status,200);
    assert.equal(ready.headers.get('access-control-allow-origin'),origin);
    const state=await ready.json();
    assert.equal(state.intake_available,true);
    assert.equal(state.checkout_available,false);
    assert.equal(state.payment_verified,false);
    assert.equal((await send({...payload,consent:false})).status,422);
    const disallowed=await fetch(runtime.url+'/api/closeout/inquiry',{
      method:'POST',headers:{origin:'https://attacker.example','content-type':'application/json'},
      body:JSON.stringify(payload)
    });
    assert.equal(disallowed.status,403);
    const received=await send(payload);
    assert.equal(received.status,201);
    const data=await received.json();
    assert.equal(data.received,true);
    assert.match(data.reference,/^EC-CLOSEOUT-[A-F0-9]{20}$/);
    assert.doesNotMatch(JSON.stringify(data),/worker@example.com|Sample Services/);
    const recordPath=path.join(dir,data.reference+'.json');
    const stat=fs.statSync(recordPath);
    assert.equal(stat.mode&0o077,0);
    const record=JSON.parse(fs.readFileSync(recordPath,'utf8'));
    assert.equal(record.offer_key,'evercraft.closeout.human_review_packet_49.v1');
    assert.equal(record.amount_cents_proposed,4900);
    assert.equal(record.paid,false);
    assert.equal(record.order_created,false);
    assert.equal(record.fulfillment_released,false);
    assert.equal(record.agent_execution_authorized,false);
    assert.equal(record.company,'Sample Services');
    assert.equal(record.note,payload.note);
    assert.ok(!JSON.stringify(record).includes('ip_address'));
    const held=await fetch(runtime.url+'/api/offers/closeout-pilot/checkout',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({user_confirmed:true,customer_ref:'worker@example.com'})
    });
    assert.equal(held.status,409);
    const response=await held.json();
    assert.equal(response.order_created,false);
    assert.equal(response.fulfillment_release,false);
    assert.equal(response.scope_url,'https://jgaethle10.github.io/forge-operator/closeout/#service');
    for(const event of events){
      assert.equal(event.product,'evercraft-closeout');
      assert.ok(!JSON.stringify(event).includes('worker@example.com'));
      assert.ok(!JSON.stringify(event).includes('Sample Services'));
      assert.equal(event.data?.contains_customer_pii,false);
    }
  }finally{
    await runtime.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
