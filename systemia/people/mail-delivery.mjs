import crypto from 'node:crypto';

const TRUSTED_PROVIDERS = new Set(['gmail_agent', 'resend_agent']);

export function emailDestinationHash(email) {
  const normalized = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('valid_email_required');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export function mailDeliveryEvidencePayload(evidence) {
  const provider = String(evidence?.provider ?? '').trim();
  const status = String(evidence?.status ?? '').trim();
  const messageRef = String(evidence?.message_ref ?? '').trim();
  const challengeKey = String(evidence?.challenge_key ?? '').trim();
  const destinationHash = String(evidence?.destination_hash ?? '').trim();
  if (!TRUSTED_PROVIDERS.has(provider)) throw new Error('trusted_mail_provider_invalid');
  if (status !== 'sent') throw new Error('trusted_mail_status_invalid');
  if (!messageRef || !challengeKey || !/^[a-f0-9]{64}$/.test(destinationHash)) {
    throw new Error('mail_delivery_evidence_invalid');
  }
  return Buffer.from(JSON.stringify([
    'evercraft.people.mail-delivery-attestation.v1',
    provider, status, challengeKey, destinationHash, messageRef,
  ]));
}

export function signMailDeliveryEvidence(evidence, privateKey) {
  return crypto.sign(null, mailDeliveryEvidencePayload(evidence), privateKey).toString('base64');
}

export function verifyMailDeliveryEvidence(evidence, signature, publicKey) {
  if (!publicKey || typeof signature !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(signature)) return false;
  try {
    return crypto.verify(null, mailDeliveryEvidencePayload(evidence), publicKey, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

/**
 * The injected send callback must be a real Gmail/Resend adapter that returns a
 * provider-issued message ID only AFTER a successful provider send response.
 * People never stores the raw recipient or verification token.
 */
export async function dispatchPeopleEmailVerification({
  provider, recipient, challenge, publicOrigin, privateKey, send,
}) {
  if (!TRUSTED_PROVIDERS.has(provider)) throw new Error('trusted_mail_provider_invalid');
  if (typeof send !== 'function') throw new Error('trusted_mail_send_adapter_required');
  const destinationHash = emailDestinationHash(recipient);
  const origin = new URL(publicOrigin);
  if (origin.protocol !== 'https:') throw new Error('owned_https_origin_required');
  if (!String(challenge?.verification_path ?? '').startsWith('/people/verify-email?token=')) {
    throw new Error('verification_challenge_invalid');
  }
  const challengeKey = String(challenge?.challenge_key ?? '').trim();
  if (!challengeKey) throw new Error('verification_challenge_invalid');
  const url = new URL(challenge.verification_path, origin).toString();
  const response = await send({
    to: recipient,
    subject: 'Verify your Evercraft People email',
    text: 'Use this link to verify the email for your People brain: ' + url +
      '\n\nIf you did not request this verification, ignore this message.',
  });
  const messageRef = String(response?.message_ref ?? '').trim();
  if (!messageRef || response?.sent !== true) throw new Error('mail_provider_send_not_confirmed');
  const evidence = {
    challenge_key: challengeKey,
    provider,
    status: 'sent',
    message_ref: messageRef,
    destination_hash: destinationHash,
  };
  return { ...evidence, evidence_signature: signMailDeliveryEvidence(evidence, privateKey) };
}
