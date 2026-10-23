import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderOfferPage} from '../systemia/mcp/fabric-public-site.mjs';
import {startFabricLocalRuntime} from '../systemia/mcp/fabric-local-runtime.mjs';

const item={
  public_id:'audit-center-website-audit-machine-v1',
  name:'Systemia Website Audit',
  description:'Public-facing web experience review.',
  state:'payment_ready',commercial_state:'sell_now',
  pricing:'Free preview. Quick Win Audit $49 one-time after verified payment.',
  entry_paid_offer:{name:'Quick Win Audit',price:'$49',price_usd_normalized:49,billing:'one_time'},
  keywords:['website audit'],use_when:['public website review'],connections:[],
};
test('editorial page keeps truthful scope, one-time price, concrete inputs, and no invented customers',()=>{
  const html=renderOfferPage(item,{checkoutConfigured:true});
  assert.match(html,/<main class="audit-editorial">/);
  assert.match(html,/See your website<br><em>through their eyes\./);
  assert.match(html,/Five priority fixes/);
  assert.match(html,/We do not claim access to your private analytics or guarantee more customers/);
  assert.match(html,/THE VISITOR JOURNEY/);
  assert.match(html,/Process illustration\. Not a finding about your site\./);
  assert.match(html,/No subscription/);
  assert.doesNotMatch(html,/Guaranteed \d+%|5-star customer review/i);
});
test('configured checkout preserves human consent, email, site URL and canonical purchase handler',()=>{
  const html=renderOfferPage(item,{checkoutConfigured:true});
  const title=html.indexOf('id="audit-title"');
  const price=html.indexOf('<div class="audit-card-price">');
  const form=html.indexOf('<form class="checkout-form audit-checkout"');
  const story=html.indexOf('<section class="audit-story"');
  assert.ok(title>0&&title<price&&price<form&&form<story);
  assert.match(html,/method="post" action="\/api\/offers\/website-audit\/checkout"/);
  assert.match(html,/name="user_confirmed" value="true"/);
  assert.match(html,/name="idempotency_key"/);
  assert.match(html,/name="customer_ref" type="email"/);
  assert.match(html,/name="website_url" type="url"/);
  assert.match(html,/Continue to checkout · \$49/);
  assert.doesNotMatch(html,/Request an approved invoice/);
});
test('unconfigured checkout hides order POST and offers a human-reviewed assisted invoice only',()=>{
  const html=renderOfferPage(item,{checkoutConfigured:false});
  assert.match(html,/ONLINE CHECKOUT ON HOLD/);
  assert.match(html,/Online checkout is temporarily unavailable/);
  assert.match(html,/Request an approved invoice/);
  assert.match(html,/mailto:jessegaethle10@gmail\.com\?subject=/);
  assert.match(html,/Email opens in your own mail app for review/);
  assert.match(html,/We do not create an order, collect money or schedule fulfillment/);
  assert.doesNotMatch(html,/<form class="checkout-form audit-checkout"/);
  assert.doesNotMatch(html,/type="submit"/);
  assert.doesNotMatch(html,/name="user_confirmed"/);
  assert.doesNotMatch(html,/Continue to checkout · \$49/);
});
test('responsive design includes visible keyboard focus, real labels, reduced motion and no hidden fallback',()=>{
  const html=renderOfferPage(item,{checkoutConfigured:true});
  assert.match(html,/@media\(max-width:900px\)/);
  assert.match(html,/@media\(max-width:540px\)/);
  assert.match(html,/prefers-reduced-motion:reduce/);
  assert.match(html,/\.audit-editorial \.audit-cta:focus-visible/);
  assert.match(html,/aria-labelledby="audit-title"/);
  assert.match(html,/autocomplete="email"/);
  assert.match(html,/autocomplete="url"/);
});
test('social card exists as original illustrative SVG with source verification',()=>{
  const html=renderOfferPage(item,{checkoutConfigured:true});
  assert.match(html,/property="og:image" content="https:\/\/fabric\.systemiacommandcenters\.com\/visuals\/website-audit-attention\/offer-og-v2\.svg"/);
  const svg=fs.readFileSync(new URL('../public/visuals/website-audit-attention/offer-og-v2.svg',import.meta.url),'utf8');
  assert.match(svg,/<svg /);
  assert.match(svg,/Illustrative design/);
  assert.match(svg,/Quick Win · \$49/);
});
test('other offers keep their default buyer layout and fallback behavior',()=>{
  const other={
    ...item,public_id:'site-survive-rapid-audit-v1',name:'Site Survive Rapid Audit',
    entry_paid_offer:{name:'Site Survive',price:'$250',price_usd_normalized:250},
  };
  const enabled=renderOfferPage(other,{checkoutConfigured:true});
  const held=renderOfferPage(other,{checkoutConfigured:false});
  assert.doesNotMatch(enabled,/<main class="audit-editorial">/);
  assert.match(enabled,/\/api\/offers\/site-survive\/checkout/);
  assert.match(held,/Online checkout is temporarily unavailable/);
  assert.doesNotMatch(held,/<form class="checkout-form"/);
});
test('local Fabric runtime serves the editorial social artwork, not a static repository path',async()=>{
  const runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[item],faieSurfaceEnabled:false,
    purchaseIntentFetch:async()=>{throw new Error('no_payment_requests_permitted_by_this_test')}});
  try{
    const response=await fetch(runtime.url+'/visuals/website-audit-attention/offer-og-v2.svg');
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type')||'',/svg|xml/i);
    assert.match(await response.text(),/Evercraft Website Audit/);
  }finally{await runtime.close()}
});
