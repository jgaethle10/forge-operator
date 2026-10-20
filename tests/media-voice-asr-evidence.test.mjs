import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {auditVoiceRecording} from '../systemia/media-studio/voice-asr-evidence.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-asr-evidence-'));
const file=path.join(root,'synthetic-nonspeech.wav');
const gen=spawnSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=321:sample_rate=48000','-t','1','-c:a','pcm_s16le',file],{encoding:'utf8'});
if(gen.status!==0)throw new Error(gen.stderr);
const sourceDigest=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const plan={schema:'evercraft.voice-foundry.session.v1',status:'ready_for_authorized_generation',
  cues:[{cueId:'cue-01',status:'ready_for_authorized_generation',planDigest:'d'.repeat(64),
    text:'We build the future.',locale:'en-US',pronunciation:[]}]};
const asr={schema:'evercraft.voice-foundry.asr-observation.v1',method:'automated_asr',
  engineId:'fixture-only-not-an-actual-ASR-run',engineVersion:'fixture-v1',
  sourceReceiptRef:'test-claim-not-an-authenticated-provider-receipt',
  cueId:'cue-01',audioDigest:sourceDigest,locale:'en-US',recognizedText:'We build the future.'};
const run=(overrides={})=>auditVoiceRecording({session:plan,cueId:'cue-01',audioPath:file,observation:asr,...overrides});
test('hashes actual local audio bytes and explicitly refuses to attest real ASR or real speech',()=>{
 const r=run();
 assert.equal(r.audioDigest,sourceDigest);
 assert.equal(r.sourceAudioActuallyHashed,true);
 assert.equal(r.status,'candidate_text_match_needs_listening');
 assert.equal(r.externalAsrProviderReceiptIndependentlyVerified,false);
 assert.equal(r.spokenWordsHeardByHuman,false);
 assert.equal(r.pronunciationConfirmed,false);
 assert.equal(r.publicationAuthorityGranted,false);
});
test('JSON digest for a different file cannot authorize the physical audio',()=>{
 const r=run({observation:{...asr,audioDigest:'b'.repeat(64)}});
 assert.equal(r.status,'held');
 assert.ok(r.reasons.includes('asr_audio_digest_mismatch'));
});
test('changed physical bytes are caught by digest check without relying on JSON',()=>{
 const altered=path.join(root,'altered.wav');
 fs.copyFileSync(file,altered);fs.appendFileSync(altered,Buffer.from('tampering'));
 const r=run({audioPath:altered});
 assert.equal(r.status,'held');
 assert.notEqual(r.audioDigest,sourceDigest);
});
test('different cue or unready casting session cannot pass',()=>{
 assert.throws(()=>run({cueId:'unknown'}),/cast_cue_not_unique/);
 assert.throws(()=>run({session:{...plan,status:'held'}}),/cast_session_not_ready/);
});
test('observed ASR deletion is held despite valid source audio digest',()=>{
 const r=run({observation:{...asr,recognizedText:'We build future.'}});
 assert.equal(r.status,'held');
 assert.ok(r.reasons.includes('recognized_words_differ_from_locked_script'));
});
test('nonexistent audio fails instead of inventing recognition evidence',()=>{
 assert.throws(()=>run({audioPath:path.join(root,'missing.wav')}));
});
