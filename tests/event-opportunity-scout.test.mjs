import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {normalizePublicEventTender,reconcileEventOpportunityBatch}
 from '../systemia/events/event-opportunity-discovery.mjs';
import {runEventOpportunityScout} from '../systemia/events/event-opportunity-scout-runner.mjs';
const now=new Date('2026-11-25T22:00:00.000Z');
const notice={
 ocid:'ocds-h6vhtk-2026-reignite-001',tag:['tender'],uri:'https://www.find-tender.service.gov.uk/Notice/045001-2026',
 buyer:{name:'Example Council'},tender:{
  title:'Festival event production and coordination',
  description:'Stage logistics, audience accessibility and live event planning.',
  status:'active',tenderPeriod:{endDate:'2026-12-18T12:00:00Z'},
  value:{amount:90000,currency:'GBP'}}
};
test('UK public tender review is grounded, de-duplicated and never performs outreach',()=>{
 const a=normalizePublicEventTender(notice,{now});
 assert.match(a.opportunity_key,/^event:[a-f0-9]{20}$/);
 assert.equal(a.buyer,'Example Council');
 assert.equal(a.deadline,'2026-12-18T12:00:00.000Z');
 assert.equal(a.budget.amount,90000);
 assert.equal(a.source_url,notice.uri);
 for(const k of ['outreach_authorized','dispatch_authorized','buyer_contact_verified',
  'eligibility_verified','proposal_sent','contract_awarded','revenue_confirmed'])
  assert.equal(a[k],false,k);
 const batch=reconcileEventOpportunityBatch([{releases:[notice,{...notice,
  tender:{...notice.tender,title:'Festival event management and delivery'}}]}],{now});
 assert.equal(batch.matches_found,1);
 assert.equal(batch.candidates.length,1);
 assert.equal(batch.outreach_sent,0);
 assert.equal(batch.contract_revenue_confirmed,0);
 assert.equal(batch.source_scope,'UK public procurement only; NOT global coverage');
});
test('expired, cancelled, award-only, disallowed URLs, unknown buyers and irrelevant notices cannot enter queue',()=>{
 for(const mutation of [
  n=>{n.tender.tenderPeriod.endDate='2026-11-01T12:00:00Z'},
  n=>{n.tag=['award']},
  n=>{n.tender.status='cancelled'},
  n=>{n.uri='https://evil.example/notices'},
  n=>{n.uri='https://www.find-tender.service.gov.uk@evil.example/notice'},
  n=>{n.buyer.name=''},
  n=>{n.tender.title='Routine road gritting';n.tender.description='Snow and salt.'},
  n=>{n.ocid='malformed'}
 ]){
  const x=structuredClone(notice);mutation(x);
  assert.equal(normalizePublicEventTender(x,{now}),null,JSON.stringify(x));
 }
 const missing=structuredClone(notice);delete missing.tender.tenderPeriod;
 const candidate=normalizePublicEventTender(missing,{now});
 assert.equal(candidate.deadline,null);
 assert.equal(candidate.lifecycle,'deadline_unverified');
 assert.equal(candidate.outreach_authorized,false);
});
test('official collector makes max one bounded request per six hours, emits private receipts with zero writes or leads when throttled',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-events-scout-'));
 let calls=0;
 const fetcher=async(url,args)=>{
  calls++;
  assert.equal(new URL(url).hostname,'www.find-tender.service.gov.uk');
  assert.equal(new URL(url).searchParams.get('stages'),'tender');
  assert.equal(new URL(url).searchParams.get('limit'),'100');
  assert.equal(args.redirect,'error');
  return {ok:true,status:200,headers:{get:()=>''},text:async()=>JSON.stringify({releases:[notice,notice],links:{next:'opaque-unfollowed'}})};
 };
 try{
  const a=await runEventOpportunityScout({outDir:tmp,now,live:true,fetcher});
  assert.equal(a.status,'official_first_page_checked');
  assert.equal(a.candidates_from_this_live_probe,1);
  assert.equal(a.automated_outreach,0);
  assert.equal(a.claim_of_money_earned,false);
  assert.equal(calls,1);
  assert.equal(fs.statSync(path.join(tmp,'state.json')).mode&0o777,0o600);
  assert.equal(fs.statSync(path.join(tmp,'latest.json')).mode&0o777,0o600);
  const second=await runEventOpportunityScout({outDir:tmp,now:new Date(now.getTime()+300000),live:true,fetcher});
  assert.equal(second.status,'throttled_prior_attempt');
  assert.equal(second.candidates_from_this_live_probe,0,'stale older evidence must not look like a fresh probe');
  assert.equal(calls,1);
  const later=await runEventOpportunityScout({outDir:tmp,now:new Date(now.getTime()+6*3600000),live:true,fetcher});
  assert.equal(later.status,'official_first_page_checked');
  assert.equal(calls,2);
  assert.equal(later.candidates.length,1);
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
});
test('official source failures remain explicit and never fabricate a fresh opportunity',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-events-scout-error-'));
 try{
  const a=await runEventOpportunityScout({outDir:tmp,now,live:true,
   fetcher:async()=>({ok:false,status:429,headers:{get:()=>''}})});
  assert.equal(a.status,'source_unavailable');
  assert.equal(a.source_http_status,429);
  assert.equal(a.candidates_from_this_live_probe,0);
  assert.equal(a.claim_of_money_earned,false);
  const noNet=await runEventOpportunityScout({outDir:tmp,now:new Date(now.getTime()+300000),live:false,
   fetcher:async()=>{throw Error('forbidden network')}});
  assert.equal(noNet.status,'source_only_not_live_enabled');
  assert.equal(noNet.candidates.length,0);
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
});
