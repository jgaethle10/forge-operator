import assert from 'node:assert/strict';
import test from 'node:test';
import {reviewVoiceScene} from './voice-scene-creative-gate.mjs';

const goodDigest=x=>x.repeat(64);
function scene(){
 return {
  schema:'evercraft.voice-foundry.scene-review.v1',
  id:'systemia-voice-audition-scene',campaignId:'systemia-university',
  mixedAudioDigest:goodDigest('a'),
  publicationAuthorized:false,
  founderVerdict:{decision:'not_reviewed',evidenceRef:'conversation:pending'},
  turns:[
   {cueId:'agent-sent',speakerId:'agent',voiceProfileId:'agent-v02',
    sourceAudioDigest:goodDigest('b'),takeQaStatus:'passed_internal_voice_qa',startSec:0,endSec:1},
   {cueId:'owner-response',speakerId:'owner',voiceProfileId:'owner-nano',
    sourceAudioDigest:goodDigest('c'),takeQaStatus:'passed_internal_voice_qa',startSec:1.4,endSec:4.2},
   {cueId:'agent-explains',speakerId:'agent',voiceProfileId:'agent-v02',
    sourceAudioDigest:goodDigest('d'),takeQaStatus:'passed_internal_voice_qa',startSec:4.5,endSec:6}
  ],
  reviews:['human-A','human-B'].map(reviewerId=>({
   reviewerId,scope:'full_uninterrupted_conversation',heardAudioDigest:goodDigest('a'),
   evidenceRef:'external-unverified-test-placeholder',humanAttested:true,approved:true,
   scores:{naturalness:5,emotionalTruth:5,conversationalResponsiveness:5,
    characterConsistency:5,speechClarity:5,sceneBelievability:5}
  }))
 };
}

test('founder rejection overrides even ideal numerical scores',()=>{
 const s=scene();
 s.founderVerdict={decision:'rejected',evidenceRef:'https://github.com/jgaethle10/forge-operator/issues/1450#issuecomment-6328317746'};
 const r=reviewVoiceScene(s);
 assert.equal(r.status,'rejected_by_founder');
 assert.ok(r.reasons.includes('founder_rejected_performance'));
 assert.equal(r.voicePerformanceApproved,false);
 assert.equal(r.publicationAuthorized,false);
});
test('without founder rejection even perfect scores never self-authorize approval',()=>{
 const r=reviewVoiceScene(scene());
 assert.equal(r.status,'held_for_verified_human_scene_review');
 assert.equal(r.externalReviewAuthenticityVerified,false);
 assert.equal(r.editorialAdmissionApproved,false);
 assert.equal(r.releaseAuthority,false);
});
test('one-word listening and missing human review are explicitly held',()=>{
 const s=scene();s.reviews=[{...s.reviews[0],scope:'isolated_word'}];
 const r=reviewVoiceScene(s);
 assert.ok(r.reasons.includes('two_full_scene_listener_reviews_required'));
});
test('rejects inconsistent agent identities and upstream unverified takes',()=>{
 const s=scene();
 s.turns[2].voiceProfileId='different-agent';
 s.turns[1].takeQaStatus='unverified';
 const r=reviewVoiceScene(s);
 assert.ok(r.reasons.includes('speaker_voice_changed_without_recasting'));
 assert.ok(r.reasons.includes('voice_foundry_take_qa_unverified'));
});
test('both reviewers must actually hear the same full-scene mix',()=>{
 const s=scene();
 s.reviews[1].heardAudioDigest=goodDigest('f');
 s.reviews[1].scores.emotionalTruth=2;
 const r=reviewVoiceScene(s);
 assert.ok(r.reasons.includes('review_audio_version_mismatch'));
 assert.ok(r.reasons.includes('scene_creative_quality_below_threshold:emotionalTruth'));
});
test('claims of publication authority throw before any review',()=>{
 const s=scene();
 s.publicationAuthorized=true;
 assert.throws(()=>reviewVoiceScene(s),/scene_review_must_not_grant_publication/);
});
test('V19 actual founder rejection stays rejected even without fabricated review evidence',()=>{
 const s={
  schema:'evercraft.voice-foundry.scene-review.v1',
  id:'systemia-v19-take-a',campaignId:'systemia-university-i-said-draft',
  publicationAuthorized:false,
  founderVerdict:{decision:'rejected',
   evidenceRef:'https://github.com/jgaethle10/forge-operator/issues/1450#issuecomment-6328317746'},
  mixedAudioDigest:null,turns:[],reviews:[]
 };
 const r=reviewVoiceScene(s);
 assert.equal(r.status,'rejected_by_founder');
 assert.ok(r.reasons.includes('full_scene_audio_digest_missing'));
 assert.equal(r.publicationAuthorized,false);
});
