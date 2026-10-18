import test from 'node:test';
import assert from 'node:assert/strict';
import {APPROVED_ORIGIN,BUYER_MOMENTS,observeBuyerMomentParity} from '../scripts/fabric-buyer-moments-live-canary.mjs';

function mock({newIndex=true,missing=null,wrongPrice=null,bound=true}={}){
  const calls=[];
  const mockFetch=async(url,options)=>{
    const p=new URL(url).pathname;
    calls.push({url,method:options.method,redirect:options.redirect});
    if(p==='/health')return new Response(JSON.stringify({
      source_release_ref:bound?'a'.repeat(40):null,
      source_release_ref_bound:bound,
      deployment_receipt_bound:bound,
    }),{status:200,headers:{'content-type':'application/json'}});
    if(p==='/offers'){
      const index=newIndex
        ?'<section class="moments"><h2>What is getting in your way?</h2><div class="moment-grid">'+BUYER_MOMENTS.map(([s])=>'<a class="moment" href="/offers/'+s+'">problem</a>').join('')+'</div></section>'
        :'<div class="grid">Old collection without buyer moments</div>';
      return new Response(index,{status:200,headers:{'content-type':'text/html'}});
    }
    const slug=p.split('/').at(-1);
    if(slug===missing)return new Response('not found',{status:404});
    const price=BUYER_MOMENTS.find(x=>x[0]===slug)?.[1];
    return new Response('<form action="/api/offers/'+slug+'/checkout"><input name="customer_ref" type="email"><input name="user_confirmed" value="true"><button>Continue to checkout</button>'+((wrongPrice===slug)?'$1':price)+'<p>Nothing is marked paid until settlement is verified</p></form>',
      {status:200,headers:{'content-type':'text/html'}});
  };
  return {mockFetch,calls};
}
test('full outsider path is seven public GETs plus health, no payment or contact',async()=>{
  const {mockFetch,calls}=mock();
  const r=await observeBuyerMomentParity({fetchImpl:mockFetch});
  assert.equal(r.passed,true);
  assert.equal(r.checks.length,8);
  assert.equal(r.summary.buyer_moments,6);
  assert.ok(r.receipt_hash.startsWith('sha256:'));
  assert.equal(r.requests_posted,0);
  assert.equal(r.payment_attempts,0);
  assert.equal(r.source_merge_claimed,false);
  assert.equal(calls.length,8);
  assert.ok(calls.every(c=>c.method==='GET'&&c.redirect==='error'));
});
test('old production page cannot masquerade as new release',async()=>{
  const r=await observeBuyerMomentParity({fetchImpl:mock({newIndex:false}).mockFetch});
  assert.equal(r.passed,false);
  assert.ok(r.failures.includes('buyer_moments_source_not_on_public_edge'));
  assert.ok(r.failures.includes('index_missing_payments-pilot'));
  assert.equal(r.deployed,false);
});
test('unbound source/deployment never proves release',async()=>{
  const r=await observeBuyerMomentParity({fetchImpl:mock({bound:false}).mockFetch});
  assert.equal(r.passed,false);
  assert.ok(r.failures.includes('source_release_unbound'));
  assert.ok(r.failures.includes('deployment_receipt_unbound'));
  assert.equal(r.deployed,false);
});
test('missing approved SKU and price drift fail closed',async()=>{
  const missing=await observeBuyerMomentParity({fetchImpl:mock({missing:'ibmi-xray'}).mockFetch});
  assert.equal(missing.passed,false);
  assert.ok(missing.failures.includes('ibmi-xray_http_404'));
  const changed=await observeBuyerMomentParity({fetchImpl:mock({wrongPrice:'payments-pilot'}).mockFetch});
  assert.equal(changed.passed,false);
  assert.ok(changed.failures.includes('payments-pilot_contract_incomplete'));
});
test('the canary cannot silently target a nonapproved origin',async()=>{
  await assert.rejects(()=>observeBuyerMomentParity({origin:'https://findmypart.base44.app'}),/unapproved_origin/);
  await assert.rejects(()=>observeBuyerMomentParity({origin:'http://localhost:8000'}),/unapproved_origin/);
});
