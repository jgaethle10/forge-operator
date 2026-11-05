import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {auditSocialContinuity} from '../systemia/clip/social-continuity-watch.mjs';

const queue=JSON.parse(fs.readFileSync('distribution/marketing/work-saban-clip-evergreen-20261030.review.json','utf8'));
const campaign=fs.readFileSync('distribution/marketing/work-saban-clip-launch-20261030.md','utf8');
const expectedPlatforms=['facebook','linkedin','x','instagram','threads','bluesky','tiktok','youtube'];
test('Work Saban has 32 distinct organic slots and explicit founder editorial direction',()=>{
 assert.equal(queue.schema,'evercraft.marketing.owner-review-queue.v1');
 assert.equal(queue.engine,'evercraft_clip');
 assert.equal(queue.orchestrator,'systemia');
 assert.equal(queue.owner_organic_distribution_approved,true);
 assert.equal(queue.publication_authority,false);
 assert.equal(queue.published_posts_verified,0);
 assert.equal(queue.platform_connections_verified,false);
 assert.equal(queue.entries.length,32);
 assert.equal(queue.policy.paid_spend_usd,0);
 assert.equal(queue.policy.no_personal_automated_posting,true);
 assert.deepEqual([...new Set(queue.entries.map(x=>x.platform))].sort(),expectedPlatforms.sort());
 assert.equal(queue.founder_personal_launch.reported_by_founder,true);
 assert.equal(queue.founder_personal_launch.independently_verified_permalinks,false);
});
test('per-destination frequency, consent, correct attribution and media holds',()=>{
 const ids=new Set(),texts=new Set(),perPlatform=new Map(),dates=new Set();
 for(const e of queue.entries){
  assert.ok(!ids.has(e.id));ids.add(e.id);
  assert.ok(!texts.has(e.caption));texts.add(e.caption);
  assert.equal(e.brand_key,'evercraft-work-saban');
  assert.equal(e.authorization.approved,false);
  assert.equal(e.authorization.authorizationRef,null);
  assert.equal(e.publicationAuthority,false);
  assert.equal(e.publisher_state,'not_submitted');
  assert.equal(e.provider_post_id,null);
  assert.equal(e.provider_post_url,null);
  assert.equal(e.distribution.paid_spend_usd,0);
  assert.equal(e.distribution.max_identical_reuse,0);
  assert.equal(e.linkVerification.expectedCanonicalUrl,queue.product_url);
  assert.ok(e.tracked_url.startsWith(queue.product_url+'?utm_source=clip'));
  assert.equal(e.first_comment_required,e.platform==='facebook');
  if(e.platform==='facebook'){
   assert.ok(!/https?:\/\//.test(e.caption));
   assert.equal(e.first_comment_copy,e.tracked_url);
  }
  if(e.platform==='tiktok'||e.platform==='youtube')assert.match(e.creative_state,/hold_approved_real_product_video_required/);
  if(e.platform==='instagram')assert.match(e.creative_state,/hold_approved_first_party_raster/);
  if(e.platform==='x')assert.ok([...e.caption].length<=280);
  if(e.platform==='bluesky')assert.ok([...e.caption].length<=300);
  assert.doesNotMatch(e.caption,/live autonomous agent workforce|paid customers already|guaranteed AI team execution/i);
  const datesFor=perPlatform.get(e.platform)||[];
  datesFor.push(Date.parse(e.planned_day+'T12:00:00Z'));perPlatform.set(e.platform,datesFor);
  const slot=e.planned_day+':'+e.platform;
  assert.ok(!dates.has(slot),'duplicate platform slot '+slot);dates.add(slot);
 }
 for(const ds of perPlatform.values()){
  assert.equal(ds.length,4);
  ds.sort((a,b)=>a-b);
  for(let i=1;i<ds.length;i++)assert.ok(ds[i]-ds[i-1]>=72*3600*1000);
 }
 for(const brand of ['eps','havenly-cleaning','rnb-chicken-and-soul','christmaslightsusa'])assert.ok(queue.excluded_brand_keys.includes(brand));
 assert.ok(campaign.includes('Systemia must mint issuer-backed'));
});
test('six-hour watch never mistakes founder editorial direction for publishing authorization',()=>{
 const r=auditSocialContinuity({queue,receipts:[],receiptSourceAvailable:false,now:new Date('2026-11-03T20:00:00Z')});
 assert.equal(r.counts.total,32);
 assert.equal(r.counts.approval_hold,32);
 assert.equal(r.counts.provider_receipt_recorded,0);
 assert.equal(r.status,'owner_review_required');
});
