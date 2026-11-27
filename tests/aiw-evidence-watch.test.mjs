import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateAiWSources,runAiWSourceCycle} from '../systemia/infrastructure-watch/aiw-evidence-watch.mjs';
import {classifyAiWReceipt,runCompanyHeartbeat} from '../systemia/organism/kaidance-company-heartbeat-runner.mjs';
import {validateCompanyLanes} from '../systemia/organism/kaidance-company-heartbeat.mjs';

const official=JSON.parse(fs.readFileSync('systemia/infrastructure-watch/source-registry.v1.json','utf8'));
const lanes=JSON.parse(fs.readFileSync('registry/kaidance-company-lanes.v1.json','utf8'));
const products=JSON.parse(fs.readFileSync('registry/public-products.json','utf8'));
const supervisor=JSON.parse(fs.readFileSync('systemia/core/resident-services.json','utf8'));
const page=t=>new Response('<!doctype html><html><body>'+t.repeat(70)+'</body></html>',
  {status:200,headers:{'content-type':'text/html; charset=utf-8'}});

test('AIW official sources are pinned; unsafe schemes, hosts and publication authority fail closed',()=>{
 assert.equal(validateAiWSources(official).sources.length,3);
 for(const modify of [
  r=>{r.sources[0].url='http://www.fhwa.dot.gov/bridge/nbi/sd2025.cfm'},
  r=>{r.sources[0].url='https://other.example/bridge/nbi/sd2025.cfm'},
  r=>{r.sources[0].url='https://www.fhwa.dot.gov.evil.example/bridge/nbi/sd2025.cfm'},
  r=>{r.sources[0].url='https://www.fhwa.dot.gov/private/sd2025.cfm'},
  r=>{r.authority.publish=true},
  r=>{r.sources.push(r.sources[0])}
 ]){
  const copy=structuredClone(official);modify(copy);
  assert.throws(()=>validateAiWSources(copy));
 }
});

test('Kaidance and Systemia catalog register the monitor as optional, not auto-executing',()=>{
 const p=validateCompanyLanes(lanes,products,supervisor);
 assert.equal(p.seen.has('infrastructure-watch'),true);
 const resident=supervisor.services.find(s=>s.service_key==='aiw-evidence-watch');
 assert.equal(resident.optional_when_unconfigured,true);
 assert.equal(resident.cadence_seconds,300);
 assert.equal(resident.env_args['--out'],'SYSTEMIA_AIW_EVIDENCE_OUT_DIR');
 assert.equal(supervisor.services.find(s=>s.service_key==='kaidance-company-heartbeat')
  .optional_env_args['--aiw-receipt'],'SYSTEMIA_AIW_EVIDENCE_RECEIPT_FILE');
});

test('Daily source watch: first baseline, repeat skips, real metadata change is review-only and queued in company heartbeat',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aiw-watch-evidence-'));
 const runAt=new Date('2026-11-25T12:00:00Z');
 let variant='baseline',calls=0;
 const fetcher=async()=>{calls++;return page(variant)};
 try{
  const a=await runAiWSourceCycle({outDir:dir,now:runAt,registry:official,fetcher});
  assert.equal(a.skipped,false);
  assert.equal(a.changed,0);
  assert.equal(a.unverified,0);
  assert.equal(a.latest.review_required,false);
  assert.equal(a.latest.ingested_bridge_records,0);
  assert.equal(calls,3);

  const b=await runAiWSourceCycle({outDir:dir,now:new Date(runAt.getTime()+300000),registry:official,fetcher});
  assert.equal(b.skipped,true);
  assert.equal(calls,3,'5-minute heartbeat must not redownload official listings');

  variant='newmetadata';
  const c=await runAiWSourceCycle({outDir:dir,now:new Date(runAt.getTime()+86401000),registry:official,
   fetcher:async url=>{calls++;return page(url.includes('sd2025.cfm')?'newmetadata':'baseline')}});
  assert.equal(c.changed,1);
  assert.equal(c.unverified,0);
  assert.equal(c.latest.review_candidates.length,1);
  assert.equal(c.latest.review_candidates[0].approval_required,true);
  assert.equal(c.latest.publications_authorized,0);
  assert.equal(c.latest.discovered_new_bridge_records,0);
  const at=new Date(runAt.getTime()+86401000);
  const classification=classifyAiWReceipt(c.latest,at);
  assert.equal(classification.status,'verified_receipt');
  assert.equal(classification.review_candidates.length,1);

  const pulseDir=fs.mkdtempSync(path.join(os.tmpdir(),'aiw-kaidance-pulse-'));
  try{
    const pulse=runCompanyHeartbeat({root:'.',outDir:pulseDir,now:at,proveWorlds:false,aiwReceipt:c.latest});
    assert.equal(pulse.report.infrastructure_watch.status,'verified_receipt');
    assert.equal(pulse.queue.execution_authorized,false);
    assert.equal(pulse.queue.candidates.filter(x=>x.lane_key==='infrastructure-watch').length,1);
    assert.equal(pulse.queue.candidates.find(x=>x.lane_key==='infrastructure-watch').publication_authorized,false);
    // Unified heartbeat has two FindMyPart review keys and the missing
    // Forest receipt hold in addition to this AIW source change.
    assert.equal(pulse.queue.candidates.filter(x=>x.lane_key==='findmypart').length,2);
    assert.equal(pulse.report.forest_restoration.status,'not_connected');
    assert.equal(pulse.report.forest_restoration.review_candidates.length,1);
    assert.equal(pulse.mission_snapshot.counts.held,4);
    assert.equal(pulse.next_action.current_next_action?.lane_key,'infrastructure-watch');
    assert.equal(pulse.next_action.current_next_action?.dispatch_authorized,false);
    assert.equal(pulse.next_action.publication_actions,0);
    assert.equal(pulse.report.advancement.production_deployments,0);
    assert.equal(fs.existsSync(path.join(pulseDir,'mission-snapshot.json')),true);
  }finally{fs.rmSync(pulseDir,{recursive:true,force:true})}
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('Unverified source and stale receipt cannot authorize release',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aiw-source-fail-'));
 const now=new Date('2026-11-25T12:00:00Z');
 try{
  const result=await runAiWSourceCycle({outDir:dir,now,registry:official,
    fetcher:async()=>{throw Error('upstream_offline')}});
  assert.equal(result.unverified,3);
  assert.equal(result.latest.status,'degraded');
  assert.equal(result.latest.review_candidates.length,3);
  assert.equal(classifyAiWReceipt(result.latest,new Date(now.getTime()+49*3600000)).status,'stale');
  const unsafe={...result.latest,production_changes:1};
  assert.equal(classifyAiWReceipt(unsafe,now).status,'invalid');
  assert.equal(result.latest.no_auto_approval,true);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
