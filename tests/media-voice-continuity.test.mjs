import test from 'node:test';import assert from 'node:assert/strict';
import {checkVoiceContinuity} from '../systemia/media-studio/voice-continuity.mjs';
const line={status:'ready_for_authorized_generation',cueId:'a',speakerId:'raven',voiceProfileId:'raven-v1',identityVersion:'v1',provider:'elevenlabs',providerVoiceId:'voice-id',locale:'en-US',accent:'general-american'};
const session=cues=>({schema:'evercraft.voice-foundry.session.v1',cues});
test('reusing same locked actor in many scenes passes contract but not acoustic review',()=>{
 const x=checkVoiceContinuity({session:session([line,{...line,cueId:'b',locale:'es-MX',accent:'mexican-spanish'}])});
 assert.equal(x.status,'cast_contract_consistent_requires_listening');assert.equal(x.audioBiometricVerificationPerformed,false);
 assert.equal(x.qualifiedHumanContinuityReviewRequired,true);assert.equal(x.publicationAuthorityGranted,false);
});
test('voice profile change for the same speaker is held',()=>{
 const x=checkVoiceContinuity({session:session([line,{...line,cueId:'b',voiceProfileId:'raven-v2'}])});
 assert.ok(x.reasons.includes('speaker_voiceProfileId_changed:raven'));
});
test('provider voice ID drift is detected despite unchanged profile name',()=>{
 const x=checkVoiceContinuity({session:session([line,{...line,cueId:'b',providerVoiceId:'different'}])});
 assert.ok(x.reasons.includes('speaker_providerVoiceId_changed:raven'));
});
test('prior season registry locks narrator voice for new episode',()=>{
 const prior={speakerId:'raven',voiceProfileId:'raven-v1',identityVersion:'v1',provider:'elevenlabs',providerVoiceId:'voice-id',approval:'human_approved',evidenceRef:'audition-2026'};
 const good=checkVoiceContinuity({session:session([line]),previousCast:[prior]});
 assert.equal(good.status,'cast_contract_consistent_requires_listening');
 const bad=checkVoiceContinuity({session:session([{...line,identityVersion:'v3'}]),previousCast:[prior]});
 assert.ok(bad.reasons.includes('speaker_identityVersion_changed:raven'));
});
test('unverified historical cast record cannot unlock continuity',()=>{
 const bad=checkVoiceContinuity({session:session([line]),previousCast:[{speakerId:'raven',approval:'auto_approved'}]});
 assert.ok(bad.reasons.includes('prior_cast_registry_record_unverified_or_duplicate'));
});