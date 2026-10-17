import test from 'node:test';
import assert from 'node:assert/strict';
import {runCanary} from './checkout-fabric-live-canary.mjs';
function mockFetch({old=false,missing=null,receipt=true,source='owned_updater_verified',ref='sha256:'+'f'.repeat(64)}={}){
  const calls=[];
  const fetchImpl=async(url,opts)=>{
    calls.push({url,method:opts.method});
    const route=new URL(url).pathname;
    if(route==='/health')return new Response(JSON.stringify({source_release_ref:receipt?'a'.repeat(40):null,source_release_ref_bound:receipt,deployment_receipt_bound:receipt,deployment_receipt_source:receipt?source:null,deployment_receipt_ref:receipt?ref:null}),{status:200});
    if(route==='/offers/'+missing)return new Response('{"error":"offer_not_found"}',{status:404});
    const prices={'website-audit':'$49','ibmi-rescue':'$250','legacy-rescue':'$299','findmypart':'$19','site-survive':'$250'};
    const slug=route.split('/').at(-1);
    return new Response('<form action="/api/offers/'+slug+'/checkout">'+(old?'':'<input name="customer_ref" type="email" required>')+'<button>Continue to checkout</button>'+prices[slug]+'</form>',{status:200});
  };
  return {fetchImpl,calls};
}
test('passing release has a verified binding and five correctly mapped forms',async()=>{
  const {fetchImpl,calls}=mockFetch();const r=await runCanary({fetchImpl});
  assert.equal(r.passed,true);assert.equal(r.checks.length,6);
  assert.equal(r.checks.filter(x=>x.email).length,5);
  assert.equal(calls.length,6);assert.ok(calls.every(x=>x.method==='GET'));
});
test('apparent readiness cannot pass without a traceable live deployment receipt',async()=>{
  const noProvenance=await runCanary({fetchImpl:mockFetch({source:''}).fetchImpl});
  assert.equal(noProvenance.passed,false);
  assert.ok(noProvenance.failures.includes('deployment_provenance_unverified'));
  const invalidRef=await runCanary({fetchImpl:mockFetch({ref:'untrusted'}).fetchImpl});
  assert.equal(invalidRef.passed,false);
  assert.ok(invalidRef.failures.includes('deployment_receipt_ref_invalid'));
  const compute=await runCanary({fetchImpl:mockFetch({source:'admitted_compute'}).fetchImpl});
  assert.equal(compute.passed,true);
});
test('stale production cannot pass only because screenshots rendered',async()=>{
  const r=await runCanary({fetchImpl:mockFetch({old:true,receipt:false}).fetchImpl});
  assert.equal(r.passed,false);
  assert.ok(r.failures.includes('source_release_unbound'));
  assert.ok(r.failures.includes('deployment_receipt_unbound'));
  assert.ok(r.failures.includes('website-audit_contract_incomplete'));
});
test('404 paid offer is P0 even if other pages render',async()=>{
  const r=await runCanary({fetchImpl:mockFetch({missing:'site-survive'}).fetchImpl});
  assert.equal(r.passed,false);assert.ok(r.failures.includes('site-survive_http_404'));
});
test('public target is fixed to an approved origin',async()=>{
  await assert.rejects(()=>runCanary({origin:'http://localhost:1010'}),/unapproved_canary_origin/);
});
