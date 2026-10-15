import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyWebsiteAuditCheckoutHandoff} from './website-audit-checkout-boundary.mjs';
import {startFabricLocalRuntime} from './fabric-local-runtime.mjs';

const valid=()=>({
  ok:true,authority:'Evercraft Payments',payment_runtime:'central',
  capability_key:'website-audit-quick-win',
  offer_key:'systemia.website_audit_quick_win_49.v1',
  amount_cents:4900,currency:'usd',checkout_ready:true,
  checkout_url:'https://checkout.stripe.com/c/pay/cs_fixture_123',
  payment_state:'unpaid',fulfillment_release:false,
});

test('correct $49 checkout handoff is a contract match, NEVER paid/provider proof',()=>{
  const r=verifyWebsiteAuditCheckoutHandoff(valid());
  assert.equal(r.valid,true);
  assert.equal(r.provider_authentication_verified,false);
  assert.equal(r.paid,false);
  assert.equal(r.customer_contact_authority,false);
});

test('wrong offer, amount, currency, authority and checkout host fail closed',()=>{
  const bad=[
    {...valid(),offer_key:'ibmi_estate_xray_250'},
    {...valid(),capability_key:'ibmi-estate-xray'},
    {...valid(),amount_cents:25000},
    {...valid(),currency:'eur'},
    {...valid(),authority:'other'},
    {...valid(),payment_runtime:'mirror'},
    {...valid(),checkout_url:'https://checkout.stripe.com.evil.invalid/pay'},
    {...valid(),checkout_url:'https://evil.invalid/pay'},
    {...valid(),checkout_url:'http://checkout.stripe.com/pay'},
    {...valid(),checkout_url:'https://alice@checkout.stripe.com/pay'},
    {...valid(),checkout_url:'https://checkout.stripe.com:8443/pay'},
    {...valid(),checkout_url:'https://checkout.stripe.com/'},
    {...valid(),checkout_url:'https://checkout.stripe.com/pay#untrusted'},
    {...valid(),payment_state:'paid'},
    {...valid(),fulfillment_release:true},
  ];
  for(const item of bad){
    const r=verifyWebsiteAuditCheckoutHandoff(item);
    assert.equal(r.valid,false,JSON.stringify(item));
    assert.equal(r.paid,false);
  }
});

test('real Fabric HTTP request refuses off-domain or mismatched price and never redirects',async()=>{
  const catalog=[{
    public_id:'audit-center-website-audit-machine-v1',name:'Systemia Website Audit',
    description:'Public website quick win audit',
    state:'payment_ready',commercial_state:'sell_now',
    pricing:'Quick Win Audit $49 one time',
    entry_paid_offer:{name:'Quick Win Audit',price:'$49',price_usd_normalized:49,billing:'one_time'},
    connections:[],keywords:['website'],use_when:['website audit'],
  }];
  let upstream={...valid(),checkout_url:'https://attacker.invalid/phishing'};
  let calls=0;
  const runtime=await startFabricLocalRuntime({
    host:'127.0.0.1',port:0,catalog,faieSurfaceEnabled:false,
    purchaseIntentFetch:async(_url,init)=>{
      calls++;
      const input=JSON.parse(String(init?.body||'{}'));
      if(input.action==='website_audit_prepayment_preflight')return Response.json({
        ok:true,schema:'raven.website-audit-context-preflight.v1',
        audited_domain:'customer-business.org',checkout_created:false,
      });
      return Response.json({...upstream,context_persisted:true,audited_domain:'customer-business.org'});
    },
  });
  try{
    const invoke=async()=>fetch(runtime.url+'/api/offers/website-audit/checkout',{
      method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({user_confirmed:'true',customer_ref:'buyer@customer-business.org',website_url:'https://customer-business.org'}),redirect:'manual',
    });
    let r=await invoke();
    assert.equal(r.status,503);
    assert.equal(r.headers.get('location'),null);
    assert.match(await r.text(),/No charge was made/);
    upstream={...valid(),amount_cents:25000};
    r=await invoke();
    assert.equal(r.status,503);
    assert.equal(r.headers.get('location'),null);
    upstream={...valid()};
    r=await invoke();
    assert.equal(r.status,303);
    assert.match(r.headers.get('location'),/^\/checkout\/handoff\//);
    assert.equal(calls,6);
  }finally{await runtime.close();}
});
