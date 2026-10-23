import assert from 'node:assert/strict';
import test from 'node:test';
import {planVoiceSession,evaluateVoiceTake} from '../systemia/media-studio/voice-foundry.mjs';
const voice={id:'narrator-01',identityVersion:'1',provider:'example',providerVoiceId:'approved-voice',approval:'human_audition_approved',locales:['en-US','es-MX'],accents:['general-american','mexican-spanish'],rights:{status:'cleared',commercialUse:true,evidenceRef:'consent-001'}};
const cue={id:'cue-01',speakerId:'narrator',voiceProfileId:voice.id,text:'Evercraft is here.',locale:'en-US',accent:'general-american',direction:'gentle wonder, conversational',maxDurationSec:4};
const plan=()=>planVoiceSession({profiles:[voice],cues:[cue],lexicon:[{term:'Evercraft',reading:'EHV-er-kraft',locale:'en-US',reviewerEvidenceRef:'pronunciation-review-01'}]});
const take=p=>({cueId:cue.id,voiceProfileId:voice.id,planDigest:p.planDigest,artifactDigest:'a'.repeat(64),providerReceiptRef:'provider-123',rightsVerified:true,locale:cue.locale,accent:cue.accent,durationSec:2.6,timingEvidenceRef:'time-001',transcriptEvidenceRef:'transcript-001',audioMeasurementEvidenceRef:'signal-001',pacingEvidenceRef:'pacing-report-001',samplePeakDbFS:-2.2});
const signal=p=>({schema:'evercraft.voice-foundry.signal-inspection.v1',status:'objective_measurements_only',audioDigest:'a'.repeat(64),durationSec:2.6,samplePeakDbFS:-2.2});
const pacing=p=>({schema:'evercraft.voice-foundry.pacing-inspection.v1',status:'measured_not_performance_approved',audioDigest:'a'.repeat(64),durationSec:2.6,warnings:[]});
const transcript=p=>({schema:'evercraft.voice-foundry.transcript-audit.v1',status:'candidate_text_match_needs_human_review',audioDigest:'a'.repeat(64),cueId:p.cueId,locale:p.locale,wordErrorRate:0,evidenceDigest:'e'.repeat(64)});
const reviewers=[
 {reviewerId:'a',approved:true,locale:'en-US',accent:'general-american',localeAccentQualified:true,evidenceRef:'review-a',scores:{naturalness:5,accentAuthenticity:5,emotionalTruth:5,intelligibility:5,identityConsistency:5,mixFit:5}},
 {reviewerId:'b',approved:true,locale:'en-US',accent:'general-american',localeAccentQualified:false,evidenceRef:'review-b',scores:{naturalness:5,accentAuthenticity:5,emotionalTruth:5,intelligibility:5,identityConsistency:5,mixFit:5}}
];
test('approved cast is ready for authorized generation, not public release',()=>{
 const r=plan(); assert.equal(r.status,'ready_for_authorized_generation');assert.equal(r.providerCallMade,false);assert.equal(r.publicationAuthorityGranted,false);assert.equal(r.cues[0].pronunciation.length,1);
});
test('rights fail closed and prevent unapproved voice use',()=>{
 const r=planVoiceSession({profiles:[{...voice,rights:{status:'unknown',commercialUse:false}}],cues:[cue]});assert.equal(r.status,'held');assert.ok(r.cues[0].reasons.includes('voice_rights_or_consent_unverified'));
});
test('a language does not prove a regional accent; both must match independently',()=>{
 const r=planVoiceSession({profiles:[voice],cues:[{...cue,locale:'en-GB',accent:'british-rp'}]}); assert.equal(r.status,'held');assert.ok(r.cues[0].reasons.includes('requested_locale_not_verified_for_voice'));assert.ok(r.cues[0].reasons.includes('requested_accent_not_verified_for_voice'));
});
test('review cannot fabricate a good score from a provider receipt',()=>{
 const p=plan().cues[0];const r=evaluateVoiceTake({plannedCue:p,take:take(p),reviews:[],signal:signal(p),pacing:pacing(p),transcript:transcript(p)});assert.equal(r.status,'held');assert.ok(r.reasons.includes('two_human_reviews_required'));
});
test('independent quality and qualified accent review gates',()=>{
 const p=plan().cues[0];const approved=evaluateVoiceTake({plannedCue:p,take:take(p),reviews:reviewers,signal:signal(p),pacing:pacing(p),transcript:transcript(p)});assert.equal(approved.status,'passed_internal_voice_qa');assert.equal(approved.publicationAuthorityGranted,false);
 const weak=evaluateVoiceTake({plannedCue:p,take:take(p),reviews:[reviewers[0],{...reviewers[1],scores:{...reviewers[1].scores,naturalness:3}}],signal:signal(p),pacing:pacing(p),transcript:transcript(p)}); assert.equal(weak.status,'held');
 const unqualified=evaluateVoiceTake({plannedCue:p,take:take(p),reviews:reviewers.map(r=>({...r,localeAccentQualified:false})),signal:signal(p),pacing:pacing(p),transcript:transcript(p)});assert.ok(unqualified.reasons.includes('native_or_qualified_accent_review_required'));
});
test('identity drift and clipping are independent hard failures',()=>{
 const p=plan().cues[0];const r=evaluateVoiceTake({plannedCue:p,take:{...take(p),voiceProfileId:'wrong',samplePeakDbFS:0},reviews:reviewers,signal:signal(p),pacing:pacing(p),transcript:transcript(p)});assert.equal(r.status,'held');assert.ok(r.reasons.includes('take_voice_identity_mismatch'));assert.ok(r.reasons.includes('digital_clipping_or_peak_unmeasured'));
});
test('multilingual casting is per cue with region-specific support',()=>{
 const es={...cue,id:'cue-02',text:'Hoy empezamos.',locale:'es-MX',accent:'mexican-spanish',direction:'warm and confident'};
 const r=planVoiceSession({profiles:[voice],cues:[cue,es]});assert.equal(r.status,'ready_for_authorized_generation');assert.equal(r.cues[1].locale,'es-MX');
});

