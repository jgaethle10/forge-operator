import crypto from 'node:crypto';

const APPROVED_TAGS=new Set(['curious','happy','sad','angry','excited','whispers','shouts','laughs','sighs','clears throat']);
const MODEL_TAG_SUPPORT=new Set(['eleven_v3','eleven_v4','eleven_v4_turbo']);
function present(value){return typeof value==='string'&&value.trim().length>0;}
function digest(value){return crypto.createHash('sha256').update(value,'utf8').digest('hex');}

/** Casting is independent from delivery. Never accept arbitrary model prompt markup. */
export function assessVoicePerformance(performance){
  if(performance===undefined || performance===null)return {status:'none',reasons:[],performance:null};
  const reasons=[];
  if(!performance || typeof performance!=='object' || Array.isArray(performance))return {status:'held',reasons:['performance_contract_invalid'],performance:null};
  if(performance.approval!=='human_approved')reasons.push('performance_direction_not_human_approved');
  if(!present(performance.evidenceRef))reasons.push('performance_approval_receipt_missing');
  if(typeof performance.tag!=='string'||!APPROVED_TAGS.has(performance.tag))reasons.push('performance_tag_unreviewed_or_unsupported');
  if(Object.keys(performance).some(key=>!['approval','evidenceRef','tag'].includes(key)))reasons.push('performance_unrecognized_instruction_field');
  return {
    status:reasons.length?'held':'approved',
    reasons,
    performance:reasons.length?null:{
      tag:performance.tag,
      approval:'human_approved',
      evidenceRef:performance.evidenceRef,
    },
  };
}

/** Render one tightly controlled vocal-direction tag. Does NOT assert the actor followed it. */
export function compileVoicePerformance({scriptText,performance,modelId,planDigest}){
  if(!present(scriptText))throw new Error('voice_performance_script_missing');
  if(!present(planDigest)||!(/^[a-f0-9]{64}$/i).test(planDigest))throw new Error('voice_performance_cast_digest_missing');
  const assessed=assessVoicePerformance(performance);
  if(assessed.status!=='approved')throw new Error('voice_performance_approval_held:'+assessed.reasons.join(','));
  if(!MODEL_TAG_SUPPORT.has(modelId))throw new Error('voice_performance_model_tags_unsupported');
  // A raw script containing tags could bypass the auditable casting contract.
  if(/\[[^\]\r\n]{1,120}\]/u.test(scriptText))throw new Error('voice_performance_unapproved_inline_tag_in_script');
  if(scriptText.length>5000)throw new Error('voice_performance_script_oversize_manual_split_required');
  const requestText='['+assessed.performance.tag+'] '+scriptText;
  return Object.freeze({
    schema:'evercraft.voice-foundry.performance-request.v1',
    modelId,
    scriptText,
    scriptDigest:digest(scriptText),
    requestText,
    requestDigest:digest(requestText),
    planDigest,
    directionTag:assessed.performance.tag,
    performanceEvidenceRef:assessed.performance.evidenceRef,
    status:'ready_for_authorized_generation',
    paidGenerationAuthorized:false,
    performanceQualityVerified:false,
    publicationAuthorityGranted:false,
  });
}
