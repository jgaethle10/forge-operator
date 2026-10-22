import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APPROVED_BUYER_MOMENTS,availableBuyerMoments,renderOffers,
  offerCapabilityForSlug,offerPurchaseKeyForSlug,renderOfferPage,
} from '../systemia/mcp/fabric-public-site.mjs';
import {PUBLIC_PAYMENT_OFFERS} from '../systemia/mcp/public-payment-offers.mjs';

const capability=(public_id,price)=>({
  public_id,name:public_id,commercial_state:'sell_now',pricing:'$'+price+' one-time',
  entry_paid_offer:{name:'Bounded initial review',price:'$'+price,price_usd_normalized:price},
});
const catalog=[
  capability('audit-center-website-audit-machine-v1',49),
  capability('legacy-rescue-lab-v1',299),
  capability('findmypart-paid-hunt-v1',19),
];

test('the six human buying moments lead to unique pre-approved exact offer identities',()=>{
  assert.equal(APPROVED_BUYER_MOMENTS.length,6);
  assert.equal(new Set(APPROVED_BUYER_MOMENTS.map(m=>m.slug)).size,6);
  const moments=availableBuyerMoments(catalog);
  assert.equal(moments.length,6);
  const list=renderOffers(catalog);
  assert.match(list,/What is slowing you down\?/);
  assert.match(list,/Browse all offers/);
  assert.ok(list.indexOf('buyer-moments-heading')<list.indexOf('Browse all offers'));
  for(const m of moments){
    assert.ok(list.includes('class="buyer-moment" href="/offers/'+m.slug+'"'));
    const item=offerCapabilityForSlug(m.slug,catalog);
    assert.equal(item?.public_id,m.public_id);
    assert.ok(offerPurchaseKeyForSlug(m.slug));
    assert.ok(/^\$[0-9][0-9,.]*$/.test(m.price));
    assert.ok(list.includes('Review exact offer · '+m.price));
  }
  for(const slug of ['payments-pilot','browser-diagnosis','ibmi-xray']){
    const m=moments.find(x=>x.slug===slug);
    assert.equal(m.price,'$'+PUBLIC_PAYMENT_OFFERS[slug].amount_cents/100);
    assert.equal(offerPurchaseKeyForSlug(slug),PUBLIC_PAYMENT_OFFERS[slug].offer_key);
  }
});

test('held checkout stays held and routes to assisted invoicing, not a false working pay button',()=>{
  const pilot=offerCapabilityForSlug('payments-pilot',catalog);
  const page=renderOfferPage(pilot,{checkoutConfigured:false});
  assert.match(page,/Online checkout is temporarily unavailable/);
  assert.match(page,/Request assisted invoicing/);
  assert.match(page,/does not create an order, collect money or schedule fulfillment/);
  assert.doesNotMatch(page,/action="\/api\/offers\/payments-pilot\/checkout"/);
  const configured=renderOfferPage(pilot,{checkoutConfigured:true});
  assert.match(configured,/action="\/api\/offers\/payments-pilot\/checkout"/);
  assert.match(configured,/name="user_confirmed" value="true"/);
  assert.match(configured,/Nothing is marked paid until settlement is verified/);
});

test('missing, held and ambiguous capability catalog entries fail closed',()=>{
  const unavailable=catalog.filter(x=>x.public_id!=='legacy-rescue-lab-v1');
  assert.equal(availableBuyerMoments(unavailable).some(x=>x.slug==='legacy-rescue'),false);
  const held=catalog.map(x=>x.public_id==='findmypart-paid-hunt-v1'?{...x,commercial_state:'review_only'}:x);
  assert.equal(availableBuyerMoments(held).some(x=>x.slug==='findmypart'),false);
  const duplicated=[...catalog,catalog[0]];
  assert.equal(availableBuyerMoments(duplicated).some(x=>x.slug==='website-audit'),false);
  assert.equal(availableBuyerMoments([]).length,3,'only preapproved native portfolio SKUs persist without catalog');
});

test('offers index does not collect data, assert payment or invent scarcity',()=>{
  const page=renderOffers(catalog);
  assert.doesNotMatch(page,/<form\b|method="post"|type="email"|name="customer_ref"/i);
  assert.doesNotMatch(page,/guaranteed results|payment confirmed|only [0-9] spots remain/i);
  assert.match(page,/checkout or assisted-invoicing path shown according to availability/);
});
