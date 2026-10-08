import test from 'node:test';
import assert from 'node:assert/strict';
import {
  offerCapabilityForSlug,
  offerPurchaseKeyForSlug,
  offerSlugForCapability,
  renderCapabilityDetail,
  renderOfferPage,
  renderOffers,
} from '../systemia/mcp/fabric-public-site.mjs';
import { startFabricLocalRuntime } from '../systemia/mcp/fabric-local-runtime.mjs';

const websiteAudit={
  public_id:'audit-center-website-audit-machine-v1',
  name:'Systemia Website Audit',
  description:'Find website conversion, performance, discoverability, and public-web problems.',
  keywords:['website audit','conversion'],
  state:'payment_ready',
  commercial_state:'sell_now',
  pricing:'Free preview. Quick Win Audit $49 one-time and machine-fulfilled after verified payment.',
  use_when:['why is my website not getting leads'],
  entry_paid_offer:{
    name:'Quick Win Audit',
    price:'$49',
    price_usd_normalized:49,
    billing:'one_time',
  },
  start_url_state:'held_no_owned_public_origin',
  connections:[],
};

test('human offer copy gives sell-now capabilities short memorable URLs',()=>{
  assert.equal(offerSlugForCapability(websiteAudit.public_id),'website-audit');
  assert.equal(offerCapabilityForSlug('website-audit',[websiteAudit])?.public_id,websiteAudit.public_id);
  assert.equal(offerPurchaseKeyForSlug('website-audit'),'website-audit-quick-win');

  const directory=renderOffers([websiteAudit]);
  assert.match(directory,/\/offers\/website-audit/);
  assert.match(directory,/Your website is getting attention/);
  assert.match(directory,/Starts at \$49/);

  const page=renderOfferPage(websiteAudit);
  assert.match(page,/Your website is getting attention\. Why isn&#39;t it getting customers\?/);
  assert.match(page,/What you are buying/);
  assert.match(page,/What you send us/);
  assert.match(page,/What you get back/);
  assert.match(page,/How it works/);
  assert.match(page,/\/api\/offers\/website-audit\/checkout/);
  assert.match(page,/Continue to checkout/);
  assert.match(page,/Evercraft Payments/);
  assert.match(page,/\$49/);
  assert.match(page,/property="og:title"/);
  assert.match(page,/property="og:description"/);
  assert.match(page,/property="og:url" content="https:\/\/fabric\.systemiacommandcenters\.com\/offers\/website-audit"/);
  assert.match(page,/rel="canonical" href="https:\/\/fabric\.systemiacommandcenters\.com\/offers\/website-audit"/);
  assert.match(page,/name="twitter:card" content="summary_large_image"/);
  assert.match(page,/property="og:image" content="https:\/\/fabric\.systemiacommandcenters\.com\/visuals\/website-audit-attention\/poster-feed\.svg"/);
  assert.doesNotMatch(page,/machine state|start_url_state|preferred_agent_route/i);
});

test('EarthWorks capability page offers a scoped human inquiry instead of checkout',()=>{
  const earthworks={
    public_id:'earthworks-site-autonomy-study-v1',
    name:'EarthWorks Site Autonomy Study',
    description:'Study one bounded material-flow loop before physical autonomy.',
    keywords:['quarry','haul trucks','shadow dispatch'],
    state:'human_handoff_only',
    commercial_state:'sell_now',
    pricing:'$5,000 one-time for the first three approved founding design-partner studies; planned standard price $7,500.',
    use_when:['reduce haul truck queueing at a quarry'],
    entry_paid_offer:{
      name:'Founding Design-Partner Site Autonomy Study',
      price:'$5,000',
      price_usd_normalized:5000,
      billing:'one_time',
    },
    start_url_state:'held_no_owned_public_origin',
    connections:[],
  };
  const page=renderCapabilityDetail(earthworks);
  assert.match(page,/EarthWorks Site Autonomy Study/);
  assert.match(page,/\$5,000/);
  assert.match(page,/Discuss one material loop/);
  assert.match(page,/mailto:jessegaethle10@gmail\.com/);
  assert.doesNotMatch(page,/Continue to checkout/);
  assert.doesNotMatch(page,/\/api\/offers\/earthworks/);
});

test('owned Fabric serves offer pages, requires confirmation, and delegates checkout to Raven',async()=>{
  const seen=[];
  const runtime=await startFabricLocalRuntime({
    host:'127.0.0.1',
    port:0,
    catalog:[websiteAudit],
    faieSurfaceEnabled:false,
    purchaseIntentUrl:'https://fabric.systemiacommandcenters.com/api/internal/test-payment-intent',
    purchaseIntentFetch:async(url,init)=>{
      seen.push({
        url:String(url),
        redirect:init?.redirect,
        body:JSON.parse(String(init?.body||'{}')),
      });
      return new Response(JSON.stringify({
        ok:true,
        authority:'Evercraft Payments',
        order_key:'RAVEN-WEBSITE-AUDIT-QUICK-WIN-TEST',
        amount_cents:4900,
        currency:'usd',
        checkout_ready:true,
        checkout_url:'https://checkout.stripe.com/c/pay/test_session',
        payment_state:'unpaid',
        fulfillment_release:false,
      }),{
        status:200,
        headers:{'content-type':'application/json'},
      });
    },
  });
  try{
    const directory=await fetch(runtime.url+'/offers');
    assert.equal(directory.status,200);
    assert.match(await directory.text(),/One problem/);

    const demo=await fetch(runtime.url+'/demos/hvac-lead-recovery/');
    assert.equal(demo.status,200);
    assert.match(demo.headers.get('content-type')||'',/^text\/html/i);
    const demoBody=await demo.text();
    assert.match(demoBody,/Evercraft HVAC Lead Recovery Demo/);
    assert.match(demoBody,/Turn this into a ready-to-work lead/);
    assert.match(demoBody,/Use your own numbers/);
    assert.match(demoBody,/Map this to my workflow/);

    const offer=await fetch(runtime.url+'/offers/website-audit');
    assert.equal(offer.status,200);
    assert.match(await offer.text(),/Quick Win Audit/);

    const noConfirmation=await fetch(runtime.url+'/api/offers/website-audit/checkout',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({}),
    });
    assert.equal(noConfirmation.status,409);
    assert.equal(seen.length,0);

    const checkout=await fetch(runtime.url+'/api/offers/website-audit/checkout',{
      method:'POST',
      headers:{'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({user_confirmed:'true'}),
      redirect:'manual',
    });
    assert.equal(checkout.status,303);
    const handoffLocation=checkout.headers.get('location')||'';
    assert.match(handoffLocation,/^\/checkout\/handoff\/[A-Za-z0-9_-]+$/);
    assert.equal(checkout.headers.get('x-evercraft-payment-authority'),'Evercraft Payments');

    const handoff=await fetch(runtime.url+handoffLocation);
    assert.equal(handoff.status,200);
    assert.match(handoff.headers.get('content-type')||'',/^text\/html/i);
    const checkoutBody=await handoff.text();
    assert.match(checkoutBody,/Your checkout is ready\./);
    assert.match(checkoutBody,/Open secure checkout/);
    assert.match(checkoutBody,/checkout\.stripe\.com\/c\/pay\/test_session/);
    assert.match(checkoutBody,/Evercraft Payments/);
    assert.equal(seen.length,1);
    assert.equal(seen[0].redirect,'error');
    assert.equal(seen[0].body.user_confirmed,true);
    assert.equal(seen[0].body.capability_key,'website-audit-quick-win');
    assert.match(seen[0].body.idempotency_key,/^fabric-website-audit-/);

    const review=await fetch(runtime.url+'/api/chum/go/'+websiteAudit.public_id+'?surface=offer-test',{
      redirect:'manual',
    });
    assert.equal(review.status,302);
    assert.equal(
      review.headers.get('location'),
      '/offers/website-audit?from=chum&surface=offer-test'
    );
  }finally{
    await runtime.close();
  }
});

test('human checkout failures render a branded Evercraft Payments page instead of raw JSON',async()=>{
  const runtime=await startFabricLocalRuntime({
    host:'127.0.0.1',
    port:0,
    catalog:[websiteAudit],
    faieSurfaceEnabled:false,
    purchaseIntentUrl:'https://fabric.systemiacommandcenters.com/api/internal/test-payment-intent',
    purchaseIntentFetch:async()=>new Response(JSON.stringify({
      ok:true,
      authority:'Evercraft Payments',
      order_key:'RAVEN-WEBSITE-AUDIT-QUICK-WIN-FAILCLOSED',
      checkout_ready:false,
      fulfillment_release:false,
    }),{
      status:200,
      headers:{'content-type':'application/json'},
    }),
  });
  try{
    const response=await fetch(runtime.url+'/api/offers/website-audit/checkout',{
      method:'POST',
      headers:{'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({user_confirmed:'true'}),
      redirect:'manual',
    });
    assert.equal(response.status,503);
    assert.match(response.headers.get('content-type')||'',/^text\/html/i);
    const body=await response.text();
    assert.match(body,/Checkout is not confirmed\./);
    assert.match(body,/not verified a completed payment/);
    assert.match(body,/Evercraft Payments/);
    assert.match(body,/Return to the offer/);
    assert.doesNotMatch(body,/evercraft_payments_checkout_not_ready|adapter_error|gate_key/);
  }finally{
    await runtime.close();
  }
});


test('default Fabric checkout holds without a configured approved owned backend', async()=>{
  let calls=0;
  const runtime=await startFabricLocalRuntime({
    host:'127.0.0.1',port:0,catalog:[websiteAudit],faieSurfaceEnabled:false,
    purchaseIntentUrl:'',
    purchaseIntentFetch:async()=>{calls++;throw new Error('unapproved_dispatch');},
  });
  try {
    const health=await fetch(runtime.url+'/health').then(r=>r.json());
    assert.equal(health.human_offer_checkout_enabled,false);
    assert.equal(health.purchase_intent_backend_state,'held_no_owned_backend');
    const response=await fetch(runtime.url+'/api/offers/website-audit/checkout',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({user_confirmed:true})
    });
    assert.equal(response.status,503);
    const body=await response.json();
    assert.equal(body.error,'owned_payment_backend_not_configured');
    assert.equal(body.checkout_ready,false);
    assert.equal(body.fulfillment_release,false);
    assert.equal(calls,0);
  }finally { await runtime.close(); }
});

test('retired and unrelated purchase backends cannot be configured', async()=>{
  for(const backend of [
    'https://base44.app/api/apps/retired',
    'https://provider.base44.app/api/checkout',
    'https://evil.example/checkout',
    'http://fabric.systemiacommandcenters.com/checkout',
    'https://fabric.systemiacommandcenters.com@evil.example/checkout',
  ]) await assert.rejects(
    startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[websiteAudit],
      faieSurfaceEnabled:false,purchaseIntentUrl:backend}),
    /purchase_intent_requires_approved_owned_https_backend/
  );
});

