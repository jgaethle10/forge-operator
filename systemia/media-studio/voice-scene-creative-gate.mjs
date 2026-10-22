import crypto from 'node:crypto';

const DIGEST=/^[a-f0-9]{64}$/i;
const present=value=>typeof value==='string'&&value.trim().length>0;
const SCORE_KEYS=['naturalness','emotionalTruth','conversationalResponsiveness',
  'characterConsistency','speechClarity','sceneBelievability'];
const SCORE_MIN=4;

const unique=items=>new Set(items).size===items.length;
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

/**
 * Review a complete interchange, not another isolated sentence or prosody edit.
 *
 * This read-only module can REJECT or HOLD a scene. It NEVER approves a public
 * commercial, never validates whether a reviewer is a real human, and never
 * substitutes inline JSON assertions for an authenticated review service.
 * An explicit founder rejection has precedence over any machine metrics.
 */
export function reviewVoiceScene(scene) {
  if(scene?.schema!=='evercraft.voice-foundry.scene-review.v1')throw Error('scene_review_schema_invalid');
  if(!present(scene.id)||!present(scene.campaignId))throw Error('scene_review_identity_missing');
  if(scene.publicationAuthorized!==false)throw Error('scene_review_must_not_grant_publication');
  const reasons=[];
  const rejection=scene.founderVerdict?.decision==='rejected';
  if(rejection)reasons.push('founder_rejected_performance');
  if(!present(scene.founderVerdict?.evidenceRef))reasons.push('founder_verdict_evidence_missing');
  if(!['rejected','not_reviewed','approved_for_further_review'].includes(scene.founderVerdict?.decision))
    reasons.push('founder_verdict_invalid');
  if(!DIGEST.test(scene.mixedAudioDigest??''))reasons.push('full_scene_audio_digest_missing');
  const turns=scene.turns;
  if(!Array.isArray(turns)||turns.length<3)reasons.push('full_exchange_required');
  else {
    if(!unique(turns.map(t=>t?.cueId)))reasons.push('duplicate_dialogue_turn');
    const speakerVoice=new Map();
    const speakers=new Set();
    let previousEnd=-1;
    for(const turn of turns){
      if(!present(turn?.cueId)||!present(turn?.speakerId)||!present(turn?.voiceProfileId))
        reasons.push('speaker_or_cue_identity_missing');
      if(!DIGEST.test(turn?.sourceAudioDigest??''))reasons.push('turn_source_digest_missing');
      if(turn?.takeQaStatus!=='passed_internal_voice_qa')reasons.push('voice_foundry_take_qa_unverified');
      if(!Number.isFinite(turn?.startSec)||!Number.isFinite(turn?.endSec)||
          turn.startSec<0||turn.endSec<=turn.startSec||turn.startSec<previousEnd-.03)
        reasons.push('turn_timing_or_overlap_invalid');
      previousEnd=turn?.endSec??previousEnd;
      if(present(turn?.speakerId)&&present(turn?.voiceProfileId)){
        const old=speakerVoice.get(turn.speakerId);
        if(old && old!==turn.voiceProfileId)reasons.push('speaker_voice_changed_without_recasting');
        speakerVoice.set(turn.speakerId,turn.voiceProfileId);
        speakers.add(turn.speakerId);
      }
    }
    if(speakers.size<2)reasons.push('two_character_exchange_required');
  }
  // Voice Foundry already checks two-human reviews of every take. These
  // scene reviews are *additional* and cannot bypass the upstream take gates.
  const reviews=scene.reviews;
  if(!Array.isArray(reviews)||reviews.length<2)reasons.push('two_full_scene_listener_reviews_required');
  else {
    if(!unique(reviews.map(r=>r?.reviewerId))||reviews.some(r=>!present(r?.reviewerId)))
      reasons.push('independent_full_scene_reviewers_required');
    for(const r of reviews){
      if(r?.scope!=='full_uninterrupted_conversation')reasons.push('isolated_word_review_not_sufficient');
      if(r?.heardAudioDigest!==scene.mixedAudioDigest)reasons.push('review_audio_version_mismatch');
      if(!present(r?.evidenceRef))reasons.push('human_listening_evidence_missing');
      if(r?.humanAttested!==true)reasons.push('human_listening_not_attested');
      if(r?.approved!==true)reasons.push('human_listener_rejected');
      for(const key of SCORE_KEYS){
        const score=r?.scores?.[key];
        if(!Number.isFinite(score)||score<SCORE_MIN||score>5)
          reasons.push('scene_creative_quality_below_threshold:'+key);
      }
    }
  }
  // Even fully populated review documents could be forged. The real upstream
  // system must verify reviewer identities and evidence before admission.
  const status=rejection?'rejected_by_founder':'held_for_verified_human_scene_review';
  return {
    schema:'evercraft.voice-foundry.scene-review-result.v1',
    id:scene.id,campaignId:scene.campaignId,status,
    rejectionOverridesMetrics:rejection,
    reasons:[...new Set(reasons)],
    evidenceDigest:hash({id:scene.id,turns:scene.turns,reviews:scene.reviews,founderVerdict:scene.founderVerdict}),
    releaseAuthority:false,
    externalReviewAuthenticityVerified:false,
    voicePerformanceApproved:false,
    editorialAdmissionApproved:false,
    publicationAuthorized:false
  };
}
