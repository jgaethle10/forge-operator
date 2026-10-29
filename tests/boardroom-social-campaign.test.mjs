import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const campaign=JSON.parse(fs.readFileSync('distribution/marketing/boardroom-executive-chamber-20261029.json','utf8'));
const copy=fs.readFileSync('distribution/marketing/boardroom-executive-chamber-20261029.md','utf8');

test('boardroom campaign is founder-safe, source backed and explicitly not published',()=>{
 assert.equal(campaign.schema,'evercraft.boardroom.social-launch-queue.v1');
 assert.equal(campaign.publisher,'evercraft_clip');
 assert.equal(campaign.state,'prepared_not_published');
 assert.equal(campaign.no_fictional_publish_receipt,true);
 assert.ok(campaign.evidence.public_pages_https_check.includes('40838160737'));
 assert.equal(campaign.evidence.live_ai_council_verified,false);
 assert.equal(campaign.evidence.provider_post_receipt_observed,false);
 assert.ok(campaign.sample_url.startsWith('https://jgaethle10.github.io/forge-operator/mesh/ai-boardroom/compare/?demo=1'));
});
test('no company account is silently approved or posed as published',()=>{
 assert.equal(campaign.entries.length,3);
 for(const row of campaign.entries){
  assert.equal(row.brand_key,'evercraft-boardroom');
  assert.equal(row.authorization.approved,false);
  assert.equal(row.authorization.authorizationRef,null);
  assert.equal(row.account_id,null);
  assert.equal(row.publisher_state,'prepared_unsubmitted');
  assert.equal(row.provider_post_url,null);
  assert.equal(row.provider_published_at,null);
 }
});
test('founder personal accounts are human-shared only',()=>{
 assert.equal(campaign.personal_share.length,2);
 assert.ok(campaign.personal_share.every(x=>x.publisher_state==='founder_manual_only'&&x.provider_post_url===null));
 assert.ok(copy.includes('Personal Facebook, for founder to share manually'));
 assert.ok(copy.includes('Personal LinkedIn, for founder to share manually'));
});
test('copy sells free real function with no unsupported multi-AI, telemetry or revenue claims',()=>{
 for(const marker of ['No account. No payment.','No data upload.','The bigger vision is an entire AI boardroom','still building toward that','human-reviewed']) assert.ok(copy.includes(marker),marker);
 assert.ok(!/hundreds of customers|100% accurate|AI models actively debated|we automatically post/i.test(copy));
 assert.ok(copy.includes(campaign.sample_url));
});
