import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {exactNativeOffer,createPaymentOperations,openPaymentJournal,startOwnedPaymentServer} from '../systemia/payments/owned-ops-service.mjs';

const offer=exactNativeOffer('workflow_foundry.xray_250.v1');
const orderKey='buyer-11111111-2222-3333-4444-555555555555';
const sessionId='cs_test_12345abc';
const sessionUrl='https://checkout.stripe.com/c/pay/cs_test_12345abc';
const args={action:'create_checkout',offer_key:offer.offer_key,order_key:orderKey,
 customer_email:'buyer@example.com',return_origin:'https://fabric.systemiacommandcenters.com',
 success_path:'/offers/workflow-xray?payment=processing',cancel_path:'/offers/workflow-xray?payment=cancelled'};
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-payments-'));
const fakeProvider=(overrides={})=>{
 const state={creates:0,retrieves:0,paid:false, ...overrides};
 return {
   live:Boolean(state.live),state,
   async create({orderKey,offer}){
     state.creates++;
     return {id:sessionId,url:sessionUrl,amount_total:offer.amount_cents,currency:'usd',
       mode:'payment',client_reference_id:orderKey,metadata:{order_key:orderKey,offer_key:offer.offer_key},
       livemode:Boolean(state.live),expires_at:Date.now()/1000+600};
   },
   async retrieve(id){
     state.retrieves++;
     return {id,client_reference_id:orderKey,metadata:{order_key:orderKey,offer_key:offer.offer_key},
       mode:'payment',amount_total:offer.amount_cents,currency:'usd',
       status:state.paid?'complete':'open',payment_status:state.paid?'paid':'unpaid',
       payment_intent:state.paid?'pi_test_123':null,livemode:Boolean(state.live)};
   }
 };
};

test('native source registry excludes held Signal and unknown SKUs',()=>{
  assert.equal(exactNativeOffer('signal.incident_evidence_brief_250.v1'),null);
  assert.equal(exactNativeOffer('some_fake_offer'),null);
  assert.equal(offer.amount_cents,25000);
});

test('session creation is exact-priced, durable and idempotent across engine restarts',async()=>{
  const dir=tmp(),journalPath=path.join(dir,'orders.jsonl');const provider=fakeProvider();
  try{
    let journal=openPaymentJournal(journalPath);
    let ops=createPaymentOperations({provider,journal});
    const first=await ops(args);
    assert.equal(first.status,200);assert.equal(first.body.checkout_ready,true);
    assert.equal(first.body.amount_cents,25000);
    assert.equal(provider.state.creates,1);
    const duplicate=await ops(args);
    assert.equal(duplicate.body.checkout_url,first.body.checkout_url);
    assert.equal(provider.state.creates,1);
    journal.close();
    journal=openPaymentJournal(journalPath);
    ops=createPaymentOperations({provider,journal});
    assert.equal((await ops(args)).body.checkout_url,sessionUrl);
    assert.equal(provider.state.creates,1);
    const mismatch=await ops({...args,offer_key:'browser_fabric_workflow_diagnosis_149',
      success_path:'/offers/browser-diagnosis?payment=processing',
      cancel_path:'/offers/browser-diagnosis?payment=cancelled'});
    assert.equal(mismatch.status,409);
    journal.close();
    const ledger=fs.readFileSync(journalPath,'utf8');
    assert.ok(!ledger.includes('buyer@example.com'));
    assert.ok(ledger.includes('"event":"checkout"'));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('provider status and exact identity govern payment receipt, not query strings',async()=>{
  const dir=tmp(),journal=openPaymentJournal(path.join(dir,'orders.jsonl'));
  const provider=fakeProvider();const ops=createPaymentOperations({provider,journal});
  try{
    await ops(args);
    const verify={action:'verify_checkout',offer_key:offer.offer_key,order_key:orderKey,provider_session_id:sessionId};
    const unpaid=await ops(verify);
    assert.equal(unpaid.body.payment_confirmed,false);
    const forged=await ops({...verify,provider_session_id:'cs_test_forged'});
    assert.equal(forged.status,400);
    provider.state.paid=true;
    const paid=await ops(verify);
    assert.equal(paid.body.payment_confirmed,true);
    assert.equal(paid.body.fulfillment_state,'awaiting_human_review');
    assert.equal(paid.body.fulfillment_released,false);
    assert.equal(paid.body.synthetic,false);
    const again=await ops(verify);
    assert.equal(again.body.receipt_key,paid.body.receipt_key);
    assert.equal(fs.readFileSync(path.join(dir,'orders.jsonl'),'utf8').match(/"event":"paid"/g).length,1);
  }finally{journal.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('mismatch, live-mode default hold and service authorization fail closed',async()=>{
  const dir=tmp(),journal=openPaymentJournal(path.join(dir,'orders.jsonl'));
  try{
    const live=fakeProvider({live:true});
    const ops=createPaymentOperations({provider:live,journal});
    const hold=await ops(args);
    assert.equal(hold.status,503);
    assert.equal(live.state.creates,0);
    const local=fakeProvider();
    const safe=createPaymentOperations({provider:local,journal});
    assert.equal((await safe({...args,return_origin:'https://attacker.invalid'})).status,422);
    assert.equal((await safe({...args,offer_key:'signal.incident_evidence_brief_250.v1'})).status,409);
    assert.equal(local.state.creates,0);
    const server=await startOwnedPaymentServer({authToken:'a'.repeat(40),operate:safe});
    try{
      const unauthorized=await fetch(server.url+'/api/payments/ops',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(args)});
      assert.equal(unauthorized.status,401);
      const authorized=await fetch(server.url+'/api/payments/ops',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+'a'.repeat(40)},body:JSON.stringify(args)});
      assert.equal(authorized.status,200);
      assert.equal((await authorized.json()).checkout_ready,true); // Authenticated local order preparation.
      const health=await fetch(server.url+'/health').then(r=>r.json());
      assert.equal(health.commercial_release_attested,false);
    }finally{await server.close();}
  }finally{journal.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('malformed durable payment journal prevents restart',()=>{
  const dir=tmp(),p=path.join(dir,'journal.jsonl');
  try{
    fs.writeFileSync(p,'this is not JSON\n');
    assert.throws(()=>openPaymentJournal(p),/payment_journal_corrupt_fail_closed/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
