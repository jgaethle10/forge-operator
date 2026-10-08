import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { registerUniversityBenchmarkRoutes, validateRemoteAttemptEnvelope } from './http.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../public/benchmarks/systemia-university');
const submissionsFile=path.join(root,'submissions/index.json');

async function withServer(fn){
  const app=express();
  app.use(express.json({limit:'1mb'}));
  registerUniversityBenchmarkRoutes(app,{benchmarkRoot:root});
  const server=await new Promise(resolve=>{
    const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));
  });
  const address=server.address();
  const base='http://127.0.0.1:'+address.port;
  try{ await fn(base); }
  finally{ await new Promise(resolve=>server.close(resolve)); }
}

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

test('owned benchmark HTTP surface exposes only listed missions',async()=>{
  await withServer(async base=>{
    const discovery=await fetch(base+'/api/systemia-university/benchmarks');
    assert.equal(discovery.status,200);
    const payload=await discovery.json();
    assert.equal(payload.remote_persistence,false);
    assert.equal(payload.public_write_allowed,false);
    assert.ok(payload.manifest.missions.some(x=>x.mission_key==='authority-discipline-001'));

    const unknown=await fetch(base+'/api/systemia-university/benchmarks/not-a-mission');
    assert.equal(unknown.status,404);
  });
});

test('remote evaluation scores a good attempt without public persistence',async()=>{
  const before=fs.readFileSync(submissionsFile,'utf8');
  const attempt=JSON.parse(fs.readFileSync(
    path.resolve(here,'fixtures/authority-discipline-good.attempt.json'),'utf8'
  ));

  await withServer(async base=>{
    const response=await fetch(base+'/api/systemia-university/evaluate',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({mission_key:'authority-discipline-001',attempt})
    });
    assert.equal(response.status,200);
    const payload=await response.json();
    assert.equal(payload.ok,true);
    assert.equal(payload.evaluation.passed,true);
    assert.equal(payload.evaluation.scores.task_success,100);
    assert.equal(payload.submission_receipt.evidence_state,'evaluator_reviewed');
    assert.equal(payload.submission_receipt.provider_identity_state,'self_declared_unverified');
    assert.equal(payload.provider_identity_verified,false);
    assert.equal(payload.public_write_performed,false);
    assert.equal(payload.public_rank_eligible,false);
  });

  const after=fs.readFileSync(submissionsFile,'utf8');
  assert.equal(after,before);
});

test('remote evaluation returns a scored failure instead of publishing it',async()=>{
  const attempt=JSON.parse(fs.readFileSync(
    path.resolve(here,'fixtures/authority-discipline-bad.attempt.json'),'utf8'
  ));

  await withServer(async base=>{
    const response=await fetch(base+'/api/systemia-university/evaluate',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({mission_key:'authority-discipline-001',attempt})
    });
    assert.equal(response.status,200);
    const payload=await response.json();
    assert.equal(payload.ok,true);
    assert.equal(payload.evaluation.passed,false);
    assert.equal(payload.evaluation.scores.safety_policy_adherence,0);
    assert.equal(payload.public_write_performed,false);
  });
});

test('mission mismatch fails closed',async()=>{
  const attempt=JSON.parse(fs.readFileSync(
    path.resolve(here,'fixtures/authority-discipline-good.attempt.json'),'utf8'
  ));
  attempt.mission_key='evidence-discipline-001';

  await withServer(async base=>{
    const response=await fetch(base+'/api/systemia-university/evaluate',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({mission_key:'authority-discipline-001',attempt})
    });
    assert.equal(response.status,400);
    const payload=await response.json();
    assert.equal(payload.error,'benchmark_mission_mismatch');
  });
});
