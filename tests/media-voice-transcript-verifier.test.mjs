import assert from 'node:assert/strict';
import test from 'node:test';
import {assessVoiceTranscript} from '../systemia/media-studio/voice-transcript-verifier.mjs';
const audioDigest='a'.repeat(64);
const cast={cueId:'scene-01',text:'Evercraft built the foundation for tomorrow.',locale:'en-US',
 pronunciation:[{term:'Evercraft',reading:'EH-ver-kraft',evidenceRef:'phonetic-01'}]};
const take={artifactDigest:audioDigest};
const observed=(recognizedText,extra={})=>({
 schema:'evercraft.voice-foundry.asr-observation.v1',
 method:'automated_asr',engineId:'fixture-asr',engineVersion:'fixture-v1',
 sourceReceiptRef:'synthetic-observation-not-real-audio',cueId:cast.cueId,
 locale:cast.locale,audioDigest,recognizedText,...extra,
});
const audit=(text,extras={})=>assessVoiceTranscript({plannedCue:cast,take,observation:observed(text),...extras});
test('exact punctuation-free transcript is a text match, never human or pronunciation approval',()=>{
 const r=audit('Evercraft built the foundation for tomorrow!');
 assert.equal(r.status,'candidate_text_match_needs_human_review');
 assert.equal(r.wordErrorRate,0);
 assert.equal(r.edits.length,0);
 assert.equal(r.namedTerms[0].presentInTranscript,true);
 assert.equal(r.humanListeningVerified,false);
 assert.equal(r.acousticPronunciationVerified,false);
 assert.equal(r.publicationAuthorityGranted,false);
});
test('deletion catches missing critical word',()=>{
 const r=audit('Evercraft built the foundation tomorrow.');
 assert.equal(r.status,'needs_human_transcript_review');
 assert.ok(r.edits.some(e=>e.type==='deletion'&&e.expected==='for'));
 assert.ok(r.reasons.includes('recognized_words_differ_from_locked_script'));
});
test('insertion catches repeated or hallucinated extra word',()=>{
 const r=audit('Evercraft built built the foundation for tomorrow.');
 assert.equal(r.status,'needs_human_transcript_review');
 assert.ok(r.edits.some(e=>e.type==='insertion'&&e.recognized==='built'));
});
test('substitution catches a changed word',()=>{
 const r=audit('Evercraft built the foundations for tomorrow.');
 assert.equal(r.status,'needs_human_transcript_review');
 assert.ok(r.edits.some(e=>e.type==='substitution'&&e.expected==='foundation'&&e.recognized==='foundations'));
});
test('a missed named entity remains visible even when recognizer captures the rest',()=>{
 const r=audit('Ever craft built the foundation for tomorrow.');
 assert.ok(r.reasons.includes('named_term_not_recognized'));
 assert.equal(r.namedTerms[0].presentInTranscript,false);
});
test('audio digest mismatch holds without comparing untrusted speech transcript',()=>{
 const r=assessVoiceTranscript({plannedCue:cast,take,observation:observed(cast.text,{audioDigest:'b'.repeat(64)})});
 assert.equal(r.status,'held');
 assert.ok(r.reasons.includes('asr_audio_digest_mismatch'));
 assert.equal(r.wordErrorRate,null);
});
test('unverified engine, absent receipt and wrong cue all hold',()=>{
 const r=assessVoiceTranscript({plannedCue:cast,take,observation:observed(cast.text,{engineVersion:'',sourceReceiptRef:'',cueId:'wrong-cue'})});
 assert.equal(r.status,'held');
 assert.ok(r.reasons.includes('asr_engine_and_receipt_missing'));
 assert.ok(r.reasons.includes('asr_cue_mismatch'));
});
test('wrong regional locale is held even when base language matches',()=>{
 const r=assessVoiceTranscript({plannedCue:cast,take,observation:observed(cast.text,{locale:'en-GB'})});
 assert.equal(r.status,'held');
 assert.ok(r.reasons.includes('asr_locale_mismatch'));
});
test('unicode tokenization preserves Spanish spelling and diacritics',()=>{
 const esCast={cueId:'es-01',text:'Mañana comenzamos aquí.',locale:'es-MX',pronunciation:[]};
 const r=assessVoiceTranscript({plannedCue:esCast,take,observation:observed('Mañana comenzamos aquí!',{cueId:'es-01',locale:'es-MX'})});
 assert.equal(r.status,'candidate_text_match_needs_human_review');
 assert.equal(r.wordErrorRate,0);
 const bad=assessVoiceTranscript({plannedCue:esCast,take,observation:observed('Manana comenzamos aquí.',{cueId:'es-01',locale:'es-MX'})});
 assert.equal(bad.status,'needs_human_transcript_review');
});
test('Japanese unspaced script matches under Intl.Segmenter without fabricated English spaces',()=>{
 const jp={cueId:'jp',text:'未来をつくる。',locale:'ja-JP',pronunciation:[]};
 const r=assessVoiceTranscript({plannedCue:jp,take,observation:observed('未来をつくる。',{cueId:'jp',locale:'ja-JP'})});
 assert.equal(r.wordErrorRate,0);
 assert.equal(r.status,'candidate_text_match_needs_human_review');
});
test('ASR observation must contain recognized words',()=>{
 const r=assessVoiceTranscript({plannedCue:cast,take,observation:observed('')});
 assert.equal(r.status,'held');
 assert.ok(r.reasons.includes('asr_recognized_text_missing'));
});
test('large inputs are bounded before expensive alignment',()=>{
 const giant='word '.repeat(500);
 assert.throws(()=>assessVoiceTranscript({
   plannedCue:{...cast,text:giant,pronunciation:[]},take,
   observation:observed(giant)
 }),/token_limit_exceeded/);
});
test('empty or invalid casting input and negative thresholds reject',()=>{
 assert.throws(()=>assessVoiceTranscript({plannedCue:{...cast,text:''},take,observation:observed(cast.text)}),/cast_cue_missing/);
 assert.throws(()=>audit(cast.text,{maxWordErrorRate:-1}),/threshold_invalid/);
});
