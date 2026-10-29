import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startFabricLocalRuntime } from '../systemia/mcp/fabric-local-runtime.mjs';

const landing=fs.readFileSync('public/findmypart/index.html','utf8');
const mark=fs.readFileSync('public/findmypart/brand/mark.svg','utf8');
const art=fs.readFileSync('public/findmypart/brand/launch-landscape.svg','utf8');
const story=fs.readFileSync('public/findmypart/brand/launch-portrait.svg','utf8');
const wordmark=fs.readFileSync('public/findmypart/brand/wordmark.svg','utf8');

test('original FindMyPart identity and all four vector artifacts are release-controlled',()=>{
  assert.match(landing,/<title>FindMyPart \| Missing part\. Not the end\.<\/title>/);
  assert.match(landing,/Missing part\./);
  assert.match(landing,/Not the end\./);
  assert.match(landing,/#7358eb|--violet:#7358eb/);
  for(const asset of [mark,art,story,wordmark]){
    assert.match(asset,/^<svg /);
    assert.match(asset,/role="img"/);
    assert.match(asset,/<title/);
    assert.doesNotMatch(asset,/<script|<foreignObject|(?:href|xlink:href)=["']https?:\/\//i);
  }
  assert.match(mark,/viewBox="0 0 256 256"/);
  assert.match(art,/viewBox="0 0 1200 628"/);
  assert.match(story,/viewBox="0 0 1080 1350"/);
});

test('offer ladder, scope disclaimers and legitimate inquiry action are understandable without hidden payment',()=>{
  for(const price of ['$19','$49','$99'])assert.ok(landing.includes(price),price);
  for(const word of ['Quick Hunt','Deep Hunt','Rescue Hunt','sourcing','Equipment','Part Passport']){
    // Part Passport is an illustrative internal product name, not necessarily in main landing
    if(word==='Part Passport')continue;
    assert.match(landing,new RegExp(word,'i'));
  }
  assert.match(landing,/One-time research services/);
  assert.match(landing,/not a guarantee of availability, compatibility/);
  assert.match(landing,/illustration shows the format, not an actual customer hunt/);
  assert.match(landing,/mailto:jessegaethle10@gmail.com\?subject=FindMyPart/);
  assert.match(landing,/href="\/offers\/findmypart"/);
  assert.match(landing,/confirm scope and payment availability rather than taking an unidentified payment/);
  assert.doesNotMatch(landing,/(?:base44\.app|buy\.stripe\.com|checkout\.stripe\.com)/i);
  assert.doesNotMatch(landing,/<form|<script|<iframe|<input/i);
});

test('pre-release HTML is inert, responsive and explicitly held from search engines',()=>{
  assert.match(landing,/<meta name="robots" content="noindex,nofollow">/);
  assert.match(landing,/<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(landing,/@media\(max-width:570px\)/);
  assert.match(landing,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(landing,/a:focus-visible/);
  assert.match(landing,/<nav .*aria-label="Main navigation"/);
  assert.doesNotMatch(landing,/<img [^>]+src="https?:/i);
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
