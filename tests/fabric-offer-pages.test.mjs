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
  assert.match(directory,/See your website through their eyes/);
  assert.match(directory,/Starts at \$49/);

  const page=renderOfferPage(websiteAudit);
  assert.match(page,/See your website through their eyes\./);
  assert.match(page,/THE FIRST STEP/);
  assert.match(page,/What you send/);
  assert.match(page,/What you get/);
  assert.match(page,/THE VISITOR JOURNEY/);
  assert.match(page,/\/api\/offers\/website-audit\/checkout/);
  assert.match(page,/Continue to checkout/);
  assert.match(page,/name="customer_ref"/);
  assert.match(page,/type="email"/);
  assert.match(page,/autocomplete="email"/);
  assert.match(page,/Evercraft Payments/);
  assert.match(page,/\$49/);
  assert.match(page,/property="og:title"/);
  assert.match(page,/property="og:description"/);
  assert.match(page,/property="og:url" content="https:\/\/fabric\.systemiacommandcenters\.com\/offers\/website-audit"/);
  assert.match(page,/rel="canonical" href="https:\/\/fabric\.systemiacommandcenters\.com\/offers\/website-audit"/);
  assert.match(page,/name="twitter:card" content="summary_large_image"/);
  assert.match(page,/property="og:image" content="https:\/\/fabric\.systemiacommandcenters\.com\/visuals\/website-audit-attention\/offer-og-v2\.svg"/);
  assert.doesNotMatch(page,/machine state|start_url_state|preferred_agent_route/i);
});

test('Site-Survive Rapid Audit has a truthful $250 owned offer page and purchase routing',()=>{
  const site={
    ...websiteAudit,
    public_id:'site-survive-rapid-audit-v1',
    name:'Site-Survive Rapid Audit',
    pricing:'$250 one-time',
    entry_paid_offer:{name:'Rapid Site-Survive Audit',price:'$250',price_usd_normalized:250,billing:'one_time'},
  };
  assert.equal(offerSlugForCapability(site.public_id),'site-survive');
  assert.equal(offerPurchaseKeyForSlug('site-survive'),'site-survive-audit');
  assert.equal(offerCapabilityForSlug('site-survive',[site])?.public_id,site.public_id);
  const page=renderOfferPage(site);
  assert.match(page,/\$250/);
  assert.match(page,/name="customer_ref"/);
  assert.match(page,/\/api\/offers\/site-survive\/checkout/);
  assert.match(page,/Not an engineering certification or emergency guarantee/);
  assert.match(renderOffers([site]),/\/offers\/site-survive/);
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
    purchaseIntentFetch:async(url,init)=>{
      seen.push({
        url:String(url),
        body:JSON.parse(String(init?.body||'{}')),
      });
      if(seen.at(-1).body.action==='website_audit_prepayment_preflight') return Response.json({ok:true,schema:'raven.website-audit-context-preflight.v1',audited_domain:'evercraftpropertyservices.com',checkout_created:false});
      return new Response(JSON.stringify({
        context_persisted:true,
        audited_domain:'evercraftpropertyservices.com',
        ok:true,
        authority:'Evercraft Payments',
        order_key:'RAVEN-WEBSITE-AUDIT-QUICK-WIN-TEST',
        amount_cents:4900,
        currency:'usd',
        checkout_ready:true,
        checkout_url:'https://settlement.example.test/pay/test',
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
    const editorialOg=await fetch(runtime.url+'/visuals/website-audit-attention/offer-og-v2.svg');
    assert.equal(editorialOg.status,200);
    assert.match(editorialOg.headers.get('content-type')||'',/svg|xml/i);
    const ogMarkup=await editorialOg.text();
    assert.match(ogMarkup,/Evercraft Website Audit/);
    assert.match(ogMarkup,/Illustrative design/);


    const noConfirmation=await fetch(runtime.url+'/api/offers/website-audit/checkout',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({}),
    });
    assert.equal(noConfirmation.status,409);
    assert.equal(seen.length,0);

    const missingCustomer=await fetch(runtime.url+'/api/offers/website-audit/checkout',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({user_confirmed:true}),
    });
    assert.equal(missingCustomer.status,422);
    assert.equal((await missingCustomer.json()).error,'valid_customer_email_required');
    assert.equal(seen.length,0);

    const checkout=await fetch(runtime.url+'/api/offers/website-audit/checkout',{
      method:'POST',
      headers:{'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({user_confirmed:'true',customer_ref:'buyer@example.com',website_url:'https://evercraftpropertyservices.com/'}),
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
    assert.match(checkoutBody,/settlement\.example\.test\/pay\/test/);
    assert.match(checkoutBody,/Evercraft Payments/);
    assert.equal(seen.length,2);
    assert.equal(seen.shift().body.action,'website_audit_prepayment_preflight');
    assert.equal(seen[0].body.website_url,'https://evercraftpropertyservices.com/');
    assert.equal(seen[0].body.user_confirmed,true);
    assert.equal(seen[0].body.customer_ref,'buyer@example.com');
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
      body:new URLSearchParams({user_confirmed:'true',customer_ref:'buyer@example.com',website_url:'https://evercraftpropertyservices.com/'}),
      redirect:'manual',
    });
    assert.equal(response.status,503);
    assert.match(response.headers.get('content-type')||'',/^text\/html/i);
    const body=await response.text();
    assert.match(body,/No charge was made\./);
    assert.match(body,/Evercraft Payments/);
    assert.match(body,/Return to the offer/);
    assert.doesNotMatch(body,/evercraft_payments_checkout_not_ready|adapter_error|gate_key/);
  }finally{
    await runtime.close();
  }
});


test('audit checkout collects a target and rejects missing or unsupported custody before purchase',async()=>{
  for(const scenario of ['missing','unsupported','rejected','mismatch']){
    const calls=[];
    const runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[websiteAudit],faieSurfaceEnabled:false,
      purchaseIntentFetch:async(url,init)=>{
        const body=JSON.parse(init.body);calls.push(body);
        if(body.action==='website_audit_prepayment_preflight'){
          if(scenario==='unsupported')return Response.json({ok:true,checkout_ready:true});
          if(scenario==='rejected')return Response.json({ok:false,error:'public_https_website_required'},{status:400});
          return Response.json({ok:true,schema:'raven.website-audit-context-preflight.v1',checkout_created:false,audited_domain:'evercraftpropertyservices.com'});
        }
        return Response.json({ok:true,checkout_ready:true,checkout_url:'https://checkout.example.test/test',context_persisted:true,audited_domain:'wrong-domain.com'});
      }});
    try{
      const page=await fetch(runtime.url+'/offers/website-audit').then(r=>r.text());
      assert.match(page,/name="website_url" type="url"/);
      const r=await fetch(runtime.url+'/api/offers/website-audit/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({user_confirmed:true,customer_ref:'buyer@example.com',...(scenario==='missing'?{}:{website_url:'https://evercraftpropertyservices.com/'})})});
      assert.equal(r.status,scenario==='missing'?422:503,scenario);
      assert.equal((await r.json()).fulfillment_release,false);
      assert.equal(calls.length,scenario==='missing'?0:scenario==='mismatch'?2:1,scenario);
      if(calls.length)assert.equal(calls[0].user_confirmed,undefined);
    }finally{await runtime.close();}
  }
});
