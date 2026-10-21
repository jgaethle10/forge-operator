import type {
  CinematicCoverageContract,
  CinematicCoverageReport,
  CinematicSceneRequirement,
  FilmPlan,
  MediaProject,
  ScenePlan,
  SourceAsset,
} from './types.js';

const allowedRights=new Set(['owned','licensed']);

function minSeconds(requirement:CinematicSceneRequirement){
  return requirement.minDurationSec??1.5;
}

function validCandidate(asset:SourceAsset|undefined, requirement:CinematicSceneRequirement){
  return Boolean(asset &&
    asset.kind==='video' &&
    allowedRights.has(asset.rights??'unknown') &&
    Number.isFinite(asset.durationSec) &&
    (asset.durationSec??0)>=minSeconds(requirement)
  );
}

/**
 * Select only explicitly bound eligible video for a must-show scene.
 * A generic image or unrelated video is not a valid substitute.
 * Matching an asset ID does not prove its depicted contents.
 */
export function cinematicCandidates(
  project:MediaProject,
  requirement:CinematicSceneRequirement,
):Array<SourceAsset & {kind:'video'}>{
  const ids=new Set(requirement.candidateAssetIds);
  return project.assets.filter((asset):asset is SourceAsset & {kind:'video'}=>
    asset.kind==='video'&&ids.has(asset.id)&&validCandidate(asset,requirement));
}

export function compileCinematicCoverage(
  project:MediaProject,
  scenes:ScenePlan[],
):CinematicCoverageReport|undefined{
  const contract=project.brief.cinematicCoverage;
  if(!contract) return undefined;
  if(contract.schema!=='evercraft.fallen.cinematic-coverage-contract.v1'){
    throw new Error('cinematic_coverage_contract_schema_invalid');
  }
  if(!Array.isArray(contract.shots)||!contract.shots.length){
    throw new Error('cinematic_coverage_shots_missing');
  }
  const seenIds=new Set<string>();
  const seenBeats=new Set<string>();
  for(const requirement of contract.shots){
    if(!requirement.id?.trim()||seenIds.has(requirement.id)){
      throw new Error('cinematic_coverage_shot_id_invalid_or_duplicate');
    }
    if(seenBeats.has(requirement.beat)){
      throw new Error('cinematic_coverage_duplicate_beat:'+requirement.beat);
    }
    if(!requirement.action?.trim()||!requirement.subject?.trim()){
      throw new Error('cinematic_coverage_action_or_subject_missing:'+requirement.id);
    }
    if(!['physical_action','environment','product_interaction'].includes(requirement.mode)){
      throw new Error('cinematic_coverage_mode_invalid:'+requirement.id);
    }
    if(!Number.isFinite(minSeconds(requirement))||minSeconds(requirement)<.5){
      throw new Error('cinematic_coverage_duration_invalid:'+requirement.id);
    }
    if(!Array.isArray(requirement.candidateAssetIds)){
      throw new Error('cinematic_coverage_candidate_ids_missing:'+requirement.id);
    }
    seenIds.add(requirement.id);
    seenBeats.add(requirement.beat);
  }

  const items=contract.shots.map(requirement=>{
    const matching=cinematicCandidates(project,requirement);
    const assigned=scenes.find(scene=>scene.beat===requirement.beat);
    const bound=matching.some(asset=>
      asset.id===assigned?.assetId &&
      assigned?.mediaKind==='video' &&
      assigned.durationSec>=minSeconds(requirement)
    );
    return {
      id:requirement.id,
      beat:requirement.beat,
      subject:requirement.subject,
      action:requirement.action,
      mode:requirement.mode,
      minDurationSec:minSeconds(requirement),
      sceneId:assigned?.id??null,
      candidateAssetId:bound?(assigned?.assetId??null):null,
      state:bound?('candidate_bound_unverified' as const):('missing' as const),
      reason:bound?null:matching.length?'required_footage_not_assigned':'eligible_shot_footage_missing',
    };
  });

  return {
    schema:'evercraft.fallen.cinematic-coverage-report.v1',
    status:items.every(x=>x.state==='candidate_bound_unverified')
      ?'candidate_bound_unverified':'blocked',
    items,
    boundaries:{
      generatedStillsCannotReplaceRequiredVideo:true,
      textCardsCannotReplacePhysicalAction:true,
      assetIdsNotVisualEvidence:true,
      creativeReviewRequired:true,
      publicationAuthority:false,
    },
  };
}

/**
 * Fail before FFmpeg starts. A hand-edited plan with a falsified
 * report must not be able to bypass the scene/asset binding checks.
 */
export function assertCinematicCoverageForRender(plan:FilmPlan){
  const report=plan.cinematicCoverage;
  if(!report) return;
  if(report.schema!=='evercraft.fallen.cinematic-coverage-report.v1' ||
     report.status!=='candidate_bound_unverified' ||
     !report.items.length){
    throw new Error('cinematic_coverage_unresolved');
  }
  for(const item of report.items){
    const scene=plan.scenes.find(s=>s.id===item.sceneId&&s.beat===item.beat);
    const source=plan.provenance.find(p=>p.assetId===item.candidateAssetId);
    if(!scene||scene.mediaKind!=='video'||scene.assetId!==item.candidateAssetId||
       !source||!allowedRights.has(source.rights)||
       !Number.isFinite(item.minDurationSec)||
       scene.durationSec<item.minDurationSec){
      throw new Error('cinematic_coverage_binding_invalid:'+item.id);
    }
  }
}
