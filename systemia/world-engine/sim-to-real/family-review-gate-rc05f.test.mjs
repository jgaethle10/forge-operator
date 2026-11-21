import test from 'node:test';
import assert from 'node:assert/strict';
import {runFamilyTrial} from './family-trial-rc05f.mjs';
import {evaluateFamilyGate,verifyFamilyGate} from './family-review-gate-rc05f.mjs';
const fixtures=()=>[
  runFamilyTrial({family:'crossing-lanes',firstSeed:501,seeds:8,maxTicks:35}),
  runFamilyTrial({family:'offset-slalom',firstSeed:601,seeds:8,maxTicks:35})
];
test('RC05F cross-family gate never permits release or hardware authority',()=>{
  const gate=evaluateFamilyGate(fixtures());
  assert.equal(gate.families.length,2);
  assert.equal(gate.hardwareAuthorized,false);
  assert.equal(gate.productionAuthorized,false);
  assert.equal(gate.realWorldSafe,false);
  assert.equal(verifyFamilyGate(gate),true);
});
test('RC05F all-timeout results are HOLD, even with zero collisions',()=>{
  const g=evaluateFamilyGate(fixtures());
  assert.equal(g.overallResearchEligible,false);
  assert.equal(g.decision,'HOLD');
  assert.ok(g.families.every(f=>f.reasons.includes('insufficient_route_completion_improvement')));
});
test('RC05F refuses single family, duplicate family, or tampered evidence',()=>{
  const reports=fixtures();
  assert.throws(()=>evaluateFamilyGate([reports[0]]),/rc05f_gate_requires_both_families/);
  assert.throws(()=>evaluateFamilyGate([reports[0],reports[0]]),/rc05f_gate_duplicate_family/);
  reports[0].scores.baseline.arrived+=1;
  assert.throws(()=>evaluateFamilyGate(reports),/rc05f_gate_invalid_input_report/);
});
test('RC05F tampered gate cannot claim physical safety',()=>{
  const g=evaluateFamilyGate(fixtures());
  g.realWorldSafe=true;
  assert.equal(verifyFamilyGate(g),false);
});