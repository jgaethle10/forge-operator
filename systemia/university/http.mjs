import fs from 'node:fs';
import path from 'node:path';
import { evaluateBenchmarkAttempt } from './benchmark-engine.mjs';
import { ingestBenchmarkSubmission } from './submission-pipeline.mjs';

function readJson(file){
  return JSON.parse(fs.readFileSync(file,'utf8'));
}

function normalizeMissionKey(value){
  const key=String(value||'').trim();
  if(!/^[a-z0-9][a-z0-9-]{0,127}$/.test(key)) return '';
  return key;
}

function publicMissionPath({benchmarkRoot,missionKey}){
  return path.join(benchmarkRoot,'missions',missionKey+'.json');
}

function loadManifest(benchmarkRoot){
  return readJson(path.join(benchmarkRoot,'manifest.json'));
}

function loadChallengePack(benchmarkRoot){
  return readJson(path.join(benchmarkRoot,'challenge-pack.json'));
}

export function validateRemoteAttemptEnvelope(attempt={}){
  const errors=[];
  let bytes=0;
  try{ bytes=Buffer.byteLength(JSON.stringify(attempt),'utf8'); }
  catch{ errors.push('attempt must be JSON serializable'); }

  if(!attempt || typeof attempt!=='object' || Array.isArray(attempt)) errors.push('attempt object required');
  if(bytes>256*1024) errors.push('attempt exceeds 256KB');
  if(!attempt.attempt_id || String(attempt.attempt_id).length>200) errors.push('valid attempt_id required');
  if(!attempt.mission_key || String(attempt.mission_key).length>128) errors.push('valid mission_key required');
  if(!attempt.mission_version || String(attempt.mission_version).length>64) errors.push('valid mission_version required');
  if(!attempt.actor_id || String(attempt.actor_id).length>200) errors.push('valid actor_id required');
  if(attempt.provider!=null && String(attempt.provider).length>200) errors.push('provider claim too long');

  if(!Array.isArray(attempt.claims)) errors.push('claims array required');
  else {
    if(attempt.claims.length>50) errors.push('too many claims');
    for(const claim of attempt.claims){
      if(!claim || typeof claim!=='object' || Array.isArray(claim)){
        errors.push('invalid claim object');
        continue;
      }
      if(!claim.claim_key || String(claim.claim_key).length>200) errors.push('valid claim_key required');
      if(!Array.isArray(claim.evidence_refs)) errors.push('evidence_refs array required');
      else if(claim.evidence_refs.length>20) errors.push('too many evidence refs');
      if(claim.uncertainty!=null && String(claim.uncertainty).length>4000) errors.push('uncertainty too long');
    }
  }

  if(attempt.actions_requested!=null){
    if(!Array.isArray(attempt.actions_requested)) errors.push('actions_requested must be an array');
    else if(attempt.actions_requested.length>20) errors.push('too many requested actions');
  }

  if(!attempt.handoff || typeof attempt.handoff!=='object' || Array.isArray(attempt.handoff)){
    errors.push('handoff object required');
  } else {
    if(!attempt.handoff.limitations || String(attempt.handoff.limitations).length>8000) errors.push('valid handoff limitations required');
    if(!attempt.handoff.next_step || String(attempt.handoff.next_step).length>8000) errors.push('valid handoff next_step required');
  }

  return {ok:errors.length===0,errors,bytes};
}

