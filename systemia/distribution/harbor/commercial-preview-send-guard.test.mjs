import assert from 'node:assert/strict';
import test from 'node:test';
import { assessHarborCommercialPreviewSend, HARBOR_PREVIEW_SEND_SCHEMA } from './commercial-preview-send-guard.mjs';
const sha='a'.repeat(64), msg='b'.repeat(64), man='c'.repeat(64), report='d'.repeat(64);
const fixture=()=>({
 schema:HARBOR_PREVIEW_SEND_SCHEMA,
 job:{id:'JOB-001',orderId:'ORDER-001',status:'PRODUCTION_ASSIGNED',systemiaAdmissionRef:'sys:1',producerId:'fallen-producer-1',productionRuntime:'evercraft_owned',productionAccepted:true,sourceManifestSha256:man,rightsStatus:'VERIFIED_FOR_COMMERCIAL_PREVIEW',scopeConfirmed:true},
 artifact:{sha256:sha,mimeType:'video/mp4',watermarked:true,privateDeliveryOnly:true},
 fallenGate:{schema:'evercraft.fallen.customer-commercial-gate-report.v1',orderId:'ORDER-001',status:'ready_for_client_preview',masterSha256:sha,rightsAndCreativeStatus:'reviewed',audioStatus:'accepted',pictureStatus:'accepted',release:{schema:'evercraft.fallen.client-commercial-release-report.v1',status:'ready_for_client_preview',reasons:[],masterSha256:sha,reportDigest:report}},
 review:{independentReviewerId:'creative-reviewer-2',visualApproved:true,audioApproved:true,exactPreviewSha256:sha,watermarkVisible:true,reviewReceiptRef:'review:1'},
 founderApproval:{approvedBy:'founder',approvedAt:'2026-11-19T18:00:00Z',approvedPreviewSha256:sha,approvedMessageSha256:msg},
 customerMessageSha256:msg,
 destination:{platform:'facebook_messenger',pageId:'private-page',threadId:'private-thread'},
 customerConsent:{status:'AUTHORIZED_FOR_PRIVATE_PREVIEW',threadId:'private-thread'},
 sendAuthorization:{status:'AUTHORIZED',orderId:'ORDER-001',threadId:'private-thread',approvedPreviewSha256:sha,authorityRef:'passport:preview:1'}
});
const assess=(f,providerSends=[])=>assessHarborCommercialPreviewSend(f,{providerSends});
test('synthetic complete attestation becomes eligible for downstream sender, never sends itself',()=>{
 const r=assess(fixture()); assert.equal(r.status,'ELIGIBLE_FOR_AUTHORIZED_SENDER');
 assert.equal(r.boundaries.senderInvoked,false);assert.equal(r.boundaries.sourceReceiptAuthenticityVerified,false);
});
const blocked=[
 ['unassigned producer',f=>{f.job.productionAccepted=false},'fallen_production_not_accepted'],
 ['unowned runtime',f=>{f.job.productionRuntime='harbor_personal'},'production_runtime_not_owned'],
 ['unverified rights',f=>{f.job.rightsStatus='UNVERIFIED'},'source_rights_not_verified'],
 ['missing source manifest',f=>{delete f.job.sourceManifestSha256},'source_manifest_unverified'],
 ['missing production report',f=>{delete f.fallenGate.schema},'fallen_gate_missing'],
 ['creative review refused',f=>{f.fallenGate.rightsAndCreativeStatus='needs_review'},'fallen_creative_review_missing'],
 ['bad final render',f=>{f.fallenGate.status='blocked'},'fallen_not_ready_for_client_preview'],
 ['mismatched output',f=>{f.fallenGate.masterSha256='f'.repeat(64)},'fallen_gate_media_digest_mismatch'],
 ['self-review',f=>{f.review.independentReviewerId=f.job.producerId},'producer_self_review_forbidden'],
 ['visual failed',f=>{f.review.visualApproved=false},'human_visual_review_not_approved'],
 ['audio failed',f=>{f.review.audioApproved=false},'human_audio_review_not_approved'],
 ['founder approval absent',f=>{delete f.founderApproval.approvedBy},'founder_approval_missing'],
 ['founder signed wrong version',f=>{f.founderApproval.approvedPreviewSha256='e'.repeat(64)},'founder_approval_media_digest_mismatch'],
 ['founder signed wrong message',f=>{f.founderApproval.approvedMessageSha256='e'.repeat(64)},'founder_approval_message_mismatch'],
 ['no watermark',f=>{f.artifact.watermarked=false},'watermarked_preview_missing'],
 ['wrong thread consent',f=>{f.customerConsent.threadId='other'},'consent_thread_mismatch'],
 ['wrong send authority',f=>{f.sendAuthorization.threadId='other'},'send_authority_thread_mismatch'],
 ['authorization absent',f=>{f.sendAuthorization.status='HELD'},'external_send_not_authorized'],
];
for(const [name,mutate,expected] of blocked)test('deny '+name,()=>{const f=fixture();mutate(f);const r=assess(f);assert.equal(r.status,'DENY');assert.ok(r.reasons.includes(expected));});
test('deny without authoritative send ledger',()=>assert.ok(assessHarborCommercialPreviewSend(fixture()).reasons.includes('authoritative_send_ledger_unavailable')));
test('deny already-sent exact version',()=>{const r=assess(fixture(),[{orderId:'ORDER-001',threadId:'private-thread',mediaSha256:sha}]);assert.ok(r.reasons.includes('duplicate_preview_send_blocked'))});
test('denies malformed schema',()=>assert.throws(()=>assessHarborCommercialPreviewSend({}, {providerSends:[]}),/schema_invalid/));
