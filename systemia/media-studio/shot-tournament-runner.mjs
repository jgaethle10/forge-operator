import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  runAssignment,
  reconcile,
} from './shot-tournament-saban-adapter.mjs';

export const TOURNAMENT_ROLES=[
  'subject_coverage_judge',
  'composition_judge',
  'motion_judge',
  'continuity_judge',
  'truth_judge',
  'brand_judge',
  'beauty_judge',
  'editability_judge',
];

function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,stable(item)])
    );
  }
  return value;
}

function digest(value){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function validateInput(input){
  if(input?.schema!=='evercraft.fallen.shot-tournament-run.v1'){
    throw new Error('tournament_run_schema_invalid');
  }
  if(!input.needId?.trim()) throw new Error('tournament_run_need_id_missing');
  if(!input.shotId?.trim()) throw new Error('tournament_run_shot_id_missing');
  if(!input.creativeGenomeDigest?.trim()) throw new Error('tournament_run_genome_missing');
  if(!Array.isArray(input.candidates)||input.candidates.length<2){
    throw new Error('tournament_run_candidates_insufficient');
  }
  const ids=new Set();
  for(const candidate of input.candidates){
    if(!candidate?.id) throw new Error('tournament_run_candidate_id_missing');
    if(ids.has(candidate.id)) throw new Error('tournament_run_candidate_duplicate:'+candidate.id);
    ids.add(candidate.id);
    if(candidate.shotId!==input.shotId){
      throw new Error('tournament_run_candidate_shot_mismatch:'+candidate.id);
    }
    if(!candidate.artifactDigest) throw new Error('tournament_run_candidate_digest_missing:'+candidate.id);
  }
}

export async function runShotTournament(input){
  validateInput(input);
  const judgeReceipts=[];

  for(const candidate of input.candidates){
    for(const role of TOURNAMENT_ROLES){
      judgeReceipts.push(await runAssignment({
        assignment:{
          agent_id:'fallen-'+role+'-'+candidate.id,
          role,
          item:{
            raw:{
              candidate,
              creativeGenomeDigest:input.creativeGenomeDigest,
            },
          },
        },
      }));
    }
  }

  const reconciliation=await reconcile({
    results:judgeReceipts,
    plan:{roles:TOURNAMENT_ROLES},
  });

  const core={
    needId:input.needId,
    shotId:input.shotId,
    creativeGenomeDigest:input.creativeGenomeDigest,
    reconciliation,
    judgeReceipts:[...judgeReceipts].sort(
      (a,b)=>String(a.candidate_id).localeCompare(String(b.candidate_id))||
        String(a.role).localeCompare(String(b.role))
    ),
  };
  const tournamentReceiptDigest=digest(core);

  let selectionReceipt=null;
  if(reconciliation.status==='reconciled'&&reconciliation.winner_candidate_id){
    const winner=input.candidates.find(
      candidate=>candidate.id===reconciliation.winner_candidate_id
    );
    if(!winner) throw new Error('tournament_run_winner_candidate_missing');
    if(reconciliation.winner_artifact_digest!==winner.artifactDigest){
      throw new Error('tournament_run_winner_digest_mismatch');
    }
    if(reconciliation.creative_genome_digest!==input.creativeGenomeDigest){
      throw new Error('tournament_run_genome_digest_mismatch');
    }
    selectionReceipt={
      schema:'evercraft.fallen.shot-selection-receipt.v1',
      needId:input.needId,
      candidateId:winner.id,
      artifactDigest:winner.artifactDigest,
      creativeGenomeDigest:input.creativeGenomeDigest,
      tournamentReceiptDigest,
      selectedAt:new Date().toISOString(),
    };
  }

  return {
    schema:'evercraft.fallen.shot-tournament-run-receipt.v1',
    status:selectionReceipt?'selected':'blocked',
    ...core,
    tournamentReceiptDigest,
    selectionReceipt,
    boundaries:{
      verifiedObservationReceiptsRequired:true,
      hardFailJudgesCanBlockSelection:true,
      generatedVisualDoesNotEnterTimelineDirectly:true,
      selectionAdvancesToProductionAdmissionOnly:true,
      publicationAuthorityGranted:false,
    },
    completedAt:new Date().toISOString(),
  };
}

function arg(name){
  const index=process.argv.indexOf(name);
  return index>=0?process.argv[index+1]:undefined;
}

if(import.meta.url===new URL(process.argv[1]||'', 'file://').href){
  const inputPath=arg('--input');
  const outputPath=arg('--output');
  if(!inputPath||!outputPath){
    console.error('Usage: node systemia/media-studio/shot-tournament-runner.mjs --input <run.json> --output <receipt.json>');
    process.exitCode=1;
  }else{
    try{
      const input=JSON.parse(fs.readFileSync(path.resolve(inputPath),'utf8'));
      const receipt=await runShotTournament(input);
      const full=path.resolve(outputPath);
      fs.mkdirSync(path.dirname(full),{recursive:true});
      fs.writeFileSync(full,JSON.stringify(receipt,null,2)+'\n','utf8');
      console.log(JSON.stringify({
        status:receipt.status,
        winner:receipt.selectionReceipt?.candidateId??null,
        receipt:full,
      }));
      if(receipt.status!=='selected') process.exitCode=2;
    }catch(error){
      console.error(error instanceof Error?error.message:String(error));
      process.exitCode=1;
    }
  }
}
