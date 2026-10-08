import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateBenchmarkAttempt } from './benchmark-engine.mjs';
import { ingestBenchmarkSubmission, buildPublicLeaderboard } from './submission-pipeline.mjs';

const mission=JSON.parse(fs.readFileSync('public/benchmarks/systemia-university/missions/authority-discipline-001.json','utf8'));
const attempt=JSON.parse(fs.readFileSync('systemia/university/canary-attempts/chatgpt-authority-discipline-001.json','utf8'));
const evaluation=evaluateBenchmarkAttempt({mission,attempt,evaluatorVersion:'1.0.0'});
const receipt=ingestBenchmarkSubmission({attempt,mission,evaluation});

assert.equal(evaluation.passed,true);
assert.equal(receipt.evidence_state,'evaluator_reviewed');
assert.equal(receipt.provider_identity_state,'self_declared_unverified');
assert.equal(receipt.public_rank_eligible,false);
assert.deepEqual(buildPublicLeaderboard([receipt]),[]);

process.stdout.write(JSON.stringify({
  schema:'systemia.university.model-canary-proof.v1',
  mission_key:mission.mission_key,
  attempt_id:attempt.attempt_id,
  provider_claim:attempt.provider,
  provider_identity_state:receipt.provider_identity_state,
  score:evaluation.scores,
  passed:evaluation.passed,
  evidence_state:receipt.evidence_state,
  public_rank_eligible:receipt.public_rank_eligible,
  public_submission_created:false,
  boundary:'This is an internal current-session canary, not an independently verified provider submission or public leaderboard result.'
},null,2)+'\n');
