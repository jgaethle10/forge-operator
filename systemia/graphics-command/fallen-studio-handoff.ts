import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compileStudioDraft, type StudioDraftPlan } from '../media-studio/studio-create.js';

export interface GovernedFallenHandoff {
  schema:'evercraft.graphics-command.fallen-handoff.v1';
  campaignId:string;
  missionRef:string;
  sourceRefs:string[];
  truth:{
    scenario:'fictional_training_reenactment';
    realProductScreen:'not_verified';
    enrollment:'not_verified';
    voiceRights:'not_verified';
    publicationAuthority:false;
  };
  studioPlan:StudioDraftPlan;
}

export function compileGovernedFallenHandoff(handoff:GovernedFallenHandoff){
  assert.equal(handoff?.schema,'evercraft.graphics-command.fallen-handoff.v1','handoff_schema_invalid');
  assert.ok(handoff.missionRef?.trim(),'handoff_mission_missing');
  assert.ok(handoff.sourceRefs?.length,'handoff_source_refs_missing');
  assert.equal(handoff.truth?.scenario,'fictional_training_reenactment','handoff_scenario_unverified');
  assert.equal(handoff.truth?.realProductScreen,'not_verified','handoff_product_claim_not_cleared');
  assert.equal(handoff.truth?.enrollment,'not_verified','handoff_enrollment_claim_not_cleared');
  assert.equal(handoff.truth?.voiceRights,'not_verified','handoff_voice_rights_not_cleared');
  assert.equal(handoff.truth?.publicationAuthority,false,'handoff_publish_authority_forbidden');
  const plan=handoff.studioPlan;
  assert.equal(plan.id,handoff.campaignId,'handoff_campaign_mismatch');
  assert.equal(plan.aspectRatio,'16:9','handoff_master_aspect_invalid');
  assert.equal(plan.fps,30,'handoff_fps_invalid');
  assert.equal(plan.sourceAssets.length,0,'handoff_source_assets_need_independent_review');
  assert.ok(plan.captions?.enabled,'handoff_captions_required');
  assert.ok(plan.music?.prompt,'handoff_music_required');
  const duration=plan.scenes.reduce((sum,scene)=>sum+scene.durationSec,0);
  assert.ok(Math.abs(duration-30)<0.001,'handoff_duration_not_30');
  assert.ok(plan.scenes.every(scene=>scene.visual?.prompt&&scene.visual.sourceRefs?.length),'handoff_visual_brief_missing');
  const speakers=new Set(plan.scenes.map(scene=>scene.narration?.speakerId));
  assert.ok(speakers.has('human-owner')&&speakers.has('ai-agent'),'handoff_two_actor_script_required');
  assert.ok(plan.scenes.every(scene=>scene.narration?.text&& !scene.narration?.voiceProfileId),'handoff_uncast_voices_must_remain_pending');
  const bundle=compileStudioDraft(plan);
  const needKinds=bundle.productionNeeds.map(need=>need.kind);
  const videoNeedCount=needKinds.filter(kind=>kind==='video').length;
  const speechNeedCount=needKinds.filter(kind=>kind==='speech').length;
  assert.equal(videoNeedCount,plan.scenes.length,'handoff_missing_visual_production_needs');
  assert.equal(speechNeedCount,plan.scenes.length,'handoff_missing_voice_production_needs');
  assert.equal(bundle.script.length,plan.scenes.length,'handoff_script_mismatch');
  assert.equal(bundle.captions.length,plan.scenes.length,'handoff_caption_mismatch');
  assert.equal(bundle.boundaries.paidGenerationAuthorityGranted,false);
  assert.equal(bundle.boundaries.publicationAuthorityGranted,false);
  return {
    bundle,
    receipt:{
      schema:'evercraft.graphics-command.fallen-handoff-receipt.v1',
      campaignId:handoff.campaignId,
      missionRef:handoff.missionRef,
      sourceRefs:[...handoff.sourceRefs],
      durationSec:duration,
      frameRate:plan.fps,
      aspectRatio:plan.aspectRatio,
      status:'awaiting_governed_assets' as const,
      productionNeedCount:bundle.productionNeeds.length,
      pendingPictureCount:videoNeedCount,
      pendingVoiceCount:speechNeedCount,
      pendingMusicCount:needKinds.filter(kind=>kind==='music').length,
      pendingSfxCount:needKinds.filter(kind=>kind==='sfx').length,
      scenarioEvidenceState:'fictional_training_reenactment' as const,
      verifiedLiveProductCapture:false,
      verifiedEnrollment:false,
      exportAllowed:false,
      paidGenerationAuthority:false,
      publicationAuthority:false
    }
  };
}

function main(){
  const [input,output]=process.argv.slice(2);
  if(!input||!output) throw new Error('Usage: node --import tsx systemia/graphics-command/fallen-studio-handoff.ts <handoff.json> <output-dir>');
  const handoff=JSON.parse(fs.readFileSync(path.resolve(input),'utf8')) as GovernedFallenHandoff;
  const result=compileGovernedFallenHandoff(handoff);
  const destination=path.resolve(output);
  fs.mkdirSync(destination,{recursive:true});
  fs.writeFileSync(path.join(destination,'fallen-studio-draft.json'),JSON.stringify(result.bundle,null,2)+'\n');
  fs.writeFileSync(path.join(destination,'production-needs.json'),JSON.stringify(result.bundle.productionNeeds,null,2)+'\n');
  fs.writeFileSync(path.join(destination,'handoff-receipt.json'),JSON.stringify(result.receipt,null,2)+'\n');
  process.stdout.write(JSON.stringify(result.receipt,null,2)+'\n');
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
  try{main();}catch(error){console.error(error);process.exitCode=1;}
}
