// Evercraft commercial loop read-model: source-backed cross-wing checkpoints.
// READ ONLY: no network, disk writes, Messenger, checkout, rendering or production.
import crypto from 'node:crypto';
import {candidateForVerifiedWingReceipt} from '../wing-courier/intake-bridge.mjs';
import {assessHarborCommercialPreviewSend,HARBOR_PREVIEW_SEND_SCHEMA}
  from '../distribution/harbor/commercial-preview-send-guard.mjs';

export const COMMERCIAL_LOOP_ORDER_SCHEMA='evercraft.commercial-loop.order.v1';
export const COMMERCIAL_LOOP_READ_MODEL_SCHEMA='evercraft.commercial-loop.read-model.v1';
const HEX64=/^[a-f0-9]{64}$/i,HEX32=/^[a-f0-9]{32}$/i;
const nonempty=x=>typeof x==='string'&&x.trim().length>0;
const sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fail=c=>{throw Error('commercial_loop_'+c);};

/**
 * Projects separately obtained, independently trusted receipts into a safe,
 * operator-readable next step. The caller must fetch source evidence directly
 * from owned Courier, Passport, Fallen, Meta, Stripe and Shipping systems,
 * never accept attestations in buyer text or an agent's generated proposal.
 * This module does not authenticate the caller or receipts.
 *
 * The primary initial use is a consented $50 Fallen Studios pilot. It does not
 * require or assume all Evercraft products share that pricing/approval policy.
 */
