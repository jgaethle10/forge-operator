import test from 'node:test';
import assert from 'node:assert/strict';
import {runFoundrySabanCaptureReview} from './instrument-foundry-saban-review.mjs';

const SHA='a'.repeat(64);
test('Saban runs four media-studio review roles concurrently but keeps release held',async()=>{
 const r=await runFoundrySabanCaptureReview({
  capture_id:'foundry-c4-quiet-001',source_sha256:SHA,
  rights_evidence_ref:'rights-record-123',provenance_receipt_id:'capture-receipt-123',
  performance_timing_receipt_id:'timing-123',
  human_listening_review:{state:'accepted',receipt_id:'human-review-123'}
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
