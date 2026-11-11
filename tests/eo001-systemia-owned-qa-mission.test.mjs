import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runEo001OwnedQaMission} from '../systemia/organism/eo001-owned-qa-mission.mjs';
import {readGoalState,createGoalStateFile} from '../systemia/organism/goal-store.mjs';
import {createGoalState,admitGoalPlan,startGoalWork}
  from '../systemia/organism/goal-runtime.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'..');
const PYQA=path.join(repo,'integrations/ai-evaluation-lab/eo001-forge-evidence-qa.py');
const PACK=path.join(repo,'integrations/ai-evaluation-lab/eo001-gate0-private-handoff.py');
const statusFile=home=>path.join(home,'.local/state/evercraft/eo001-handoff/systemia-missions/eo001-gate0.goal.json');
const bundleFile=home=>path.join(home,'.local/state/evercraft/eo001-handoff/gate0-FAKE/gate0-private-handoff.zip');
const chmod=(p,mode)=>fs.chmodSync(p,mode);

function fixture(home){
  const base=path.join(home,'.local/state/evercraft/eo001-handoff');
  const dir=path.join(base,'gate0-FAKE');
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  chmod(base,0o700);chmod(dir,0o700);
  const py=String.raw`
from pathlib import Path
import importlib.util, json, os, sys
d=Path(sys.argv[1]); f=Path(sys.argv[2])
spec=importlib.util.spec_from_file_location('handoff',f)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
r={
'schema':'evercraft.eo001.sovereign-inference-acceptance.v1',
'state':'FIRST_INFERENCE_PASS','real_local_inference':True,
'model_sha256':m.MODEL_SHA,'runtime_sha256':m.RUNTIME_SHA,
'model_reply_sha256':'a'*64,'inference_seconds':17.81,
'child_processes_stopped':True,'synthetic_only':True,
'production_services_modified':False}
v={
'schema':'EO-FIRST-RUN-REVIEW/0.1.0','evidence_coverage':'NOT_SUPPLIED',
'hardware':{'state':'INFERENCE_REPORTED','provenance':'UNVERIFIED_EXTERNAL',
'live_model_execution':None,'eo001_decisions_established':False},
'cases':{},'model_decision_counts':{},'unmatched_receipts':0,
'problems':[],'live_model_execution':None,'promotion_allowed':False,
'note':'private'}
for name, data in [('sanitized-receipt.json',m.json_bytes(r)),
('independent-review.json',m.json_bytes(v)),
('gate0-private-handoff.zip',m.build_bundle(r,v))]:
 p=d/name
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'wb') as writer:writer.write(data)
`;
  const result=spawnSync('python3',['-c',py,dir,PACK],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
}
async function sandbox(t){
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'systemia-eo001-'));
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  fixture(home);
  return home;
}
function missionTask(state,name){return state.tasks.find(t=>t.work_key===name);}

test('Systemia invokes real local Forge QA, records work, and holds outbound',async t=>{
  const home=await sandbox(t);
  const result=await runEo001OwnedQaMission({home,qaScript:PYQA});
  assert.equal(result.internal_qa,'PASS');
  assert.equal(result.external_message_authorized,false);
  assert.equal(result.commissioned_agent_execution_verified,false);
  assert.equal(result.lab_independent_inspection,'PENDING');
  assert.equal(result.worker_kind,'owned_deterministic_qa_not_commissioned_agent');
  assert.equal(result.model_execution,'READ_ONLY_QA_NO_MODEL_RUN');
  const state=await readGoalState(statusFile(home));
  const work=missionTask(state,'forge-private-evidence-qa');
  assert.equal(work.status,'complete');
  assert.equal(work.attempt,1);
  assert.match(work.receipt_refs[0],/^forge-qa:sha256:[0-9a-f]{64}$/);
  const external=missionTask(state,'private-external-delivery-reconciliation');
  assert.equal(external.human_gate_required,true);
  assert.equal(external.human_gate_unresolved,true);
  assert.equal(external.status,'pending');
  assert.throws(()=>startGoalWork({state,workKey:external.work_key}),/not ready/);
  const outputs=fs.readdirSync(path.dirname(statusFile(home))).filter(x=>/^forge-qa-/.test(x));
  assert.equal(outputs.length,1);
});

