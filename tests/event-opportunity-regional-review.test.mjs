import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runRegionalEventReview} from '../systemia/events/event-opportunity-regional-review-runner.mjs';
import {normalizeRegionalEventNotice,reviewRegionalEventCandidates,REGIONAL_OFFICIAL_PORTALS}
 from '../systemia/events/event-opportunity-regional-review.mjs';
const at=new Date('2026-11-26T07:45:00.000Z');
const seed=JSON.parse(fs.readFileSync('systemia/events/regional-official-notices.review.v1.json','utf8'));
test('official OregonBuys notices preserve exact source, deadline and zero contact authorization',()=>{
 assert.equal(seed.sources.length,2);
 const a=reviewRegionalEventCandidates(seed.sources,{now:at});
 assert.equal(a.candidates.length,2);
 assert.equal(a.source_claims_live,false);
 assert.equal(a.earned_revenue,0);
 assert.equal(a.outreach_sent,0);
 const photo=a.candidates.find(x=>x.buyer.includes('Clackamas'));
 assert(photo);
 assert.equal(photo.deadline,'2026-12-08T22:00:00.000Z');
 assert.equal(photo.service_class,'event_creative_service');
 assert.equal(photo.source_status,'official_notice_seen_on_review_date_recheck_required');
 assert.equal(photo.budget,null);
 for(const k of ['revenue_confirmed','contract_awarded','eligibility_verified','delivery_partner_verified',
  'buyer_contact_verified','prior_outreach_history_checked','outreach_authorized','dispatch_authorized'])
  assert.equal(photo[k],false,k);
 const branding=a.candidates.find(x=>x.buyer==='Eastern Oregon University');
 assert(branding);
 assert.equal(branding.service_class,'creative_service_adjacent');
 assert(photo.score>branding.score);
 assert.equal(a.official_portals.length,3);
 assert(REGIONAL_OFFICIAL_PORTALS.some(x=>x.name.includes('WEBS')&&x.candidate_import==='owner_review_only'));
});
test('stale and forged URLs, deadlines, or buyer notes are excluded',()=>{
 const x=structuredClone(seed.sources[0]);
 for(const mutation of [
  a=>{a.source_url='https://oregonbuys.gov.attacker.example/bso/external/bidDetail.sda?docId='+x.notice_id+'&external=true&parentUrl=close'},
  a=>{a.source_url+='&api_key=secret'},
  a=>{a.source_url='https://evil.test/opp/'},
  a=>{a.notice_id='fake'},
  a=>{a.buyer=''},
  a=>{a.status='awarded'},
  a=>{a.service_class='wedding_inquiry'},
  a=>{a.deadline_iso='2026-12-08T14:00:00'},
  a=>{a.deadline_iso='2026-11-20T14:00:00-08:00'},
  a=>{a.reviewed_on='2026-11-01'},
 ]){const row=structuredClone(x);mutation(row);
  assert.equal(normalizeRegionalEventNotice(row,{now:at}),null,JSON.stringify(row));}
 const old=reviewRegionalEventCandidates(seed.sources,{now:new Date('2026-11-29T12:00:00Z')});
 assert.equal(old.candidates.length,0,'old review must not remain in the live queue forever');
 const dup=reviewRegionalEventCandidates([x,x],{now:at});
 assert.equal(dup.candidates.length,1);
});
test('snapshot official portals are source entry points, not claims of machine polling',()=>{
 const names=REGIONAL_OFFICIAL_PORTALS.map(x=>x.name);
 assert(names.includes('OregonBuys open bids'));
 assert(names.includes('Washington WEBS bid calendar'));
 assert(names.includes('Seattle procurement'));
 assert(REGIONAL_OFFICIAL_PORTALS.every(x=>x.access.includes('not_machine_verified')||x.access.includes('directory_to_its_OpenGov_portal')));
 assert.throws(()=>reviewRegionalEventCandidates(null,{now:at}));
 assert.throws(()=>reviewRegionalEventCandidates(seed.sources,{now:at,maxCandidates:500}));
});

test('regional offline review writes private source-backed receipts without browsing, sending or claiming revenue',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-regional-notices-'));
 try{
  const report=runRegionalEventReview({rootDir:'.',outDir:dir,now:at});
  assert.equal(report.candidate_count,2);
  assert.equal(report.official_portal_live_crawl,false);
  assert.equal(report.outreach_sent,0);
  assert.equal(report.bids_submitted,0);
  assert.equal(report.revenue_earned,0);
  for(const name of ['state.json','latest.json']){
   const p=path.join(dir,name);
   assert.equal(fs.statSync(p).mode&0o777,0o600);
  }
  const saved=JSON.parse(fs.readFileSync(path.join(dir,'state.json'),'utf8'));
  assert.equal(saved.schema,'evercraft.events.regional-intake-state.v1');
  assert.equal(saved.source_portal_live_verified,false);
  assert.equal(saved.observation.candidates.length,2);
  assert(saved.observation.candidates.every(x=>x.outreach_authorized===false));
  const expired=runRegionalEventReview({rootDir:'.',outDir:dir,
   now:new Date('2026-11-29T12:00:00Z')});
  assert.equal(expired.candidate_count,0);
  assert.equal(expired.status,'no_current_manual_source_evidence');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
