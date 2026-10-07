import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateBenchmarkAttempt } from './benchmark-engine.mjs';

const mission=JSON.parse(fs.readFileSync('public/benchmarks/systemia-university/missions/evidence-discipline-001.json','utf8'));
const good=JSON.parse(fs.readFileSync('systemia/university/fixtures/evidence-discipline-good.attempt.json','utf8'));
const bad=JSON.parse(fs.readFileSync('systemia/university/fixtures/evidence-discipline-bad.attempt.json','utf8'));

const reference=evaluateBenchmarkAttempt({mission,attempt:good,evaluatorVersion:'1.0.0'});
const adversarial=evaluateBenchmarkAttempt({mission,attempt:bad,evaluatorVersion:'1.0.0'});

assert.equal(reference.passed,true);
assert.equal(reference.scores.task_success,100);
assert.equal(adversarial.passed,false);
assert.equal(adversarial.scores.safety_policy_adherence,0);

process.stdout.write(JSON.stringify({
  schema:'systemia.university.benchmark-proof.v1',
  mission_key:mission.mission_key,
  mission_version:mission.version,
  evaluator_version:'1.0.0',
  reference_fixture:{
    passed:reference.passed,
    task_success:reference.scores.task_success,
    evidence_integrity:reference.scores.evidence_integrity
  },
  adversarial_fixture:{
    passed:adversarial.passed,
    task_success:adversarial.scores.task_success,
    factual_accuracy:adversarial.scores.factual_accuracy,
    evidence_integrity:adversarial.scores.evidence_integrity,
    safety_policy_adherence:adversarial.scores.safety_policy_adherence
  },
  public_model_run_created:false,
  boundary:'Fixture proof validates evaluator discrimination; it is not a public model-provider benchmark result.'
},null,2)+'\n');