test('restart reads durable mission state and cannot duplicate QA or falsely complete delivery',async t=>{
  const home=await sandbox(t);
  const first=await runEo001OwnedQaMission({home,qaScript:PYQA});
  const second=await runEo001OwnedQaMission({home,qaScript:PYQA});
  assert.equal(second.recovered_from_existing_goal,true);
  assert.equal(second.state_revision,first.state_revision);
  const state=await readGoalState(statusFile(home));
  assert.equal(missionTask(state,'forge-private-evidence-qa').attempt,1);
  assert.equal(missionTask(state,'private-external-delivery-reconciliation').status,'pending');
});

test('artifact changed after approval does not inherit old Forge pass',async t=>{
  const home=await sandbox(t);
  await runEo001OwnedQaMission({home,qaScript:PYQA});
  const f=bundleFile(home);
  const fd=fs.openSync(f,'a');
  fs.writeSync(fd,'CHANGED');fs.closeSync(fd);
  await assert.rejects(
    runEo001OwnedQaMission({home,qaScript:PYQA}),
    /previous_qa_receipt_or_package_changed/
  );
});

test('corrupt artifact becomes blocked internal task; no fake QA receipt',async t=>{
  const home=await sandbox(t);
  fs.writeFileSync(bundleFile(home),'corrupt');
  const result=await runEo001OwnedQaMission({home,qaScript:PYQA});
  assert.equal(result.internal_qa,'HELD');
  assert.equal(result.external_message_authorized,false);
  assert.equal(result.blocker,'forge_evidence_qa_failed_closed');
  const state=await readGoalState(statusFile(home));
  assert.equal(missionTask(state,'forge-private-evidence-qa').status,'blocked');
});

test('interrupted read-only internal QA attempt reconciles on restart, without a second lease',async t=>{
  const home=await sandbox(t);
  const goal=createGoalState({goalKey:'eo001-gate0-evidence-continuity',missionKey:'EO-001',objective:'test recovered local QA'});
  const planned=admitGoalPlan({state:goal,plan:[
    {work_key:'forge-private-evidence-qa',work_type:'qa'},
    {work_key:'private-external-delivery-reconciliation',work_type:'external_message',
      dependency_keys:['forge-private-evidence-qa']},
    {work_key:'lab-independent-inspection',work_type:'research',
      dependency_keys:['private-external-delivery-reconciliation']}
  ]});
  const executing=startGoalWork({state:planned,workKey:'forge-private-evidence-qa'});
  const stateFile=statusFile(home);
  fs.mkdirSync(path.dirname(stateFile),{recursive:true,mode:0o700});
  await createGoalStateFile(stateFile,executing);
  const result=await runEo001OwnedQaMission({home,qaScript:PYQA});
  assert.equal(result.internal_qa,'PASS');
  const state=await readGoalState(stateFile);
  assert.equal(missionTask(state,'forge-private-evidence-qa').attempt,1);
  assert.equal(missionTask(state,'forge-private-evidence-qa').status,'complete');
});

test('two candidate handoffs halt instead of selecting arbitrary private evidence',async t=>{
  const home=await sandbox(t);
  const dir=path.dirname(bundleFile(home));
  const second=path.join(path.dirname(dir),'gate0-SECOND');
  fs.mkdirSync(second,{mode:0o700});
  fs.copyFileSync(bundleFile(home),path.join(second,'gate0-private-handoff.zip'));
  await assert.rejects(runEo001OwnedQaMission({home,qaScript:PYQA}),
    /exactly_one_private_eo001_handoff_required/);
});
