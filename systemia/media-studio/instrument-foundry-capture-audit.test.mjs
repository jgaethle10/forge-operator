import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {auditFoundryPianoCapture} from './instrument-foundry-capture-audit.mjs';

function wav({frequency=261.625565,amplitude=.3,seconds=.9,silent=false}={}){
 const rate=48000,frames=Math.round(rate*seconds),b=Buffer.alloc(44+frames*2);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);
 b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
 b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);
 b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++){
   const sample=silent?0:amplitude*Math.exp(-i/rate*10)*Math.sin(2*Math.PI*frequency*i/rate);
   b.writeInt16LE(Math.round(sample*32767),44+2*i);
 }
 return b;
}
test('auditing a valid locally sourced WAV creates content-addressed audition receipt without license claims',async()=>{
 const b=wav();
 const r=await auditFoundryPianoCapture({bytes:b,expected_midi:60,source_name:'c4-pp.wav'});
 assert.equal(r.status,'candidate_for_human_listening',JSON.stringify(r));
 assert.equal(r.asset_id,'audio-sha256:'+createHash('sha256').update(b).digest('hex'));
 assert.equal(r.capture_signal_qa.status,'technical_signal_pass');
 assert.equal(r.root_pitch_evidence.status,'consistent');
 assert.equal(r.expected_midi,60);
 assert.equal(r.source_provenance_verified,false);
 assert.equal(r.performer_consent_verified,false);
 assert.equal(r.music_sample_rights_verified,false);
 assert.equal(r.audio_browser_output_verified,false);
 assert.equal(r.release_ready,false);
 assert.equal(r.human_listening_review,null);
});
test('wrong MIDI root remains held with measured pitch error evidence',async()=>{
 const r=await auditFoundryPianoCapture({bytes:wav(),expected_midi:61,source_name:'mislabel.wav'});
 assert.equal(r.status,'held');
 assert.equal(r.root_pitch_evidence.status,'mismatch');
 assert.ok(r.blockers.some(x=>x.includes('pitch_mismatch')));
});
test('silent files retain quality blockers and cannot be admitted',async()=>{
 const r=await auditFoundryPianoCapture({bytes:wav({silent:true}),expected_midi:60});
 assert.equal(r.status,'held');
 assert.equal(r.root_pitch_evidence,null);
 assert.ok(r.blockers.includes('recording_near_silent'));
});
test('malformed containers and invalid roots fail before reporting custody',async()=>{
 await assert.rejects(auditFoundryPianoCapture({bytes:new Uint8Array(44),expected_midi:60}),/Invalid WAV container/);
 await assert.rejects(auditFoundryPianoCapture({bytes:wav(),expected_midi:60.4}),/Expected piano root MIDI note/);
 await assert.rejects(auditFoundryPianoCapture({bytes:wav(),expected_midi:109}),/MIDI note/);
});
test('source path never leaks into the auditable source name',async()=>{
 const r=await auditFoundryPianoCapture({bytes:wav(),expected_midi:60,source_name:'/Users/private/recordings/piano.wav'});
 assert.equal(r.source_name,'piano.wav');
 assert.doesNotMatch(JSON.stringify(r),/Users\/private/);
});
test('CLI evaluates a real on-disk WAV and emits a receipt without modifying audio',()=>{
 const dir=mkdtempSync(join(tmpdir(),'foundry-capture-'));
 try{
  const file=join(dir,'c4.wav'),out=join(dir,'capture-receipt.json');
  const bytes=wav(),originalHash=createHash('sha256').update(bytes).digest('hex');
  writeFileSync(file,bytes);
  execFileSync(process.execPath,['systemia/media-studio/instrument-foundry-capture-audit.mjs',
    '--wav',file,'--midi','60','--out',out],{cwd:process.cwd(),stdio:'pipe'});
  const record=JSON.parse(readFileSync(out,'utf8'));
  assert.equal(record.status,'candidate_for_human_listening');
  assert.equal(record.source_sha256,originalHash);
  assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),originalHash);
  assert.equal(record.release_ready,false);
  assert.ok(existsSync(out));
  const second=spawnSync(process.execPath,['systemia/media-studio/instrument-foundry-capture-audit.mjs',
    '--wav',file,'--midi','60','--out',out],{cwd:process.cwd(),encoding:'utf8'});
  assert.equal(second.status,1,'must never overwrite an existing evidence receipt');
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('CLI exits held when a locally recorded take is labeled as wrong note',()=>{
 const dir=mkdtempSync(join(tmpdir(),'foundry-pitch-held-'));
 try{
  const file=join(dir,'wrong.wav'),out=join(dir,'receipt.json');
  writeFileSync(file,wav());
  const run=spawnSync(process.execPath,['systemia/media-studio/instrument-foundry-capture-audit.mjs',
    '--wav',file,'--midi','61','--out',out],{cwd:process.cwd(),encoding:'utf8'});
  assert.equal(run.status,2);
  assert.equal(JSON.parse(readFileSync(out,'utf8')).status,'held');
 }finally{rmSync(dir,{recursive:true,force:true})}
});
