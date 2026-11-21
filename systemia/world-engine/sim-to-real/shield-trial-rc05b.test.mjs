import test from 'node:test';
import assert from 'node:assert/strict';
import {runShieldTrial,verifyShieldTrial,assessShieldEvidence} from './shield-trial-rc05b.mjs';
import {runReactiveEpisode} from './native-reactive-rc05.mjs';
test('RC05B runs native triple comparison with modeled evidence only',()=>{
  const p=runShieldTrial({firstSeed:51,seeds:1,maxTicks:85});
  assert.equal(p.scores.baseline.total,1);
  assert.equal(p.scores.progress.total,1);
  assert.equal(p.scores.shield.total,1);
  assert.equal(p.noHardwareAuthority,true);
  assert.equal(p.productionAuthorized,false);
  assert.equal(verifyShieldTrial(p),true);
});
test('RC05B does not change default controller',()=>{
  const a=runReactiveEpisode({seed:41,maxTicks:65});
  const b=runReactiveEpisode({seed:41,maxTicks:65,controllerMode:'baseline'});
  assert.equal(a.sha256,b.sha256);
  assert.equal(a.controllerMode,'baseline');
});
test('RC05B uses only tick-bound native set_velocity',()=>{
  const e=runReactiveEpisode({seed:56,maxTicks:120,controllerMode:'progress-shielded'});
  assert.equal(e.hardwareExecution,false);
  assert.equal(e.noTeleportInputs,true);
  assert.ok(e.inputs.every(i=>i.kind==='set_velocity'));
  assert.ok(e.frames.every(f=>typeof f.requested==='string'));
});
test('RC05B tampering cannot confer hardware or production authority',()=>{
  const trial=runShieldTrial({firstSeed:49,seeds:1,maxTicks:90});
  trial.review.productionAuthorized=true;
  assert.equal(verifyShieldTrial(trial),false);
});
test('RC05B rejects invalid scenario options',()=>{
  assert.throws(()=>runShieldTrial({firstSeed:0}),/rc05b_trial_invalid_options/);
  assert.throws(()=>runShieldTrial({seeds:30}),/rc05b_trial_invalid_options/);
});
test('RC05B review gate rejects safety-by-immobility and zero detour progress',()=>{
  const pairs=Array.from({length:8},(_,i)=>({seed:49+i,baseline:{status:'timeout'},shield:{status:'timeout'}}));
  const scores={baseline:{arrived:0},shield:{arrived:0,shieldedMoves:0}};
  const gate=assessShieldEvidence(scores,pairs);
  assert.equal(gate.reviewEligible,false);
  assert.ok(gate.reasons.includes('no_meaningful_arrival_improvement'));
  assert.ok(gate.reasons.includes('no_shielded_progress_commands'));
  assert.equal(gate.hardwareAuthorized,false);
});
test('RC05B positive research-review threshold demands measured improvement and actual detours',()=>{
  const pairs=Array.from({length:8},(_,i)=>({seed:49+i,
    baseline:{status:'timeout'},shield:{status:i<2?'arrived':'timeout'}}));
  const allowed=assessShieldEvidence({baseline:{arrived:0},
    shield:{arrived:2,shieldedMoves:16}},pairs);
  assert.equal(allowed.reviewEligible,true);
  assert.equal(allowed.requiredImprovement,2);
  assert.equal(allowed.productionAuthorized,false);
  const noMovement=assessShieldEvidence({baseline:{arrived:0},
    shield:{arrived:2,shieldedMoves:0}},pairs);
  assert.equal(noMovement.reviewEligible,false);
});
test('RC05B measured gains cannot override a new collision regression',()=>{
  const pairs=Array.from({length:8},(_,i)=>({seed:57+i,baseline:{status:'timeout'},
    shield:{status:i===0?'collision':i<=3?'arrived':'timeout'}}));
  const verdict=assessShieldEvidence({baseline:{arrived:0},shield:{arrived:3,shieldedMoves:99}},pairs);
  assert.equal(verdict.reviewEligible,false);
  assert.ok(verdict.reasons.includes('new_collision_relative_to_default'));
});
test('previous eight-seed RC05B hold regression is explicitly ineligible',()=>{
  const data=runShieldTrial({firstSeed:49,seeds:8,maxTicks:350});
  assert.equal(data.scores.shield.shieldedMoves,0);
  assert.equal(data.review.reviewEligible,false);
  assert.ok(data.review.reasons.includes('no_shielded_progress_commands'));
  assert.equal(verifyShieldTrial(data),true);
});
