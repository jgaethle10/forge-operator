import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {planCompanyHeartbeat,validateCompanyLanes} from '../systemia/organism/kaidance-company-heartbeat.mjs';
import {runCompanyHeartbeat,sourceFingerprint,runResidentEventSources} from '../systemia/organism/kaidance-company-heartbeat-runner.mjs';
import {runRegionalEventReview} from '../systemia/events/event-opportunity-regional-review-runner.mjs';
const products=JSON.parse(fs.readFileSync('registry/public-products.json','utf8'));
const supervisor=JSON.parse(fs.readFileSync('systemia/core/resident-services.json','utf8'));
const lanes=JSON.parse(fs.readFileSync('registry/kaidance-company-lanes.v1.json','utf8'));
const now=new Date('2026-11-21T16:00:00.000Z');
const fingerprint='sha256:'+'b'.repeat(64);
test('Kaidance company catalog identifies all existing products, actual services and unbound lanes',()=>{
 const validated=validateCompanyLanes(lanes,products,supervisor);
 assert.equal(validated.catalogKeys.length,products.products.length);
 assert.equal(validated.serviceKeys.length,supervisor.services.length);
 const first=planCompanyHeartbeat({manifest:lanes,products,supervisor,now,
  worldsFingerprint:fingerprint,proof:{status:'not_run',executed:false}});
 assert.equal(first.report.company_portfolio.public_products,products.products.length);
 assert.equal(first.report.company_portfolio.resident_services_configured,supervisor.services.length);
 assert.equal(first.report.company_portfolio.registered_lanes,lanes.lanes.length);
 assert.ok(first.report.company_portfolio.products_discovered_without_named_lane>0);
 assert.equal(first.report.advancement.code_changes,0);
 assert.equal(first.report.advancement.autonomous_development_workers_launched,0);
 assert.equal(first.snapshot.counts.admitted,0);
 assert.equal(first.snapshot.schema,'evercraft.kaidance.mission-snapshot.v1');
 assert.equal(first.snapshot.counts.held,0);
 assert.ok(first.snapshot.counts.scanned>=first.snapshot.counts.changed);
});
test('Kaidance never turns an unchanged heartbeat into engineering progress',()=>{
 const first=planCompanyHeartbeat({manifest:lanes,products,supervisor,now,
  worldsFingerprint:fingerprint,proof:{status:'passed',executed:true}});
 const duplicate=planCompanyHeartbeat({manifest:lanes,products,supervisor,previous:first.state,
  now:new Date(now.getTime()+20000),worldsFingerprint:fingerprint});
 assert.equal(duplicate.duplicate,true);
 const next=planCompanyHeartbeat({manifest:lanes,products,supervisor,previous:first.state,
  now:new Date(now.getTime()+300000),worldsFingerprint:fingerprint,proof:{status:'fresh_prior_evidence',executed:false}});
 assert.equal(next.duplicate,false);
 assert.equal(next.snapshot.counts.changed,0);
 assert.equal(next.report.advancement.read_only_worlds_proof_run,false);
 assert.equal(next.report.lanes.find(x=>x.lane_key==='worlds').source_proof.tests_verified,false);
 assert.equal(next.state.worlds_last_verified_at,now.toISOString());
});
test('Unsafe authority, unknown products and duplicate claims fail closed',()=>{
 for(const mutate of [
  m=>{m.automatic_production_mutations=true},
  m=>{m.lanes[0].mode='deploy_code'},
  m=>{m.lanes[0].source_files=['../../private/key']},
  m=>{m.lanes[1].products=['nonexistent-product']},
  m=>{m.lanes.push({...m.lanes[0]})},
  m=>{m.lanes[2].products.push(m.lanes[1].products[0])}
 ]){
  const bad=structuredClone(lanes);mutate(bad);
  assert.throws(()=>validateCompanyLanes(bad,products,supervisor));
 }
});
test('Company source fingerprint is deterministic and rejects missing or unsafe inputs',()=>{
 const f=lanes.lanes.find(x=>x.lane_key==='worlds').source_files;
 assert.match(sourceFingerprint('.',f),/^sha256:[a-f0-9]{64}$/);
 assert.equal(sourceFingerprint('.',f),sourceFingerprint('.',[...f].reverse()));
 assert.throws(()=>sourceFingerprint('.', ['../private/secret']));
 assert.throws(()=>sourceFingerprint('.',['public/worlds/missing-file']));
});
test('Runner writes local private receipts; no worker, deployment, or code write is implied',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-company-proof-'));
 try{
  const first=runCompanyHeartbeat({root:'.',outDir:dir,now,proveWorlds:false});
  assert.equal(first.duplicate,false);
  assert.equal(first.report.proof.status,'due_not_executed');
  const latest=JSON.parse(fs.readFileSync(path.join(dir,'latest.json'),'utf8'));
  const snapshot=JSON.parse(fs.readFileSync(path.join(dir,'mission-snapshot.json'),'utf8'));
  const queue=JSON.parse(fs.readFileSync(path.join(dir,'queue.json'),'utf8'));
  assert.equal(latest.advancement.code_changes,0);
  assert.equal(queue.execution_authorized,false);
  assert.equal(snapshot.counts.admitted,0);
  const nextAction=JSON.parse(fs.readFileSync(path.join(dir,'next-action.json'),'utf8'));
  const nextSnapshot=JSON.parse(fs.readFileSync(path.join(dir,'next-action-mission-snapshot.json'),'utf8'));
  assert.equal(nextAction.schema,'evercraft.kaidance.next-action.v1');
  assert.equal(nextAction.execution_performed,false);
  assert.equal(nextSnapshot.counts.admitted,0);
  assert.equal(fs.statSync(path.join(dir,'next-action-state.json')).mode&0o777,0o600);
  assert.equal(fs.statSync(path.join(dir,'state.json')).mode&0o777,0o600);
  assert.equal(runCompanyHeartbeat({root:'.',outDir:dir,now,proveWorlds:true}).duplicate,true);
  const next=runCompanyHeartbeat({root:'.',outDir:dir,now:new Date(now.getTime()+300000),
   proveWorlds:true,spawn:()=>({status:0,error:null})});
  assert.equal(next.report.proof.status,'passed');
  assert.equal(next.report.proof.executed,true);
  assert.equal(next.report.advancement.read_only_worlds_proof_passed,true);
  assert.equal(next.report.advancement.autonomous_development_workers_launched,0);
  assert.equal(next.mission_snapshot.counts.admitted,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});


test('company heartbeat surfaces a verified existing checkout handoff, without performing it',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-next-action-integration-'));
 const out=path.join(root,'kaidance-company-heartbeat');
 const offer=path.join(root,'kaidance-offer-checkout');
 const at=new Date('2026-11-22T23:00:00.000Z');
 function save(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  fs.writeFileSync(file,JSON.stringify(value)+'\n',{mode:0o600});
 }
 try{
  save(path.join(offer,'latest.json'),{
   schema:'evercraft.kaidance.offer-checkout-heartbeat.v1',
   observed_at:at.toISOString(),readiness:'exact_link_candidates_verified',
   changes_to_stripe_tax_settings:0,sensitive_provider_data_exported:false});
  save(path.join(offer,'actions.json'),{
   schema:'evercraft.payments.kaidance-heartbeat-actions.v1',
   observed_at:at.toISOString(),candidate_count:1,actions:[{kind:'review'}],
   proposed_checkout_placements:[{offer_key:'approved-product'}],
   provider_write_authorized:false,publisher_write_authorized:false});
  const result=runCompanyHeartbeat({root:'.',outDir:out,now:at});
  assert.equal(result.next_action.current_next_action.work_key,'checkout:verified-candidates');
  assert.equal(result.next_action.execution_performed,false);
  assert.equal(result.next_action.checkout_mutations,0);
  const next=JSON.parse(fs.readFileSync(path.join(out,'next-action.json'),'utf8'));
  assert.equal(next.decision_ref,result.next_action.decision_ref);
  assert.equal(JSON.parse(fs.readFileSync(
    path.join(out,'next-action-mission-snapshot.json'),'utf8')).counts.admitted,0);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('existing heartbeat admits up to six official event reviews without repeating outreach or fabricating client work',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-event-scout-'));
 const out=path.join(root,'kaidance-company-heartbeat');
 const scout=path.join(root,'event-opportunity-scout');
 const at=new Date('2026-11-25T22:00:00.000Z');
 const id='event:'+'a'.repeat(20);
 const candidate={opportunity_key:id,
  source_url:'https://www.find-tender.service.gov.uk/Notice/012345-2026',
  outreach_authorized:false,dispatch_authorized:false,
  buyer_contact_verified:false,revenue_confirmed:false,
  deadline:'2026-12-15T00:00:00.000Z'};
 fs.mkdirSync(scout,{recursive:true,mode:0o700});
 try{
  fs.writeFileSync(path.join(scout,'state.json'),JSON.stringify({
   schema:'evercraft.events.opportunity-scout-state.v1',
   last_attempt_ms:at.getTime(),last_success_at:at.toISOString(),
   observation:{schema:'evercraft.events.opportunity-review.v1',
    candidates:[candidate,{...candidate,opportunity_key:'event:'+'b'.repeat(20)},
     {...candidate,opportunity_key:'event:'+'c'.repeat(20),
      source_url:'https://www.find-tender.service.gov.uk.attacker.example/Notice/123'}]}
  }),{mode:0o600});
  const result=runCompanyHeartbeat({root:'.',outDir:out,now:at,proveWorlds:false});
  const events=result.queue.candidates.filter(c=>c.lane_key==='events');
  assert.equal(events.length,2);
  assert.equal(events[0].outreach_authorized,false);
  assert.equal(events[0].dispatch_authorized,false);
  assert.equal(events[0].authority,'founder_review_required');
  assert.equal(result.report.event_discovery.candidates_for_review,2);
  assert.equal(result.report.event_discovery.any_buyer_contact,false);
  assert(result.next_action.candidates.some(x=>x.work_key===id));
  assert.equal(result.next_action.execution_performed,false);
  assert.equal(result.next_action.customer_contacts,0);
  assert.equal(runCompanyHeartbeat({root:'.',outDir:out,now:at}).duplicate,true);
  const stale=runCompanyHeartbeat({root:'.',outDir:out,
   now:new Date(at.getTime()+9*3600000)});
  assert.equal(stale.report.event_discovery.candidates_for_review,0);
  assert.equal(stale.queue.candidates.some(x=>x.lane_key==='events'),false);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('US SAM event source is admitted as founder-review only, quarantined when stale',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-us-event-scout-'));
 const out=path.join(root,'kaidance-company-heartbeat');
 const dir=path.join(root,'event-opportunity-us-sam');
 const at=new Date('2026-11-25T22:00:00.000Z');
 const id='a'.repeat(32);
 const item={opportunity_key:'event:'+'b'.repeat(20),source:'us_sam_public_v2',
  source_url:'https://sam.gov/opp/'+id+'/view',
  outreach_authorized:false,dispatch_authorized:false,buyer_contact_verified:false,
  revenue_confirmed:false,deadline:'2026-12-20T00:00:00.000Z'};
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 try{
  fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify({
   schema:'evercraft.events.us-sam-scout-state.v1',last_attempt_ms:at.getTime(),
   last_success_at:at.toISOString(),
   observation:{schema:'evercraft.events.us-sam-review.v1',candidates:[item,
    {...item,opportunity_key:'event:'+'c'.repeat(20),source_url:'https://sam.gov.evil.example/opp/'+id+'/view'}]}
  }),{mode:0o600});
  const r=runCompanyHeartbeat({root:'.',outDir:out,now:at});
  assert.equal(r.report.event_discovery.candidates_for_review,1);
  assert.equal(r.report.event_discovery.us_source_status,'read_only_us_review_candidates');
  const candidates=r.queue.candidates.filter(c=>c.lane_key==='events');
  assert.equal(candidates.length,1);
  assert.equal(candidates[0].source_region,'United States');
  assert.equal(candidates[0].outreach_authorized,false);
  assert.equal(candidates[0].dispatch_authorized,false);
  assert.equal(r.next_action.candidates.some(x=>x.work_key===item.opportunity_key),true);
  assert.equal(r.next_action.execution_performed,false);
  assert.equal(r.next_action.customer_contacts,0);
  const stale=runCompanyHeartbeat({root:'.',outDir:out,
   now:new Date(at.getTime()+9*3600000)});
  assert.equal(stale.report.event_discovery.us_source_status,'us_source_stale');
  assert.equal(stale.queue.candidates.filter(c=>c.lane_key==='events').length,0);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('reviewed Oregon tender evidence joins Kaidance queue without external actions or evergreen freshness',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-regional-review-'));
 const out=path.join(root,'kaidance-company-heartbeat');
 const intake=path.join(root,'event-opportunity-regional');
 const at=new Date('2026-11-26T07:45:00.000Z');
 try{
  const admitted=runRegionalEventReview({rootDir:'.',outDir:intake,now:at});
  assert.equal(admitted.candidate_count,2);
  const result=runCompanyHeartbeat({root:'.',outDir:out,now:at});
  const candidates=result.queue.candidates.filter(x=>x.source_region==='Oregon, USA');
  assert.equal(candidates.length,2);
  assert.equal(result.report.event_discovery.regional_source_status,'regional_manual_review_only');
  assert.equal(result.report.event_discovery.regional_crawl_performed,false);
  assert(candidates.every(x=>x.outreach_authorized===false));
  assert(candidates.every(x=>x.dispatch_authorized===false));
  assert(candidates.every(x=>x.prior_outreach_history_checked===false));
  assert.equal(result.queue.execution_authorized,false);
  assert(result.next_action.candidates.some(x=>x.lane_key==='events'&&
   x.evidence_ref.includes('oregonbuys.gov/bso/external/bidDetail.sda')));
  assert.equal(result.next_action.customer_contacts,0);
  const stale=runCompanyHeartbeat({root:'.',outDir:out,now:new Date(at.getTime()+20*60000)});
  assert.equal(stale.report.event_discovery.regional_source_status,'regional_receipt_stale');
  assert.equal(stale.queue.candidates.filter(x=>x.source_region==='Oregon, USA').length,0);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('existing company tick reconciles owner-private R&D once, without publishing its records',()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-rd-company-'));
 const out=path.join(state,'company'),rd=path.join(state,'kaidance-rd-continuity'),goals=path.join(state,'goals');
 const secret='SYNTHETIC_PRIVATE_MISSION_01';
 try{
  fs.mkdirSync(rd,{mode:0o700});fs.mkdirSync(goals,{mode:0o700});
  const save=(file,value)=>fs.writeFileSync(file,JSON.stringify(value),{mode:0o600});
  const receiptAt=new Date(now.getTime()-60000).toISOString();
  const row={mission_id:secret,admission_state:'admitted',disposition:'active',owner:'PRIVATE_OWNER',
   receipt_sla_seconds:3600,next_action:{description:'PRIVATE_NEXT_ACTION',due_at:new Date(now.getTime()+3600000).toISOString()},
   last_work_receipt:{ref:'PRIVATE_RECEIPT',observed_at:receiptAt},
   goal_binding:{goal_key:'goal-a',work_key:'work-a',state_relpath:'goals/a.json'}};
  const file=path.join(rd,'mission-export.json');
  save(file,{schema:'evercraft.systemia.rd-continuity-export.v1',scope:'all_rd',coverage_complete:true,
   exported_at:now.toISOString(),priority_mission_ids:[secret],missions:[row]});
  save(path.join(goals,'a.json'),{schema:'evercraft.goal.state.v1',mission_key:secret,goal_key:'goal-a',revision:3,
   tasks:[{mission_key:secret,goal_key:'goal-a',work_key:'work-a',status:'complete',last_result:'complete',attempt:1,
    receipt_refs:['PRIVATE_RECEIPT'],updated_at:receiptAt}]});
  const first=runCompanyHeartbeat({root:'.',outDir:out,now,rdContinuityEnabled:true});
  assert.equal(first.report.research_continuity.status,'private_reconciled');
  const privateFile=path.join(rd,'latest.json');
  const before=fs.readFileSync(privateFile,'utf8');
  assert.equal(JSON.parse(before).counts.goal_checkpoints_matched,1);
  assert.equal(first.mission_snapshot.counts.admitted,0);
  for(const f of ['latest.json','queue.json','mission-snapshot.json','next-action.json','state.json']){
   assert.doesNotMatch(fs.readFileSync(path.join(out,f),'utf8'),/SYNTHETIC_PRIVATE_MISSION|PRIVATE_OWNER|PRIVATE_NEXT_ACTION|PRIVATE_RECEIPT/);
  }
  fs.unlinkSync(file);
  assert.equal(runCompanyHeartbeat({root:'.',outDir:out,now,rdContinuityEnabled:true}).duplicate,true);
  assert.equal(fs.readFileSync(privateFile,'utf8'),before);
  const next=runCompanyHeartbeat({root:'.',outDir:out,now:new Date(+now+300000),rdContinuityEnabled:true});
  assert.equal(next.report.research_continuity.status,'held');
  assert.equal(JSON.parse(fs.readFileSync(privateFile,'utf8')).missions,null);
  assert.equal(next.mission_snapshot.counts.admitted,0);
 }finally{fs.rmSync(state,{recursive:true,force:true})}
});


test('owned resident runs event sources in existing private sibling roots; CI and duplicate pulses do not poll',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-resident-events-'));
 try{
  const outDir=path.join(root,'kaidance-company-heartbeat'),now=new Date('2026-11-26T19:00:00Z');
  const seen=[];
  const uk=async x=>{seen.push(['uk',x]);return {status:'mock_uk'}};
  const us=async x=>{seen.push(['us',x]);throw Error('private error must not leak')};
  const regional=x=>{seen.push(['regional',x]);return {status:'mock_regional'}};
  const cfg={root:'.',outDir,now,uk,us,regional,apiKey:'test_key_never_logged'};
  assert.equal((await runResidentEventSources(cfg)).status,'not_admitted');
  assert.equal((await runResidentEventSources({...cfg,enabled:true,githubActions:true})).status,'not_admitted');
  assert.equal(seen.length,0);
  const r=await runResidentEventSources({...cfg,enabled:true});
  assert.deepEqual(r.sources,[{key:'uk',status:'mock_uk'},{key:'us',status:'held_source_failure'},{key:'regional',status:'mock_regional'}]);
  assert.equal(seen[0][1].outDir,path.join(root,'event-opportunity-scout'));
  assert.equal(seen[0][1].live,true);
  assert.equal(seen[1][1].outDir,path.join(root,'event-opportunity-us-sam'));
  assert.equal(seen[2][1].outDir,path.join(root,'event-opportunity-regional'));
  assert.equal(JSON.stringify(r).includes(cfg.apiKey),false);
  fs.mkdirSync(outDir);
  fs.writeFileSync(path.join(outDir,'state.json'),JSON.stringify({tick:Math.floor(now.getTime()/300000)}),{mode:0o600});
  assert.equal((await runResidentEventSources({...cfg,enabled:true})).status,'duplicate_or_clock_rollback');
  assert.equal(seen.length,3);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
