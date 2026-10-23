import crypto from 'node:crypto';
const clean=x=>typeof x==='string'&&x.trim().length>0;
function castOf(c){return {speakerId:c.speakerId,voiceProfileId:c.voiceProfileId,identityVersion:c.identityVersion,provider:c.provider,providerVoiceId:c.providerVoiceId};}
/** Verify declared speaker identity across a scripted session and past approved registry records.
 * This is NOT speaker biometric matching or proof of natural-sounding identity.
 */
export function checkVoiceContinuity({session,previousCast=[]}){
 if(session?.schema!=='evercraft.voice-foundry.session.v1'||!Array.isArray(session.cues)||!Array.isArray(previousCast))throw new Error('voice_continuity_session_invalid');
 const baselines=new Map();
 const reasons=[];
 const casting=[];
 for(const rec of previousCast){
  if(!clean(rec?.speakerId)||baselines.has(rec.speakerId)||!clean(rec.evidenceRef)||rec.approval!=='human_approved'){
   reasons.push('prior_cast_registry_record_unverified_or_duplicate');continue;
  }
  baselines.set(rec.speakerId,rec);
 }
 for(const cue of session.cues){
  if(cue?.status!=='ready_for_authorized_generation')reasons.push('scene_cast_not_authorized');
  const proposed=castOf(cue);
  if(Object.values(proposed).some(x=>!clean(x))){reasons.push('scene_voice_identity_incomplete');continue;}
  const current=baselines.get(proposed.speakerId);
  if(current){
   for(const key of ['voiceProfileId','identityVersion','provider','providerVoiceId']){
    if(current[key]!==proposed[key])reasons.push('speaker_'+key+'_changed:'+proposed.speakerId);
   }
  }else baselines.set(proposed.speakerId,proposed);
  casting.push({cueId:cue.cueId,locale:cue.locale,accent:cue.accent,...proposed});
 }
 const uniqueReasons=[...new Set(reasons)];
 return {schema:'evercraft.voice-foundry.continuity-audit.v1',status:uniqueReasons.length?'held':'cast_contract_consistent_requires_listening',reasons:uniqueReasons,
  casting,castDigest:crypto.createHash('sha256').update(JSON.stringify(casting)).digest('hex'),
  audioBiometricVerificationPerformed:false,realVoiceIdentityConfirmed:false,qualifiedHumanContinuityReviewRequired:true,publicationAuthorityGranted:false};
}