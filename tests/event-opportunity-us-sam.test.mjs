import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {normalizeSAMEventOpportunity,reconcileSAMEventResults}
 from '../systemia/events/event-opportunity-us-sam.mjs';
import {runSAMEventScout} from '../systemia/events/event-opportunity-us-sam-runner.mjs';
const now=new Date('2026-11-25T22:00:00.000Z');
const id='abcd0123abcd0123abcd0123abcd0123';
const notice={
 noticeId:id,title:'Event planning and production services for annual festival',
 type:'Solicitation',active:'Yes',fullParentPathName:'Example Federal Agency.Division',
 responseDeadLine:'2026-12-20T18:00:00Z',postedDate:'2026-11-23',
 uiLink:'https://sam.gov/opp/'+id+'/view'
};
test('SAM.gov public notice is a human-reviewed candidate, never a contract or customer',()=>{
 const a=normalizeSAMEventOpportunity(notice,{now});
 assert.match(a.opportunity_key,/^event:[a-f0-9]{20}$/);
 assert.equal(a.source,'us_sam_public_v2');
 assert.equal(a.source_url,notice.uiLink);
 assert.equal(a.deadline,'2026-12-20T18:00:00.000Z');
 assert.equal(a.buyer,'Example Federal Agency.Division');
 for(const name of ['outreach_authorized','dispatch_authorized','proposal_sent','eligibility_verified',
  'contract_awarded','revenue_confirmed','buyer_contact_verified','registration_or_set_aside_verified'])
  assert.equal(a[name],false,name);
 const batch=reconcileSAMEventResults({opportunitiesData:[notice,notice],totalRecords:2},{now});
 assert.equal(batch.matches_found,1);
 assert.equal(batch.outreach_sent,0);
 assert.equal(batch.revenue_confirmed,0);
});
test('USA market research is not a paid solicitation; awards, expired and unrelated records are rejected',()=>{
 const research=normalizeSAMEventOpportunity({...notice,type:'Sources Sought'},{now});
 assert.equal(research.lifecycle,'early_market_research_not_a_solicitation');
 for(const mutate of [
  n=>{n.type='Award Notice'},n=>{n.active='No'},
  n=>{n.responseDeadLine='2026-11-01T00:00:00Z'},
  n=>{n.title='Bulk road salt transport'},
  n=>{n.fullParentPathName=''},n=>{n.noticeId='invalid'},
  n=>{n.award={date:'2026-11-20'}},
 ]){const x=structuredClone(notice);mutate(x);assert.equal(normalizeSAMEventOpportunity(x,{now}),null);}
 const malicious=normalizeSAMEventOpportunity({...notice,uiLink:'https://sam.gov@attacker.example/opp/'+id+'/view'},{now});
 assert.equal(malicious.source_url,'https://sam.gov/opp/'+id+'/view');
 assert.throws(()=>reconcileSAMEventResults({data:[notice]},{now}));
});
test('US source never runs without private key or on offline PR, and never exposes secret in receipt',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'us-sam-events-'));
 let calls=0;
 try{
  const absent=await runSAMEventScout({outDir:dir,now,live:true,
   fetcher:async()=>{calls++;throw Error('unexpected')}});
  assert.equal(absent.status,'api_key_not_connected');
  assert.equal(absent.key_configured,false);
  assert.equal(calls,0);
  const offline=await runSAMEventScout({outDir:dir,now,live:false,apiKey:'test_private_key_abcdef',
   fetcher:async()=>{calls++;throw Error('unexpected')}});
  assert.equal(offline.status,'source_only_not_live_enabled');
  assert.equal(calls,0);
  const privateKey='test_private_key_abcdef';
  const fakeFetcher=async(url,args)=>{
   calls++;const u=new URL(url);
   assert.equal(u.hostname,'api.sam.gov');
   assert.equal(u.searchParams.get('api_key'),privateKey);
   assert.equal(u.searchParams.get('title'),'event');
   assert.equal(u.searchParams.get('postedFrom'),'11/11/2026');
   assert.equal(u.searchParams.get('postedTo'),'11/25/2026');
   assert.equal(args.redirect,'error');
   return {status:200,ok:true,headers:{get:()=>''},
    text:async()=>JSON.stringify({opportunitiesData:[notice,notice],totalRecords:2})};
  };
  const a=await runSAMEventScout({outDir:dir,now,live:true,apiKey:privateKey,fetcher:fakeFetcher});
  assert.equal(a.status,'official_first_page_checked');
  assert.equal(a.candidates_from_this_probe,1);
  assert.equal(a.contacts_sent,0);
  assert.equal(a.spend_authorized,false);
  assert.equal(calls,1);
  for(const file of ['state.json','latest.json']){
   const full=path.join(dir,file);
   assert.equal(fs.statSync(full).mode&0o777,0o600);
   assert(!fs.readFileSync(full,'utf8').includes(privateKey),'secret must not be persisted');
  }
  const b=await runSAMEventScout({outDir:dir,now:new Date(now.getTime()+300000),live:true,apiKey:privateKey,
   fetcher:async()=>{calls++;throw Error('throttle failed')}});
  assert.equal(b.status,'throttled_prior_attempt');
  assert.equal(b.candidates_from_this_probe,0);
  assert.equal(calls,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('US API failure cannot falsely mint a lead or leak key-bearing URL',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'us-sam-events-failed-'));
 try{
  const k='test_private_key_abcdef';
  const out=await runSAMEventScout({outDir:dir,now,live:true,apiKey:k,
   fetcher:async(url)=>{throw Error('Secret in URL '+url)}});
  assert.equal(out.status,'official_source_unavailable');
  assert.equal(out.candidates_from_this_probe,0);
  assert(!JSON.stringify(out).includes(k));
  assert(!fs.readFileSync(path.join(dir,'state.json'),'utf8').includes(k));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
