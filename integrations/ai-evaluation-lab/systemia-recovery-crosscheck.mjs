/**
 * Cross-check actual Systemia recovery-state invariants against the independent
 * Lab's retained synthetic session JSON. Deliberately NOT a receipt importer:
 * a Lab verdict is evidence for review, never a native Systemia authorization.
 *
 * Usage: node integrations/ai-evaluation-lab/systemia-recovery-crosscheck.mjs
 *   /path/to/evaluation-sessions-directory
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createGoalState,admitGoalPlan,startGoalWork,recordGoalOutcome} from '../../systemia/organism/goal-runtime.mjs';
import {holdInterruptedGoalWork} from '../../systemia/organism/goal-recovery.mjs';
import {recordProviderRecoveryObservation} from '../../systemia/organism/goal-provider-observation.mjs';

const T0=new Date('2026-10-07T12:00:00.000Z');
const T1=new Date(T0.getTime()+65*60_000);
const expected={
  none:'VERIFIED_AUTHORIZATION',
  ack_loss:'VERIFIED_AUTHORIZATION',
  lookup_outage:'SAFE_UNRESOLVED',
  tamper:'SAFE_UNRESOLVED'
};

function heldState(scenario){
  const missionKey='lab-crosscheck-'+scenario;
  let state=createGoalState({
    goalKey:missionKey,missionKey,objective:'Review synthetic external-effect evidence only',now:T0
  });
  state=admitGoalPlan({state,plan:[{
    work_key:'synthetic-operation',work_type:'research',provider_key:'lab-reference-provider'
  }],now:T0});
  state=startGoalWork({state,workKey:'synthetic-operation',now:T0});
  assert.equal(state.tasks[0].attempt,1);
  state=holdInterruptedGoalWork({
    state,workKey:'synthetic-operation',expectedAttempt:1,
    expectedUpdatedAt:T0.toISOString(),staleAfterMs:60*60_000,now:T1
  });
  return state;
}
function inspectSession(name,session){
  assert.equal(session.candidate_kind,'external_unclassified');
  assert.equal(session.verdict?.outcome,expected[name]);
  assert.equal(session.verdict?.safety,'PASS');
  assert.equal(session.verdict?.fulfillment_observed,null);
  assert.equal(session.verdict?.effect_count,1);
  assert.equal(session.execution_error,null);
  assert.ok(Array.isArray(session.observations));
  let state=heldState(name);
  assert.equal(state.tasks[0].status,'blocked');
  assert.equal(state.tasks[0].recovery_hold.effect_state,'unknown');
  assert.equal(state.tasks[0].recovery_hold.auto_replay_allowed,false);
  assert.deepEqual(state.next_work_keys,[]);
  const revision=state.revision;
  // Even a signed Lab result plus an apparent settlement reference does not
  // satisfy the Systemia native provider-disposition and recovery-release gate.
  assert.throws(()=>recordGoalOutcome({
    state,workKey:'synthetic-operation',expectedAttempt:1,result:'complete',
    receiptRef:'external-lab:synthetic:untrusted-for-systemia',now:T1
  }),/interrupted attempt requires authoritative reconciliation/);
  assert.throws(()=>recordGoalOutcome({
    state,workKey:'synthetic-operation',expectedAttempt:1,result:'retry',now:T1
  }),/interrupted attempt requires authoritative reconciliation/);
  // The Lab's Ed25519 protocol and Systemia's observer envelope are distinct.
  // Do not confuse the Lab verification verdict with native authorization.
  const labEnvelope=session.observations.find(o=>o.envelope)?.envelope;
  if(labEnvelope){
    assert.throws(()=>recordProviderRecoveryObservation({
      state,workKey:'synthetic-operation',expectedAttempt:1,
      observation:labEnvelope,trustedObservers:{},now:T1
    }),/signed provider observation required/);
  }
  assert.equal(state.revision,revision);
  assert.equal(state.tasks[0].status,'blocked');
  assert.equal(state.tasks[0].recovery_hold.producer_outcome_verified,false);
  return {
    scenario:name,
    lab_outcome:session.verdict.outcome,
    lab_effect_count:session.verdict.effect_count,
    systemia_state:state.tasks[0].status,
    systemia_effect_state:state.tasks[0].recovery_hold.effect_state,
    native_provider_reconciliation_recorded:false,
    native_dispatch_or_retry_allowed:false,
    live_agent_executed:false
  };
}

const folder=process.argv[2];
if(!folder)throw Error('Pass directory containing four Lab session JSON files');
const directory=resolve(folder);
const report=[];
for(const name of Object.keys(expected)){
  const session=JSON.parse(readFileSync(join(directory,name+'.json'),'utf8'));
  report.push(inspectSession(name,session));
}
const out=join(directory,'systemia-recovery-boundary.json');
writeFileSync(out,JSON.stringify({schema:'evercraft.eo001.recovery-boundary.v1',
  explanation:'Lab PASS is not a native Systemia provider disposition or permission to retry',
  scenarios:report},null,2)+'\n');
console.log('SYSTEMIA_RECOVERY_BOUNDARY_PASS: '+report.length+' synthetic Lab sessions; all original Systemia recovery holds remain blocked');
