import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createUniversityBenchmarkService, validateRemoteAttemptEnvelope } from './http.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../public/benchmarks/systemia-university');
const submissionsFile=path.join(root,'submissions/index.json');
const service=createUniversityBenchmarkService({benchmarkRoot:root});

test('remote envelope enforces bounded claim shape',()=>{
  const result=validateRemoteAttemptEnvelope({
    attempt_id:'a',
    mission_key:'authority-discipline-001',
    mission_version:'1.0.0',
    actor_id:'actor',
    claims:Array.from({length:51},(_,i)=>({claim_key:'c'+i,evidence_refs:[]})),
    handoff:{limitations:'bounded',next_step:'stop'}
  });
  assert.equal(result.ok,false);
  assert.ok(result.errors.includes('too many claims'));
});

test('owned benchmark service exposes only listed missions',()=>{
  const discovery=service.snapshot();
  assert.equal(discovery.remote_persistence,false);
  assert.equal(discovery.public_write_allowed,false);
  assert.ok(discovery.manifest.missions.some(x=>x.mission_key==='authority-discipline-001'));
  assert.equal(service.mission('not-a-mission'),null);
});

test('remote evaluation service scores a good attempt without public persistence',()=>{
  const before=fs.readFileSync(submissionsFile,'utf8');
  const attempt=JSON.parse(fs.readFileSync(
    path.resolve(here,'fixtures/authority-discipline-good.attempt.json'),'utf8'
  ));

  const payload=service.evaluate({
    missionKey:'authority-discipline-001',
    attempt,
    receivedAt:'2026-10-08T00:00:00Z'
  });

  assert.equal(payload.status,200);
  assert.equal(payload.ok,true);
  assert.equal(payload.evaluation.passed,true);
  assert.equal(payload.evaluation.scores.task_success,100);
  assert.equal(payload.submission_receipt.evidence_state,'evaluator_reviewed');
  assert.equal(payload.submission_receipt.provider_identity_state,'self_declared_unverified');
  assert.equal(payload.provider_identity_verified,false);
  assert.equal(payload.public_write_performed,false);
  assert.equal(payload.public_rank_eligible,false);

  const after=fs.readFileSync(submissionsFile,'utf8');
  assert.equal(after,before);
});

test('remote evaluation service returns a scored failure instead of publishing it',()=>{
  const attempt=JSON.parse(fs.readFileSync(
    path.resolve(here,'fixtures/authority-discipline-bad.attempt.json'),'utf8'
  ));
  attempt.handoff={
    limitations:'This structurally valid negative fixture intentionally misclassifies regulated authority.',
    next_step:'Evaluate the attempt without publishing it.'
  };
  const payload=service.evaluate({
    missionKey:'authority-discipline-001',
    attempt
  });
  assert.equal(payload.status,200);
  assert.equal(payload.ok,true);
  assert.equal(payload.evaluation.passed,false);
  assert.equal(payload.evaluation.scores.safety_policy_adherence,0);
  assert.equal(payload.public_write_performed,false);
});

test('mission mismatch fails closed',()=>{
  const attempt=JSON.parse(fs.readFileSync(
    path.resolve(here,'fixtures/authority-discipline-good.attempt.json'),'utf8'
  ));
  attempt.mission_key='evidence-discipline-001';

  const payload=service.evaluate({
    missionKey:'authority-discipline-001',
    attempt
  });
  assert.equal(payload.status,400);
  assert.equal(payload.error,'benchmark_mission_mismatch');
});

test('unknown mission fails closed without evaluating attacker-supplied mission content',()=>{
  const attempt=JSON.parse(fs.readFileSync(
    path.resolve(here,'fixtures/authority-discipline-good.attempt.json'),'utf8'
  ));
  const payload=service.evaluate({
    missionKey:'invented-mission',
    attempt
  });
  assert.equal(payload.status,404);
  assert.equal(payload.error,'benchmark_mission_not_found');
});
