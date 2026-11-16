import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const queue=JSON.parse(read('distribution/marketing/evercraft-services-clip-20261110.review.json'));
const manifest=JSON.parse(read('public/mesh/checkout-ready/verified-links.json'));
test('Clip offer rotation covers only the exact seven published Stripe SKUs',()=>{
 assert.equal(queue.schema,'evercraft.marketing.owner-review-queue.v1');
 assert.equal(queue.engine,'evercraft_clip');
 assert.equal(queue.orchestrator,'systemia');
 assert.equal(queue.entries.length,5);
 const expected=new Set(manifest.links.map(x=>x.key));
 const used=queue.entries.flatMap(x=>x.sku_keys);
 assert.equal(used.length,7);
 assert.deepEqual(new Set(used),expected);
 for(const e of queue.entries){
  const priceMatch=e.sku_keys.map(key=>manifest.links.find(x=>x.key===key));
  assert.ok(priceMatch.every(Boolean));
  assert.match(e.canonical_offer_url,/^https:\/\/jgaethle10\.github\.io\/forge-operator\/mesh\/checkout-ready\/[a-z0-9-]+\/$/);
  assert.ok(e.caption.includes(e.canonical_offer_url));
  assert.ok(priceMatch.every(x=>e.caption.includes(x.price)),e.id+' missing price');
  assert.equal(e.publisher_state,'not_submitted');
  assert.equal(e.provider_post_id,null);
  assert.equal(e.provider_post_url,null);
  assert.equal(e.authorization.approved,false);
  assert.equal(e.publicationAuthority,false);
  assert.equal(e.linkVerification.expectedCanonicalUrl,e.canonical_offer_url);
  assert.equal(e.linkVerification.requireCanonicalSelfMatch,true);
  assert.ok(!e.caption.includes('buy.stripe.com'));
 }
});
test('owner direction is distinct from provider authority and purchase evidence',()=>{
 assert.equal(queue.owner_organic_distribution_approved,true);
 assert.equal(queue.publication_authority,false);
 assert.equal(queue.platform_connections_verified,false);
 assert.equal(queue.published_posts_verified,0);
 assert.equal(queue.provider_paid_receipts_verified,0);
 assert.equal(queue.native_evercraft_payments_state,'held_separate_from_hosted_links');
 assert.equal(queue.scope_confirmation_required_before_payment,true);
 assert.equal(queue.policy.no_personal_automated_posting,true);
 assert.equal(queue.policy.issuer_passport_grant_required,true);
 assert.equal(queue.policy.provider_permalinks_and_readback_required,true);
 assert.equal(queue.policy.check_all_other_clip_campaigns_for_cadence,true);
 assert.equal(queue.policy.minimum_hours_between_company_page_posts,72);
 assert.equal(queue.policy.paid_spend_usd,0);
 for(let i=1;i<queue.entries.length;i++){
  const a=Date.parse(queue.entries[i-1].proposed_day+'T12:00:00Z');
  const b=Date.parse(queue.entries[i].proposed_day+'T12:00:00Z');
  assert.ok(b-a>=72*3600*1000);
 }
});
