import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startFabricLocalRuntime } from '../systemia/mcp/fabric-local-runtime.mjs';

const landing=fs.readFileSync('public/findmypart/index.html','utf8');
const mark=fs.readFileSync('public/findmypart/brand/mark.svg','utf8');
const art=fs.readFileSync('public/findmypart/brand/launch-landscape.svg','utf8');
const story=fs.readFileSync('public/findmypart/brand/launch-portrait.svg','utf8');
const wordmark=fs.readFileSync('public/findmypart/brand/wordmark.svg','utf8');

test('practical orange blue black identity is consistent across customer surfaces',()=>{
  assert.match(landing,/<title>FindMyPart \| Missing part\. Not the end\.<\/title>/);
  assert.match(landing,/--ink:#151c25/);
  assert.match(landing,/--orange:#f16b27/);
  assert.match(landing,/--blue:#2565a3/);
  assert.match(landing,/--paper:#fff/);
  for(const asset of [mark,art,story,wordmark]){
    assert.match(asset,/^<svg /);
    assert.match(asset,/role="img"/);
    assert.match(asset,/<title/);
    assert.doesNotMatch(asset,/<script|<foreignObject|(?:href|xlink:href)=["']https?:\/\//i);
    assert.doesNotMatch(asset,/#7358eb|#a38cff|#caf1ad/i,'obsolete brand colors should not reappear');
  }
  assert.match(mark,/viewBox="0 0 256 256"/);
  assert.match(art,/viewBox="0 0 1200 628"/);
  assert.match(story,/viewBox="0 0 1080 1350"/);
});

test('working-customer homepage is genuinely short and action focused',()=>{
  assert.match(landing,/For the part nobody can find/);
  assert.match(landing,/Missing part\./);
  assert.match(landing,/Not the end\./);
  assert.match(landing,/Tell us about your part/);
  assert.match(landing,/How it works/);
  assert.match(landing,/A simpler way past the dead end/);
  assert.match(landing,/We dig into it/);
  assert.match(landing,/Get a clear next step/);
  assert.match(landing,/Not sure which hunt fits\?/);
  assert.match(landing,/No subscription/);
  const descriptions=(landing.match(/<article class="step">/g)||[]).length;
  assert.equal(descriptions,3,'only three customer-visible steps');
  assert.doesNotMatch(landing,/STAGE 0[1-6]|six-stage sourcing|SYSTEMIA COMMAND|RAVEN NEXUS/i);
  assert.doesNotMatch(landing,/base44\.app|checkout\.stripe\.com|buy\.stripe\.com/i);
  assert.match(landing,/<form id="part-request-form"[^>]*method="post" action="\/api\/findmypart\/inquiry"/);
  assert.match(landing,/<script type="module" src="\/findmypart\/app\.mjs"><\/script>/);
  assert.doesNotMatch(landing,/<iframe/i);
  assert.ok(landing.length<16000,'customer page should remain compact');
});

test('three visible offer prices, simple lead action and no false proof',()=>{
  for(const price of ['$19','$49','$99'])assert.ok(landing.includes(price),price);
  for(const name of ['Quick Hunt','Deep Hunt','Rescue Hunt'])assert.ok(landing.includes(name));
  assert.equal((landing.match(/class="price-card/g)||[]).length,3);
  const priceSection=landing.slice(landing.indexOf('<section id="pricing">'),landing.indexOf('</section>',landing.indexOf('<section id="pricing">')));
  assert.doesNotMatch(priceSection,/class="btn primary"|href="\/api\/offers/,'No checkout button in each tier before customer scope');
  assert.match(landing,/research, not a replacement part/i);
  assert.match(landing,/not guaranteed/);
  assert.match(landing,/href="\/findmypart\/sample-report\/"/);
  assert.match(landing,/mailto:jessegaethle10@gmail\.com\?subject=FindMyPart/);
  for(const field of ['part_description','equipment_context','email','consent'])assert.ok(landing.includes('name="'+field+'"'));
  assert.match(landing,/type="submit">Send my part request/);
  assert.match(landing,/No payment needed to send your request/);
  assert.equal((landing.match(/href="mailto:/g)||[]).length,1,'one buyer-controlled message action');
  assert.equal((landing.match(/href="#request"/g)||[]).length,2,'repeated primary action routes to the same destination');
});

test('mobile is legible, accessible, inert and explicitly held from indexing',()=>{
  assert.match(landing,/<meta name="robots" content="noindex,nofollow">/);
  assert.match(landing,/<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(landing,/@media\(max-width:600px\)/);
  assert.match(landing,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(landing,/a:focus-visible/);
  assert.match(landing,/<nav .*aria-label="Main navigation"/);
  assert.doesNotMatch(landing,/<img [^>]+src="https?:/i);
  assert.match(landing,/role="status" aria-live="polite"/);
});

test('owned Fabric serves exact FindMyPart site and art as GET/HEAD read-only, noindex',async()=>{
 const runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false});
 try{
   for(const route of ['/findmypart','/findmypart/','/findmypart/index.html']){
     const res=await fetch(runtime.url+route);
     assert.equal(res.status,200,route);
     assert.match(res.headers.get('content-type')||'',/text\/html/);
     assert.match(res.headers.get('x-robots-tag')||'',/noindex/);
     assert.match(res.headers.get('content-security-policy')||'',/form-action 'none'/);
     assert.match(await res.text(),/Missing part\./);
   }
   const sample=await fetch(runtime.url+'/findmypart/sample-report/');
   assert.equal(sample.status,200);
   assert.match(await sample.text(),/NOT A REAL HUNT OR SUPPLIER QUOTE/);
   assert.match(sample.headers.get('x-robots-tag')||'',/noindex/);
   const app=await fetch(runtime.url+'/findmypart/app.mjs');
   assert.equal(app.status,200);
   assert.match(app.headers.get('content-type')||'',/text\/javascript/);
   assert.match(await app.text(),/api\/findmypart\/inquiry/);
   const h=await fetch(runtime.url+'/findmypart/',{method:'HEAD'});
   assert.equal(h.status,200);
   assert.equal((await h.text()).length,0);
   for(const name of ['mark.svg','wordmark.svg','launch-landscape.svg','launch-portrait.svg']){
     const r=await fetch(runtime.url+'/findmypart/brand/'+name);
     assert.equal(r.status,200,name);
     assert.match(r.headers.get('content-type')||'',/image\/svg\+xml/);
     assert.match(await r.text(),/^<svg /);
   }
   const post=await fetch(runtime.url+'/findmypart/',{method:'POST'});
   assert.equal(post.status,405);
   assert.equal((await post.json()).error,'findmypart_public_route_read_only');
   assert.equal((await fetch(runtime.url+'/findmypart/brand/not-found.svg')).status,404);
 }finally{await runtime.close()}
});

test('Systemia machine launch manifest cannot falsely announce production readiness',()=>{
 const m=JSON.parse(fs.readFileSync('systemia/launch/findmypart-launch-readiness.json','utf8'));
 assert.equal(m.launch_permission,false);
 assert.equal(m.release_phase,'STAGED_NOT_PUBLICLY_RELEASED');
 assert.equal(m.operational_rules.owned_only,true);
 assert.equal(m.operational_rules.collect_live_payments,false);
 assert.equal(m.operational_rules.publish_ads,false);
 assert.equal(m.offers.length,3);
 assert.deepEqual(m.offers.map(x=>x.amount_cents),[1900,4900,9900]);
 assert.ok(m.checks.some(x=>x.id==='settlement'&&x.state==='unverified'));
 assert.ok(m.checks.some(x=>x.id==='real_fulfillment'&&x.state==='unverified'));
 assert.ok(m.checks.some(x=>x.id==='distribution_authority'&&x.state==='held'));
 assert.equal(m.no_live_metrics_claimed,true);
});
