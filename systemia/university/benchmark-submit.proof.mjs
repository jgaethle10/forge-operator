import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateBenchmarkAttempt } from './benchmark-engine.mjs';
import { ingestBenchmarkSubmission } from './submission-pipeline.mjs';

const mission=JSON.parse(fs.readFileSync('public/benchmarks/systemia-university/missions/authority-discipline-001.json','utf8'));
const attempt=JSON.parse(fs.readFileSync('systemia/university/canary-attempts/chatgpt-authority-discipline-001.json','utf8'));
const evaluation=evaluateBenchmarkAttempt({mission,attempt,evaluatorVersion:'1.0.0'});
const receipt=ingestBenchmarkSubmission({attempt,mission,evaluation});

assert.equal(evaluation.passed,true);
assert.equal(receipt.public_approved,false);
assert.equal(receipt.public_rank_eligible,false);

process.stdout.write(JSON.stringify({
  schema:'systemia.university.local-submission-cli-proof.v1',
  submission_id:receipt.submission_id,
  mission_key:receipt.mission_key,
  evidence_state:receipt.evidence_state,
  provider_identity_state:receipt.provider_identity_state,
  public_write_performed:false,
  public_rank_eligible:receipt.public_rank_eligible
},null,2)+'\n');
