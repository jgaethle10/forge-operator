import crypto from 'node:crypto';
import { preflightPackage } from './package-preflight.mjs';

function clean(value) {
  return String(value ?? '').trim();
}

function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
}

function digest(value) {
  return 'sha256:' + crypto.createHash('sha256').update(stable(value)).digest('hex');
}

function normalizeRecipient(recipient = {}) {
  const address = clean(recipient.address || recipient.email || recipient.ref);
  if (!address) throw new Error('recipient_address_required');
  return {
    address,
    display_name:clean(recipient.display_name || recipient.name) || null,
    recipient_ref:clean(recipient.recipient_ref || address)
  };
}

export function prepareShipment({
  logical_package_key,
  recipient,
  subject,
  body,
  artifacts = [],
  authorization_ref,
  preferred_route = 'thread_reply',
  fallback_route = 'fresh_outbound',
  thread_ref = null,
  now = new Date()
} = {}) {
  if (!clean(logical_package_key)) throw new Error('logical_package_key_required');
  if (!clean(subject)) throw new Error('subject_required');
  if (!clean(body)) throw new Error('body_required');
  if (!clean(authorization_ref)) throw new Error('send_authorization_ref_required');

  const normalizedRecipient = normalizeRecipient(recipient);
  const packageManifest = preflightPackage({ artifacts });
  const reasons = [...packageManifest.reasons];
  if (!packageManifest.pass) reasons.unshift('package_preflight_failed');

  const envelopeCore = {
    schema:'evercraft.shipping.envelope.v2',
    logical_package_key:clean(logical_package_key),
    recipient:normalizedRecipient,
    subject:clean(subject),
    body_digest:digest(clean(body)),
    package_manifest:packageManifest,
    authorization_ref:clean(authorization_ref),
    route_policy:{
      preferred_route:clean(preferred_route) || 'thread_reply',
      fallback_route:clean(fallback_route) || 'fresh_outbound',
      thread_ref:clean(thread_ref) || null,
      maximum_provider_send_acceptances:1,
      maximum_pre_acceptance_route_attempts:2,
      unknown_provider_acceptance_requires_verification_before_retry:true,
      never_retry_after_verified_provider_acceptance:true
    },
    prepared_at:new Date(now).toISOString()
  };

  return {
    ...envelopeCore,
    shipment_fingerprint:digest(envelopeCore),
    dispatch_ready:reasons.length === 0,
    reasons:[...new Set(reasons)]
  };
}

export function classifyDeliveryFailure(error = {}) {
  const raw = [
    error.code,
    error.name,
    error.message,
    error.detail
  ].filter(Boolean).join(' ').toLowerCase();

  if (!raw) return {
    classification:'unknown',
    safe_to_retry:false,
    verification_required:true
  };

  const threadFailure = /(thread|reply).*?(fail|invalid|unknown)|failed to send email.*reply|failed to create draft/.test(raw);
  if (threadFailure) {
    return {
      classification:'thread_write_failure',
      safe_to_retry:true,
      verification_required:false,
      recommended_route:'fresh_outbound'
    };
  }

  const explicitPreSend = /(attachment.*(resolve|read|upload|invalid)|file.*not found|recipient.*invalid|payload.*invalid|request.*rejected)/.test(raw);
  if (explicitPreSend) {
    return {
      classification:'pre_acceptance_failure',
      safe_to_retry:true,
      verification_required:false
    };
  }

  const providerAccepted = /(accepted|queued|message[_ -]?id|sent successfully)/.test(raw);
  if (providerAccepted) {
    return {
      classification:'possible_provider_acceptance',
      safe_to_retry:false,
      verification_required:true
    };
  }

  return {
    classification:'ambiguous_connector_failure',
    safe_to_retry:false,
    verification_required:true
  };
}

