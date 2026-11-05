import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectWebsiteAuditCheckoutHandoff as inspect, WEBSITE_AUDIT_NATIVE_ORDER as SKU} from '../systemia/mcp/website-audit-payment-guard.mjs';
import {startFabricLocalRuntime} from '../systemia/mcp/fabric-local-runtime.mjs';

const domain='evercraftpropertyservices.com';
const valid=()=>({
  ok:true,checkout_ready:true,authority:'Evercraft Payments',
  order_key:'RAVEN-WEBSITE-AUDIT-QUICK-WIN-TEST',amount_cents:4900,
  currency:'usd',payment_state:'unpaid',fulfillment_release:false,
  context_persisted:true,audited_domain:domain,
  checkout_url:'https://checkout.stripe.com/c/pay/cs_test_example',
});

test('correct $49 Website Audit checkout handoff remains unpaid and does not grant fulfillment',()=>{
  const r=inspect({result:valid(),auditedDomain:domain});
  assert.equal(SKU.capabilityKey,'website-audit-quick-win');
  assert.equal(SKU.amountCents,4900);
  assert.equal(r.accepted,true);
  assert.equal(r.expectedAmountCents,4900);
  assert.equal(r.providerPaymentVerified,false);
  assert.equal(r.fulfillmentAuthorized,false);
  assert.equal(r.checkoutCreatedByThisValidator,false);
});

for(const [name,mutation,reason] of [
  ['wrong $50 price',r=>r.amount_cents=5000,'amount_or_currency_mismatch'],
  ['same price in EUR',r=>r.currency='eur','amount_or_currency_mismatch'],
  ['string price pretending to equal 4900',r=>r.amount_cents='4900','amount_or_currency_mismatch'],
  ['already paid assertion',r=>r.payment_state='paid','premature_payment_or_fulfillment'],
  ['entitlement released assertion',r=>r.fulfillment_release=true,'premature_payment_or_fulfillment'],
  ['wrong authority',r=>r.authority='Other Payments','payment_authority_mismatch'],
  ['no canonical order',r=>r.order_key='','canonical_order_key_missing'],
  ['custody not persisted',r=>r.context_persisted=false,'audited_domain_custody_mismatch'],
  ['wrong audited domain',r=>r.audited_domain='someoneelse.example','audited_domain_custody_mismatch'],
  ['insecure checkout url',r=>r.checkout_url='http://example.org/pay','checkout_destination_invalid'],
  ['credentialed url',r=>r.checkout_url='https://name:password@checkout.stripe.com/pay','checkout_destination_invalid'],
  ['fragment url',r=>r.checkout_url='https://checkout.stripe.com/pay#token','checkout_destination_invalid'],
]){
  test('Evercraft Payments refuses '+name,()=>{
    const response=valid();mutation(response);
    const checked=inspect({result:response,auditedDomain:domain});
    assert.equal(checked.accepted,false);
    assert.equal(checked.reason,reason);
    assert.equal(checked.providerPaymentVerified,false);
    assert.equal(checked.fulfillmentAuthorized,false);
  });
}

const native='https://fabric.systemiacommandcenters.com/api/payments/intent';
const ops='https://fabric.systemiacommandcenters.com/api/payments/ops';
const item={
  public_id:'audit-center-website-audit-machine-v1',
  name:'Systemia Website Audit',description:'Public website review',
  pricing:'Quick Win Audit $49',state:'payment_ready',commercial_state:'sell_now',
  entry_paid_offer:{name:'Quick Win Audit',price:'$49',price_usd_normalized:49,billing:'one_time'},
  keywords:['audit'],connections:[],
};
function mockTransport(response,calls){
  return async(_url,init)=>{
    const req=JSON.parse(init.body);calls.push(req);
    if(req.action==='website_audit_prepayment_preflight'){
      return Response.json({schema:'raven.website-audit-context-preflight.v1',ok:true,
        audited_domain:domain,checkout_created:false});
    }
    return Response.json(response);
  };
}
async function sendRequest(response,format){
  const calls=[];
  const runtime=await startFabricLocalRuntime({
    host:'127.0.0.1',port:0,catalog:[item],faieSurfaceEnabled:false,
    purchaseIntentUrl:native,paymentOpsUrl:ops,purchaseIntentFetch:mockTransport(response,calls),
  });
  try{
    const data={user_confirmed:true,customer_ref:'buyer@example.test',
      website_url:'https://evercraftpropertyservices.com/'};
    const isForm=format==='form';
    const body=isForm?new URLSearchParams(data):JSON.stringify(data);
    const res=await fetch(runtime.url+'/api/offers/website-audit/checkout',{
      method:'POST',headers:{'content-type':isForm?'application/x-www-form-urlencoded':'application/json'},
      body,redirect:'manual',
    });
    const text=await res.text();
    return {status:res.status,location:res.headers.get('location'),text,calls};
  }finally{await runtime.close()}
}
test('Evercraft Payments rejects wrong amount before handing any browser a checkout URL',async()=>{
  const r=valid();r.amount_cents=5000;
  const json=await sendRequest(r,'json');
  assert.equal(json.status,503);
  assert.equal(JSON.parse(json.text).checkout_ready,false);
  assert.equal(json.location,null);
  assert.equal(json.calls.length,2);
  assert.equal(json.calls[0].action,'website_audit_prepayment_preflight');
  assert.equal(json.calls[1].capability_key,'website-audit-quick-win');

  const browser=await sendRequest(r,'form');
  assert.equal(browser.status,503);
  assert.equal(browser.location,null);
  assert.match(browser.text,/Checkout could not be confirmed/);
  assert.doesNotMatch(browser.text,/checkout\.stripe\.com/);
});

test('correct exact-SKU response creates a local handoff, never a paid order claim',async()=>{
  const response=await sendRequest(valid(),'form');
  assert.equal(response.status,303);
  assert.match(response.location||'',/^\/checkout\/handoff\//);
  assert.equal(response.calls.length,2);
});
