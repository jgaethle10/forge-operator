import path from 'node:path';
import { FORENSISCOPE_OFFERS, prepareForensiScopePaymentIntent } from './commercial-offers.mjs';

const MEDIA_EXTENSIONS = new Set([
  '.mp4','.mov','.mkv','.webm','.m4v','.avi',
  '.mp3','.wav','.m4a','.aac','.flac','.ogg'
]);
const RECEIPT_SOURCE='evercraft_payments_authoritative_provider_readback';
const hexHash=(x)=>typeof x==='string'&&/^sha256:[0-9a-f]{64}$/.test(x);

/**
 * Nontransactional, deterministic quote for a recording inspected locally
 * in a browser. No media bytes, secret URLs, user identity or PII accepted.
 *
 * The quoted price is NOT permission to charge or upload anything.
 */
export function quoteForensiScopeSelfService({
  fileName, fileSizeBytes, durationSeconds, mediaRightsConfirmed
}={}) {
  const name=String(fileName||'');
  if(!name || name.length>180 || name==='.' || name==='..' ||
     name.includes('/') || name.includes('\\') ||
     name.includes('\0')) throw new Error('safe_file_name_required');
  const ext=path.extname(name).toLowerCase();
  if(!MEDIA_EXTENSIONS.has(ext)) throw new Error('unsupported_media_extension');
  if(!Number.isSafeInteger(fileSizeBytes)||fileSizeBytes<=0)
    throw new Error('valid_file_size_required');
  if(!Number.isSafeInteger(durationSeconds)||durationSeconds<=0)
    throw new Error('verified_positive_duration_required');
  if(mediaRightsConfirmed!==true)throw new Error('explicit_media_rights_required');

  const intent=prepareForensiScopePaymentIntent({
    durationSeconds,mediaRightsConfirmed:true
  });
  return Object.freeze({
    schema:'evercraft.forensiscope.self-service-quote.v1',
    file_name:name,
    file_size_bytes:fileSizeBytes,
    duration_seconds:durationSeconds,
    offer_key:intent.offer_key,
    amount_cents:intent.price_usd*100,
    currency:'usd',
    payment_authority:'Evercraft Payments',
    state:'quote_only',
    checkout_created:false,
    upload_authorized:false,
    job_started:false,
    private_result_available:false
  });
}

/**
 * Only trusted server-side capacity/processor status may be supplied.
 * This is a planning predicate, NOT an HTTP endpoint or bearer credential.
 */
export function evaluateForensiScopeCheckoutGate({quote,capabilities={}}={}) {
  if(quote?.schema!=='evercraft.forensiscope.self-service-quote.v1' ||
     quote.state!=='quote_only')throw new Error('valid_server_quote_required');
  const tier=FORENSISCOPE_OFFERS.find(x=>x.offer_key===quote.offer_key);
  if(!tier||tier.amount_usd*100!==quote.amount_cents||
     quote.currency!=='usd'||quote.duration_seconds>tier.max_duration_seconds)
    throw new Error('quote_price_or_duration_mismatch');

  const reasons=[];
  const bounded=capabilities.ingress_max_bytes;
  if(!Number.isSafeInteger(bounded)||bounded<=0)
    reasons.push('ingress_size_limit_not_verified');
  else if(quote.file_size_bytes>bounded)reasons.push('file_exceeds_ingress_capacity');
  if(capabilities.codec_preflight_verified!==true)
    reasons.push('codec_preflight_not_verified');
  if(capabilities.secure_resumable_ingress_verified!==true)
    reasons.push('secure_ingress_not_verified');
  if(capabilities.processing_capacity_verified!==true)
    reasons.push('processing_capacity_not_verified');
  if(capabilities.private_result_delivery_verified!==true)
    reasons.push('private_delivery_not_verified');
  if(capabilities.exact_offer_payment_route_verified!==true)
    reasons.push('exact_evercraft_payments_route_not_verified');
  return Object.freeze({
    schema:'evercraft.forensiscope.checkout-admission.v1',
    quote_offer_key:quote.offer_key,
    permitted:reasons.length===0,
    blockers:reasons,
    checkout_created:false,
    upload_authorized:false,
    entitlement_granted:false,
    payment_authority:'Evercraft Payments'
  });
}

/**
 * Invoke ONLY inside authenticated Evercraft server code with a trusted
 * order-ledger/provider readback callback. Neither a browser-provided
 * 'paid' flag nor a checkout success redirect can authorize ingress.
 *
 * This helper returns an admission decision, not a signed upload URL.
 */
export async function evaluateForensiScopePaidUpload({
  quote, checkoutAdmission, orderKey, verifyPaidOrder
}={}) {
  if(checkoutAdmission?.schema!=='evercraft.forensiscope.checkout-admission.v1' ||
     checkoutAdmission.permitted!==true ||
     checkoutAdmission.quote_offer_key!==quote?.offer_key)
    throw new Error('checkout_admission_not_verified');
  if(typeof orderKey!=='string'||!/^[a-zA-Z0-9._:-]{8,120}$/.test(orderKey))
    throw new Error('valid_order_key_required');
  if(typeof verifyPaidOrder!=='function')
    throw new Error('trusted_server_payment_readback_required');
  const paid=await verifyPaidOrder(orderKey);
  const valid=paid?.verification_source===RECEIPT_SOURCE &&
    paid?.provider_paid_verified===true &&
    paid?.settlement_verified===true &&
    paid?.order_key===orderKey &&
    paid?.offer_key===quote.offer_key &&
    paid?.amount_cents===quote.amount_cents &&
    String(paid?.currency||'').toLowerCase()==='usd' &&
    typeof paid?.provider_receipt_id==='string' &&
    paid.provider_receipt_id.trim().length>0;
  return Object.freeze({
    schema:'evercraft.forensiscope.paid-upload-admission.v1',
    admitted:valid,
    order_key:orderKey,
    offer_key:quote.offer_key,
    payment_verified:valid,
    source_upload_link_created:false,
    analysis_started:false,
    reason:valid?null:'authoritative_paid_receipt_missing_or_mismatched'
  });
}

/**
 * Private delivery needs actual source/result hashes and a verified
 * customer-scoped access grant. Never returns transcript/media or a
 * public access URL. Caller performs signed URL minting separately.
 */
export function evaluateForensiScopeResultRelease({
  uploadAdmission, sourceSha256, analysisReceipt, accessGrant
}={}) {
  const ok=uploadAdmission?.admitted===true &&
    uploadAdmission?.payment_verified===true &&
    hexHash(sourceSha256) &&
    analysisReceipt?.state==='completed' &&
    analysisReceipt?.order_key===uploadAdmission.order_key &&
    analysisReceipt?.source_sha256===sourceSha256 &&
    hexHash(analysisReceipt?.result_sha256) &&
    accessGrant?.verified===true &&
    accessGrant?.order_key===uploadAdmission.order_key &&
    accessGrant?.scope==='private_result_read' &&
    typeof accessGrant?.expires_at==='string' &&
    Number.isFinite(Date.parse(accessGrant.expires_at)) &&
    Date.parse(accessGrant.expires_at)>Date.now();

  return Object.freeze({
    schema:'evercraft.forensiscope.result-release.v1',
    releasable:ok===true,
    result_url_issued:false,
    public_media_access:false,
    reason:ok===true?null:'paid_source_processing_or_private_access_unverified'
  });
}
