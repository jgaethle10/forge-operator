import { dispatchPeopleEmailVerification } from './mail-delivery.mjs';

const RESEND_ENDPOINT='https://api.resend.com/emails';

/**
 * Transport authority belongs to the mail worker, never the People web process.
 * Keys, recipient and verification URL exist only in transient worker memory.
 */
export function createResendMailSender({apiKey,from,fetchImpl=fetch}) {
  if(typeof apiKey!=='string'||!apiKey.trim())throw new Error('resend_api_key_required');
  if(typeof from!=='string'||!from.includes('@'))throw new Error('resend_verified_sender_required');
  if(typeof fetchImpl!=='function')throw new Error('resend_fetch_required');

  return async function send({to,subject,text,idempotency_key}) {
    if(!to||!subject||!text||!/^people-email-[a-f0-9]{64}$/.test(String(idempotency_key||''))) {
      throw new Error('resend_verification_payload_invalid');
    }
    const response=await fetchImpl(RESEND_ENDPOINT,{
      method:'POST',
      headers:{
        authorization:'Bearer '+apiKey,
        'content-type':'application/json',
        'idempotency-key':idempotency_key,
      },
      body:JSON.stringify({from,to:[to],subject,text}),
    });
    if(!response.ok)throw new Error('resend_mail_send_failed');
    const json=await response.json();
    const id=typeof json?.id==='string'?json.id.trim():'';
    if(!id)throw new Error('resend_provider_message_ref_missing');
    return {sent:true,message_ref:'resend:'+id};
  };
}

/**
 * Call only from an external trusted adapter with a private signing key.
 * The evidence sink records the attestation through People operator API.
 * A success result means provider accepted the send AND People recorded it.
 * It does not mean mailbox ownership; only recipient redemption proves that.
 */
export async function deliverPeopleVerificationViaResend({
  apiKey,from,privateKey,recipient,challenge,publicOrigin,recordEvidence,fetchImpl=fetch,
}) {
  if(typeof recordEvidence!=='function')throw new Error('mail_delivery_receipt_sink_required');
  const evidence=await dispatchPeopleEmailVerification({
    provider:'resend_agent',
    recipient,challenge,publicOrigin,privateKey,
    send:createResendMailSender({apiKey,from,fetchImpl}),
  });
  const receipt=await recordEvidence(evidence);
  if(receipt?.trusted_mailbox_delivery!==true)throw new Error('people_delivery_receipt_not_trusted');
  return {
    ok:true,provider:'resend_agent',
    challenge_key:evidence.challenge_key,
    destination_hash:evidence.destination_hash,
    provider_message_ref:evidence.message_ref,
    delivery_receipt_key:receipt.delivery_receipt_key,
    mailbox_ownership_verified:false,
  };
}