export function projectCommercialLoop({
  order,custody,intake,assignment,fallenGate,previewSendRequest,
  providerSends,providerPreview,clientFeedback,payment,finalDelivery,
}={}){
  if(order?.schema!==COMMERCIAL_LOOP_ORDER_SCHEMA||!nonempty(order.orderId)||
    !HEX32.test(order.packageId||'')||!nonempty(order.pageId)||!nonempty(order.threadId)||
    !nonempty(order.offerKey)||!Number.isSafeInteger(order.agreedPriceCents)||
    order.agreedPriceCents<=0||order.currency!=='usd'||
    order.paymentPolicy!=='AFTER_APPROVED_PREVIEW'||
    !Number.isInteger(order.expectedAssetCount)||order.expectedAssetCount<1||
    order.expectedAssetCount>100)fail('order_identity_scope_invalid');
  // A public issue/report is never a customer conversation transcript.
  const base={schema:COMMERCIAL_LOOP_READ_MODEL_SCHEMA,orderRef:order.orderId,
    offerKey:order.offerKey,mode:'READ_ONLY',nextAction:null,stage:null,holds:[],
    publisherInvoked:false,checkoutCreated:false,customerMessaged:false,
    paymentCaptured:false,finalDelivered:false,productionExecutionGranted:false,
    receiptAuthenticityVerifiedByProjection:false};
  function hold(stage,action,reasons=[]){return {...base,stage,nextAction:action,holds:reasons};}
  // Receiver custody (never sender's 'I uploaded it' claim).
  if(!custody)return hold('AWAITING_PRIVATE_CUSTODY','VERIFY_ACTUAL_NEXTGEN_COURIER_RECEIPT');
  const receipt=custody.receipt;
  if(custody.observedBy!=='trusted-owned-receiver'||
    receipt?.privateCustodyVerified!==true||receipt.id!==order.packageId||
    receipt.fromWing!=='harbor'||receipt.toWing!=='fallen'||receipt.kind!=='media'||
    receipt.assets?.length!==order.expectedAssetCount)
    return hold('CUSTODY_CONFLICT','HOLD_AND_RECONCILE_RECEIVER_IDENTITY',['owned_receiver_binding_missing']);
  let candidate;
  try{candidate=candidateForVerifiedWingReceipt({receipt});}
  catch{return hold('CUSTODY_CONFLICT','HOLD_AND_RECONCILE_RECEIVER_IDENTITY',['courier_receipt_invalid']);}
  const assetIdentity=sha(receipt.assets.map(x=>[x.filename,x.sha256,x.bytes]));
  if(!intake)return hold('AWAITING_PASSPORT_INTAKE','ADMIT_INERT_COURIER_CANDIDATE_VIA_EXISTING_PASSPORT');
  if(intake.schema!=='evercraft.wing-courier.intake-handoff.v1'||
    intake.packageId!==order.packageId||
    !['candidate_only','duplicate'].includes(intake.intakeState)||
    !nonempty(intake.candidateId)||!HEX64.test(intake.intakeReceiptHash||'')||
    intake.admissionGranted!==false||intake.executionGranted!==false)
    return hold('INTAKE_CONFLICT','RECONCILE_PRIVATE_PASSPORT_RECEIPT',['intake_receipt_not_admissible']);
  // Separate bounded job/capacity admission, NEVER implied by raw storage.
  if(!assignment)return hold('AWAITING_PRODUCTION_ASSIGNMENT','REQUEST_BOUNDED_FALLEN_CAPACITY_REVIEW');
  if(assignment.schema!=='evercraft.commercial-loop.assignment.v1'||
    assignment.status!=='PRODUCTION_ASSIGNED'||
    assignment.orderId!==order.orderId||assignment.packageId!==order.packageId||
    assignment.assetIdentity!==assetIdentity||!nonempty(assignment.systemiaAdmissionRef)||
    !nonempty(assignment.jobId)||!nonempty(assignment.producerId)||
    !nonempty(assignment.productionAcceptanceRef)||assignment.runtime!=='evercraft_owned'||
    assignment.rightsStatus!=='VERIFIED_FOR_COMMERCIAL_PREVIEW'||
    assignment.scopeConfirmed!==true)
    return hold('ASSIGNMENT_CONFLICT','HOLD_PRODUCTION_AND_RECHECK_SYSTEMIA_AUTHORITY',
      ['assignment_scope_or_authority_missing']);
  if(!fallenGate)return hold('AWAITING_FALLEN_QC','WAIT_FOR_OWNED_RENDER_AND_INDEPENDENT_QC');
  const previewSha=fallenGate.masterSha256;
  if(fallenGate.schema!=='evercraft.fallen.customer-commercial-gate-report.v1'||
    fallenGate.orderId!==order.orderId||fallenGate.status!=='ready_for_client_preview'||
    !HEX64.test(previewSha||'')||fallenGate.audioStatus!=='accepted'||
    fallenGate.pictureStatus!=='accepted'||
    fallenGate.rightsAndCreativeStatus!=='reviewed'||
    fallenGate.release?.status!=='ready_for_client_preview')
    return hold('PREVIEW_QC_HELD','REVISE_AND_REVIEW_FALLEN_PREVIEW',['fallen_gate_not_ready']);
  if(!previewSendRequest)return hold('AWAITING_RELEASE_REVIEW','ASSEMBLE_EXACT_PREVIEW_AND_FOUNDER_APPROVAL');
  if(previewSendRequest.schema!==HARBOR_PREVIEW_SEND_SCHEMA||
    previewSendRequest.job?.orderId!==order.orderId||
    previewSendRequest.job?.id!==assignment.jobId||
    previewSendRequest.job?.producerId!==assignment.producerId||
    previewSendRequest.job?.systemiaAdmissionRef!==assignment.systemiaAdmissionRef||
    previewSendRequest.job?.sourceManifestSha256!==assetIdentity||
    sha(previewSendRequest.fallenGate)!==sha(fallenGate)||
    previewSendRequest.destination?.threadId!==order.threadId||
    previewSendRequest.destination?.pageId!==order.pageId||
    previewSendRequest.artifact?.sha256!==previewSha)
    return hold('PREVIEW_RELEASE_CONFLICT','RECONCILE_EXACT_JOB_SOURCE_AND_CUSTOMER_THREAD',
      ['release_packet_binding_invalid']);
  // The existing preview-send guard is authoritative as a source-level policy,
  // but NOT a replacement for mediated provider-side enforcement.
  let provenPreviewLedgerEntry=null;
  if(providerPreview){
    // A completed authorized send must remain visible on replay. It is the
    // *one* provider readback matching the exact previous send, not a new send.
    provenPreviewLedgerEntry=Array.isArray(providerSends)?providerSends.find(row=>
      row?.providerMessageId===providerPreview.providerMessageId &&
      row?.orderId===order.orderId && row?.threadId===order.threadId &&
      row?.mediaSha256===previewSha && row?.pageId===order.pageId):null;
    if(!provenPreviewLedgerEntry)return hold('PREVIEW_SEND_CONFLICT',
      'RECONCILE_PROVIDER_LEDGER_AND_EXACT_MESSAGE',
      ['sender_ledger_missing_exact_provider_receipt']);
  }
  const precedingSends=provenPreviewLedgerEntry?
    providerSends.filter(row=>row!==provenPreviewLedgerEntry):providerSends;
  let guard;
  try{guard=assessHarborCommercialPreviewSend(previewSendRequest,{providerSends:precedingSends});}
  catch{return hold('PREVIEW_RELEASE_HELD','REVIEW_INVALID_PREVIEW_SEND_PACKET',['guard_rejected_input']);}
  if(guard.status!=='ELIGIBLE_FOR_AUTHORIZED_SENDER')
    return hold('PREVIEW_RELEASE_HELD','RESOLVE_PREVIEW_SEND_GUARD',guard.reasons);
  if(!providerPreview)return hold('READY_FOR_MEDIATED_PREVIEW_SEND',
    'USE_EXISTING_AUTHORIZED_HARBOR_SENDER_AND_COLLECT_PROVIDER_READBACK');
  if(providerPreview.schema!=='evercraft.commercial-loop.provider-preview-receipt.v1'||
    providerPreview.status!=='SENT_READBACK'||
    providerPreview.orderId!==order.orderId||providerPreview.pageId!==order.pageId||
    providerPreview.threadId!==order.threadId||
    providerPreview.mediaSha256!==previewSha||!nonempty(providerPreview.providerMessageId)||
    !nonempty(providerPreview.readbackReceiptRef))
    return hold('PREVIEW_SEND_CONFLICT','RECONCILE_ACTUAL_PROVIDER_MESSAGE',
      ['provider_preview_readback_invalid']);
  if(!clientFeedback)return hold('AWAITING_CLIENT_FEEDBACK','WAIT_FOR_CLIENT_RESPONSE_IN_ORIGINAL_THREAD');
  if(clientFeedback.schema!=='evercraft.commercial-loop.client-feedback.v1'||
    clientFeedback.orderId!==order.orderId||clientFeedback.threadId!==order.threadId||
    clientFeedback.previewSha256!==previewSha||
    !nonempty(clientFeedback.providerMessageId)||
    !nonempty(clientFeedback.receiptRef))
    return hold('CLIENT_FEEDBACK_CONFLICT','RECONCILE_ORIGINAL_CUSTOMER_MESSAGE',
      ['customer_feedback_binding_invalid']);
  if(clientFeedback.status==='REVISION_REQUESTED')
    return hold('REVISION_REQUESTED','RETURN_PRIVATE_NOTES_TO_SYSTEMIA_FALLEN_FOR_NEW_VERSION');
  if(clientFeedback.status!=='APPROVED')
    return hold('AWAITING_CLIENT_APPROVAL','WAIT_FOR_EXPLICIT_EXACT_PREVIEW_APPROVAL');
  // Client approval is not a charge; require actual direct provider settlement.
  if(!payment)return hold('PAYMENT_PENDING',
    'REQUEST_EXACT_APPROVED_ORDER_PAYMENT_THROUGH_EVERCRAFT_PAYMENTS');
  if(payment.schema!=='evercraft.commercial-loop.payment-readback.v1'||
    payment.orderId!==order.orderId||payment.status!=='PAID_VERIFIED'||
    payment.provider!=='stripe'||payment.accountVerified!==true||
    payment.amountReceivedCents!==order.agreedPriceCents||
    payment.currency!==order.currency||payment.previewSha256!==previewSha||
    !nonempty(payment.providerPaymentIntentId)||!nonempty(payment.readbackReceiptRef))
    return hold('PAYMENT_NOT_VERIFIED','RECONCILE_AUTHORITATIVE_STRIPE_PAID_RECEIPT',
      ['exact_order_payment_readback_missing']);
  if(!finalDelivery)return hold('AWAITING_FINAL_DELIVERY',
    'VERIFY_FINAL_MASTER_AND_AUTHORIZE_EVERCRAFT_SHIPPING');
  if(finalDelivery.schema!=='evercraft.commercial-loop.shipping-readback.v1'||
    finalDelivery.orderId!==order.orderId||finalDelivery.threadId!==order.threadId||
    finalDelivery.approvedPreviewSha256!==previewSha||finalDelivery.status!=='DELIVERED_READBACK'||
    !HEX64.test(finalDelivery.masterSha256||'')||
    !nonempty(finalDelivery.shippingReceiptRef)||!nonempty(finalDelivery.recipientReadbackRef))
    return hold('FINAL_DELIVERY_CONFLICT','HOLD_AND_RECONCILE_FINAL_DELIVERY',
      ['shipping_receipt_not_bound_to_approved_order']);
  return {...base,stage:'DELIVERY_RECEIPT_PRESENT',nextAction:'RECORD_ACCEPTANCE_AND_SUPPORT',
    // Observation only; never grants any actual payment or external send authority.
    proofs:{courierCandidateFingerprint:candidate.content_fingerprint,
      assetIdentity,previewSha256:previewSha,
      paymentReadbackRef:payment.readbackReceiptRef,
      shippingReadbackRef:finalDelivery.recipientReadbackRef}};
}
