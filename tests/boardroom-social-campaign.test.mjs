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
function section(start,end){
 const i=copy.indexOf(start),j=copy.indexOf(end);
 assert.ok(i>=0&&j>i,'missing editorial section '+start);
 return copy.slice(i+start.length,j).trim();
}
const founderFB=section('### Personal Facebook, for founder to share manually','### Personal LinkedIn, for founder to share manually');
const founderLI=section('### Personal LinkedIn, for founder to share manually','### Evercraft Facebook Page (company owned, brand-authorized only)');
const companyFB=section('### Evercraft Facebook Page (company owned, brand-authorized only)','### Evercraft LinkedIn Page (company owned, brand-authorized only)');
const companyLI=section('### Evercraft LinkedIn Page (company owned, brand-authorized only)','### Evercraft Instagram (company account, only if brand and media authorized)');
const share=fs.readFileSync('public/mesh/ai-boardroom/share/index.html','utf8');

test('founder posts follow grounded, coherent prose, without a prescribed paragraph count',()=>{
 for(const draft of [founderFB,founderLI]){
  assert.ok(draft.includes(campaign.sample_url));
  assert.match(draft,/Evercraft Boardroom/);
  assert.match(draft,/browser|account|responses|comparison/i);
  assert.doesNotMatch(draft,/I've been working on something pretty cool|So which one do you trust\?|No account\. No payment\.|🔥|🙌|#\w+/);
 }
});
test('corporate release copy documents shipped work without engagement theater',()=>{
 for(const draft of [companyFB,companyLI]){
  assert.match(draft,/Evercraft/);
  assert.match(draft,/free|public|browser/);
  assert.match(draft,/does not|doesn't|not a live|not an automated|not a verified/);
  assert.doesNotMatch(draft,/🔥|🥂|#\w+|What if|So which one do you trust|Join the revolution|10\/10|guaranteed|AI advisors have debated/i);
  assert.ok(draft.includes(campaign.sample_url));
 }
});
test('owner share kit contains exact reviewed founder drafts, not superseded promo text',()=>{
 const extract=id=>{
  const start='<div class="post" id="'+id+'">';
  const i=share.indexOf(start),j=share.indexOf('</div>',i);
  assert.ok(i>=0&&j>i);
  return share.slice(i+start.length,j);
 };
 assert.equal(extract('fb-content'),founderFB);
 assert.equal(extract('li-content'),founderLI);
 assert.ok(share.includes('Nothing gets published automatically.'));
});
test('drafts state capability and payments limits, not invented sales or provider receipts',()=>{
 assert.match(copy,/human-reviewed/i);
 assert.match(copy,/not a live debate|isn't a verified customer feature|does not make live model calls/i);
 assert.match(copy,/publisher not authorized\/verified|not published|not submitted/i);
 assert.ok(!/hundreds of customers|100% accurate|AI models actively debated|we automatically post/i.test(copy));
});

test('superseded general launch kit points to the corrected editorial source',()=>{
 const kit=fs.readFileSync('distribution/boardroom-public-launch-kit.md','utf8');
 assert.ok(kit.includes('marketing/boardroom-executive-chamber-20261029.md'));
 assert.ok(kit.includes('field report'));
 assert.ok(kit.includes('no required number of paragraphs'));
 assert.doesNotMatch(kit,/I've been working on something pretty cool|Big decision\? Bring more perspective/);
});
