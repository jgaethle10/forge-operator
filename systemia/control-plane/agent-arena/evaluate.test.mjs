import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAgentTrials, INPUT_SCHEMA, REPORT_SCHEMA } from './evaluate.mjs';

const digest = letter => letter.repeat(64);
function batch() {
  const runs = (quality, opts={}) => ['a','b','c'].map(fixture_id => ({
    fixture_id,
    verdict: 'pass',
    quality,
    elapsed_ms: 100,
    cost_units: 10,
    proposed_unsafe_action: false,
    guard_intervened: false,
    evidence_ref: 'local-synthetic-' + fixture_id,
    ...opts
  }));
  return {
    schema: INPUT_SCHEMA,
    mission_id: 'mission-001',
    suite_id: 'safe-fixture-set',
    suite_version: 'v1',
    baseline_id: 'baseline',
    fixtures: ['a','b','c'],
    candidates: [
      {candidate_id:'baseline',config_digest:digest('a'),runs:runs(0.86)},
      {candidate_id:'challenger',config_digest:digest('b'),runs:runs(0.95)}
    ]
  };
}
test('qualifying challenger is only nominated for review, never promoted',()=>{
  const report=evaluateAgentTrials(batch());
  assert.equal(report.schema,REPORT_SCHEMA);
  assert.equal(report.evidence_status,'unverified_caller_supplied');
  assert.equal(report.review_nomination,'challenger');
  assert.equal(report.production_promotion_allowed,false);
  assert.equal(report.execution_authority_granted,false);
});
test('blocked unsafe proposals still disqualify a trial',()=>{
  const b=batch();
  b.candidates[1].runs[0].proposed_unsafe_action=true;
  b.candidates[1].runs[0].guard_intervened=true;
  const report=evaluateAgentTrials(b);
  assert.equal(report.review_nomination,null);
  assert.ok(report.candidates[1].blockers.includes('unsafe_agent_proposals'));
});
test('missing fixture blocks review',()=>{
  const b=batch();
  b.candidates[1].runs.pop();
  assert.equal(evaluateAgentTrials(b).review_nomination,null);
});
test('duplicate fixture submission is rejected',()=>{
  const b=batch();
  b.candidates[1].runs[1].fixture_id='a';
  assert.throws(()=>evaluateAgentTrials(b),/run_fixture_coverage/);
});
test('evidence references are required but never treated as verification',()=>{
  const b=batch();
  b.candidates[1].runs[0].evidence_ref=null;
  const report=evaluateAgentTrials(b);
  assert.equal(report.review_nomination,null);
  assert.equal(report.evidence_status,'unverified_caller_supplied');
});
test('failed verdict cannot be hidden behind strong quality',()=>{
  const b=batch();
  b.candidates[1].runs[0].verdict='fail';
  assert.equal(evaluateAgentTrials(b).review_nomination,null);
});
test('latency or cost regression blocks review',()=>{
  const b=batch();
  b.candidates[1].runs.forEach(r=>r.elapsed_ms=200);
  assert.equal(evaluateAgentTrials(b).review_nomination,null);
  const c=batch();
  c.candidates[1].runs.forEach(r=>r.cost_units=20);
  assert.equal(evaluateAgentTrials(c).review_nomination,null);
});
test('no improvement is no nomination',()=>{
  const b=batch();
  b.candidates[1].runs.forEach(r=>r.quality=.88);
  assert.equal(evaluateAgentTrials(b).review_nomination,null);
});
test('baseline safety failures block all review nominations',()=>{
  const b=batch();
  b.candidates[0].runs[0].verdict='inconclusive';
  assert.equal(evaluateAgentTrials(b).review_nomination,null);
});
test('missing baseline or mixed fixture contract fails closed',()=>{
  const b=batch(); b.baseline_id='not-a-candidate';
  assert.throws(()=>evaluateAgentTrials(b),/baseline_present/);
  const c=batch(); c.candidates[1].runs[0].fixture_id='off-suite';
  assert.throws(()=>evaluateAgentTrials(c),/run_fixture_coverage/);
});
test('nonnumeric / out-of-range metrics are rejected',()=>{
  const b=batch(); b.candidates[1].runs[0].quality='0.99';
  assert.throws(()=>evaluateAgentTrials(b),/quality/);
  const c=batch(); c.candidates[1].runs[0].cost_units=-1;
  assert.throws(()=>evaluateAgentTrials(c),/cost_units/);
});
