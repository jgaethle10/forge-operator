import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const r=JSON.parse(fs.readFileSync('systemia/clip/evercraft-web-last-light-registry.json','utf8'));
const hash=/^[a-f0-9]{64}$/;
test('preserve owner-liked Steinway byte-locked reference without inventing music approval',()=>{
 assert.equal(r.master_reference.feedback_state,'positively_received_timbre_foundation');
 assert.equal(r.master_reference.preserve_exact_bytes,true);
 assert.match(r.master_reference.wav.sha256,hash);
 assert.match(r.master_reference.listening_mp3.sha256,hash);
 assert.equal(r.master_reference.full_score_approved,false);
 assert.equal(r.master_reference.commercial_music_approved,false);
 assert.equal(r.master_reference.performed_by_human_verified,false);
});
test('all V3 orchestra interpretations remain explicitly held',()=>{
 assert.equal(r.orchestration_candidates.length,2);
 for(const x of r.orchestration_candidates){assert.equal(x.status,'UNAPPROVED');assert.equal(x.publish_authorized,false);assert.match(x.sha256,hash)}
});
test('no signal meter or earlier positive piano comment grants campaign launch authority',()=>{
 assert.equal(r.hard_gates.human_listening_release_approval,false);
 assert.equal(r.hard_gates.commercial_sound_rights_verified,false);
 assert.equal(r.hard_gates.evercraft_web_public_customer_access_verified,false);
 assert.equal(r.hard_gates.publication_authorized,false);
});