const ibmiRescue={
  public_id:'ibmi-rescue-v1',
  name:'Evercraft IBM i Rescue',
  description:'A bounded IBM i / AS400 support-transition risk assessment.',
  keywords:['ibm i 7.4 support','rpg','upgrade'],
  state:'direct_checkout_ready',
  commercial_state:'sell_now',
  pricing:'$250 IBM i Estate X-Ray; $250 IBM i 7.4 Deadline X-Ray.',
  entry_paid_offer:{name:'IBM i Estate X-Ray',price:'$250',price_usd_normalized:250,billing:'one_time'},
  connections:[],
};

test('7.4 public route and purchase SKU remain distinct from general Estate X-Ray',async()=>{
  const directory=renderOffers([ibmiRescue]);
  assert.match(directory,/\/offers\/ibmi-74-deadline-xray/);
  assert.match(directory,/Review the scope/);
  assert.match(directory,/\$250 proposed bounded assessment/);
  assert.equal(offerCapabilityForSlug('ibmi-74-deadline-xray',[ibmiRescue])?.public_id,'ibmi-rescue-v1');
  assert.equal(offerPurchaseKeyForSlug('ibmi-74-deadline-xray'),'ibmi_74_deadline_xray_250');
  assert.equal(offerPurchaseKeyForSlug('ibmi-rescue'),'ibmi-estate-xray');
  const page=renderOfferPage(ibmiRescue,{slug:'ibmi-74-deadline-xray',checkoutEnabled:false});
  assert.match(page,/September 30, 2026/);
  assert.match(page,/IBM i 7\.4 Deadline X-Ray/);
  assert.match(page,/\$250/);
  assert.match(page,/purchase corridor held/);
  assert.doesNotMatch(page,/Continue to checkout/);
  const runtime=await startFabricLocalRuntime({
    host:'127.0.0.1',port:0,catalog:[ibmiRescue],faieSurfaceEnabled:false,purchaseIntentUrl:''
  });
  try{
    const result=await fetch(runtime.url+'/offers/ibmi-74-deadline-xray');
    assert.equal(result.status,200);
    const body=await result.text();
    assert.match(body,/IBM i 7\.4 support changed/);
    assert.match(body,/purchase corridor held/);
    assert.doesNotMatch(body,/Continue to checkout/);
  }finally{await runtime.close();}
});

