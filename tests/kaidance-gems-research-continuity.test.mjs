import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
 inspectGemsResearchRegistry,reviewGemsResearchSource
} from '../systemia/organism/kaidance-gems-research-continuity.mjs';
import {runCompanyHeartbeat} from '../systemia/organism/kaidance-company-heartbeat-runner.mjs';

const source=JSON.parse(fs.readFileSync(
 'registry/kaidance-gems-research-continuity.v1.json','utf8'));
const now=new Date('2026-11-26T23:55:00.000Z');
const goodHash='sha256:'+'a'.repeat(64);
const clone=()=>structuredClone(source);

test('GEMS science continuity is source-only, not model/work execution',()=>{
 const report=inspectGemsResearchRegistry(source,now,goodHash);
 assert.equal(report.status,'source_registered_review_required');
 assert.equal(report.lane_key,'science-research');
 assert.equal(report.workstreams_reviewed,3);
 assert.equal(report.held_workstreams,3);
 assert.equal(report.actual_nbmg_features_verified,false);
 assert.equal(report.private_log_read,false);
 assert.equal(report.independent_fault_truth_verified,false);
 assert.equal(report.remote_execution_performed,false);
 assert.equal(report.submission_made,false);
 assert.equal(report.model_training_executed,false);
 assert.equal(report.payment_authorized,false);
 assert.equal(report.review_candidates.length,1);
 assert.equal(report.review_candidates[0].retry_authorized,false);
 assert.equal(report.review_candidates[0].execution_authorized,false);
 assert.equal(report.selected_submission_id,330339);
 assert.equal(report.selected_dti_reported_not_reverified,0.0552);
});

test('GEMS registry fails closed on tampering, claims or a second dispatcher',()=>{
 const changes=[
  x=>{x.heartbeat_seconds=60},
  x=>{x.lane_key='revenue'},
  x=>{x.canonical.research_source_commit='0'.repeat(40)},
  x=>{x.canonical.continuity_issue=2261},
  x=>{x.selected_entry.selection_change_authorized=true},
  x=>{x.selected_entry.official_public_dti_reported=0.999},
  x=>{x.workstreams.push({...x.workstreams[0]})},
  x=>{x.workstreams[0].automatic_retry=true},
  x=>{x.workstreams[0].next_action='repeat_public_get'},
  x=>{x.workstreams[1].state='model_fit_succeeded'},
  x=>{x.authority.network_probe=true},
  x=>{x.authority.remote_shell=true},
  x=>{x.authority.automatic_work_dispatch=true},
  x=>{x.authority.license_or_competition_submission=true},
  x=>{x.claims.actual_nbmg_features_obtained=true},
  x=>{x.claims.private_capture_error_contents_observed=true},
  x=>{x.claims.new_training_executed=true}
 ];
 for(const mutate of changes){
  const x=clone();mutate(x);
  assert.equal(inspectGemsResearchRegistry(x,now,goodHash).status,'held_source');
 }
 assert.equal(inspectGemsResearchRegistry(source,now,'bad').status,'held_source');
 assert.equal(inspectGemsResearchRegistry(null,now,goodHash).status,'held_source');
});

test('GEMS source registry rejects symlink/absence and never crawls private files',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-kaidance-src-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'registry'),{mode:0o700});
 const p=path.join(root,'registry/kaidance-gems-research-continuity.v1.json');
 assert.equal(reviewGemsResearchSource({root,now}).status,'held_source');
 fs.symlinkSync('/tmp/missing-private-evidence',p);
 assert.equal(reviewGemsResearchSource({root,now}).status,'held_source');
 fs.unlinkSync(p);
 fs.writeFileSync(p,JSON.stringify(source),{mode:0o600});
 assert.equal(reviewGemsResearchSource({root,now}).source_registry_verified,true);
 fs.unlinkSync(p);
 fs.writeFileSync(p,'{malformed-json}',{mode:0o600});
 assert.equal(reviewGemsResearchSource({root,now}).review_candidates.length,0);
});

test('existing company tick includes GEMS held R&D without duplicating a scheduler or creating actions',t=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'gems-kaidance-tick-'));
 t.after(()=>fs.rmSync(state,{recursive:true,force:true}));
 const out=path.join(state,'company-heartbeat');
 const r=runCompanyHeartbeat({root:'.',outDir:out,now,rdContinuityEnabled:false});
 assert.equal(r.executed,true);
 assert.equal(r.report.gems_research.status,'source_registered_review_required');
 assert.equal(r.report.research_continuity.status,'not_configured');
 assert.equal(r.report.gems_research.remote_execution_performed,false);
 assert.equal(r.report.gems_research.model_training_executed,false);
 assert.equal(r.report.gems_research.actual_nbmg_features_verified,false);
 const cases=r.queue.candidates.filter(x=>x.work_key==='gems:008e:review-capture-error');
 assert.equal(cases.length,1);
 assert.equal(cases[0].lane_key,'science-research');
 assert.equal(cases[0].priority,3);
 assert.equal(cases[0].retry_authorized,false);
 assert.equal(r.queue.execution_authorized,false);
 assert.equal(r.mission_snapshot.counts.admitted,0);
 assert.equal(r.report.gems_research.held_workstreams,3);
 assert.equal(r.mission_snapshot.counts.held,0,'historical GEMS holds must not inflate company action holds');
 assert.ok(r.mission_snapshot.evidence_refs.some(x=>x==='source:registry/kaidance-gems-research-continuity.v1.json'));
 assert.equal(r.duplicate,false);
 const dup=runCompanyHeartbeat({root:'.',outDir:out,now});
 assert.equal(dup.duplicate,true);
 assert.equal(dup.executed,false);
 const next=runCompanyHeartbeat({root:'.',outDir:out,
   now:new Date(now.getTime()+300000)});
 assert.equal(next.queue.candidates.filter(x=>x.work_key==='gems:008e:review-capture-error').length,1);
 assert.equal(next.report.gems_research.scientific_artifacts_created,0);
 for(const f of ['latest.json','queue.json','mission-snapshot.json','state.json']){
  const s=fs.readFileSync(path.join(out,f),'utf8');
  assert.doesNotMatch(s,/GEMS008E_FROZEN_URL_PLAN|capture\.stderr\.log|source_neatline|query_url|PRIVATE_ZIP|sha256:253dd30b/);
 }
});
