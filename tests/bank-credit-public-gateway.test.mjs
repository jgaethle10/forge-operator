import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startBankCreditRequestRuntime} from '../systemia/payments/bank-credit-request-runtime.mjs';
import {startBankCreditPublicGateway} from '../systemia/payments/bank-credit-public-gateway.mjs';

const token='operator-test-fixture-key-01234567890123456789012345';
const secret='bank-link-hmac-test-fixture-01234567890123456789012345';
const approved={offer_key:'asset-diagnosis-149',
 idempotency_key:'public-gateway-test-order-key-1234',
 scope_approved:true,capacity_approved:true,buyer_confirmed:true};
const bank={receiving_account_confirmed:true,legal_name:'Evercraft Synthetic Fixture',
 bank_name:'Sandbox Fixture Bank',routing_number:'021000021',
 account_number:'000012345678',account_type:'business_checking',
 bank_confirmation_ref:'synthetic-checker-only'};
async function setup(){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'evercraft-public-gateway-'));
 const privateRuntime=await startBankCreditRequestRuntime({
  storeDir:dir,operatorToken:token,linkSigningKey:secret,
  approvedOffers:[{offer_key:'asset-diagnosis-149',product_key:'asset-diagnosis',
    name:'Asset Diagnosis',amount_cents:14900,currency:'usd',owner_approved:true}],
  bankPayee:bank,
 });
 const gateway=await startBankCreditPublicGateway({privateRuntimeUrl:privateRuntime.url});
 return {dir,privateRuntime,gateway,close:async()=>{
  await gateway.close();await privateRuntime.close();
  await fs.rm(dir,{recursive:true,force:true});
 }};
}
async function issue(privateUrl){
 const r=await fetch(privateUrl+'/v1/operator/bank-requests',{
  method:'POST',
  headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify(approved),
 });
 assert.equal(r.status,201);return r.json();
}
test('public listener serves only the exact, signed, read-only ACH buyer page',async()=>{
 const x=await setup();
 try{
  const created=await issue(x.privateRuntime.url);
  const signed=new URL(created.payment_request_url);
  const r=await fetch(x.gateway.url+signed.pathname);
  assert.equal(r.status,200);
  assert.match(r.headers.get('cache-control'),/no-store/);
  assert.equal(r.headers.get('referrer-policy'),'no-referrer');
  assert.equal(r.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
  assert.equal(r.headers.get('set-cookie'),null);
  const text=await r.text();
  assert.match(text,/Asset Diagnosis/);
  assert.match(text,/\$149\.00/);
  assert.match(text,/000012345678/);
  assert.match(text,/Payment has not been received or verified/);
  assert.doesNotMatch(text,/paid successfully|Payment complete/i);
  const head=await fetch(x.gateway.url+signed.pathname,{method:'HEAD'});
  assert.equal(head.status,200);
  assert.equal(await head.text(),'');
  for(const [uri,method] of [
    ['/health','GET'],
    ['/v1/operator/bank-requests','GET'],
    ['/v1/operator/bank-requests','POST'],
    ['/v1/operator/bank-credit/reconcile','POST'],
    [signed.pathname+'?redirect=https://evil.example','GET'],
    ['/pay/bank/../../v1/operator/bank-requests','GET'],
    ['/pay/bank/invalid','GET'],
  ]){
   const blocked=await fetch(x.gateway.url+uri,{method,redirect:'manual'});
   assert.ok([404,405].includes(blocked.status),method+' '+uri);
   assert.doesNotMatch(await blocked.text(),/operator_token|link_signing_key|account_number/);
  }
  assert.equal((await fs.readdir(x.dir)).length,1,'public gateway must not create new orders');
 }finally{await x.close()}
});
test('incorrect signature and unavailable private runtime fail closed',async()=>{
 const x=await setup();
 try{
  const c=await issue(x.privateRuntime.url);
  const pathname=new URL(c.payment_request_url).pathname;
  const tampered=pathname.slice(0,-1)+(pathname.endsWith('A')?'B':'A');
  assert.equal((await fetch(x.gateway.url+tampered)).status,404);
  await x.privateRuntime.close();
  const missing=await fetch(x.gateway.url+pathname);
  assert.equal(missing.status,502);
  // Avoid second close of the already stopped private listener
  await x.gateway.close();await fs.rm(x.dir,{recursive:true,force:true});
 }catch(error){
  await x.gateway.close().catch(()=>{});
  await x.privateRuntime.close().catch(()=>{});
  await fs.rm(x.dir,{recursive:true,force:true});
  throw error;
 }
});
test('public listener refuses arbitrary remote targets and nonloopback interfaces',async()=>{
 for(const changes of [
  {privateRuntimeUrl:'https://evil.example'},
  {privateRuntimeUrl:'http://localhost:8795'},
  {privateRuntimeUrl:'http://127.0.0.1:8795/v1/operator'},
  {privateRuntimeUrl:'http://127.0.0.1:8795?query=1'},
  {privateRuntimeUrl:'http://127.0.0.1:8795@evil.example'},
  {privateRuntimeUrl:'http://127.0.0.1:8795',host:'0.0.0.0'},
 ]){
  await assert.rejects(()=>startBankCreditPublicGateway(changes),/invalid|loopback_only/);
 }
});


test('public gateway stops serving a signed ACH instruction after private operator revocation',async()=>{
 const x=await setup();
 try{
  const order=await issue(x.privateRuntime.url);
  const signedPath=new URL(order.payment_request_url).pathname;
  assert.equal((await fetch(x.gateway.url+signedPath)).status,200);
  const result=await fetch(x.privateRuntime.url+'/v1/operator/bank-requests/revoke',{
   method:'POST',
   headers:{'authorization':'Bearer '+token,'content-type':'application/json'},
   body:JSON.stringify({request_id:order.request_id,reason:'suspected_link_compromise'}),
  });
  assert.equal(result.status,200);
  const held=await fetch(x.gateway.url+signedPath);
  assert.equal(held.status,410);
  const redacted=await held.json();
  assert.equal(redacted.error,'payment_request_revoked');
  assert.equal(redacted.fulfillment_release,undefined);
  const head=await fetch(x.gateway.url+signedPath,{method:'HEAD'});
  assert.equal(head.status,410);
  assert.equal(await head.text(),'');
  assert.equal((await fetch(x.gateway.url+'/v1/operator/bank-requests/revoke',{
   method:'POST',headers:{'authorization':'Bearer '+token},
  })).status,405);
 }finally{await x.close()}
});
