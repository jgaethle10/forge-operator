import test from 'node:test';
import assert from 'node:assert/strict';
import {observeSignalNativeOffer} from '../scripts/probe-signal-native-payments.mjs';
const ORIGIN='https://fabric.systemiacommandcenters.com';
function stub({offerStatus=200,held=true}={}){
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,method:options.method});
    if(url.endsWith('/health'))return Response.json({
      source_release_ref_bound:true,
      deployment_receipt_bound:true,
      human_offer_checkout_enabled:true
    });
    const body=held?'<h1>Evercraft Payments</h1><h2>Incident Evidence Brief</h2><p>$250</p><p>Confirm your incident brief first.</p>':'<h1>Unrelated product</h1>';
    return new Response(body,{status:offerStatus,headers:{'content-type':'text/html'}});
  };
  return {fetchImpl,calls};
}
test('owned offer gets are evidence of a held page only, never a payment',async()=>{
  const s=stub();
  const receipt=await observeSignalNativeOffer({fetchImpl:s.fetchImpl});
  assert.equal(receipt.native_offer_reachable,true);
  assert.equal(receipt.deploy_attestation_verified,true);
  assert.equal(receipt.status,'native_owned_offer_page_observed_checkout_held');
  assert.equal(receipt.checkout_ready,false);
  assert.equal(receipt.payments_attempted,0);
  assert.equal(receipt.orders_created,0);
  assert.ok(s.calls.every(x=>x.method==='GET'));
  assert.deepEqual(s.calls.map(x=>x.url),[ORIGIN+'/health',ORIGIN+'/offers/signal-brief']);
});
test('a 404 or wrong offer price is not claimed as a verified buyer door',async()=>{
  for(const settings of [{offerStatus:404},{held:false}]){
    const s=stub(settings);
    const receipt=await observeSignalNativeOffer({fetchImpl:s.fetchImpl});
    assert.equal(receipt.native_offer_reachable,false);
    assert.equal(receipt.checkout_ready,false);
  }
});
test('canary never probes user-chosen endpoints',async()=>{
  await assert.rejects(observeSignalNativeOffer({origin:'https://evil.example'}),/unapproved_owned_origin/);
});
