import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startBankCreditRequestRuntime,validBankCreditPayee} from '../systemia/payments/bank-credit-request-runtime.mjs';

const opts={
  operatorToken:'operator-fixture-authority-abcdefghijklmnopqrstuvwxyz987654',
  linkSigningKey:'link-fixture-secret-abcdefghijklmnopqrstuvwxyz987654',
  publicOrigin:'https://fabric.systemiacommandcenters.com',
  approvedOffers:[
    {offer_key:'workflow-xray-250',product_key:'workflow-foundry',name:'Workflow X-Ray',amount_cents:25000,currency:'usd',owner_approved:true},
    {offer_key:'asset-diagnosis-149',product_key:'asset-diagnosis',name:'Asset Diagnosis',amount_cents:14900,currency:'usd',owner_approved:true},
  ],
  // Fake account fixture. NO real merchant bank details are in the repository.
  bankPayee:{receiving_account_confirmed:true,legal_name:'Evercraft TEST Merchant',
    bank_name:'Example TEST Financial Institution',routing_number:'021000021',
    account_number:'000012345678',account_type:'business_checking',
    bank_confirmation_ref:'test-only-dummy-confirmation'},
};
const approved={offer_key:'workflow-xray-250',idempotency_key:'test-bank-credit-order-1001',
  scope_approved:true,capacity_approved:true,buyer_confirmed:true};
