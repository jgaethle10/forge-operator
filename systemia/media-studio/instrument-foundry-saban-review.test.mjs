import test from 'node:test';
import assert from 'node:assert/strict';
import {runFoundrySabanCaptureReview} from './instrument-foundry-saban-review.mjs';

const SHA='a'.repeat(64);
const goodPitch=()=>({
 schema:'evercraft.fallen.piano-root-evidence.v1',status:'consistent',expected_midi:60,
 expected_hz:261.626,estimated_hz:261.7,cents_error:0.49,periodicity:.91,
 reason:'instrument_capture_pitch_consistent',human_pitch_confirmed:false
});
const goodQa=()=>({schema:'evercraft.fallen.piano-capture-technical-qa.v1',
 status:'technical_signal_pass',blockers:[],
 metrics:{peak_dbfs:-11,rms_dbfs:-26},commercial_release_ready:false});
test('Saban runs four media-studio review roles concurrently but keeps release held',async()=>{
 const r=await runFoundrySabanCaptureReview({
  capture_id:'foundry-c4-quiet-001',source_sha256:SHA,
  rights_evidence_ref:'rights-record-123',provenance_receipt_id:'capture-receipt-123',
  performance_timing_receipt_id:'timing-123',
  human_listening_review:{state:'accepted',receipt_id:'human-review-123'},
  capture_signal_qa:goodQa(),
  root_pitch_evidence:goodPitch(),selected_midi_root:60
 });
 assert.equal(r.roles_checked.length,4);
 assert.equal(r.planning_receipts.length,4);
 assert.equal(r.review_status,'review_ready_for_independent_rights_and_audio_QA');
 assert.equal(r.release_ready,false);
 assert.equal(r.live_distributed_worker_execution,false);
 assert.equal(r.sample_rights_independently_verified,false);
 assert.equal(r.findings.length,0);
});
test('missing commercial license evidence is flagged and blocks capture promotion',async()=>{
 const r=await runFoundrySabanCaptureReview({
  capture_id:'foundry-c4-quiet-002',source_sha256:SHA,
  provenance_receipt_id:'capture-receipt-002',
  performance_timing_receipt_id:'timing-002',
  human_listening_review:{state:'accepted',receipt_id:'human-review-002'}
 });
 assert.equal(r.review_status,'blocked');
 assert.ok(r.findings.includes('commercial_rights_requirement_missing'));
});
test('missing human listening acceptance blocks even if planning role requirements are declared',async()=>{
 const r=await runFoundrySabanCaptureReview({
  capture_id:'foundry-c4-quiet-003',source_sha256:SHA,
  rights_evidence_ref:'claim',provenance_receipt_id:'receipt',
  performance_timing_receipt_id:'timing',
 });
 assert.equal(r.review_status,'blocked');
 assert.ok(r.findings.includes('human_listening_acceptance_missing'));
});
test('invalid source SHA and missing capture provenance block all publication claims',async()=>{
 const r=await runFoundrySabanCaptureReview({
  capture_id:'foundry-c4-quiet-004',source_sha256:'bad'
 });
 assert.equal(r.review_status,'blocked');
 assert.ok(r.findings.includes('source_sha256_invalid'));
 assert.ok(r.findings.includes('continuity_digest_missing'));
 assert.ok(r.findings.includes('provenance_receipt_requirement_missing'));
 assert.ok(r.findings.includes('timing_control_requirement_missing'));
 assert.equal(r.release_ready,false);
});

test('Saban preflight will not promote a capture with missing technical waveform inspection',async()=>{
 const r=await runFoundrySabanCaptureReview({
  capture_id:'foundry-c4-bad-qa',source_sha256:SHA,
  rights_evidence_ref:'claim',provenance_receipt_id:'receipt',
  performance_timing_receipt_id:'timing',
  human_listening_review:{state:'accepted',receipt_id:'review'},
 });
 assert.equal(r.review_status,'blocked');
 assert.ok(r.findings.includes('piano_capture_signal_qa_missing_or_held'));
});
test('Saban preflight rejects a technically held/clipped waveform report',async()=>{
 const r=await runFoundrySabanCaptureReview({
  capture_id:'foundry-c4-clipped',source_sha256:SHA,
  rights_evidence_ref:'claim',provenance_receipt_id:'receipt',
  performance_timing_receipt_id:'timing',
  human_listening_review:{state:'accepted',receipt_id:'review'},
  capture_signal_qa:{...goodQa(),status:'held',blockers:['sustained_sample_clipping']},
 });
 assert.equal(r.review_status,'blocked');
 assert.equal(r.qa_report_consistency_checked,false);
 assert.equal(r.qa_waveform_bytes_reexamined_by_saban,false);
});

test('Saban review refuses incorrectly labeled root pitch even with completed signal and listening QA',async()=>{
 const r=await runFoundrySabanCaptureReview({
   capture_id:'piano-f3',source_sha256:SHA,rights_evidence_ref:'claim',
   provenance_receipt_id:'receipt',performance_timing_receipt_id:'timing',
   human_listening_review:{state:'accepted',receipt_id:'review'},
   capture_signal_qa:goodQa(),root_pitch_evidence:goodPitch(),selected_midi_root:61,
 });
 assert.equal(r.review_status,'blocked');
 assert.ok(r.findings.includes('root_pitch_evidence_missing_mismatched_or_indeterminate'));
 assert.equal(r.root_pitch_verified_by_saban,false);
});
test('Saban review refuses indeterminate pitch and does not certify human pitch correctness',async()=>{
 const r=await runFoundrySabanCaptureReview({
   capture_id:'piano-f4',source_sha256:SHA,rights_evidence_ref:'claim',
   provenance_receipt_id:'receipt',performance_timing_receipt_id:'timing',
   human_listening_review:{state:'accepted',receipt_id:'review'},
   capture_signal_qa:goodQa(),
   root_pitch_evidence:{...goodPitch(),status:'indeterminate',estimated_hz:null},selected_midi_root:60
 });
 assert.equal(r.review_status,'blocked');
 assert.equal(r.root_pitch_report_consistency_checked,false);
 assert.equal(r.release_ready,false);
});
