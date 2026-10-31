import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const campaign=JSON.parse(fs.readFileSync('distribution/marketing/humanfilter-free-desktop-20261030.review.json','utf8'));
test('HumanFilter has a real desktop release and bounded Clip editorial rotation',()=>{
 assert.equal(campaign.schema,'evercraft.marketing.owner-review-queue.v1');
 assert.equal(campaign.engine,'evercraft_clip');
 assert.equal(campaign.orchestrator,'systemia');
 assert.equal(campaign.product,'humanfilter');
 assert.match(campaign.product_url,/^https:\/\/jgaethle10\.github\.io\/forge-operator\/humanfilter-beta\/$/);
 assert.equal(campaign.owner_organic_distribution_approved,true);
 assert.equal(campaign.publication_authority,false);
 assert.equal(campaign.published_posts_verified,0);
 assert.equal(campaign.platform_connections_verified,false);
 assert.equal(campaign.policy.paid_spend_usd,0);
 assert.equal(campaign.policy.no_personal_automated_posting,true);
 assert.equal(campaign.policy.never_repost_identical_copy,true);
 const ids=new Set(),days=new Map(),texts=new Set();
 for(const entry of campaign.entries){
  assert.ok(!ids.has(entry.id));ids.add(entry.id);
  assert.ok(entry.caption.length>80,entry.id);
  assert.ok(!texts.has(entry.caption),entry.id);
  texts.add(entry.caption);
  assert.ok(entry.tracked_url.startsWith(campaign.product_url+'?utm_source=evercraft_clip'));
  assert.equal(entry.brand_key,'evercraft');
  assert.equal(entry.authorization.approved,false);
  assert.equal(entry.publicationAuthority,false);
  assert.equal(entry.publisher_state,'not_submitted');
  assert.equal(entry.provider_post_url,null);
  assert.equal(entry.provider_post_id,null);
  assert.equal(entry.distribution.paid_spend_usd,0);
  assert.equal(entry.distribution.max_identical_reuse,0);
  assert.equal(entry.first_comment_required,entry.platform==='facebook');
  const key=entry.planned_day+':'+entry.platform;
  assert.ok(!days.has(key),'duplicate platform slot '+key);
  days.set(key,entry.id);
  assert.doesNotMatch(entry.caption,/guarantee(?:s|d)? to detect|works in (?:all|every) apps|available on iPhone/i);
 }
 assert.equal(ids.size,32);
 const perPlatform=new Map();
 for(const e of campaign.entries){
  const d=perPlatform.get(e.platform)||[];
  d.push(Date.parse(e.planned_day+'T12:00:00Z'));perPlatform.set(e.platform,d);
 }
 assert.equal(perPlatform.size,8);
 for(const dates of perPlatform.values()){
  dates.sort((a,b)=>a-b);
  assert.equal(dates.length,4);
  for(let i=1;i<dates.length;i++)assert.ok(dates[i]-dates[i-1]>=72*3600*1000);
 }
 assert.ok(campaign.entries.filter(e=>e.platform==='tiktok'||e.platform==='youtube').every(e=>e.creative_state.includes('hold_real_product_demo')));
});