test('7.4 checkout sends exact SKU and rejects a mismatched same-price Estate checkout',async()=>{
  const seen=[];
  let wrongOffer=true;
  const runtime=await startFabricLocalRuntime({
    host:'127.0.0.1',port:0,catalog:[ibmiRescue],faieSurfaceEnabled:false,
    purchaseIntentUrl:'https://fabric.systemiacommandcenters.com/api/internal/test-payment-intent',
    purchaseIntentFetch:async(url,init)=>{
      seen.push(JSON.parse(init.body));
      return new Response(JSON.stringify({
        ok:true,
        authority:'Evercraft Payments',
        order_key:'IBMI-TEST-123',
        offer_key:wrongOffer?'ibmi_estate_xray_250':'ibmi_74_deadline_xray_250',
        amount_cents:25000,currency:'USD',
        checkout_ready:true,checkout_url:'https://checkout.stripe.com/c/pay/test',
        payment_state:'unpaid',fulfillment_release:false,
      }),{status:200,headers:{'content-type':'application/json'}});
    },
  });
  try{
    const url=runtime.url+'/api/offers/ibmi-74-deadline-xray/checkout';
    let result=await fetch(url,{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({user_confirmed:true}),
    });
    assert.equal(result.status,503);
    let body=await result.json();
    assert.equal(body.error,'ibmi_74_checkout_contract_not_verified');
    assert.equal(body.fulfillment_release,false);
    assert.equal(seen[0].offer_key,'ibmi_74_deadline_xray_250');
    assert.equal(seen[0].capability_key,'ibmi_74_deadline_xray_250');

    wrongOffer=false;
    result=await fetch(url,{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({user_confirmed:true}),
    });
    assert.equal(result.status,200);
    body=await result.json();
    assert.equal(body.amount_cents,25000);
    assert.equal(body.checkout_ready,true);
    assert.equal(body.payment_state,'unpaid');
    assert.equal(body.fulfillment_release,false);
    assert.equal(seen.length,2);
  }finally{await runtime.close();}
});

test('payment adapter network uncertainty holds both JSON and human forms',async()=>{
  const runtime=await startFabricLocalRuntime({
    host:'127.0.0.1',port:0,catalog:[websiteAudit],faieSurfaceEnabled:false,
    purchaseIntentUrl:'https://fabric.systemiacommandcenters.com/api/internal/approved-intent',
    purchaseIntentFetch:async(_url,init)=>{
      assert.equal(init.redirect,'error');
      throw new Error('simulated_backend_timeout');
    },
  });
  try{
    const api=await fetch(runtime.url+'/api/offers/website-audit/checkout',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({user_confirmed:true}),
    });
    assert.equal(api.status,503);
    const body=await api.json();
    assert.equal(body.error,'purchase_intent_response_unverified');
    assert.equal(body.checkout_ready,false);
    assert.equal(body.payment_verified,false);
    assert.equal(body.fulfillment_release,false);
    const form=await fetch(runtime.url+'/api/offers/website-audit/checkout',{
      method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({user_confirmed:'true'})
    });
    assert.equal(form.status,503);
    const html=await form.text();
    assert.match(html,/Checkout is not confirmed/);
    assert.doesNotMatch(html,/Open secure checkout/);
  }finally{await runtime.close();}
});
