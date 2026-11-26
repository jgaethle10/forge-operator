import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {inspectEarthPulseSource,earthPulseReviewCandidate,EARTH_PULSE_SOURCE_PATHS} from '../systemia/organism/kaidance-earth-pulse-source.mjs';
import {runCompanyHeartbeat} from '../systemia/organism/kaidance-company-heartbeat-runner.mjs';
import {planCompanyHeartbeat,validateCompanyLanes} from '../systemia/organism/kaidance-company-heartbeat.mjs';

const at=new Date('2026-11-25T23:45:00.000Z');
function temporary(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-earth-pulse-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 return dir;
}
function sourceFixture(root,payload='// synthetic source\n'){
 for(const name of EARTH_PULSE_SOURCE_PATHS){
  const abs=path.join(root,name);
  fs.mkdirSync(path.dirname(abs),{recursive:true});
  fs.writeFileSync(abs,payload);
 }
}
test('missing research source is a hold, never a verified worker',t=>{
 const dir=temporary(t),p=inspectEarthPulseSource({root:dir});
 assert.equal(p.status,'source_not_in_checkout');
 assert.equal(p.source_files_present,0);
 assert.equal(p.source_fingerprint,null);
 assert.equal(p.mission_admission_verified,false);
 assert.equal(p.researcher_execution_verified,false);
 assert.equal(p.scientific_accuracy_verified,false);
 assert.equal(p.public_release_authorized,false);
 assert.equal(earthPulseReviewCandidate(p).execution_authorized,false);
});
test('source file fingerprints prove presence but not admission or research advancement',t=>{
 const root=temporary(t);sourceFixture(root);
 const before=inspectEarthPulseSource({root});
 assert.equal(before.status,'source_present_not_runtime_verified');
 assert.match(before.source_fingerprint,/^sha256:[a-f0-9]{64}$/);
 assert.equal(before.source_files_present,3);
 assert.equal(before.mission_admission_verified,false);
 assert.equal(before.researcher_execution_verified,false);
 assert.equal(before.worker_dispatched,false);
 assert.equal(before.next_review_action,'verify_existing_systemia_rd_export_and_real_research_receipt');
 fs.appendFileSync(path.join(root,EARTH_PULSE_SOURCE_PATHS[0]),'// test change\n');
 assert.notEqual(inspectEarthPulseSource({root}).source_fingerprint,before.source_fingerprint);
});
test('partial and symlinked files fail closed',t=>{
 const root=temporary(t);sourceFixture(root);
 fs.rmSync(path.join(root,EARTH_PULSE_SOURCE_PATHS[1]));
 const partial=inspectEarthPulseSource({root});
 assert.equal(partial.status,'source_not_in_checkout');
 assert.equal(partial.source_fingerprint,null);
 fs.symlinkSync(path.join(root,EARTH_PULSE_SOURCE_PATHS[0]),path.join(root,EARTH_PULSE_SOURCE_PATHS[1]));
 assert.equal(inspectEarthPulseSource({root}).status,'held_invalid_source');
 assert.equal(inspectEarthPulseSource({root:'/definitely-not-a-real-directory'}).status,'held_invalid_root');
});
test('company inventory names Earth Pulse without inventing a resident service',()=>{
 const manifest=JSON.parse(fs.readFileSync('registry/kaidance-company-lanes.v1.json','utf8'));
 const products=JSON.parse(fs.readFileSync('registry/public-products.json','utf8'));
 const supervisor=JSON.parse(fs.readFileSync('systemia/core/resident-services.json','utf8'));
 validateCompanyLanes(manifest,products,supervisor);
 const lanes=manifest.lanes.filter(x=>x.lane_key==='earth-pulse');
 assert.equal(lanes.length,1);
 const lane=lanes[0];
 assert.equal(lane.cadence_seconds,300);
 assert.equal(lane.mode,'observe_existing_workflows');
 assert.deepEqual(lane.services,[]);
 assert.deepEqual(lane.products,[]);
 const result=planCompanyHeartbeat({manifest,products,supervisor,now:at,
    worldsFingerprint:'sha256:'+'b'.repeat(64)});
 assert.equal(result.report.lanes.find(x=>x.lane_key==='earth-pulse').worker_verified,false);
 assert.equal(result.snapshot.counts.admitted,0);
});
test('existing company runner checks Earth Pulse once per tick and queues only human admission',t=>{
 const root=temporary(t),out=path.join(root,'state');
 const first=runCompanyHeartbeat({root:'.',outDir:out,now:at});
 assert.equal(first.duplicate,false);
 assert.equal(first.report.earth_pulse.schema,'evercraft.kaidance.earth-pulse-source-observation.v1');
 assert.equal(first.report.earth_pulse.researcher_execution_verified,false);
 assert.equal(first.report.earth_pulse.automated_alerts_authorized,false);
 const candidates=first.queue.candidates.filter(x=>x.work_key==='earth-pulse:kaidance-research-continuity');
 assert.equal(candidates.length,1);
 assert.equal(candidates[0].execution_authorized,false);
 assert.equal(candidates[0].publication_authorized,false);
 assert.equal(first.mission_snapshot.counts.admitted,0);
 const receipt=fs.readFileSync(path.join(out,'latest.json'),'utf8');
 const repeat=runCompanyHeartbeat({root:'.',outDir:out,now:at});
 assert.equal(repeat.duplicate,true);
 assert.equal(fs.readFileSync(path.join(out,'latest.json'),'utf8'),receipt);
});
