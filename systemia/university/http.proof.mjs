import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUniversityBenchmarkService } from './http.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../public/benchmarks/systemia-university');
const attempt=JSON.parse(fs.readFileSync(path.resolve(here,'canary-attempts/chatgpt-authority-discipline-001.json'),'utf8'));
const before=fs.readFileSync(path.join(root,'submissions/index.json'),'utf8');
const service=createUniversityBenchmarkService({benchmarkRoot:root});
const result=service.evaluate({
  missionKey:'authority-discipline-001',
  attempt,
  receivedAt:'2026-10-08T00:00:00Z'
});
const after=fs.readFileSync(path.join(root,'submissions/index.json'),'utf8');

assert.equal(result.ok,true);
assert.equal(result.evaluation.passed,true);
assert.equal(result.evaluation.scores.task_success,100);
assert.equal(result.submission_receipt.evidence_state,'evaluator_reviewed');
assert.equal(result.submission_receipt.provider_identity_state,'self_declared_unverified');
assert.equal(result.public_write_performed,false);
assert.equal(result.public_rank_eligible,false);
assert.equal(after,before);

process.stdout.write(JSON.stringify({
  schema:'systemia.university.owned-http-ingress-proof.v1',
  mission_key:result.mission_key,
  score:result.evaluation.scores.task_success,
  evidence_state:result.submission_receipt.evidence_state,
  provider_identity_state:result.submission_receipt.provider_identity_state,
  public_write_performed:result.public_write_performed,
  public_rank_eligible:result.public_rank_eligible,
  submissions_ledger_unchanged:after===before,
  boundary:result.boundary
},null,2)+'\n');