async function setup(overrides={}){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'evercraft-bank-credit-'));
 const rt=await startBankCreditRequestRuntime({...opts,storeDir:dir,...overrides});
 return {dir,rt,dispose:async()=>{await rt.close();await fs.rm(dir,{recursive:true,force:true})}};
}
async function issue(rt,body,token=opts.operatorToken){
 const response=await fetch(rt.url+'/v1/operator/bank-requests',{
  method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},
  body:JSON.stringify(body),
 });
 return {status:response.status,data:await response.json()};
}
test('the bank payment request is its own owned URL and never a paid event',async()=>{
 const x=await setup();
 try{
  const h=await fetch(x.rt.url+'/health').then(r=>r.json());
  assert.equal(h.bank_credit_configured,true);
  assert.equal(h.automatic_bank_reconciliation,false);
  const created=await issue(x.rt,approved);
  assert.equal(created.status,201);
  const c=created.data;
  assert.equal(c.state,'awaiting_bank_transfer');
  assert.equal(c.method,'buyer_initiated_ach_credit');
  assert.equal(c.amount_cents,25000);
  assert.equal(c.paid_verified,false);
  assert.equal(c.bank_deposit_verified,false);
  assert.equal(c.fulfillment_release,false);
  assert.equal(c.checkout_created,undefined);
  assert.match(c.payment_request_url,/^https:\/\/fabric\.systemiacommandcenters\.com\/pay\/bank\/bpr_[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/);
  assert.doesNotMatch(JSON.stringify(c),/021000021|000012345678/);
  const pageUrl=new URL(c.payment_request_url);
  const buyer=await fetch(x.rt.url+pageUrl.pathname);
  assert.equal(buyer.status,200);
  assert.match(buyer.headers.get('cache-control'),/no-store/);
  assert.equal(buyer.headers.get('referrer-policy'),'no-referrer');
  assert.match(buyer.headers.get('content-security-policy'),/default-src 'none'/);
  const html=await buyer.text();
  assert.match(html,/Workflow X-Ray/);
  assert.match(html,/\$250\.00/);
  assert.match(html,/000012345678/);
  assert.match(html,/EC-[A-F0-9]{12}/);
  assert.match(html,/Payment has not been received or verified/);
  assert.match(html,/This page does not take money/);
  assert.doesNotMatch(html,/checkout\.stripe\.com|base44\.app/);
  const replay=await issue(x.rt,approved);
  assert.equal(replay.status,200);
  assert.equal(replay.data.replayed,true);
  assert.equal(replay.data.payment_request_url,c.payment_request_url);
  const tampered=pageUrl.pathname.slice(0,-1)+(pageUrl.pathname.endsWith('A')?'B':'A');
  const forged=await fetch(x.rt.url+tampered);
  assert.equal(forged.status,404);
 }finally{await x.dispose()}
});
test('only authorized merchant can issue, never override approved amount or skip confirmation',async()=>{
 const x=await setup();
 try{
  assert.equal((await issue(x.rt,approved,'wrong-secret')).status,401);
  assert.equal((await issue(x.rt,{...approved,buyer_confirmed:false})).status,409);
  assert.equal((await issue(x.rt,{...approved,capacity_approved:false})).status,409);
  assert.equal((await issue(x.rt,{...approved,scope_approved:false})).status,409);
  assert.equal((await issue(x.rt,{...approved,amount_cents:1})).status,409);
  assert.equal((await issue(x.rt,{...approved,offer_key:'not-allowed'})).status,404);
  assert.equal((await issue(x.rt,{...approved,idempotency_key:'bad'})).status,422);
  assert.equal((await issue(x.rt,approved)).status,201);
  assert.equal((await issue(x.rt,{...approved,offer_key:'asset-diagnosis-149'})).status,409);
 }finally{await x.dispose()}
});
test('missing bank confirmation disables link issuance, and an expired link fails closed',async()=>{
 assert.equal(validBankCreditPayee({...opts.bankPayee,routing_number:'021000022'}),false);
 const x=await setup({bankPayee:{...opts.bankPayee,receiving_account_confirmed:false}});
 try{
  const r=await issue(x.rt,approved);
  assert.equal(r.status,503);
  assert.equal(r.data.error,'bank_receiving_account_not_confirmed');
 }finally{await x.dispose()}
 let current=Date.parse('2026-11-09T18:00:00Z');
 const y=await setup({clock:()=>current});
 try{
  const c=(await issue(y.rt,approved)).data;
  current+=8*24*60*60*1000;
  const r=await fetch(y.rt.url+new URL(c.payment_request_url).pathname);
  assert.equal(r.status,410);
  assert.equal((await r.json()).error,'request_unavailable_or_expired');
 }finally{await y.dispose()}
});
test('no public origin drift, no non-loopback listener, and no secrets-less startup',async()=>{
 const storeDir=await fs.mkdtemp(path.join(os.tmpdir(),'bank-pay-safety-'));
 try{
  for(const changes of [
    {host:'0.0.0.0'},
    {publicOrigin:'https://evil.example'},
    {publicOrigin:'http://fabric.systemiacommandcenters.com'},
    {operatorToken:'too-short'},
    {linkSigningKey:'too-short'},
    {approvedOffers:[{...opts.approvedOffers[0],owner_approved:false}]},
  ])await assert.rejects(()=>startBankCreditRequestRuntime({...opts,storeDir,...changes}));
 }finally{await fs.rm(storeDir,{recursive:true,force:true})}
});
test('buyer page escapes merchant-supplied HTML and never embeds customer details',async()=>{
 const x=await setup({approvedOffers:[{...opts.approvedOffers[0],name:'Workflow <script>alert(1)</script> X-Ray'}]});
 try{
  const c=(await issue(x.rt,approved)).data;
  const html=await fetch(x.rt.url+new URL(c.payment_request_url).pathname).then(r=>r.text());
  assert.doesNotMatch(html,/<script>/);
  assert.match(html,/&lt;script&gt;/);
 }finally{await x.dispose()}
});


test('each request is privately bound to the verified destination; rotation invalidates old instructions',async()=>{
 const x=await setup();
 let second=null;
 try{
  const c=(await issue(x.rt,approved)).data;
  assert.equal(c.ok,true);
  const stored=JSON.parse(await fs.readFile(path.join(x.dir,c.request_id+'.json'),'utf8'));
  assert.match(stored.receiving_account_key,/^recv_[0-9a-f]{48}$/);
  assert.doesNotMatch(JSON.stringify(stored),/021000021|000012345678/);
  second=await startBankCreditRequestRuntime({
    ...opts,storeDir:x.dir,
    bankPayee:{...opts.bankPayee,account_number:'000012345679'},
  });
  const url=new URL(c.payment_request_url);
  const old=await fetch(second.url+url.pathname);
  assert.equal(old.status,410);
  assert.equal((await old.json()).error,'request_unavailable_or_expired');
  const replay=await issue(second,approved);
  assert.equal(replay.status,409);
  assert.equal(replay.data.error,'idempotency_conflict');
 }finally{
  if(second)await second.close();
  await x.dispose();
 }
});


test('private reconciliation endpoint compares bank observations but never issues paid receipts',async()=>{
 const x=await setup();
 try{
  const c=(await issue(x.rt,approved)).data;
  const saved=JSON.parse(await fs.readFile(path.join(x.dir,c.request_id+'.json'),'utf8'));
  const route=x.rt.url+'/v1/operator/bank-credit/reconcile';
  const observations=[{
   source_type:'merchant_bank_statement_observation',
   bank_transaction_id:'SYNTHETIC-BANK-POSTING-1',
   receiving_account_key:saved.receiving_account_key,
   amount_cents:25000,currency:'usd',direction:'credit',bank_status:'posted',
   posted_at:'2026-11-11T16:00:00Z',
   memo:'ACH CREDIT '+c.reference,
  }];
  const body={request_ids:[c.request_id],observations};
  const send=(b,token=opts.operatorToken)=>fetch(route,{
   method:'POST',headers:{'content-type':'application/json',
    authorization:'Bearer '+token},body:JSON.stringify(b),
  });
  assert.equal((await send(body,'wrong-operator-key')).status,401);
  const result=await send(body);
  assert.equal(result.status,200);
  const report=await result.json();
  assert.equal(report.candidates,1);
  assert.equal(report.matches[0].match_state,'RECONCILIATION_CANDIDATE');
  assert.equal(report.matches[0].paid_verified,false);
  assert.equal(report.paid_orders_confirmed,0);
  assert.equal(report.fulfillment_releases,0);
  assert.equal(report.bank_data_authenticated,false);
  assert.doesNotMatch(JSON.stringify(report),/SYNTHETIC-BANK-POSTING-1|000012345678|021000021/);
  const later=await send({...body,observations:[{...observations[0],bank_status:'pending'}]});
  assert.equal(later.status,200);
  assert.equal((await later.json()).candidates,0);
  const dupe=await send({...body,observations:[...observations,...observations]});
  assert.equal(dupe.status,200);
  assert.equal((await dupe.json()).candidates,0);
  const invalid=await send({...body,request_ids:['../../private']});
  assert.equal(invalid.status,422);
  const notFound=await send({...body,request_ids:['bpr_'+'9'.repeat(32)]});
  assert.equal(notFound.status,404);
  // No request state has changed through any reconciliation diagnostic.
  const storedAfter=JSON.parse(await fs.readFile(path.join(x.dir,c.request_id+'.json'),'utf8'));
  assert.deepEqual(storedAfter,saved);
 }finally{await x.dispose()}
});
