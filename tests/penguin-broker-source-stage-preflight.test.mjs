import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {evaluateBrokerSourceStage} from '../scripts/preflight-penguin-broker-source-stage.mjs';
const methods=['deploymentStatus','renewDeploymentLease','deployRelease','verifyRoute','stopDeployment'];
const valid={
 unit_loaded:true,active:true,pid:407,account:'evercraft',group:'evercraft',
 cwd:'/opt/evercraft/forge-operator',
 unit_entrypoint_ok:true,running_entrypoint_ok:true,installed_target_missing:true,
 candidate_regular:true,candidate_blob:'c546293e947a99ca784b804c8065b27abf580f3b',
 operator_regular:true,operator_methods:methods,nodeseed_active:true,
 updater_active:false,updater_state_unknown:false,
};
test('review eligibility never implies restart or deployment authorization',()=>{
 const result=evaluateBrokerSourceStage(valid);
 assert.equal(result.stage_candidate_review_eligible,true);
 assert.deepEqual(result.reasons,[]);
 for(const field of ['restart_authorized','identity_cutover_authorized',
  'broker_deployment_authorized','unattended_dispatch_authorized',
  'services_changed','filesystem_changed','secrets_read']){
   assert.equal(result[field],false,field);
 }
});
test('fail closed on altered source, active updater and changed target',()=>{
 for(const [key,value,reason] of [
  ['candidate_blob','f'.repeat(40),'candidate_source_not_pinned'],
  ['candidate_regular',false,'candidate_not_regular'],
  ['installed_target_missing',false,'target_no_longer_missing'],
  ['updater_active',true,'fabric_updater_active'],
  ['updater_state_unknown',true,'fabric_updater_state_unknown'],
  ['running_entrypoint_ok',false,'broker_running_entrypoint_mismatch'],
  ['unit_entrypoint_ok',false,'broker_unit_entrypoint_mismatch'],
  ['nodeseed_active',false,'nodeseed_not_active'],
  ['pid',0,'broker_pid_invalid'],
  ['account','root','broker_account_mismatch'],
 ]){
  const result=evaluateBrokerSourceStage({...valid,[key]:value});
  assert.equal(result.stage_candidate_review_eligible,false,key);
  assert.ok(result.reasons.includes(reason),reason);
  assert.equal(result.restart_authorized,false,key);
 }
});
test('each Yard API dependency must exist',()=>{
 for(const missing of methods){
  const result=evaluateBrokerSourceStage({...valid,
   operator_methods:methods.filter(m=>m!==missing)});
  assert.ok(result.reasons.includes('operator_method_missing_'+missing));
  assert.equal(result.stage_candidate_review_eligible,false);
 }
});
test('source stage inspector remains nonmutating and cannot restart services',()=>{
 const source=fs.readFileSync(new URL('../scripts/preflight-penguin-broker-source-stage.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/execFileSync\([^\n]*['"](?:restart|stop|start|enable)['"]/);
 assert.doesNotMatch(source,/\b(?:writeFileSync|copyFileSync|renameSync|unlinkSync|mkdirSync|chownSync|chmodSync)\s*\(/);
 assert.doesNotMatch(source,/\/proc\/['"]?\+?pid\+?['"]?\/environ/);
 assert.doesNotMatch(source,/show\(['"]Environment/);
 const syntax=spawnSync(process.execPath,['--check',
  new URL('../scripts/preflight-penguin-broker-source-stage.mjs',import.meta.url).pathname],{encoding:'utf8'});
 assert.equal(syntax.status,0,syntax.stderr);
});
