import {inspectToonHandoff,renderToonShotDirection} from './toon-shot-handoff.mjs';
import {buildVisualModelPlan} from './model-fabric.ts';
import {runwayGen45Endpoint} from './visual-provider-runway.ts';

const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function guard(test,code){if(!test)throw new Error('toon_cinema_preflight_'+code)}

/**
 * Switch to an externally rendered, reference-locked high-fidelity shot,
 * instead of shipping the procedural fox as a cartoon.
 * Planning only: No provider call, credential, generation bill, or publish.
 */
export function prepareToonCinemaShot({
  packet,shotId,approvedStartFrame=null,
  endpoints=[runwayGen45Endpoint(false)],
  explicitPaidGenerationApproval=false,
}={}){
  const inspection=inspectToonHandoff(packet);
  guard(typeof shotId==='string'&&shotId.length>0,'shot_id_missing');
  const shot=packet.shots.find(s=>s.id===shotId);
  guard(shot,'unknown_shot');
  guard(shot.characters.length===1,'one_visible_actor_limit');
  guard(shot.durationSec>=2&&shot.durationSec<=10,'cinema_duration_2_to_10_seconds');
  guard(shot.aspectRatio==='16:9'||shot.aspectRatio==='9:16','aspect_unsupported');
  const blockers=[];
  const frame=approvedStartFrame;
  const actor=shot.characters[0];
  if(!frame)blockers.push('approved_identity_locked_start_frame_missing');
  if(frame){
    guard(frame.schema==='evercraft.fallen.toon-approved-frame.v1','frame_schema');
    guard(frame.actorId===actor.id,'start_frame_actor_mismatch');
    guard(actor.referenceAssetIds.includes(frame.referenceAssetId),'unrecognized_character_reference');
    guard(hex(frame.sha256),'start_frame_digest_invalid');
    guard(frame.approvalState==='declared_approved','approved_frame_provenance_missing');
    guard(typeof frame.approvalEvidenceRef==='string'&&frame.approvalEvidenceRef.length>=8,
      'approval_evidence_missing');
    guard(['owned','licensed'].includes(frame.commercialRights),'commercial_rights_missing');
    let url;
    try{url=new URL(frame.url);}catch{guard(false,'url_invalid')}
    guard(url.protocol==='https:','url_must_be_https');
    const host=url.hostname.toLowerCase();
    guard(host.includes('.')&&!host.endsWith('.local')&&host!=='localhost'&&
      !host.includes('..')&&!host.endsWith('.internal')&&
      !/^\d+\.\d+\.\d+\.\d+$/.test(host) &&
      !host.startsWith('127.')&&!host.startsWith('10.')&&
      host!=='169.254.169.254','url_host_not_public');
    guard(!url.username&&!url.password,'url_credentials_forbidden');
    // Verified reference bytes, reachability and consent are checked at runtime
    // and are not inferred from any of these string declarations.
  }
  const references=frame?[{
    id:frame.referenceAssetId,kind:'image',role:'start_frame',
    digest:frame.sha256,sourceRefs:[frame.approvalEvidenceRef],
    locator:{kind:'url',value:frame.url},
  }]:[];
  const visualRequest={
    schema:'evercraft.fallen.visual-shot-request.v1',
    id:'toon-cinema-'+shot.id,
    needId:shot.visualNeedId,
    task:'video',
    prompt:renderToonShotDirection(packet,shotId)+
      '\nDIRECTION: Favor readable silhouettes, anticipation, motivated facial change, intentional shot scale and natural holds. No cheap template transitions or static face plus animated mouth. If identity cannot be preserved, reject rather than substitute.',
    durationSec:shot.durationSec,
    aspectRatio:shot.aspectRatio,
    continuityDigest:inspection.packetDigest,
    requires:['reference_identity','reference_environment',
      'commercial_rights','provenance_receipt','timing_control'],
    requiredInputModes:['start_frame'],
    references,candidateCount:1,modelDiversity:1,
    sourceRefs:['toon-shot:'+shot.id,'toon-packet:'+packet.digest,
      ...(frame?[frame.approvalEvidenceRef]:[])],
  };
  const modelPlan=buildVisualModelPlan(visualRequest,endpoints);
  if(modelPlan.status==='blocked')blockers.push('no_verified_compatible_video_provider');
  if(frame)blockers.push('reference_bytes_and_reachability_not_yet_runtime_verified');
  if(!explicitPaidGenerationApproval)blockers.push('paid_generation_not_authorized');
  const executionEligible=false; // Runtime verifier must revalidate references and rights.
  return {
    schema:'evercraft.fallen.toon-cinema-preflight.v1',
    shotId:shot.id,packetDigest:inspection.packetDigest,
    sourceActorId:actor.id,
    status:'not_executable_preflight_only',
    blockers,
    request:visualRequest,
    modelPlan,
    generatedVideo:false,
    actualReferenceIdentityVerified:false,
    runtimeReferenceBytesVerified:false,
    sourceImageArtApprovalDeclared:frame?.approvalState==='declared_approved',
    paidGenerationApprovalDeclared:explicitPaidGenerationApproval===true,
    runtimeExecutionEligible:executionEligible,
    audiovisualPerformanceVerified:false,
    visualAestheticApproved:false,
    publicationAuthority:false,
  };
}
