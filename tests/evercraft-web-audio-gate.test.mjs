import test from "node:test";
import assert from "node:assert/strict";
import {assessCommercialAudio,NON_APPROVED_SOURCES} from "../systemia/clip/evercraft-web-audio-gate.mjs";
const hash="f".repeat(64);
const approved=(source=hash)=>({
 sha256:source,rights_state:"commercial_cleared",
 listening_review:{decision:"approved",reviewed_by:"fixture-only-reviewer",reviewed_at:"2026-10-20T00:00:00Z"}
});
const packet=(music=approved())=>({schema:"evercraft.clip.audio-approval.v1",music,voice:approved(),sfx:approved()});
test("missing packet holds",()=>{
 assert.equal(assessCommercialAudio(undefined).status,"HOLD");
});
test("every Oct 20 music audition is blocked regardless of arbitrary approval flags",()=>{
 for(const rejected of Object.keys(NON_APPROVED_SOURCES)){
  const result=assessCommercialAudio(packet(approved(rejected)));
  assert.equal(result.audio_gate_passed,false);
  assert.ok(result.reasons.includes("music:previously_rejected_or_not_approved"));
 }
});
test("a mastered but unauditioned candidate cannot release",()=>{
 const x=approved();x.listening_review.decision="pending";x.lufs=-14;x.truePeakDb=-1;
 assert.ok(assessCommercialAudio(packet(x)).reasons.includes("music:no_human_listening_approval"));
});
test("commercial clearance and dated human approval are independently required",()=>{
 const x=approved();x.rights_state="unknown";
 assert.ok(assessCommercialAudio(packet(x)).reasons.includes("music:commercial_rights_unverified"));
});
test("intentional silence also requires review",()=>{
 const x=packet(null);x.intentional_silence=["music"];
 const r=assessCommercialAudio(x);
 assert.ok(r.reasons.includes("music:silence_unapproved"));
});
test("even fully approved synthetic fixtures never grant publication",()=>{
 const r=assessCommercialAudio(packet());
 assert.equal(r.audio_gate_passed,true);
 assert.equal(r.release_authorized,false);
 assert.equal(r.status,"AUDIO_REVIEW_PASSED_NOT_PUBLISHED");
});
