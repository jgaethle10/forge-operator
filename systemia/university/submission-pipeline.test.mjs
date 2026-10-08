import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { evaluateBenchmarkAttempt } from './benchmark-engine.mjs';
import { ingestBenchmarkSubmission, advanceSubmissionState, buildPublicLeaderboard } from './submission-pipeline.mjs';

const mission=JSON.parse(fs.readFileSync('public/benchmarks/systemia-university/missions/authority-discipline-001.json','utf8'));
const good=JSON.parse(fs.readFileSync('systemia/university/fixtures/authority-discipline-good.attempt.json','utf8'));
const bad=JSON.parse(fs.readFileSync('systemia/university/fixtures/authority-discipline-bad.attempt.json','utf8'));

test('Authority Discipline reference attempt passes',()=>{
  const result=evaluateBenchmarkAttempt({mission,attempt:good,evaluatorVersion:'1.0.0'});
  assert.equal(result.passed,true);
  assert.equal(result.scores.task_success,100);
});

test('fake bank authority attempt fails hard',()=>{
  const result=evaluateBenchmarkAttempt({mission,attempt:bad,evaluatorVersion:'1.0.0'});
  assert.equal(result.passed,false);
  assert.equal(result.scores.safety_policy_adherence,0);
  assert.ok(result.prohibited_actions_requested.includes('accept_deposits'));
});

test('submission receipt never becomes public by ingestion alone',()=>{
  const evaluation=evaluateBenchmarkAttempt({mission,attempt:good,evaluatorVersion:'1.0.0'});
  const receipt=ingestBenchmarkSubmission({attempt:good,mission,evaluation,receivedAt:'2026-10-07T00:00:00Z'});
  assert.equal(receipt.evidence_state,'evaluator_reviewed');
  assert.equal(receipt.provider_identity_state,'self_declared_unverified');
  assert.equal(receipt.public_rank_eligible,false);
  assert.deepEqual(buildPublicLeaderboard([receipt]),[]);
});

test('public approval requires human verification first',()=>{
  const evaluation=evaluateBenchmarkAttempt({mission,attempt:good,evaluatorVersion:'1.0.0'});
  const receipt=ingestBenchmarkSubmission({attempt:good,mission,evaluation});
  assert.throws(()=>advanceSubmissionState(receipt,'public_approved',{publicApproval:'approval://1'}),/invalid transition|human verification/);
  const reviewed=advanceSubmissionState(receipt,'human_verified',{humanReviewer:'reviewer-1'});
  const approved=advanceSubmissionState(reviewed,'public_approved',{publicApproval:'approval://1'});
  assert.equal(approved.public_rank_eligible,true);
  assert.equal(buildPublicLeaderboard([approved]).length,1);
});

test('failed attempt cannot become rank eligible even after approval flow',()=>{
  const evaluation=evaluateBenchmarkAttempt({mission,attempt:bad,evaluatorVersion:'1.0.0'});
  const receipt=ingestBenchmarkSubmission({attempt:bad,mission,evaluation});
  const reviewed=advanceSubmissionState(receipt,'human_verified',{humanReviewer:'reviewer-1'});
  const approved=advanceSubmissionState(reviewed,'public_approved',{publicApproval:'approval://2'});
  assert.equal(approved.public_rank_eligible,false);
  assert.deepEqual(buildPublicLeaderboard([approved]),[]);
});
