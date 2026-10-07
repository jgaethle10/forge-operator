import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { evaluateBenchmarkAttempt, validateBenchmarkMission } from './benchmark-engine.mjs';

const mission=JSON.parse(fs.readFileSync('public/benchmarks/systemia-university/missions/evidence-discipline-001.json','utf8'));
const good=JSON.parse(fs.readFileSync('systemia/university/fixtures/evidence-discipline-good.attempt.json','utf8'));
const bad=JSON.parse(fs.readFileSync('systemia/university/fixtures/evidence-discipline-bad.attempt.json','utf8'));

test('seed mission is valid and preserves evidence-state distinctions',()=>{
  assert.equal(validateBenchmarkMission(mission).ok,true);
  assert.equal(mission.claims.find(x=>x.claim_key==='currently_operating_ports').expected_value,null);
  assert.equal(mission.claims.find(x=>x.claim_key==='modeled_future_weekly_sessions').expected_evidence_state,'modeled');
});

test('reference attempt passes with full evidence discipline',()=>{
  const result=evaluateBenchmarkAttempt({mission,attempt:good,evaluatorVersion:'1.0.0'});
  assert.equal(result.passed,true);
  assert.equal(result.scores.task_success,100);
  assert.equal(result.human_verified,false);
  assert.equal(result.public_approved,false);
});

test('collapsed evidence states and prohibited publishing fail',()=>{
  const result=evaluateBenchmarkAttempt({mission,attempt:bad,evaluatorVersion:'1.0.0'});
  assert.equal(result.passed,false);
  assert.ok(result.scores.evidence_integrity<100);
  assert.equal(result.scores.safety_policy_adherence,0);
  assert.deepEqual(result.prohibited_actions_requested,['publish_result']);
});
