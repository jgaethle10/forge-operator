import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileCharacterCommercial} from './character-commercial-bridge.mjs';
const campaign=JSON.parse(fs.readFileSync(new URL('./campaigns/forensiscope-ship-character-v1.json',import.meta.url),'utf8'));
test('nine character-directed shots have exact continuous 29-second frames',()=>{
 const p=compileCharacterCommercial(campaign);
 assert.equal(p.shots.length,9);assert.equal(p.totalSec,29);assert.equal(p.frameCount,696);
 assert.equal(p.shots[0].startSec,0);assert.equal(p.shots.at(-1).endSec,29);
 for(let i=1;i<p.shots.length;i++)assert.equal(p.shots[i].frameStart,p.shots[i-1].frameEnd);
 assert.equal(p.cinematicSequenceInput.schema,'evercraft.fallen.cinematic-sequence-input.v1');
});
test('missing authentic video, identity and licensed voices block release',()=>{
 const p=compileCharacterCommercial(campaign);
 assert.equal(p.status,'blocked');assert.ok(p.issues.includes('real_product_capture_missing'));
 assert.ok(p.issues.includes('voice_rights_missing:maya_voice_license'));
 assert.ok(p.issues.includes('public_cta_not_verified'));
 assert.equal(p.publicationAuthority,false);assert.equal(p.paidGenerationAuthority,false);
 assert.equal(p.renderExecutionState,'not_requested');
});
test('all three styles reuse the same story and require real footage',()=>{
 const versions=['photoreal','animated','claymation'].map(style=>compileCharacterCommercial(campaign,{style}));
 assert.deepEqual(versions.map(v=>v.frameCount),[696,696,696]);
 assert.deepEqual(versions.map(v=>v.shots.map(s=>s.line)),[versions[0].shots.map(s=>s.line),versions[0].shots.map(s=>s.line),versions[0].shots.map(s=>s.line)]);
 assert.match(versions[2].cinematicSequenceInput.shots[0].prompt,/12 unique poses/);
 assert.match(versions[0].cinematicSequenceInput.shots[4].prompt,/authentic ForensiScope UI capture/);
});
test('extra fictional asset paths do not spoof rights or product proof',()=>{
 const p=compileCharacterCommercial(campaign,{assets:{maya_identity:{kind:'image',digest:'a'.repeat(64),sourceRefs:['fictional'],locator:{kind:'url',value:'https://example.com/fake.png'}},forensiscope_actual_ui_capture:{kind:'image',rightsState:'owned'}}});
 assert.equal(p.status,'blocked');assert.ok(p.issues.includes('reference_unverified:maya_identity'));
 assert.ok(p.issues.includes('real_product_capture_missing'));
});
test('unknown cast speaker and runtime tampering fail closed',()=>{
 const changed=structuredClone(campaign);
 changed.shotPlan[0].speakerId='unverified_person';changed.shotPlan[0].durationSec=9;
 const p=compileCharacterCommercial(changed);
 assert.ok(p.issues.includes('speaker_unknown:S01'));assert.ok(p.issues.includes('runtime_mismatch'));
 assert.throws(()=>compileCharacterCommercial(campaign,{style:'phantom'}),/character_style_invalid/);
});
