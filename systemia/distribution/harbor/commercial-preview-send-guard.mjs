import crypto from 'node:crypto';

export const HARBOR_PREVIEW_SEND_SCHEMA = 'evercraft.harbor.commercial-preview-send-request.v1';
const HEX64 = /^[0-9a-f]{64}$/i;
const present = x => typeof x === 'string' && x.trim().length > 0;
const digest = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');

/**
 * A deliberately fail-closed preflight for a future authorized Messenger publisher.
 * This is NOT a Meta sender, an authentication mechanism, or a rights verifier.
 * The caller MUST obtain receipts from independent trusted sources, not customer text.
 * Native sends outside the mediated publisher remain an uncontrolled bypass.
 */
export function assessHarborCommercialPreviewSend(request, { providerSends } = {}) {
  const denied = [];
  const requireRule = (test, code) => { if (!test) denied.push(code); };
  if (request?.schema !== HARBOR_PREVIEW_SEND_SCHEMA) {
    throw new Error('harbor_preview_send_schema_invalid');
  }
  const job = request.job || {};
  const art = request.artifact || {};
  const fallen = request.fallenGate || {};
  const release = fallen.release || {};
  const reviews = request.review || {};
  const approval = request.founderApproval || {};
  const destination = request.destination || {};
  const consent = request.customerConsent || {};
  const send = request.sendAuthorization || {};

  requireRule(present(job.id), 'job_id_missing');
  requireRule(present(job.orderId), 'order_id_missing');
  requireRule(job.status === 'PRODUCTION_ASSIGNED', 'systemia_production_not_assigned');
  requireRule(present(job.systemiaAdmissionRef), 'systemia_admission_missing');
  requireRule(present(job.producerId), 'named_fallen_producer_missing');
  requireRule(job.productionRuntime === 'evercraft_owned', 'production_runtime_not_owned');
  requireRule(job.productionAccepted === true, 'fallen_production_not_accepted');
  requireRule(present(job.sourceManifestSha256) && HEX64.test(job.sourceManifestSha256), 'source_manifest_unverified');
  requireRule(job.rightsStatus === 'VERIFIED_FOR_COMMERCIAL_PREVIEW', 'source_rights_not_verified');
  requireRule(job.scopeConfirmed === true, 'order_scope_not_confirmed');

  requireRule(present(art.sha256) && HEX64.test(art.sha256), 'preview_digest_invalid');
  requireRule(art.mimeType === 'video/mp4', 'preview_media_type_invalid');
  requireRule(art.watermarked === true, 'watermarked_preview_missing');
  requireRule(art.privateDeliveryOnly === true, 'preview_private_delivery_not_enforced');

  requireRule(fallen.schema === 'evercraft.fallen.customer-commercial-gate-report.v1', 'fallen_gate_missing');
  requireRule(fallen.orderId === job.orderId, 'fallen_gate_order_mismatch');
  requireRule(fallen.status === 'ready_for_client_preview', 'fallen_not_ready_for_client_preview');
  requireRule(fallen.masterSha256 === art.sha256, 'fallen_gate_media_digest_mismatch');
  requireRule(fallen.rightsAndCreativeStatus === 'reviewed', 'fallen_creative_review_missing');
  requireRule(fallen.audioStatus === 'accepted', 'fallen_audio_qc_not_accepted');
  requireRule(fallen.pictureStatus === 'accepted', 'fallen_picture_qc_not_accepted');
  requireRule(release.schema === 'evercraft.fallen.client-commercial-release-report.v1', 'fallen_release_schema_invalid');
  requireRule(release.status === 'ready_for_client_preview', 'fallen_release_not_ready');
  requireRule(Array.isArray(release.reasons) && release.reasons.length === 0, 'fallen_release_has_blockers');
  requireRule(release.masterSha256 === art.sha256, 'fallen_release_digest_mismatch');
  requireRule(present(release.reportDigest) && HEX64.test(release.reportDigest), 'fallen_release_report_digest_missing');

  // A technical checker, creative producer, independent reviewer and founder are not interchangeable.
  requireRule(present(reviews.independentReviewerId), 'independent_reviewer_missing');
  requireRule(reviews.independentReviewerId !== job.producerId, 'producer_self_review_forbidden');
  requireRule(reviews.visualApproved === true, 'human_visual_review_not_approved');
  requireRule(reviews.audioApproved === true, 'human_audio_review_not_approved');
  requireRule(reviews.exactPreviewSha256 === art.sha256, 'independent_review_digest_mismatch');
  requireRule(reviews.watermarkVisible === true, 'watermark_not_human_verified');
  requireRule(present(reviews.reviewReceiptRef), 'independent_review_receipt_missing');

  requireRule(present(approval.approvedBy), 'founder_approval_missing');
  requireRule(present(approval.approvedAt), 'founder_approval_timestamp_missing');
  requireRule(approval.approvedPreviewSha256 === art.sha256, 'founder_approval_media_digest_mismatch');
  requireRule(present(request.customerMessageSha256) && HEX64.test(request.customerMessageSha256), 'customer_message_digest_invalid');
  requireRule(approval.approvedMessageSha256 === request.customerMessageSha256, 'founder_approval_message_mismatch');

  requireRule(destination.platform === 'facebook_messenger', 'invalid_customer_channel');
  requireRule(present(destination.pageId), 'destination_page_missing');
  requireRule(present(destination.threadId), 'destination_thread_missing');
  requireRule(consent.status === 'AUTHORIZED_FOR_PRIVATE_PREVIEW', 'customer_preview_consent_missing');
  requireRule(consent.threadId === destination.threadId, 'consent_thread_mismatch');
  requireRule(send.status === 'AUTHORIZED', 'external_send_not_authorized');
  requireRule(send.orderId === job.orderId, 'send_authority_order_mismatch');
  requireRule(send.threadId === destination.threadId, 'send_authority_thread_mismatch');
  requireRule(send.approvedPreviewSha256 === art.sha256, 'send_authority_digest_mismatch');
  requireRule(present(send.authorityRef), 'send_authority_receipt_missing');

  // This array must be read from the actual private outbound ledger by the publisher.
  requireRule(Array.isArray(providerSends), 'authoritative_send_ledger_unavailable');
  if (Array.isArray(providerSends)) {
    const prior = providerSends.some(row => row?.orderId === job.orderId &&
      row?.threadId === destination.threadId && row?.mediaSha256 === art.sha256);
    requireRule(!prior, 'duplicate_preview_send_blocked');
  }

  const reasons = [...new Set(denied)].sort();
  return {
    schema:'evercraft.harbor.commercial-preview-send-decision.v1',
    status: reasons.length ? 'DENY' : 'ELIGIBLE_FOR_AUTHORIZED_SENDER',
    reasons,
    orderId: job.orderId || null,
    previewSha256: HEX64.test(art.sha256 || '') ? art.sha256 : null,
    decisionDigest: digest({orderId:job.orderId||null,sha:art.sha256||null,reasons}),
    boundaries: {
      senderInvoked: false,
      sourceReceiptAuthenticityVerified: false,
      providerSendAuthorizedByThisModule: false,
      nativeMessengerBypassStillPossible: true,
    },
  };
}
