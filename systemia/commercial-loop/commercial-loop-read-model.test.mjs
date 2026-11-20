import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import {projectCommercialLoop,COMMERCIAL_LOOP_ORDER_SCHEMA} from './commercial-loop-read-model.mjs';
import {HARBOR_PREVIEW_SEND_SCHEMA} from '../distribution/harbor/commercial-preview-send-guard.mjs';

const H='a'.repeat(64),PREVIEW='b'.repeat(64),MSG='c'.repeat(64),REPORT='d'.repeat(64);
const sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const order=()=>({schema:COMMERCIAL_LOOP_ORDER_SCHEMA,orderId:'order-test-001',
  packageId:'a'.repeat(32),pageId:'private-page-id',threadId:'private-thread-id',
  offerKey:'fallen-commercial-30s',agreedPriceCents:5000,currency:'usd',
  paymentPolicy:'AFTER_APPROVED_PREVIEW',expectedAssetCount:12});
function fixture(){
 const o=order();
 const r={schema:'evercraft.systemia.wing-receive-receipt.v1',
   id:o.packageId,fromWing:'harbor',toWing:'fallen',kind:'media',
   ciphertextSha256:H,state:'AUTHENTICATED_BYTES_RECEIVED',privateCustodyVerified:true,
   receivedAt:'2026-11-19T20:00:00Z',
   assets:Array.from({length:12},(_,i)=>({filename:'asset-'+String(i+1).padStart(3,'0')+'.jpg',
     sha256:String((i+1)%10).repeat(64),bytes:100+i}))};
 const assetIdentity=sha(r.assets.map(a=>[a.filename,a.sha256,a.bytes]));
 const fallenGate={schema:'evercraft.fallen.customer-commercial-gate-report.v1',
   orderId:o.orderId,status:'ready_for_client_preview',masterSha256:PREVIEW,
   audioStatus:'accepted',pictureStatus:'accepted',rightsAndCreativeStatus:'reviewed',
   release:{schema:'evercraft.fallen.client-commercial-release-report.v1',
     status:'ready_for_client_preview',reasons:[],masterSha256:PREVIEW,reportDigest:REPORT}};
 const assignment={schema:'evercraft.commercial-loop.assignment.v1',status:'PRODUCTION_ASSIGNED',
   orderId:o.orderId,packageId:o.packageId,assetIdentity,systemiaAdmissionRef:'systemia:verified-1',
   jobId:'job-test-001',producerId:'fallen-producer-1',productionAcceptanceRef:'fallen:accept:1',
   runtime:'evercraft_owned',rightsStatus:'VERIFIED_FOR_COMMERCIAL_PREVIEW',scopeConfirmed:true};
 const previewSendRequest={schema:HARBOR_PREVIEW_SEND_SCHEMA,
   job:{id:assignment.jobId,orderId:o.orderId,status:'PRODUCTION_ASSIGNED',
     systemiaAdmissionRef:assignment.systemiaAdmissionRef,producerId:assignment.producerId,
     productionRuntime:'evercraft_owned',productionAccepted:true,
     sourceManifestSha256:assetIdentity,rightsStatus:assignment.rightsStatus,scopeConfirmed:true},
   artifact:{sha256:PREVIEW,mimeType:'video/mp4',watermarked:true,privateDeliveryOnly:true},
   fallenGate,review:{independentReviewerId:'creative-reviewer-2',
     visualApproved:true,audioApproved:true,exactPreviewSha256:PREVIEW,
     watermarkVisible:true,reviewReceiptRef:'review-1'},
   founderApproval:{approvedBy:'founder',approvedAt:'2026-11-19T20:00:00Z',
     approvedPreviewSha256:PREVIEW,approvedMessageSha256:MSG},
   customerMessageSha256:MSG,
   destination:{platform:'facebook_messenger',pageId:o.pageId,threadId:o.threadId},
   customerConsent:{status:'AUTHORIZED_FOR_PRIVATE_PREVIEW',threadId:o.threadId},
   sendAuthorization:{status:'AUTHORIZED',orderId:o.orderId,threadId:o.threadId,
     approvedPreviewSha256:PREVIEW,authorityRef:'approved:preview:1'}};
 const providerPreview={schema:'evercraft.commercial-loop.provider-preview-receipt.v1',
   status:'SENT_READBACK',orderId:o.orderId,pageId:o.pageId,threadId:o.threadId,
   mediaSha256:PREVIEW,providerMessageId:'meta-msg-001',readbackReceiptRef:'meta:readback-001'};
 const clientFeedback={schema:'evercraft.commercial-loop.client-feedback.v1',
   status:'APPROVED',orderId:o.orderId,threadId:o.threadId,previewSha256:PREVIEW,
   providerMessageId:'customer-reply-001',receiptRef:'meta:reply-readback-001'};
 const payment={schema:'evercraft.commercial-loop.payment-readback.v1',orderId:o.orderId,
   status:'PAID_VERIFIED',provider:'stripe',accountVerified:true,
   amountReceivedCents:5000,currency:'usd',previewSha256:PREVIEW,
   providerPaymentIntentId:'pi_synthetic_001',readbackReceiptRef:'stripe:readback-001'};
 const finalDelivery={schema:'evercraft.commercial-loop.shipping-readback.v1',
   orderId:o.orderId,threadId:o.threadId,approvedPreviewSha256:PREVIEW,
   status:'DELIVERED_READBACK',masterSha256:PREVIEW,
   shippingReceiptRef:'shipping:001',recipientReadbackRef:'delivery:001'};
 return {order:o,custody:{observedBy:'trusted-owned-receiver',receipt:r},
   intake:{schema:'evercraft.wing-courier.intake-handoff.v1',packageId:o.packageId,
     intakeState:'candidate_only',candidateId:'intake-001',intakeReceiptHash:H,
     admissionGranted:false,executionGranted:false},
   assignment,fallenGate,previewSendRequest,providerSends:[],
   providerPreview,clientFeedback,payment,finalDelivery};
}
const stage=x=>projectCommercialLoop(x).stage;
test('without physical receiver proof the bridge is not operational regardless of downstream claims',()=>{
 const f=fixture();delete f.custody;assert.equal(stage(f),'AWAITING_PRIVATE_CUSTODY');
 f.custody={observedBy:'sender-claims-delivered',receipt:fixture().custody.receipt};
 assert.equal(stage(f),'CUSTODY_CONFLICT');
});
test('exact 12/12 owned receipt must match order package identity and hash format',()=>{
 const f=fixture();f.custody.receipt.assets.pop();assert.equal(stage(f),'CUSTODY_CONFLICT');
 f.custody.receipt.assets=fixture().custody.receipt.assets;
 f.custody.receipt.id='f'.repeat(32);assert.equal(stage(f),'CUSTODY_CONFLICT');
 f.custody.receipt.id=f.order.packageId;
 f.custody.receipt.assets[0].sha256='wrong';assert.equal(stage(f),'CUSTODY_CONFLICT');
});
test('Courier receiving receipt is distinct from Passport intake and production assignment',()=>{
 const f=fixture();delete f.intake;assert.equal(stage(f),'AWAITING_PASSPORT_INTAKE');
 f.intake=fixture().intake;delete f.assignment;assert.equal(stage(f),'AWAITING_PRODUCTION_ASSIGNMENT');
 f.assignment=fixture().assignment;f.assignment.assetIdentity='f'.repeat(64);
 assert.equal(stage(f),'ASSIGNMENT_CONFLICT');
});
test('Fallen preview QC and separate media message release are mandatory',()=>{
 const f=fixture();delete f.fallenGate;assert.equal(stage(f),'AWAITING_FALLEN_QC');
 f.fallenGate=fixture().fallenGate;delete f.previewSendRequest;
 assert.equal(stage(f),'AWAITING_RELEASE_REVIEW');
 f.previewSendRequest=fixture().previewSendRequest;
 f.previewSendRequest.review.independentReviewerId=f.assignment.producerId;
 assert.equal(stage(f),'PREVIEW_RELEASE_HELD');
});
test('wrong customer thread, wrong Page, changed Fallen gate and unsafely reused courier hash all hold',()=>{
 const f=fixture();f.previewSendRequest.destination.pageId='another-page';
 assert.equal(stage(f),'PREVIEW_RELEASE_CONFLICT');
 f.previewSendRequest=fixture().previewSendRequest;f.previewSendRequest.fallenGate.release.reportDigest='f'.repeat(64);
 assert.equal(stage(f),'PREVIEW_RELEASE_CONFLICT');
 f.previewSendRequest=fixture().previewSendRequest;f.previewSendRequest.job.sourceManifestSha256=f.custody.receipt.ciphertextSha256;
 assert.equal(stage(f),'PREVIEW_RELEASE_CONFLICT');
});
test('a correctly approved preview only creates a staged sender action, no Meta send',()=>{
 const f=fixture();delete f.providerPreview;
 const r=projectCommercialLoop(f);
 assert.equal(r.stage,'READY_FOR_MEDIATED_PREVIEW_SEND');
 assert.equal(r.publisherInvoked,false);
 assert.equal(r.paymentCaptured,false);
 assert.equal(r.customerMessaged,false);
});
test('actual provider readback must reconcile with private outbound ledger, including retry',()=>{
 const f=fixture();assert.equal(stage(f),'PREVIEW_SEND_CONFLICT');
 f.providerSends=[{orderId:f.order.orderId,threadId:f.order.threadId,
   pageId:f.order.pageId,providerMessageId:f.providerPreview.providerMessageId,mediaSha256:PREVIEW}];
 assert.equal(stage(f),'DELIVERY_RECEIPT_PRESENT');
 assert.equal(stage(f),'DELIVERY_RECEIPT_PRESENT');
 const old=f.providerSends;
 f.providerSends=[...old,{orderId:f.order.orderId,threadId:f.order.threadId,
   pageId:f.order.pageId,providerMessageId:'double-send',mediaSha256:PREVIEW}];
 assert.equal(stage(f),'PREVIEW_RELEASE_HELD');
});
test('private customer revisions must not trigger payment',()=>{
 const f=fixture();f.providerSends=[{orderId:f.order.orderId,threadId:f.order.threadId,
   pageId:f.order.pageId,providerMessageId:f.providerPreview.providerMessageId,mediaSha256:PREVIEW}];
 f.clientFeedback.status='REVISION_REQUESTED';
 assert.equal(stage(f),'REVISION_REQUESTED');
 assert.equal(projectCommercialLoop(f).paymentCaptured,false);
});
test('payment requires explicit exact-version client approval and provider readback, not checkout',()=>{
 const f=fixture();f.providerSends=[{orderId:f.order.orderId,threadId:f.order.threadId,
   pageId:f.order.pageId,providerMessageId:f.providerPreview.providerMessageId,mediaSha256:PREVIEW}];
 delete f.clientFeedback;assert.equal(stage(f),'AWAITING_CLIENT_FEEDBACK');
 f.clientFeedback=fixture().clientFeedback;delete f.payment;
 assert.equal(stage(f),'PAYMENT_PENDING');
 f.payment={schema:'evercraft.commercial-loop.payment-readback.v1',orderId:f.order.orderId,
   status:'CHECKOUT_OPEN',provider:'stripe'};
 assert.equal(stage(f),'PAYMENT_NOT_VERIFIED');
 f.payment=fixture().payment;f.payment.amountReceivedCents=4900;
 assert.equal(stage(f),'PAYMENT_NOT_VERIFIED');
});
test('delivery is never inferred from successful payment or preview file creation',()=>{
 const f=fixture();f.providerSends=[{orderId:f.order.orderId,threadId:f.order.threadId,
   pageId:f.order.pageId,providerMessageId:f.providerPreview.providerMessageId,mediaSha256:PREVIEW}];
 delete f.finalDelivery;assert.equal(stage(f),'AWAITING_FINAL_DELIVERY');
 f.finalDelivery=fixture().finalDelivery;f.finalDelivery.threadId='other-thread';
 assert.equal(stage(f),'FINAL_DELIVERY_CONFLICT');
});
test('full synthetic receipts project informational delivery milestone, never authorize real actions',()=>{
 const f=fixture();f.providerSends=[{orderId:f.order.orderId,threadId:f.order.threadId,
   pageId:f.order.pageId,providerMessageId:f.providerPreview.providerMessageId,mediaSha256:PREVIEW}];
 const r=projectCommercialLoop(f);
 assert.equal(r.stage,'DELIVERY_RECEIPT_PRESENT');
 assert.equal(r.receiptAuthenticityVerifiedByProjection,false);
 for(const v of ['publisherInvoked','checkoutCreated','customerMessaged','paymentCaptured','finalDelivered','productionExecutionGranted'])
   assert.equal(r[v],false);
 assert.ok(r.proofs.courierCandidateFingerprint.startsWith('sha256:'));
 assert.equal(r.proofs.previewSha256,PREVIEW);
 assert.doesNotMatch(JSON.stringify(r),/person@example|customer-reply-001/);
});
test('malformed order cannot create a commercial loop',()=>{
 const f=fixture();f.order.agreedPriceCents=0;
 assert.throws(()=>projectCommercialLoop(f),/order_identity_scope_invalid/);
});
