import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditSocialContinuity} from '../systemia/clip/social-continuity-watch.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(root,'distribution/marketing/evercraft-partners-20261030.review.json');
const queue=JSON.parse(fs.readFileSync(file,'utf8'));
const blocked=['eps','havenly-cleaning','rnb-chicken-and-soul','christmaslightsusa','aliev','rivet'];
const origin='https://jgaethle10.github.io/forge-operator/partners/';
const ids=()=>queue.entries.map(e=>e.id);

test('Evercraft Partners corporate Clip queue has a real public first-party release',()=>{
 assert.equal(queue.schema,'evercraft.marketing.owner-review-queue.v1');
 assert.equal(queue.campaign_id,'evercraft-partners-founding-20261030');
 assert.equal(queue.engine,'evercraft_clip');
 assert.equal(queue.orchestrator,'systemia');
 assert.equal(queue.public_url,origin);
 assert.ok(queue.founder_editorial_approval);
 assert.ok(queue.entries.length>=8);
 assert.equal(queue.entries.filter(e=>e.platform==='facebook').length,8);
 assert.equal(new Set(ids()).size,ids().length);
 assert.equal(queue.published_posts_verified,0);
 assert.equal(queue.platform_connections_verified,false);
});
test('no corporate page skips actual issuer and provider permissions',()=>{
 for(const e of queue.entries){
  assert.equal(e.authorization.approved,false,e.id);
  assert.equal(e.authorization.authorizationRef,null,e.id);
  assert.equal(e.publicationAuthority,false,e.id);
  assert.equal(e.publisher_state,'not_submitted',e.id);
  assert.equal(e.provider_post_id,null,e.id);
  assert.equal(e.provider_post_url,null,e.id);
  assert.equal(e.account_identity_verified,false,e.id);
  assert.equal(e.platform_permissions_verified,false,e.id);
  assert.equal(e.account_id,null,e.id);
  assert.notEqual(e.status,'published');
 }
});
test('campaign respects specific founder brand separations',()=>{
 for(const e of queue.entries){
  const brand=String(e.brand_key||'').toLowerCase();
  for(const b of blocked)assert.ok(!brand.includes(b),e.id+' '+b);
  for(const b of blocked.slice(0,4))assert.ok(e.distribution.excluded_brand_keys.includes(b),e.id+' '+b);
 }
 assert.ok(queue.excluded_pages.some(x=>/Evercraft Property Services/i.test(x)));
 assert.ok(queue.excluded_pages.some(x=>/R&B Chicken/i.test(x)));
});
test('audience-specific copy, real media and attributable links are not stale or cloned',()=>{
 const captions=new Set();
 const utms=new Set();
 for(const e of queue.entries){
  assert.ok(e.caption.length>110,e.id);
  assert.ok(!captions.has(e.caption),e.id);
  captions.add(e.caption);
  assert.ok(e.tracked_url.startsWith(origin+'?'),e.id);
  assert.ok(e.tracked_url.includes('utm_campaign=evercraft-partners-founding-20261030'),e.id);
  assert.ok(e.tracked_url.includes('utm_content='+e.brand_key),e.id);
  assert.ok(!utms.has(e.tracked_url),e.id);
  utms.add(e.tracked_url);
  assert.equal(e.linkVerification.expectedCanonicalUrl,origin);
  assert.ok(e.linkVerification.expectedText.includes('Evercraft Partners'));
  assert.equal(e.media_asset_url,'https://jgaethle10.github.io/forge-operator/partners/social-card.png');
  assert.equal(e.media_rights,'original_evercraft');
  assert.equal(e.media_upload_verified,false);
  assert.doesNotMatch(e.caption,/guaranteed earnings|instant commission|sign up to get paid|passive income/i);
 }
});
test('Clip review watchdog reports held not fictitious platform publication',()=>{
 const s=auditSocialContinuity({queue,receipts:[],now:new Date('2026-10-30T23:00:00Z'),receiptSourceAvailable:false});
 assert.equal(s.counts.total,queue.entries.length);
 assert.equal(s.counts.approval_hold,queue.entries.length);
 assert.equal(s.counts.provider_receipt_recorded,0);
 assert.equal(s.status,'owner_review_required');
 assert.equal(s.platform_connections_verified,false);
});
