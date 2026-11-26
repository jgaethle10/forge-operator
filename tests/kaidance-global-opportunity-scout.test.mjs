import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runGlobalOpportunityScout,normalizeGlobalNotices,validateGlobalSourceRegistry}
 from '../systemia/organism/kaidance-global-opportunity-scout.mjs';
import {classifyGlobalOpportunityReceipt,runCompanyHeartbeat}
 from '../systemia/organism/kaidance-company-heartbeat-runner.mjs';

const config=JSON.parse(fs.readFileSync('registry/kaidance-global-opportunity-sources.v1.json','utf8'));
const at=new Date('2026-11-25T19:00:00.000Z');
const notice=(id,type='Request for Expression of Interest',title='GIS mapping of irrigation systems')=>({
 id,notice_type:type,notice_status:'Published',noticedate:'24-Nov-2026',
 project_ctry_name:'El Salvador',project_id:'P517267',
 project_name:'Climate resilient agriculture',bid_description:title
});
const response=items=>new Response(JSON.stringify({rows:items.length,os:'0',
 total:String(items.length),procnotices:items}),{
 status:200,headers:{'content-type':'application/json'}});
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'global-opportunities-'));

test('registry allows exactly the pinned official source, not arbitrary targets or outreach',()=>{
 validateGlobalSourceRegistry(config);
 for(const mutate of [
  x=>{x.outreach_authorized=true},
  x=>{x.payment_authorized=true},
  x=>{x.deployment_authorized=true},
  x=>{x.heartbeat_seconds=60},
  x=>{x.sources[0].api_url='https://other.example/data'},
  x=>{x.sources[0].rows=10000},
  x=>{x.sources.push({...x.sources[0]})},
  x=>{x.source_refresh_seconds=300}
 ]){
  const copy=structuredClone(config);mutate(copy);
  assert.throws(()=>validateGlobalSourceRegistry(copy));
 }
});

test('global scope is geographical, not a country filter; only current procurement leads remain',()=>{
 const items=[
  notice('OP00483301'),
  {...notice('OP00483302'),'project_ctry_name':'Kenya','bid_description':'Agribusiness market analysis'},
  notice('OP00483303','Contract Award'),
  {...notice('OP00483304'),noticedate:'01-Jan-2020'},
  {...notice('OP00483305'),notice_status:'Cancelled'},
  {...notice('OP00483306','Request for Expression of Interest','Office furniture'),project_name:'Administrative offices'}
 ];
 const result=normalizeGlobalNotices({procnotices:items},{now:at,maxAgeDays:21});
 assert.deepEqual(result.rows.map(r=>r.notice_id),['OP00483301','OP00483302']);
 assert.deepEqual(result.rows.map(r=>r.country),['El Salvador','Kenya']);
 for(const row of result.rows){
  assert.equal(row.deadline_at,null);
  assert.equal(row.deadline_status,'verify_on_official_notice');
  assert.equal(row.outreach_authorized,false);
  assert.equal(row.application_authorized,false);
  assert.equal(row.contract_eligibility,'unverified');
  assert.equal(row.revenue_usd,null);
  assert.ok(row.source_url.endsWith('/'+row.notice_id));
 }
});

