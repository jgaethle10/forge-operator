import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateAirCoreConfig,fingerprintAirCoreSources,runAirCoreDevelopmentCycle}
 from '../systemia/organism/kaidance-aircore-development.mjs';
import {runCompanyHeartbeat} from '../systemia/organism/kaidance-company-heartbeat-runner.mjs';

const config=JSON.parse(fs.readFileSync('registry/kaidance-aircore-development.v1.json','utf8'));
const at=new Date('2026-11-25T23:15:00.000Z');
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-aircore-'));

test('AirCore product is an unpublished, explicitly held 300s workstream',()=>{
 assert.equal(validateAirCoreConfig(config).heartbeat_seconds,300);
 assert.equal(config.systemia_review_required,true);
 assert.equal(config.policy.hardware_purchase_authorized,false);
 assert.equal(config.policy.customer_or_partner_contact_authorized,false);
 assert.equal(config.policy.public_air_quality_claim_authorized,false);
 const bad=structuredClone(config);
 bad.policy.hardware_purchase_authorized=true;
 assert.throws(()=>validateAirCoreConfig(bad),/aircore_untrusted_configuration/);
 assert.match(fingerprintAirCoreSources('.',config.source_files).source_fingerprint,/^sha256:[a-f0-9]{64}$/);
 assert.throws(()=>fingerprintAirCoreSources('.',['../../etc/passwd']),/aircore_untrusted_source_path/);
});

test('source review occurs on existing clock; no duplicate proof or invented physical progress',()=>{
 const out=tmp();
 try{
  const first=runAirCoreDevelopmentCycle({root:'.',outDir:out,now:at});
  assert.equal(first.report.source_status,'source_proof_queued');
  assert.equal(first.report.physical_prototype_built,false);
  assert.equal(first.report.measured_cadr_cfm,null);
  assert.equal(first.queue.execution_authorized,false);
  const same=runAirCoreDevelopmentCycle({root:'.',outDir:out,now:at,runProofs:true,
   spawn:()=>{throw Error('duplicated source proof')}});
  assert.equal(same.duplicate,true);
  let calls=0;
  const proven=runAirCoreDevelopmentCycle({root:'.',outDir:out,
   now:new Date(at.getTime()+300000),runProofs:true,
   spawn:(_program,args)=>{calls++;assert.deepEqual(args,['--test','systemia/breath-of-fresh-air/aircore-sizing.test.mjs']);return {status:0,error:null};}});
  assert.equal(calls,1);
  assert.equal(proven.report.source_status,'source_proof_passed');
  assert.equal(proven.report.gate_G0_source_validation,'source_checks_passed_not_physical_validation');
  assert.equal(proven.report.work_executed_by_saban,false);
  assert.equal(proven.report.measured_airflow_cfm,null);
  const steady=runAirCoreDevelopmentCycle({root:'.',outDir:out,
   now:new Date(at.getTime()+600000),runProofs:true,
   spawn:()=>{throw Error('unnecessary hourly rerun')}});
  assert.equal(steady.report.source_status,'fresh_prior_source_proof');
  assert.equal(steady.report.newly_seen,0);
  assert.equal(fs.statSync(path.join(out,'state.json')).mode&0o777,0o600);
 }finally{fs.rmSync(out,{recursive:true,force:true});}
});

test('missing model sources HOLD and failed source proof never implies validated CADR',()=>{
 const root=tmp(),out=tmp();
 try{
  fs.mkdirSync(path.join(root,'registry'),{recursive:true});
  fs.writeFileSync(path.join(root,'registry/kaidance-aircore-development.v1.json'),JSON.stringify(config));
  const missing=runAirCoreDevelopmentCycle({root,outDir:out,now:at,runProofs:true,
   spawn:()=>{throw Error('must not run')}});
  assert.equal(missing.report.source_status,'missing_source_hold');
  assert.equal(missing.report.gate_G0_source_validation,'not_yet_verified');
  assert.equal(missing.report.measured_cadr_cfm,null);
  assert.equal(missing.queue.candidates[0].execution_authorized,false);
 }finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(out,{recursive:true,force:true});}
 const out2=tmp();
 try{
  const fail=runAirCoreDevelopmentCycle({root:'.',outDir:out2,now:at,
   runProofs:true,spawn:()=>({status:1,error:null})});
  assert.equal(fail.report.source_status,'source_proof_failed');
  assert.equal(fail.report.gate_G0_source_validation,'not_yet_verified');
  assert.equal(fail.report.hardware_purchases,0);
 }finally{fs.rmSync(out2,{recursive:true,force:true});}
});

test('company heartbeat integrates AirCore receipt and held next action without new scheduler',()=>{
 const out=tmp();
 try{
  const first=runCompanyHeartbeat({root:'.',outDir:out,now:at,
   proveWorlds:false,proveLearning:false,proveAirCore:false});
  assert.equal(first.report.aircore_development.state,'source_reconciled');
  assert.equal(first.report.aircore_development.physical_prototype_built,false);
  const candidates=first.queue.candidates.filter(x=>x.lane_key==='aircore-development');
  assert.equal(candidates.length,1);
  assert.equal(candidates[0].execution_authorized,false);
  assert.equal(candidates[0].hardware_purchase_authorized,false);
  assert.ok(first.mission_snapshot.evidence_refs.includes('source:registry/kaidance-aircore-development.v1.json'));
  assert.equal(first.mission_snapshot.counts.admitted,0);
  assert.equal(runCompanyHeartbeat({root:'.',outDir:out,now:at,proveAirCore:true}).duplicate,true);
 }finally{fs.rmSync(out,{recursive:true,force:true});}
});
