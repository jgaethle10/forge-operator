import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {listHeartbeatOffers,reconcileKaidanceOfferLinks} from '../systemia/payments/kaidance-offer-links.mjs';
import {readOfferStripeLinks} from '../systemia/payments/kaidance-stripe-readonly.mjs';
import {runOfferLinkHeartbeat} from '../systemia/payments/kaidance-checkout-cycle.mjs';
const bindings=JSON.parse(fs.readFileSync('registry/kaidance-payment-offer-bindings.v1.json','utf8'));
const legacy=JSON.parse(fs.readFileSync('public/mesh/checkout-ready/verified-links.json','utf8'));
const catalog=listHeartbeatOffers(bindings,legacy);
const founding=catalog.find(x=>x.slug==='founding-commercial-30s');
const audit=catalog.find(x=>x.slug==='website-audit-quick-win');
const when=new Date('2026-11-21T23:00:00Z');
function promo(offer=founding,placements=['facebook-evercraft']){
 return {schema:'evercraft.clip.verified-offer-beat.v1',observed_at:when.toISOString(),offers:placements.map(placement_key=>({
  campaign_id:'campaign-1',placement_key,offer_key:offer.offer_key,merchant:offer.merchant,
  offer_amount_cents:offer.amount_cents,currency:'usd',promotion_state:'ready_for_publisher_verification'
 }))};
}
function link(offer){return {id:offer.payment_link_id,active:true,url:offer.checkout_url,
 automatic_tax_enabled:false,managed_payments_enabled:false,
 allow_promotion_codes:false,optional_items_count:0,shipping_options_count:0,
 after_completion:{type:'hosted_confirmation'},line_items_complete:true,
 line_items:[{price_id:offer.price_id,product_id:offer.product_id,unit_amount:offer.amount_cents,
  currency:'usd',type:'one_time',quantity:1,fixed_quantity_verified:true}]};}
