import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileStudioDraft} from '../media-studio/studio-create.js';
import {prepareVoiceFoundryHandoff} from './fallen-voice-foundry-handoff.mjs';
import {writeVoiceFoundryQueue} from './write-voice-foundry-queue.mjs';

const home=path.dirname(fileURLToPath(import.meta.url));
const source=JSON.parse(fs.readFileSync(path.join(home,'campaigns/systemia-university-owned-handoff.v1.json'),'utf8'));
const fresh=()=>compileStudioDraft(JSON.parse(JSON.stringify(source.studioPlan)));

test('all seven voice cues bind to exact Fallen speech need and timeline timing',()=>{
  const {foundry,cues,receipt}=prepareVoiceFoundryHandoff(fresh());
  assert.equal(cues.length,7);
  assert.equal(foundry.cues.length,7);
  assert.deepEqual(receipt.speakerRoles,['ai-agent','human-owner']);
  assert.equal(cues[2].text,'I already sent it.');
  assert.equal(cues[3].text,'Sent? I said draft.');
  assert.equal(cues[2].timelineStartSec,7);
  assert.equal(cues[3].timelineStartSec,11);
  assert.equal(cues[5].timelineStartSec,20);
  assert.equal(cues[2].maxDurationSec,4);
  assert.ok(cues.every(c=>c.id===c.productionNeedId));
  assert.ok(cues.every(c=>c.castingState==='awaiting_human_audition_and_rights_evidence'));
  assert.ok(foundry.cues.every(c=>c.voiceProfileId===null&&c.accent===null&&c.performance===null));
  assert.deepEqual(foundry.profiles,[]);
  assert.equal(receipt.status,'held_cast_and_rights_required');
  assert.equal(receipt.paidGenerationAuthority,false);
  assert.equal(receipt.publicationAuthority,false);
});

test('cue receipts stable across identical scene scripts without fake audition evidence',()=>{
  const a=prepareVoiceFoundryHandoff(fresh());
  const b=prepareVoiceFoundryHandoff(fresh());
  assert.equal(a.receipt.cueDigest,b.receipt.cueDigest);
  assert.match(a.receipt.cueDigest,/^[a-f0-9]{64}$/);
  assert.equal(a.receipt.audioMeasured,false);
  assert.equal(a.receipt.castApproved,false);
  assert.equal(a.receipt.auditionCompleted,false);
});

test('tampering with dialog, timing, unauthorized cast or release authority blocks handoff',()=>{
  const differentText=fresh();differentText.productionNeeds.find(n=>n.kind==='speech').prompt='Totally new text';
  assert.throws(()=>prepareVoiceFoundryHandoff(differentText),/line_to_need_mismatch/);
  const changedTime=fresh();changedTime.project.tracks.find(t=>t.kind==='voice').clips[0].startSec=1;
  assert.throws(()=>prepareVoiceFoundryHandoff(changedTime),/voice_timeline_mismatch/);
  const fabricatedCast=fresh();fabricatedCast.productionNeeds.find(n=>n.kind==='speech').voiceProfileId='pretend-approved-voice';
  assert.throws(()=>prepareVoiceFoundryHandoff(fabricatedCast),/already_cast_must_use_approved_path/);
  const dangerous=fresh();dangerous.boundaries.publicationAuthorityGranted=true;
  assert.throws(()=>prepareVoiceFoundryHandoff(dangerous),/authority_boundary_invalid/);
  const noSpeaker=fresh();noSpeaker.script[0].speakerId='';
  assert.throws(()=>prepareVoiceFoundryHandoff(noSpeaker),/line_identity_missing/);
  const removed=fresh();removed.productionNeeds=removed.productionNeeds.filter(n=>n.kind!=='speech');
  assert.throws(()=>prepareVoiceFoundryHandoff(removed),/matching_need_missing/);
});

test('portable voice queue is written as held artifact, not a production cast',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'systemia-owned-voice-'));
  try{
    const draft=path.join(dir,'draft.json');
    fs.writeFileSync(draft,JSON.stringify(fresh()));
    const receipt=writeVoiceFoundryQueue(draft,dir);
    assert.equal(receipt.cueCount,7);
    const foundry=JSON.parse(fs.readFileSync(path.join(dir,'voice-foundry-session.held.json'),'utf8'));
    assert.equal(foundry.profiles.length,0);
    assert.equal(foundry.cues.length,7);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'voice-handoff-receipt.json'),'utf8')).publicationAuthority,false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