test('one source poll for many five-minute beats, stable dedupe and private receipts',async()=>{
 const out=tmp();let calls=0,urls=[];
 const fetcher=async(url)=>{calls++;urls.push(url);return response(
  calls===1?[notice('OP00483301')]:[notice('OP00483301'),notice('OP00483302')]
 )};
 try{
  const first=await runGlobalOpportunityScout({outDir:out,now:at,fetcher,registry:config});
  assert.equal(first.report.status,'fetched');
  assert.equal(first.report.new_candidate_count,0); // first run is baseline, not proof of newly issued notices
  assert.equal(first.report.review_candidates.length,1);
  assert.equal(first.report.source_request_performed,true);
  assert.equal(calls,1);
  assert.match(urls[0],/^https:\/\/search\.worldbank\.org\/api\/v2\/procnotices\?/);
  assert.equal(classifyGlobalOpportunityReceipt(first.report,at).status,'verified_source_receipt');
  const secondAt=new Date(+at+300000);
  const second=await runGlobalOpportunityScout({outDir:out,now:secondAt,fetcher,registry:config});
  assert.equal(second.report.status,'cooldown');
  assert.equal(second.report.source_request_performed,false);
  assert.equal(second.report.new_candidate_count,0);
  assert.equal(calls,1);
  const laterAt=new Date(+at+21600000+300000);
  const later=await runGlobalOpportunityScout({outDir:out,now:laterAt,fetcher,registry:config});
  assert.equal(later.report.new_candidate_count,1);
  assert.equal(later.report.review_candidates.length,2);
  assert.equal(calls,2);
  const state=JSON.parse(fs.readFileSync(path.join(out,'state.json'),'utf8'));
  assert.deepEqual(state.seen,['OP00483301','OP00483302']);
  assert.equal(fs.statSync(path.join(out,'state.json')).mode&0o777,0o600);
  const q=JSON.parse(fs.readFileSync(path.join(out,'queue.json'),'utf8'));
  assert.equal(q.execution_authorized,false);
  assert.equal(q.no_external_contacts,true);
  assert.equal(q.candidates.length,2);
 }finally{fs.rmSync(out,{recursive:true,force:true})}
});

test('failed official source does not manufacture fresh opportunities or break company',async()=>{
 const out=tmp();
 try{
  const fail=await runGlobalOpportunityScout({outDir:out,now:at,registry:config,
    fetcher:async()=>new Response('denied',{status:429})});
  assert.equal(fail.report.status,'held_source_error');
  assert.equal(fail.report.review_candidates.length,0);
  assert.equal(classifyGlobalOpportunityReceipt(fail.report,at).status,'held_source_error');
  const cooldown=await runGlobalOpportunityScout({outDir:out,now:new Date(+at+300000),registry:config,
    fetcher:async()=>{throw Error('should not refetch in failure backoff')}});
  assert.equal(cooldown.report.status,'cooldown');
  assert.equal(cooldown.report.review_candidates.length,0);
  assert.equal(classifyGlobalOpportunityReceipt(cooldown.report,new Date(+at+300000)).status,'stale');
 }finally{fs.rmSync(out,{recursive:true,force:true})}
});

test('tampered, future, stale and unauthorized opportunity receipts are denied',async()=>{
 const out=tmp();
 try{
  const r=(await runGlobalOpportunityScout({outDir:out,now:at,registry:config,
    fetcher:async()=>response([notice('OP00483301')])})).report;
  const tampered=structuredClone(r);tampered.review_candidates[0].outreach_authorized=true;
  assert.equal(classifyGlobalOpportunityReceipt(tampered,at).status,'invalid');
  const staleTime=new Date(+at+16*60000);
  assert.equal(classifyGlobalOpportunityReceipt(r,staleTime).status,'stale');
  const result=runCompanyHeartbeat({root:'.',outDir:path.join(out,'company'),
    now:at,globalOpportunityReceipt:r});
  assert.equal(result.report.global_opportunities.status,'verified_source_receipt');
  assert.ok(result.queue.candidates.some(x=>x.work_key==='global:worldbank:op00483301'));
  const c=result.queue.candidates.find(x=>x.work_key==='global:worldbank:op00483301');
  assert.equal(c.outreach_authorized,false);
  assert.equal(c.execution_authorized,false);
  assert.equal(result.mission_snapshot.counts.admitted,0);
  const denied=runCompanyHeartbeat({root:'.',outDir:path.join(out,'other-company'),
    now:at,globalOpportunityReceipt:tampered});
  assert.equal(denied.report.global_opportunities.status,'invalid');
  assert.equal(denied.queue.candidates.filter(x=>x.work_key.startsWith('global:')).length,0);
 }finally{fs.rmSync(out,{recursive:true,force:true})}
});
