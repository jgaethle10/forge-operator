import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const fail = reason => { throw new Error('systemia_motion_candidate_'+reason); };
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

/**
 * Convert an actual original moving-video render into an *unreviewed* candidate
 * compatible with Fallen's existing Visual Observer/Shot Tournament.
 * Never rewrite Fallen's source assets or imply human acceptance from pixel QA.
 */
export function prepareSystemiaMotionCandidate({handoff,receipt,assetPath}){
  if(handoff?.schema!=='evercraft.graphics-command.fallen-handoff.v1')fail('campaign_schema_invalid');
  if(handoff?.truth?.publicationAuthority!==false)fail('campaign_authority_not_held');
  const shot=handoff.studioPlan?.scenes?.find(s=>s.id==='permission-trace');
  if(!shot||shot.durationSec!==5||!shot.visual?.sourceRefs?.length)fail('scene_contract_mismatch');
  if(receipt?.schema!=='evercraft.graphics-command.original-motion-candidate.v1')fail('receipt_schema_invalid');
  if(receipt.campaignId!==handoff.campaignId||receipt.sceneId!==shot.id)fail('receipt_wrong_scene');
  if(receipt.visualState!=='original_software_render_synthetic_training_scene')fail('visual_state_unverified');
  if(receipt.rightsState!=='original_source_authored_pending_human_review')fail('unapproved_rights_state');
  for(const field of ['nativeWorldEngineGpu','voicePresent','shotTournamentApproved','admittedIntoFallen','publicationAuthority']){
    if(receipt[field]!==false)fail('false_claim_or_release:'+field);
  }
  if(receipt.width!==1280||receipt.height!==720||receipt.fps!==24||
     receipt.durationSec!==5||receipt.frames!==120)fail('render_spec_mismatch');
  const hashes=Object.values(receipt.frameSha256??{});
  if(hashes.length!==6||new Set(hashes).size!==6||
     hashes.some(d=>!(/^[a-f0-9]{64}$/i).test(d)))fail('frame_diversity_not_proven');
  const resolved=path.resolve(assetPath);
  if(!fs.existsSync(resolved)||!fs.statSync(resolved).isFile())fail('actual_movie_missing');
  const bytes=fs.readFileSync(resolved);
  if(!bytes.length||bytes.length!==receipt.assetBytes||sha(bytes)!==receipt.assetSha256)fail('movie_byte_identity_mismatch');
  const candidate={
    id:'systemia-permission-trace-original-v1',
    shotId:handoff.campaignId+'-permission-trace',
    artifactPath:resolved,
    artifactDigest:'sha256:'+sha(bytes),
    kind:'video',
    durationSec:5,
    aspectRatio:'16:9',
    sourceState:'generated_visualization',
    provenance:'complete',
    syntheticLabelPresent:true,
    providerId:'evercraft-authored-original-motion-cpu',
    subjectIds:['ai-agent','human-owner','permission-lineage'],
    observations:[]
  };
  const gate={
    schema:'evercraft.graphics-command.motion-candidate-hold.v1',
    sceneId:shot.id,campaignId:handoff.campaignId,
    productionNeedId:handoff.campaignId+'-permission-trace-visual',
    sourceRefs:[...shot.visual.sourceRefs],
    artifactSha256:sha(bytes),
    state:'observer_candidate_only',
    permissions:{modelGeneration:false,paidGeneration:false,sourceAdmission:false,shotTournamentApproval:false,publication:false},
    missing:['human_visual_review','rights_review','shot_tournament_selection','production_admission','voice_performance']
  };
  return {candidate,gate};
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const [handoffPath,receiptPath,assetPath,outputDir,...extra]=process.argv.slice(2);
    if(!handoffPath||!receiptPath||!assetPath||!outputDir||extra.length)
      fail('usage:_node_permission-trace-candidate.mjs_<handoff>_<receipt>_<movie>_<out>');
    const handoff=JSON.parse(fs.readFileSync(path.resolve(handoffPath),'utf8'));
    const receipt=JSON.parse(fs.readFileSync(path.resolve(receiptPath),'utf8'));
    const result=prepareSystemiaMotionCandidate({handoff,receipt,assetPath});
    fs.mkdirSync(path.resolve(outputDir),{recursive:true});
    fs.writeFileSync(path.join(outputDir,'fallen-motion-candidate.json'),JSON.stringify(result.candidate,null,2)+'\n');
    fs.writeFileSync(path.join(outputDir,'fallen-motion-release-hold.json'),JSON.stringify(result.gate,null,2)+'\n');
    console.log(JSON.stringify(result.gate,null,2));
  }catch(e){console.error(e);process.exitCode=1;}
}
