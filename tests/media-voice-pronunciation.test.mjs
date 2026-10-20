import assert from 'node:assert/strict';
import test from 'node:test';
import {bindVoicePronunciation} from '../systemia/media-studio/voice-pronunciation.mjs';
const cue={locale:'es-MX',pronunciation:[{term:'Evercraft',reading:'EH-ver-kraft',evidenceRef:'reviewed-name'}]};
const dict={locale:'es-MX',pronunciation_dictionary_id:'dict_1234',version_id:'version_7890',approval:'human_approved',approvalEvidenceRef:'approved-dictionary-v1'};
test('versioned locale-specific dictionary binds exactly one provider locator',()=>{
 const r=bindVoicePronunciation({plannedCue:cue,bindings:[dict],strict:true});
 assert.deepEqual(r.locators,[{pronunciation_dictionary_id:'dict_1234',version_id:'version_7890'}]);
 assert.equal(r.locale,'es-MX');assert.equal(r.speechPronunciationVerified,false);
 assert.equal(r.publicationAuthorityGranted,false);assert.equal(r.digest.length,64);
});
test('different region dictionary cannot masquerade as regional lexicon',()=>{
 assert.throws(()=>bindVoicePronunciation({plannedCue:cue,bindings:[{...dict,locale:'es-ES'}],strict:true}),/dictionary_required/);
});
test('strict pronunciation mode holds missing dictionaries; permissive mode makes no quality claim',()=>{
 assert.throws(()=>bindVoicePronunciation({plannedCue:cue,bindings:[],strict:true}),/dictionary_required/);
 assert.equal(bindVoicePronunciation({plannedCue:cue,bindings:[],strict:false}),null);
});
test('cannot attach provider dictionaries without reviewed versions',()=>{
 for(const bad of [{...dict,approval:'auto_approved'},{...dict,version_id:''},{...dict,approvalEvidenceRef:''}]){
  assert.throws(()=>bindVoicePronunciation({plannedCue:cue,bindings:[bad],strict:true}),/unapproved/);
 }
});
test('duplicates and more than three locators hold before provider work',()=>{
 assert.throws(()=>bindVoicePronunciation({plannedCue:cue,bindings:[dict,dict],strict:true}),/duplicate_dictionary/);
 const array=Array.from({length:4},(_,i)=>({...dict,pronunciation_dictionary_id:'dictionary-'+i}));
 assert.throws(()=>bindVoicePronunciation({plannedCue:cue,bindings:array,strict:true}),/limit_three/);
});
test('speech without lexicon terms needs no dictionary at all',()=>{
 assert.equal(bindVoicePronunciation({plannedCue:{...cue,pronunciation:[]},bindings:[],strict:true}),null);
});
