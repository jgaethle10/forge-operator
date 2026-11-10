import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const queue=JSON.parse(fs.readFileSync('distribution/marketing/work-saban-20261030.review.json','utf8'));
const copy=fs.readFileSync('distribution/marketing/work-saban-clip-launch-20261030.md','utf8');
const home=fs.readFileSync('public/work-saban/index.html','utf8');
const reporter=fs.readFileSync('public/work-saban/report/index.html','utf8');
const mark=fs.readFileSync('public/work-saban/brand/work-saban-mark.svg','utf8');
const destinations=new Set(['facebook-page','linkedin-organization','x','instagram-business','tiktok']);
const workReport='https://jgaethle10.github.io/forge-operator/work-saban/report/';

test('launch calls only real public reporting live, never hosted AI sales',()=>{
 assert.equal(queue.schema,'evercraft.marketing.owner-review-queue.v1');
 assert.equal(queue.engine,'evercraft_clip');
 assert.equal(queue.orchestrator,'systemia');
 assert.equal(queue.public_product.working_report,workReport);
 assert.equal(queue.published_posts_verified,0);
 assert.equal(queue.platform_connections_verified,false);
 assert.equal(queue.publication_authority,false);
 assert.equal(queue.observed_paid_sales,0);
 assert.match(reporter,/Your numbers/);
 assert.match(reporter,/id="consent"/);
 assert.match(reporter,/connect-src 'none'/);
 assert.match(home,/href="\.\/report\/"/);
 assert.match(mark,/flow symbol/);
});

test('Clip queue has unique scoped unsubmitted entries and no impersonated account approvals',()=>{
 assert.equal(queue.entries.length,5);
 const ids=queue.entries.map(x=>x.id);
 assert.equal(new Set(ids).size,ids.length);
 for(const row of queue.entries){
  assert.ok(destinations.has(row.destination));
  assert.equal(row.authorization.approved,false);
  assert.equal(row.authorization.authorizationRef,null);
  assert.equal(row.publicationAuthority,false);
  assert.equal(row.publisher_state,'not_submitted');
  assert.equal(row.provider_post_id,null);
  assert.equal(row.provider_post_url,null);
  assert.equal(row.provider_published_at,null);
  assert.equal(row.distribution.engine,'evercraft_clip');
  assert.equal(row.brand_key,'evercraft-work-saban');
  assert.ok(row.tracked_url.startsWith(workReport+'?utm_source=evercraft_clip'));
  assert.equal(row.linkVerification.expectedCanonicalUrl,workReport);
  assert.equal(row.linkVerification.requireCanonicalSelfMatch,true);
  assert.match(row.caption,/report/i);
  assert.doesNotMatch(row.caption,/we have launched 10,000 agents|paid customers|live autonomous AI employees/i);
 }
 assert.ok(queue.restricted_brand_keys.includes('christmaslightsusa'));
});

test('company Facebook uses first-comment link and its own provider receipt, not a fake direct link',()=>{
 const fb=queue.entries.find(x=>x.platform==='facebook');
 assert.ok(fb);
 assert.equal(fb.first_comment_required,true);
 assert.equal(fb.link_mode,'first_comment');
 assert.ok(!/https?:\/\//.test(fb.caption));
 assert.ok(fb.first_comment_copy.startsWith(workReport));
 assert.equal(fb.provider_first_comment_url,null);
 assert.match(copy,/Facebook first comment \(requires separate verified provider publication\)/);
});

test('platform copy is different for each market and does not promise unrestricted teams',()=>{
 const text=queue.entries.map(x=>x.caption);
 assert.equal(new Set(text).size,text.length);
 const x=queue.entries.find(p=>p.platform==='x');
 assert.ok([...x.caption].length<=280,'X copy must fit a normal post');
 const ig=queue.entries.find(p=>p.platform==='instagram');
 const tt=queue.entries.find(p=>p.platform==='tiktok');
 assert.equal(ig.link_mode,'profile_link');
 assert.equal(tt.link_mode,'bio_or_story');
 for(const p of [ig,tt])assert.doesNotMatch(p.caption,/https?:\/\//);
 assert.match(copy,/storyboard only/i);
 assert.match(copy,/No video file/i);
 assert.match(copy,/No Base44, Metricool/);
});

test('personal accounts stay owner-controlled; no unrelated brand promotion',()=>{
 assert.equal(queue.personal_share.length,5);
 for(const p of queue.personal_share){
  assert.equal(p.account_scope,'founder_personal_manual_only');
  assert.equal(p.provider_post_url,null);
  assert.notEqual(p.post_state,'published');
 }
 for(const brand of ['eps','havenly-cleaning','rnb-chicken-and-soul','christmaslightsusa'])
   assert.ok(queue.restricted_brand_keys.includes(brand));
 assert.ok(copy.includes('Systemia must mint issuer-backed'));
});

test('mobile landing retains action and tightens layout without hiding product',()=>{
 assert.match(home,/\.byline\{display:none\}/);
 assert.match(home,/\.hero\{padding:38px 0 57px\}/);
 assert.match(home,/\.top-inner\{height:64px;gap:10px\}/);
 assert.match(home,/>Make your sales report<\/a>/);
 assert.match(home,/>Join the pilot<\/a>/);
});
