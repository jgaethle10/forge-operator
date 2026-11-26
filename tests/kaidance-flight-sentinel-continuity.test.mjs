import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {inspectFlightSentinelContinuity} from '../systemia/organism/kaidance-flight-sentinel-continuity.mjs';
import {runCompanyHeartbeat} from '../systemia/organism/kaidance-company-heartbeat-runner.mjs';
const contract=JSON.parse(fs.readFileSync('registry/kaidance-flight-sentinel-continuity.v1.json','utf8'));
function fixture(t,files='none'){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'flight-sentinel-kaidance-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'registry'));
 fs.writeFileSync(path.join(root,'registry/kaidance-flight-sentinel-continuity.v1.json'),
  JSON.stringify(contract));
 if(files!=='none')for(const project of contract.projects){
  for(const rel of project.source_files){
   const f=path.join(root,rel);fs.mkdirSync(path.dirname(f),{recursive:true});
   fs.writeFileSync(f,'# offline research source fixture\n');
  }
 }
 return root;
}
test('two existing research PRs use existing lanes and no new scheduler',()=>{
 assert.deepEqual(contract.projects.map(p=>p.existing_pr).sort((a,b)=>a-b),[1882,2112]);
 assert.equal(contract.heartbeat_seconds,300);
 assert.equal(contract.new_scheduler_authorized,false);
 assert.equal(contract.mission_admission_policy,'existing_systemia_authority_only');
 assert.equal(contract.automatic_research_or_network_execution,false);
 assert.deepEqual(contract.projects.map(p=>p.lane_key),
  ['science-research','infrastructure-watch']);
});
test('existing draft branches missing from main checkout are truthfully reported',t=>{
 const result=inspectFlightSentinelContinuity({root:fixture(t)});
 assert.equal(result.status,'source_only_review_required');
 assert.equal(result.tracked_projects,2);
 assert.equal(result.review_candidates.length,2);
 assert.ok(result.projects.every(x=>x.source_status==='source_not_in_checkout'));
 assert.ok(result.projects.every(x=>x.source_fingerprint===null));
 assert.equal(result.worker_dispatched,false);
 assert.equal(result.research_execution_verified,false);
 assert.equal(result.systemia_mission_admission_verified,false);
});
test('source presence can be fingerprinted but never considered progress',t=>{
 const root=fixture(t,'present');
 const a=inspectFlightSentinelContinuity({root});
 const b=inspectFlightSentinelContinuity({root});
 assert.deepEqual(a,b);
 assert.ok(a.projects.every(x=>x.source_status==='source_present_not_runtime_verified'));
 assert.ok(a.projects.every(x=>/^sha256:[a-f0-9]{64}$/.test(x.source_fingerprint)));
 assert.equal(a.external_io_performed,false);
 assert.equal(a.code_changed_this_tick,false);
 assert.equal(a.private_rd_export_status,'not_independently_verified_here');
 assert.equal(a.research_execution_verified,false);
});
test('tampered or missing registry fails closed',t=>{
 const root=fixture(t);
 const file=path.join(root,'registry/kaidance-flight-sentinel-continuity.v1.json');
 fs.writeFileSync(file,JSON.stringify({...contract,heartbeat_seconds:60}));
 assert.equal(inspectFlightSentinelContinuity({root}).status,'held_registry_unavailable_or_invalid');
 fs.writeFileSync(file,JSON.stringify({...contract,projects:[contract.projects[0],contract.projects[0]]}));
 assert.equal(inspectFlightSentinelContinuity({root}).status,'held_registry_unavailable_or_invalid');
});
test('traversal and unrecognized PR binding fail closed',t=>{
 const root=fixture(t);
 const file=path.join(root,'registry/kaidance-flight-sentinel-continuity.v1.json');
 const broken=structuredClone(contract);
 broken.projects[0].source_files[0]='research/flight-sentinel/v0_6/../../private/key.py';
 fs.writeFileSync(file,JSON.stringify(broken));
 assert.equal(inspectFlightSentinelContinuity({root}).status,'held_registry_unavailable_or_invalid');
 broken.projects[0].source_files[0]=contract.projects[0].source_files[0];
 broken.projects[0].existing_pr=9999;
 fs.writeFileSync(file,JSON.stringify(broken));
 assert.equal(inspectFlightSentinelContinuity({root}).status,'held_registry_unavailable_or_invalid');
});
test('symlink in checked source is not followed',t=>{
 const root=fixture(t,'present');
 const f=path.join(root,contract.projects[0].source_files[0]);
 fs.unlinkSync(f);
 fs.symlinkSync('/etc/hosts',f);
 const a=inspectFlightSentinelContinuity({root});
 assert.equal(a.projects[0].source_status,'held_invalid_source');
 assert.equal(a.projects[0].source_fingerprint,null);
});
test('non-file checked source is held',t=>{
 const root=fixture(t,'present');
 const f=path.join(root,contract.projects[1].source_files[0]);
 fs.unlinkSync(f);fs.mkdirSync(f);
 assert.equal(inspectFlightSentinelContinuity({root}).projects[1].source_status,
  'held_invalid_source');
});
test('existing Kaidance cycle observes research without admission or dispatch',t=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'flight-sentinel-company-'));
 t.after(()=>fs.rmSync(out,{recursive:true,force:true}));
 const now=new Date('2026-11-25T23:45:00Z');
 const a=runCompanyHeartbeat({root:'.',outDir:out,now});
 assert.equal(a.duplicate,false);
 assert.equal(a.report.flight_sentinel_research.tracked_projects,2);
 const candidates=a.queue.candidates.filter(x=>
  x.work_key?.startsWith('flight-sentinel-'));
 assert.equal(candidates.length,2);
 assert.equal(new Set(candidates.map(x=>x.work_key)).size,2);
 assert.ok(candidates.every(x=>!x.execution_authorized&&!x.admission_authorized));
 assert.equal(a.queue.execution_authorized,false);
 assert.equal(a.mission_snapshot.counts.admitted,0);
 assert.equal(a.report.advancement.autonomous_development_workers_launched,0);
 assert.equal(runCompanyHeartbeat({root:'.',outDir:out,now}).duplicate,true);
 const next=runCompanyHeartbeat({root:'.',outDir:out,
  now:new Date(now.getTime()+300000)});
 assert.equal(next.duplicate,false);
 assert.equal(next.report.flight_sentinel_research.code_changed_this_tick,false);
 assert.equal(next.report.flight_sentinel_research.research_execution_verified,false);
});
test('private Systemia identities never enter the public source observations',t=>{
 const root=fixture(t,'present');
 const data=JSON.stringify(inspectFlightSentinelContinuity({root}));
 assert.doesNotMatch(data,/PRIVATE_OWNER|private_mission_id|private_goal_key|real_aircraft/);
 assert.match(data,/source_only_review_required/);
});