test('signal inspection evidence is required and must match take bytes',()=>{
 const p=plan().cues[0];
 const omitted=evaluateVoiceTake({plannedCue:p,take:take(p),reviews:reviewers});
 assert.equal(omitted.status,'held');assert.ok(omitted.reasons.includes('verified_signal_inspection_missing_or_held'));
 const forged=evaluateVoiceTake({plannedCue:p,take:take(p),reviews:reviewers,signal:{...signal(p),audioDigest:'b'.repeat(64)}});
 assert.equal(forged.status,'held');assert.ok(forged.reasons.includes('signal_audio_digest_mismatch'));
});

test('pronunciation lexicon only matches whole Latin-language names, not accidental substrings',()=>{
 const p=planVoiceSession({profiles:[voice],cues:[{...cue,text:'Evercrafting is not Evercraft.'}],lexicon:[{term:'Evercraft',reading:'EH-ver-kraft',locale:'en-US',reviewerEvidenceRef:'lexicon-review'}]});
 assert.equal(p.cues[0].pronunciation.length,1);
 const mismatched=planVoiceSession({profiles:[voice],cues:[{...cue,text:'Evercrafting makes things.'}],lexicon:[{term:'Evercraft',reading:'EH-ver-kraft',locale:'en-US',reviewerEvidenceRef:'lexicon-review'}]});
 assert.equal(mismatched.cues[0].pronunciation.length,0);
});

test('pacing report must be from exact candidate bytes and duration',()=>{
 const p=plan().cues[0];
 const missing=evaluateVoiceTake({plannedCue:p,take:take(p),reviews:reviewers,signal:signal(p)});
 assert.equal(missing.status,'held');
 assert.ok(missing.reasons.includes('measured_pacing_missing'));
 const wrong=evaluateVoiceTake({plannedCue:p,take:take(p),reviews:reviewers,signal:signal(p),pacing:{...pacing(p),audioDigest:'b'.repeat(64)}});
 assert.ok(wrong.reasons.includes('pacing_audio_digest_mismatch'));
});
test('suspicious quiet intervals require explicit editorial acknowledgement without changing audio',()=>{
 const p=plan().cues[0];
 const warning={...pacing(p),status:'needs_human_rhythm_review',warnings:['long_internal_pause_review']};
 const held=evaluateVoiceTake({plannedCue:p,take:take(p),reviews:reviewers,signal:signal(p),pacing:warning,transcript:transcript(p)});
 assert.ok(held.reasons.includes('pacing_warnings_need_editorial_acknowledgement'));
 const noted=evaluateVoiceTake({plannedCue:p,take:{...take(p),pacingNotesReviewed:true,pacingReviewEvidenceRef:'human-pause-review'},reviews:reviewers,signal:signal(p),pacing:warning,transcript:transcript(p)});
 assert.equal(noted.status,'passed_internal_voice_qa');
 assert.equal(noted.publicationAuthorityGranted,false);
});

test('casting plan automatically blocks speaker identity switches inside a multi-scene session',()=>{
 const secondVoice={...voice,id:'narrator-02',identityVersion:'2',providerVoiceId:'other-voice'};
 const scene2={...cue,id:'scene-02',voiceProfileId:secondVoice.id};
 const r=planVoiceSession({profiles:[voice,secondVoice],cues:[cue,scene2]});
 assert.equal(r.status,'held');
 assert.ok(r.continuity.reasons.includes('speaker_voiceProfileId_changed:narrator'));
 assert.equal(r.publicationAuthorityGranted,false);
});

test('transcript gap or ASR-detected script rewrite holds the voice despite great listening scores',()=>{
 const p=plan().cues[0];
 const missing=evaluateVoiceTake({plannedCue:p,take:take(p),reviews:reviewers,signal:signal(p),pacing:pacing(p)});
 assert.equal(missing.status,'held');
 assert.ok(missing.reasons.includes('recognized_script_requires_review_or_correction'));
 const wrong=evaluateVoiceTake({plannedCue:p,take:take(p),reviews:reviewers,signal:signal(p),pacing:pacing(p),transcript:{...transcript(p),status:'needs_human_transcript_review',wordErrorRate:.2}});
 assert.ok(wrong.reasons.includes('recognized_script_requires_review_or_correction'));
 assert.ok(wrong.reasons.includes('transcript_word_error_rate_unacceptable'));
});
test('transcript for different audio or cue cannot unlock internal QA',()=>{
 const p=plan().cues[0];
 const wrong=evaluateVoiceTake({plannedCue:p,take:take(p),reviews:reviewers,signal:signal(p),pacing:pacing(p),transcript:{...transcript(p),audioDigest:'b'.repeat(64),cueId:'other'}});
 assert.ok(wrong.reasons.includes('transcript_audio_digest_mismatch'));
 assert.ok(wrong.reasons.includes('transcript_cue_mismatch'));
});
