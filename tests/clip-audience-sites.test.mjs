import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../public/clip/audience-sites/',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const queue=JSON.parse(read('queue.json'));
const expected=['partscout','valuescout','playbook-lab','site-rescue','creative-studio','publisher-lab','relay-notes'];

test('Clip distribution queue covers all seven sites, no silent drops',()=>{
 assert.equal(queue.schema,'evercraft.clip.audience-sites-distribution-queue.v1');
 assert.equal(queue.engine,'Evercraft Clip');
 assert.equal(queue.site_count,7);
 assert.equal(queue.sites.length,7);
 assert.deepEqual(queue.sites.map(x=>x.id).sort(),expected.slice().sort());
 assert.equal(queue.provider_publications_confirmed,0);
 assert.equal(queue.verified_paid_orders,0);
 assert.equal(queue.publicationAuthority,false);
 assert.equal(queue.state,'retired_brand_isolation');
 assert.equal(queue.allowed_corporate_cross_promotion,false);
});
test('all native campaigns have specific hooks, truthful source and tracked landing',()=>{
 for(const site of queue.sites){
  assert.equal(site.hook.length,2);
  assert.ok(site.hook.every(s=>s.trim()));
  assert.ok(site.caption.length>150,'substantive native caption');
  assert.ok(site.channels.length>=2);
  assert.ok(site.tracked_url.includes('utm_source=evercraft_clip'));
  assert.ok(site.tracked_url.includes('utm_content='+site.id));
  assert.equal(site.link,'https://jgaethle10.github.io/forge-operator/audience-sites/'+site.id+'/');
  assert.equal(site.clip_draft.metadata.link,site.link);
  assert.equal(site.clip_draft.linkVerification.expectedCanonicalUrl,site.link);
  assert.equal(site.clip_draft.linkVerification.requireCanonicalSelfMatch,true);
 }
});
test('drafts fail closed in Evercraft Clip existing social publisher',()=>{
 for(const site of queue.sites){
  const handoff=JSON.parse(read(site.id+'/handoff.json'));
  assert.equal(handoff.schema,'evercraft.clip.social-publish-request.v1');
  assert.equal(handoff.brandKey,'evercraft-audience-sites');
  assert.equal(handoff.authorization.approved,false);
  assert.equal(handoff.authorization.authorizationRef,'');
  assert.equal(handoff.publicationAuthority,false);
  assert.equal(handoff.status,'cancelled_brand_isolation');
  assert.equal(handoff.distribution.corporate_channels_authorized,false);
  assert.equal(handoff.status_proofs.clip_provider_publish_receipt,null);
  assert.equal(handoff.status_proofs.payment_receipts,null);
  assert.equal(handoff.distribution.paid_spend_usd,0);
  assert.ok(handoff.disallowed.includes('adult_content_on_family_brands'));
  assert.ok(handoff.disallowed.includes('evercraft_corporate_social_distribution'));
  assert.equal(handoff.creative.media_ready_for_provider_upload,false);
 }
});
test('each social creative exists in 4:5 feed and 9:16 story sizes',()=>{
 for(const site of queue.sites){
  for(const [format,width,height] of [['feed',1080,1350],['story',1080,1920]]){
   const s=read(site.id+'/'+format+'.svg');
   assert.ok(s.startsWith('<?xml'));
   assert.match(s,/<svg\s/);
   assert.ok(s.includes('viewBox="0 0 '+width+' '+height+'"'));
   assert.ok(s.includes('xmlns="http://www.w3.org/2000/svg"'));
   assert.ok(s.includes(site.brand));
   assert.match(s,/<\/svg>/);
  }
 }
});
test('campaign review UI shows native assets but no fake live-social status',()=>{
 const html=read('index.html');
 assert.equal((html.match(/<article class="card"/g)||[]).length,7);
 assert.match(html,/0 provider publications verified/);
 assert.match(html,/Social platform publication is held/);
 assert.match(html,/Evercraft Clip/);
 assert.doesNotMatch(html,/Metricool|base44|RIVET|AliEV/);
});