function provider(off=[founding,audit],merchant='evercraft-llc'){
 return {schema:'evercraft.payments.stripe-link-readback.v1',accounts:[{
  merchant,account_id:bindings.merchant_accounts[merchant].stripe_account_id,livemode:true,
  observed_at:when.toISOString(),source:'stripe_api_authenticated_read',complete:true,
  links:off.map(link)
 }]};
}
test('Offer registry pins exact existing live prices, not guessed replacements',()=>{
 assert.equal(catalog.length,9);
 assert.equal(founding.amount_cents,5000);
 assert.equal(founding.merchant,'evercraft-llc');
 assert.equal(audit.amount_cents,4900);
 assert.equal(audit.merchant,'evercraft-llc');
 assert.ok(catalog.filter(x=>x.merchant==='systemia').length===7);
});
test('Every heartbeat chooses the actual offer and placement without mutating Stripe',()=>{
 const first=reconcileKaidanceOfferLinks({bindings,legacy,promotions:promo(),provider:provider(),now:when});
 assert.equal(first.placements.length,1);
 assert.equal(first.holds.length,0);
 assert.equal(first.placements[0].provider_checkout_url,founding.checkout_url);
 assert.equal(first.placements[0].amount_cents,5000);
 assert.equal(first.placements[0].published_by_this_cycle,false);
 assert.equal(first.stripe_mutations_executed,0);
 const second=reconcileKaidanceOfferLinks({bindings,legacy,promotions:promo(audit),provider:provider(),now:when});
 assert.equal(second.placements.length,1);
 assert.equal(second.placements[0].provider_checkout_url,audit.checkout_url);
 assert.equal(second.placements[0].amount_cents,4900);
 assert.notEqual(second.placements[0].provider_checkout_url,first.placements[0].provider_checkout_url);
});
test('Mismatched account, stale readback, wrong SKU or redirect never routes buyers',()=>{
 const scenarios=[
  (()=>{const p=provider();p.accounts[0].account_id='acct_Foreign123';return p})(),
  (()=>{const p=provider();p.accounts[0].observed_at='2026-11-21T20:00:00Z';return p})(),
  (()=>{const p=provider();p.accounts[0].links[0].line_items[0].unit_amount=200;return p})(),
  (()=>{const p=provider();p.accounts[0].links[0].after_completion={type:'redirect',redirect:{url:'https://retired.base44.app/order'}};return p})(),
  (()=>{const p=provider();p.accounts[0].links[0].url='https://buy.stripe.com/wrong';return p})(),
  (()=>{const p=provider();p.accounts[0].links[0].automatic_tax_enabled=true;return p})(),
  (()=>{const p=provider();p.accounts[0].links[0].managed_payments_enabled=true;return p})(),
  (()=>{const p=provider();p.accounts[0].links[0].line_items[0].fixed_quantity_verified=false;return p})(),
  (()=>{const p=provider();delete p.accounts[0].links[0].line_items[0].fixed_quantity_verified;return p})(),
  (()=>{const p=provider();p.accounts[0].links[0].optional_items_count=1;return p})()
 ];
 for(const snapshot of scenarios){
  const r=reconcileKaidanceOfferLinks({bindings,legacy,promotions:promo(),provider:snapshot,now:when});
  assert.equal(r.placements.length,0);
  assert.equal(r.holds.length,1);
 }
});
test('Campaigns require exact approved price and no duplicate per placement',()=>{
 const p=promo(founding,['facebook-evercraft','facebook-evercraft']);
 p.offers[0].offer_amount_cents=999;
 let result=reconcileKaidanceOfferLinks({bindings,legacy,promotions:p,provider:provider(),now:when});
 assert.equal(result.placements.length,0);
 assert.equal(result.holds.length,1);
 const p2=promo(founding,['facebook-evercraft','facebook-evercraft']);
 result=reconcileKaidanceOfferLinks({bindings,legacy,promotions:p2,provider:provider(),now:when});
 assert.equal(result.placements.length,1);
});
test('Unknown offer is queued for admission, never granted a made-up payment link',()=>{
 const p=promo();p.offers[0].offer_key='unknown:100';
 const r=reconcileKaidanceOfferLinks({bindings,legacy,promotions:p,provider:provider(),now:when});
 assert.equal(r.placements.length,0);
 assert.equal(r.holds[0].reason,'offer_not_in_exact_price_registry');
 assert.equal(r.actions[0].authority,'review_required');
});
test('Owner-private read-only Stripe adapter pins merchant, SKU and price line items',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-stripe-read-'));
 try{
  const file=path.join(dir,'key');fs.writeFileSync(file,'rk_live_SYNTHETIC123456\n',{mode:0o600});
  const calls=[];
  const fetchFn=async(url,opts)=>{
   calls.push({url,method:opts.method,auth:opts.headers.Authorization});
   const route=new URL(url).pathname;
   if(route==='/v1/account')return {ok:true,json:async()=>({id:bindings.merchant_accounts['evercraft-llc'].stripe_account_id})};
   if(route.endsWith('/line_items'))return {ok:true,json:async()=>({has_more:false,data:[{
    quantity:1,adjustable_quantity:null,price:{id:founding.price_id,product:founding.product_id,unit_amount:5000,currency:'usd',type:'one_time',custom_unit_amount:null}
   }]})};
   return {ok:true,json:async()=>({id:founding.payment_link_id,active:true,url:founding.checkout_url,
    automatic_tax:{enabled:false},managed_payments:{enabled:false},
    allow_promotion_codes:false,optional_items:[],shipping_options:[],
    after_completion:{type:'hosted_confirmation'}})};
  };
  const r=await readOfferStripeLinks({bindings,offerCatalog:[founding],
   credentialPaths:{'evercraft-llc':file},fetchFn,now:when,repoRoot:process.cwd()});
  assert.equal(r.accounts.length,1);
  assert.equal(r.accounts[0].account_id,bindings.merchant_accounts['evercraft-llc'].stripe_account_id);
  assert.equal(r.accounts[0].links[0].line_items[0].unit_amount,5000);
  assert.equal(r.accounts[0].links[0].automatic_tax_enabled,false);
  assert.equal(r.accounts[0].links[0].managed_payments_enabled,false);
  assert.equal(calls.length,3);
  assert.ok(calls.every(x=>x.method==='GET'&&x.url.startsWith('https://api.stripe.com/')));
  assert.equal(JSON.stringify(r).includes('rk_live_'),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('No Clip proof/Stripe credentials keeps a receipt but never invents a checkout',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-checkout-cycle-'));
 try{
  const state=await runOfferLinkHeartbeat({root:'.',outDir:dir,now:when,
   fetchFn:async()=>{throw Error('must not call Stripe without owner-private authorization')}});
  assert.equal(state.readiness,'awaiting_current_clip_promotion_receipt');
  assert.equal(state.matches,0);assert.equal(state.provider_mutations,0);
  const latest=JSON.parse(fs.readFileSync(path.join(dir,'latest.json'),'utf8'));
  const snap=JSON.parse(fs.readFileSync(path.join(dir,'mission-snapshot.json'),'utf8'));
  assert.equal(latest.placements.length,0);
  assert.equal(snap.schema,'evercraft.kaidance.mission-snapshot.v1');
  assert.equal(snap.counts.admitted,0);
  assert.ok(snap.counts.held>0);
  assert.equal(fs.statSync(path.join(dir,'latest.json')).mode&0o777,0o600);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
