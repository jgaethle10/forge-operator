import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {listHeartbeatOffers,reconcileKaidanceOfferLinks} from '../systemia/payments/kaidance-offer-links.mjs';
import {discoverKaidanceStripeInventory} from '../systemia/payments/kaidance-stripe-inventory.mjs';
import {inspectClipCheckoutCampaign,draftClipRequestWithCheckout} from '../systemia/clip/kaidance-checkout-intake.mjs';
import {runOfferLinkHeartbeat} from '../systemia/payments/kaidance-checkout-cycle.mjs';
const bindings=JSON.parse(fs.readFileSync('registry/kaidance-payment-offer-bindings.v1.json','utf8'));
const legacy=JSON.parse(fs.readFileSync('public/mesh/checkout-ready/verified-links.json','utf8'));
const source=JSON.parse(fs.readFileSync(bindings.clip_source_queue,'utf8'));
const offers=listHeartbeatOffers(bindings,legacy);
const when=new Date('2026-11-21T23:00:00Z');
const account='evercraft-llc';
const pin=bindings.merchant_accounts[account].stripe_account_id;
function fakeLink(id,{active=true,tax=false,managed=false,type='hosted_confirmation'}={}){
 return {id,active,url:'https://buy.stripe.com/4gM3cweaOcwJ1Za1I84AU0d',
  automatic_tax:{enabled:tax},managed_payments:{enabled:managed},
  after_completion:{type},metadata:{private_customer_data:'must_never_leak'}};
}
test('All five connected Stripe accounts have exact identities and discovery-only boundaries',()=>{
 assert.equal(Object.keys(bindings.merchant_accounts).length,5);
 assert.equal(bindings.rules.no_additional_automatic_tax,true);
 for(const [name,row] of Object.entries(bindings.merchant_accounts)){
  assert.match(row.stripe_account_id,/^acct_[A-Za-z0-9]+$/);
  assert.equal(row.livemode,true);
  if(['evercraft-media','evercraft-media-legacy','systemia-forge'].includes(name))
   assert.equal(row.offer_promotion_allowed,false);
 }
 const bad=structuredClone(bindings);bad.offers[0].merchant='evercraft-media';
 assert.throws(()=>listHeartbeatOffers(bad,legacy),/exact_offer_binding_invalid/);
});
test('Clip source already names real offers and planned placements but does not authorize publishing',()=>{
 const intake=inspectClipCheckoutCampaign({queue:source,catalog:offers,now:when});
 assert.equal(intake.source_entries,source.entries.length);
 assert.ok(intake.source_entries>=5);
 assert.ok(intake.selected_exact_source_offers>=3);
 assert.ok(intake.rows.some(x=>x.selected_offer_key==='legacy-systemia:weekly-social'));
 assert.ok(intake.rows.every(x=>x.existing_publication_permit_authenticated===false));
 assert.ok(intake.rows.every(x=>x.provider_checkout_url_disclosed===false));
 assert.equal(intake.published_posts,0);
});
test('A verified Stripe placement yields a fresh unapproved Clip draft, never an automatic post',()=>{
 const offer=offers.find(o=>o.slug==='founding-commercial-30s');
 const request={schema:'evercraft.clip.social-publish-request.v1',id:'commercial-spot-001',
  destination:'facebook-page',brandKey:'evercraft',
  checkout_offer:{offer_key:offer.offer_key,merchant:offer.merchant,amount_cents:5000},
  authorization:{approved:true,authorizationRef:'grant-used-on-different-content'},
  metadata:{message:'A 30-second commercial for fifty dollars.',link:'',title:'Commercial',campaign:'pilot'}};
 const placement={offer_key:offer.offer_key,merchant:offer.merchant,amount_cents:5000,
  account_identity_verified:true,sku_and_price_verified:true,
  provider_checkout_url:offer.checkout_url,checkout_proof_ref:'sha256:example',
  recommended_status:'eligible_for_separate_clip_publish_gate'};
 const draft=draftClipRequestWithCheckout({request,placement});
 assert.equal(draft.authorization.approved,false);
 assert.equal(draft.authorization.authorizationRef,null);
 assert.equal(draft.metadata.link,offer.checkout_url);
 assert.equal(draft.preflight_state,'requires_fresh_content_digest_and_existing_private_clip_permit');
 assert.equal(request.metadata.link,'');
 assert.throws(()=>draftClipRequestWithCheckout({request:{...request,
  metadata:{...request.metadata,link:'https://example.com/something'}},placement}),/copy_review/);
 assert.throws(()=>draftClipRequestWithCheckout({request:{...request,
  checkout_offer:{...request.checkout_offer,amount_cents:4999}},placement}),/mismatch/);
});
test('Owner-private provider inventory is paginated, account-pinned, and hides raw URLs/metadata',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-stripe-inventory-'));
 try{
  const key=path.join(dir,'key');fs.writeFileSync(key,'rk_live_SYNTHETICINVENTORY\n',{mode:0o600});
  const first=Array.from({length:100},(_,i)=>fakeLink('plink_123456'+String(i).padStart(5,'0'),{
   tax:i%2===0,managed:i%2===0
  }));
  const second=[fakeLink('plink_123456999999',{tax:false}),fakeLink('plink_123456888888',{tax:true})];
  const calls=[];
  const fetchFn=async(url,opt)=>{
   calls.push({url,method:opt.method});
   const u=new URL(url);
   if(u.pathname==='/v1/account')return {ok:true,json:async()=>({id:pin})};
   assert.equal(u.pathname,'/v1/payment_links');
   const rows=u.searchParams.has('starting_after')?second:first;
   return {ok:true,json:async()=>({data:rows,has_more:rows===first})};
  };
  const result=await discoverKaidanceStripeInventory({bindings,
   credentialPaths:{[account]:key},repoRoot:process.cwd(),fetchFn,now:when});
  assert.equal(result.accounts_observed,1);
  assert.equal(result.full_merchant_coverage_verified,false);
  assert.equal(result.observed_links_from_complete_accounts,102);
  assert.equal(result.active_links_from_complete_accounts,102);
  assert.equal(result.active_auto_tax_on_from_complete_accounts,51);
  assert.equal(result.active_auto_tax_off_from_complete_accounts,51);
  assert.equal(result.no_auto_tax_hosted_candidates_from_complete_accounts,51);
  assert.ok(result.accounts.find(a=>a.merchant==='systemia-forge').state==='not_connected_to_owned_runtime');
  assert.equal(calls.filter(x=>x.url.includes('payment_links')).length,2);
  assert.ok(calls.every(x=>x.method==='GET'&&x.url.startsWith('https://api.stripe.com/')));
  assert.equal(JSON.stringify(result).includes('private_customer_data'),false);
  assert.equal(JSON.stringify(result).includes('https://buy.stripe.com/'),false);
  assert.equal(result.stripe_mutations_executed,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('Unknown or duplicated provider IDs fail closed and never count as inventory coverage',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-stripe-dup-'));
 try{
  const key=path.join(dir,'key');fs.writeFileSync(key,'rk_live_SYNTHETICINVENTORY\n',{mode:0o600});
  const fetchFn=async(url)=>({
   ok:true,json:async()=>url.endsWith('/v1/account')?{id:pin}:
    {data:[fakeLink('plink_123456123456'),fakeLink('plink_123456123456')],has_more:false}
  });
  const result=await discoverKaidanceStripeInventory({bindings,credentialPaths:{[account]:key},
   repoRoot:process.cwd(),fetchFn,now:when});
  assert.equal(result.accounts_observed,0);
  assert.equal(result.accounts.find(x=>x.merchant===account).state,'provider_read_failed_hold');
  assert.equal(result.active_links_from_complete_accounts,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('Kaidance uses actual Clip source each cycle without inventing an active campaign or checkout',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-offer-intake-'));
 try{
  const result=await runOfferLinkHeartbeat({root:'.',outDir:dir,now:when,
   fetchFn:async()=>{throw Error('No owner-private keys means no Stripe network calls')}});
  assert.equal(result.clip_source_entries,source.entries.length);
  assert.equal(result.inventory_accounts_observed,0);
  assert.equal(result.matches,0);
  const latest=JSON.parse(fs.readFileSync(path.join(dir,'latest.json'),'utf8'));
  const actions=JSON.parse(fs.readFileSync(path.join(dir,'actions.json'),'utf8'));
  const inv=JSON.parse(fs.readFileSync(path.join(dir,'inventory.json'),'utf8'));
  assert.equal(latest.clip_source_intake.source_entries,source.entries.length);
  assert.equal(actions.clip_source_candidates.length,source.entries.length);
  assert.equal(actions.publisher_write_authorized,false);
  assert.equal(inv.accounts_observed,0);
  assert.equal(inv.stripe_mutations_executed,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
