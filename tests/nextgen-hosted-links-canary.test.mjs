import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectCheckoutUrl,observeHostedLinks} from '../scripts/nextgen-hosted-links-canary.mjs';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('GET-only reachability does not claim a paid receipt or live item identity',async()=>{
  const calls=[];
  const mock=async(url,init)=>{
    calls.push({url,method:init.method,redirect:init.redirect});
    return new Response('<html>Stripe</html>',{status:200});
  };
  const d=await inspectCheckoutUrl('https://buy.stripe.com/abc123',{fetchImpl:mock});
  assert.equal(d.outcome,'HTTP_REACHABLE_FORM_NOT_VERIFIED');
  assert.deepEqual(calls,[{url:'https://buy.stripe.com/abc123',method:'GET',redirect:'manual'}]);
});
test('redirect outside Stripe checkout allowlist is blocked before next call',async()=>{
  let calls=0;
  const mock=async()=>{calls++;return new Response(null,{status:303,headers:{location:'https://not-stripe.example/checkout'}})};
  const d=await inspectCheckoutUrl('https://buy.stripe.com/abc123',{fetchImpl:mock});
  assert.equal(d.outcome,'UNAPPROVED_REDIRECT');
  assert.equal(calls,1);
  assert.equal((await inspectCheckoutUrl('https://unapproved.invalid/any',{fetchImpl:mock})).outcome,'UNAPPROVED_DESTINATION');
  assert.equal(calls,1);
});
test('full report requires catalog and never claims live provider account validity',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'evercraft-checkouts-'));
  try{
    mkdirSync(join(folder,'public/mesh/checkout-ready'),{recursive:true});
    writeFileSync(join(folder,'public/mesh/checkout-ready/verified-links.json'),JSON.stringify({
      checked_on:'2026-10-21',links:[{key:'asset-diagnosis',amount_cents:14900,url:'https://buy.stripe.com/abc123'}]
    }));
    const d=await observeHostedLinks({cwd:folder,fetchImpl:async()=>new Response('ok',{status:200})});
    assert.equal(d.http_reachable,1);
    assert.equal(d.results[0].recorded_price_usd,'149.00');
    assert.equal(d.provider_account_activity_verified,false);
    assert.equal(d.product_price_identity_live_verified,false);
    assert.equal(d.payments_attempted,0);
    assert.equal(d.form_submissions,0);
  }finally{rmSync(folder,{recursive:true,force:true});}
});
