import crypto from 'node:crypto';

const clean=value=>String(value??'').trim();
const SHA=/^[a-f0-9]{64}$/i;
export const CREATIVE_DIMENSIONS=Object.freeze([
  'narrative_stakes','subject_specificity','shot_variety','camera_motivation',
  'motion_with_purpose','sound_picture_relationship','visual_authenticity','earned_emotion',
]);

/**
 * Turn human/critical feedback into an artifact-bound *creative decision*.
 * Never substitute this for a real visual observation, independent reviewer or a production render.
 */
export function assessCreativeDecision(input){
  const artifactSha=clean(input?.artifactSha256).toLowerCase();
  if(!SHA.test(artifactSha)) throw new Error('creative_decision_artifact_sha_invalid');
  const state=clean(input?.decision).toLowerCase();
  if(!['reject','needs_revision','approve_for_internal_review'].includes(state)){
    throw new Error('creative_decision_state_invalid');
  }
  const notes=Array.isArray(input?.findings)?input.findings:[];
  if(!notes.length) throw new Error('creative_decision_findings_missing');
  const normalized=notes.map((item,i)=>{
    const dimension=clean(item?.dimension);
    if(!CREATIVE_DIMENSIONS.includes(dimension)) throw new Error('creative_decision_dimension_invalid:'+i);
    const evidence=clean(item?.evidence);
    const change=clean(item?.requiredChange);
    if(evidence.length<18||change.length<18) throw new Error('creative_decision_action_not_grounded:'+i);
    return {dimension,evidence,requiredChange:change};
  });
  const proofRefs=(Array.isArray(input?.proofRefs)?input.proofRefs:[]).map(clean).filter(Boolean);
  if(!proofRefs.length) throw new Error('creative_decision_proof_missing');
  const reviewerKind=clean(input?.reviewerKind);
  if(!['human_feedback_plus_creator_analysis','human_critic','external_observer'].includes(reviewerKind)){
    throw new Error('creative_decision_reviewer_kind_invalid');
  }
  const createdAt=clean(input?.createdAt);
  if(!createdAt||!Number.isFinite(Date.parse(createdAt))) throw new Error('creative_decision_date_invalid');
  const result={
    schema:'evercraft.graphics-command.creative-decision.v1',
    artifactSha256:artifactSha,
    decision:state,
    reviewerKind,
    createdAt,
    proofRefs,
    findings:normalized,
    publicationAuthority:false,
    boundaries:{
      codeTestsAreNotAestheticReview:true,
      approvalForInternalReviewIsNotRelease:true,
      noHumanAudienceStudyImplied:true,
      noRealFootageImplied:true,
    },
  };
  return {...result,digest:crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex')};
}

/** Optional fail-closed release gate applied *after* technical media inspection. */
export function gateCreativeCandidate({mediaSha256,technicalStatus,creativeDecision}){
  const media=clean(mediaSha256).toLowerCase();
  if(!SHA.test(media)) throw new Error('creative_gate_media_sha_invalid');
  const reasons=[];
  if(!['technical_pass','accepted'].includes(technicalStatus)) reasons.push('master_technical_validation_missing_or_failed');
  if(!creativeDecision) reasons.push('creative_decision_missing');
  else{
    if(creativeDecision.schema!=='evercraft.graphics-command.creative-decision.v1') reasons.push('creative_decision_schema_invalid');
    if(creativeDecision.artifactSha256!==media) reasons.push('creative_decision_artifact_mismatch');
    if(creativeDecision.decision!=='approve_for_internal_review') reasons.push('creative_decision_rejected_or_needs_revision');
  }
  return {
    schema:'evercraft.graphics-command.creative-candidate-gate.v1',
    status:reasons.length?'rejected':'eligible_for_independent_review',
    reasons,
    mediaSha256:media,
    nextGate:'independent_sequence_aesthetic_verification_and_publication_approval',
    publicationAuthority:false,
  };
}