export function nextDispatchRoute({
  envelope,
  attempts = [],
  sent_copy_state = 'unknown'
} = {}) {
  if (!envelope?.dispatch_ready) return {
    allowed:false,
    reason:'shipment_not_dispatch_ready'
  };

  const accepted = attempts.find((row) => row.outcome === 'sent' && row.provider_message_id);
  if (accepted) {
    return {
      allowed:false,
      reason:'provider_acceptance_already_recorded',
      verification_required:sent_copy_state !== 'verified'
    };
  }

  const ambiguous = attempts.find((row) => row.outcome === 'unknown' || row.ambiguous_provider_acceptance === true);
  if (ambiguous && sent_copy_state !== 'verified_absent') {
    return {
      allowed:false,
      reason:'ambiguous_prior_attempt_requires_sent_copy_check',
      verification_required:true
    };
  }
  if (ambiguous && sent_copy_state === 'verified_absent') {
    return {
      allowed:true,
      route:envelope.route_policy.fallback_route,
      thread_ref:null,
      reason:'sent_copy_verified_absent_after_ambiguous_attempt'
    };
  }

  if (attempts.length === 0) {
    return {
      allowed:true,
      route:envelope.route_policy.preferred_route,
      thread_ref:envelope.route_policy.thread_ref || null,
      reason:'preferred_route'
    };
  }

  const last = attempts[attempts.length - 1];
  const classified = classifyDeliveryFailure(last.error || {
    code:last.error_code,
    message:last.error_message,
    detail:last.error_detail
  });

  if (!classified.safe_to_retry) {
    return {
      allowed:false,
      reason:classified.classification,
      verification_required:classified.verification_required
    };
  }

  const preAcceptanceAttempts = attempts.filter((row) => row.outcome !== 'sent').length;
  if (preAcceptanceAttempts >= Number(envelope.route_policy.maximum_pre_acceptance_route_attempts || 2)) {
    return {
      allowed:false,
      reason:'pre_acceptance_retry_budget_exhausted'
    };
  }

  return {
    allowed:true,
    route:classified.recommended_route || envelope.route_policy.fallback_route,
    thread_ref:null,
    reason:classified.classification
  };
}

export function verifySentCopy({
  envelope,
  sent_message = {}
} = {}) {
  if (!envelope?.dispatch_ready) throw new Error('shipment_not_dispatch_ready');
  const reasons = [];
  const expectedRecipient = clean(envelope.recipient?.address).toLowerCase();
  const actualRecipients = [
    ...(sent_message.to || []),
    ...(sent_message.cc || []),
    ...(sent_message.bcc || [])
  ].map((value) => clean(value).toLowerCase());

  if (!actualRecipients.includes(expectedRecipient)) reasons.push('recipient_not_present_in_sent_copy');
  if (clean(sent_message.subject) !== clean(envelope.subject)) reasons.push('subject_mismatch');

  const expectedAttachments = envelope.package_manifest.artifacts
    .map((row) => row.client_filename)
    .sort((a,b) => a.localeCompare(b));
  const actualAttachments = (sent_message.attachments || [])
    .map((row) => clean(row.filename))
    .filter(Boolean)
    .sort((a,b) => a.localeCompare(b));

  if (expectedAttachments.length !== actualAttachments.length ||
      expectedAttachments.some((name, index) => name !== actualAttachments[index])) {
    reasons.push('attachment_manifest_mismatch');
  }

  if (!clean(sent_message.id || sent_message.message_id || sent_message.provider_message_id)) {
    reasons.push('provider_message_id_missing');
  }

  const verificationCore = {
    schema:'evercraft.shipping.sent-copy-verification.v2',
    shipment_fingerprint:envelope.shipment_fingerprint,
    provider_message_id:clean(sent_message.id || sent_message.message_id || sent_message.provider_message_id) || null,
    recipient_verified:!reasons.includes('recipient_not_present_in_sent_copy'),
    subject_verified:!reasons.includes('subject_mismatch'),
    attachments_verified:!reasons.includes('attachment_manifest_mismatch'),
    attachment_names:actualAttachments
  };

  return {
    ...verificationCore,
    verified:reasons.length === 0,
    reasons,
    verification_digest:digest(verificationCore)
  };
}

export function buildDispatchAudit({
  envelope,
  attempts = [],
  sent_copy_verification = null
} = {}) {
  const state = sent_copy_verification?.verified === true
    ? 'verified_delivered'
    : attempts.some((row) => row.outcome === 'sent' && row.provider_message_id)
      ? 'provider_accepted_unverified'
      : attempts.some((row) => row.outcome === 'unknown' || row.ambiguous_provider_acceptance)
        ? 'verification_required_before_retry'
        : attempts.length
          ? 'send_failed_pre_acceptance'
          : 'prepared';

  const auditCore = {
    schema:'evercraft.shipping.dispatch-audit.v2',
    shipment_fingerprint:envelope?.shipment_fingerprint || null,
    logical_package_key:envelope?.logical_package_key || null,
    state,
    attempt_count:attempts.length,
    attempts,
    sent_copy_verification,
    duplicate_send_protection:{
      package_fingerprint_required:true,
      one_provider_acceptance_max:true,
      ambiguous_send_requires_sent_copy_check:true
    }
  };

  return {
    ...auditCore,
    integrity_digest:digest(auditCore)
  };
}