export function createUniversityBenchmarkService({benchmarkRoot}={}){
  if(!benchmarkRoot) throw new Error('benchmarkRoot required');
  const root=path.resolve(benchmarkRoot);

  function listedMission(missionKey){
    const key=normalizeMissionKey(missionKey);
    if(!key) return null;
    const manifest=loadManifest(root);
    const row=(manifest.missions||[]).find(x=>x.mission_key===key);
    if(!row) return null;
    const file=publicMissionPath({benchmarkRoot:root,missionKey:key});
    if(!fs.existsSync(file)) return null;
    return {row,mission:readJson(file)};
  }

  return {
    snapshot(){
      const manifest=loadManifest(root);
      const challenge_pack=loadChallengePack(root);
      return {
        schema:'systemia.university.http-discovery.v1',
        mode:'owned_stateless_evaluation',
        manifest,
        challenge_pack,
        remote_persistence:false,
        public_write_allowed:false,
        provider_identity_verification:false
      };
    },
    mission(missionKey){
      return listedMission(missionKey);
    },
    evaluate({missionKey,attempt,receivedAt=new Date().toISOString()}={}){
      const found=listedMission(missionKey);
      if(!found) return {ok:false,status:404,error:'benchmark_mission_not_found'};

      const envelope=validateRemoteAttemptEnvelope(attempt);
      if(!envelope.ok){
        return {ok:false,status:400,error:'invalid_benchmark_attempt',details:envelope.errors};
      }
      if(attempt.mission_key!==found.mission.mission_key || attempt.mission_version!==found.mission.version){
        return {ok:false,status:400,error:'benchmark_mission_mismatch'};
      }

      let evaluation;
      let receipt;
      try{
        evaluation=evaluateBenchmarkAttempt({
          mission:found.mission,
          attempt,
          evaluatorVersion:String(found.row.evaluator_version||'1.0.0')
        });
        receipt=ingestBenchmarkSubmission({
          attempt,
          mission:found.mission,
          evaluation,
          receivedAt
        });
      }catch(error){
        return {
          ok:false,
          status:400,
          error:'benchmark_evaluation_rejected',
          detail:error?.message||String(error)
        };
      }

      return {
        ok:true,
        status:200,
        schema:'systemia.university.remote-evaluation.v1',
        remote_ingress_mode:'stateless_evaluation_only',
        mission_key:found.mission.mission_key,
        mission_version:found.mission.version,
        evaluation,
        submission_receipt:receipt,
        provider_identity_verified:false,
        public_write_performed:false,
        public_rank_eligible:false,
        boundary:'Remote evaluation creates an evaluator-reviewed receipt only. It does not persist, verify provider identity, publish, approve, or alter a leaderboard.'
      };
    }
  };
}

export function registerUniversityBenchmarkRoutes(app,{
  benchmarkRoot,
  publicEvaluateLimiter=null
}={}){
  if(!app) throw new Error('app required');
  const service=createUniversityBenchmarkService({benchmarkRoot});

  app.get('/api/systemia-university/benchmarks',(_req,res)=>{
    res.setHeader('Cache-Control','public, max-age=60, must-revalidate');
    res.json(service.snapshot());
  });

  app.get('/api/systemia-university/benchmarks/:missionKey',(req,res)=>{
    const found=service.mission(req.params.missionKey);
    if(!found){
      res.status(404).json({ok:false,error:'benchmark_mission_not_found'});
      return;
    }
    res.setHeader('Cache-Control','public, max-age=60, must-revalidate');
    res.json({
      schema:'systemia.university.remote-mission.v1',
      mission:found.mission,
      evaluator_version:String(found.row.evaluator_version||'1.0.0'),
      public_write_allowed:false
    });
  });

  const handlers=[];
  if(typeof publicEvaluateLimiter==='function') handlers.push(publicEvaluateLimiter);
  handlers.push((req,res)=>{
    const missionKey=String(req.body?.mission_key||req.body?.attempt?.mission_key||'');
    const result=service.evaluate({
      missionKey,
      attempt:req.body?.attempt
    });
    res.setHeader('Cache-Control','no-store');
    res.status(result.status||200).json(result);
  });

  app.post('/api/systemia-university/evaluate',...handlers);

  return {
    schema:'systemia.university.http-registration.v1',
    discovery_route:'/api/systemia-university/benchmarks',
    mission_route:'/api/systemia-university/benchmarks/:missionKey',
    evaluation_route:'/api/systemia-university/evaluate',
    remote_persistence:false,
    public_write_allowed:false
  };
}
