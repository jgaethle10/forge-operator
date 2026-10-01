import {
  classifyDeliveryFailure,
  nextDispatchRoute,
  verifySentCopy
} from './shipping-department.mjs';
import {
  markSentCopyVerified,
  recordDeliveryAttempt,
  reserveShipment
} from './shipping-ledger.mjs';

function clean(value) {
  return String(value ?? '').trim();
}

function attemptView(attempt = {}) {
  return {
    outcome:attempt.outcome,
    provider_message_id:attempt.provider_message_id || null,
    ambiguous_provider_acceptance:attempt.ambiguous_provider_acceptance === true,
    error_code:attempt.error_code || null,
    error_message:attempt.error_message || null,
    error_detail:attempt.error_detail || null,
    error:attempt.error || null
  };
}

async function verifyAcceptedShipment({ shipment, envelope, adapter, ledger_file, now }) {
  const providerMessageId = clean(shipment.provider_message_id);
  if (!providerMessageId) {
    return {
      state:'verification_required_before_retry',
      delivered:false,
      shipment_key:shipment.shipment_key,
      verification_required:true,
      reason:'provider_message_id_missing'
    };
  }

  const sentMessage = await adapter.readSent({
    provider_message_id:providerMessageId,
    envelope
  });
  const verification = verifySentCopy({
    envelope,
    sent_message:sentMessage
  });

  if (!verification.verified) {
    return {
      state:'provider_accepted_unverified',
      delivered:false,
      shipment_key:shipment.shipment_key,
      provider_message_id:providerMessageId,
      verification
    };
  }

  const verified = markSentCopyVerified({
    ledger_file,
    shipment_key:shipment.shipment_key,
    verification_ref:verification.verification_digest,
    provider_message_id:providerMessageId,
    attachment_names:verification.attachment_names,
    recipient_verified:verification.recipient_verified,
    subject_verified:verification.subject_verified,
    attachments_verified:verification.attachments_verified,
    now:now()
  });

  return {
    state:'verified_delivered',
    delivered:true,
    duplicate_suppressed:true,
    resumed:true,
    shipment:verified.shipment,
    provider_message_id:providerMessageId,
    verification
  };
}

export async function dispatchVerifiedShipment({
  envelope,
  transport_artifacts = [],
  adapter,
  ledger_file = 'state/shipping/shipping-ledger.json',
  provider = 'external',
  now = () => new Date()
} = {}) {
  if (!envelope?.dispatch_ready) {
    return {
      state:'blocked_preflight',
      delivered:false,
      reasons:envelope?.reasons || ['shipment_not_dispatch_ready']
    };
  }
  if (!adapter || typeof adapter.send !== 'function' || typeof adapter.readSent !== 'function') {
    throw new Error('shipping_adapter_send_and_read_required');
  }

  const reserved = reserveShipment({
    ledger_file,
    recipient_ref:envelope.recipient.recipient_ref,
    subject:envelope.subject,
    package_digest:envelope.package_manifest.package_digest,
    logical_package_key:envelope.logical_package_key,
    authorization_ref:envelope.authorization_ref,
    preferred_route:envelope.route_policy.preferred_route,
    now:now()
  });

  const shipment = reserved.shipment;
  const shipmentKey = shipment.shipment_key;
  const attempts = [...(shipment.attempts || [])].map(attemptView);
  let sentCopyState = 'unknown';

  if (reserved.duplicate_suppressed) {
    if (shipment.state === 'verified_delivered') {
      return {
        state:'verified_delivered',
        delivered:true,
        duplicate_suppressed:true,
        shipment
      };
    }

    if (shipment.state === 'provider_accepted') {
      return verifyAcceptedShipment({
        shipment,
        envelope,
        adapter,
        ledger_file,
        now
      });
    }

    if (shipment.state === 'verification_required_before_retry') {
      if (typeof adapter.verifyAbsent !== 'function') {
        return {
          state:'verification_required_before_retry',
          delivered:false,
          duplicate_suppressed:true,
          shipment_key:shipmentKey,
          verification_required:true,
          attempts
        };
      }
      const absent = await adapter.verifyAbsent({
        envelope,
        prior_attempts:attempts
      });
      if (absent !== true) {
        return {
          state:'verification_required_before_retry',
          delivered:false,
          duplicate_suppressed:true,
          shipment_key:shipmentKey,
          verification_required:true,
          attempts
        };
      }
      sentCopyState = 'verified_absent';
    }
  }

  const maxAttempts = Number(envelope.route_policy.maximum_pre_acceptance_route_attempts || 2);
  let preAcceptanceAttempts = attempts.filter((row) => row.outcome !== 'sent').length;

  while (preAcceptanceAttempts < maxAttempts) {
    const route = nextDispatchRoute({
      envelope,
      attempts,
      sent_copy_state:sentCopyState
    });

    if (!route.allowed) {
      return {
        state:route.verification_required ? 'verification_required_before_retry' : 'dispatch_blocked',
        delivered:false,
        shipment_key:shipmentKey,
        reason:route.reason,
        verification_required:route.verification_required === true,
        attempts
      };
    }

    try {
      const result = await adapter.send({
        route:route.route,
        thread_ref:route.thread_ref || null,
        recipient:envelope.recipient,
        subject:envelope.subject,
        body_digest:envelope.body_digest,
        package_manifest:envelope.package_manifest,
        transport_artifacts,
        idempotency_key:shipment.idempotency_key
      });

      const providerMessageId = clean(
        result?.provider_message_id ||
        result?.message_id ||
        result?.id
      );

      if (!providerMessageId) {
        const unknown = {
          outcome:'unknown',
          route:route.route,
          ambiguous_provider_acceptance:true,
          error_code:'provider_message_id_missing',
          error_message:'send returned without a provider message id',
          error_detail:null
        };
        attempts.push(unknown);
        preAcceptanceAttempts += 1;
        recordDeliveryAttempt({
          ledger_file,
          shipment_key:shipmentKey,
          route:route.route,
          provider,
          outcome:'unknown',
          ambiguous_provider_acceptance:true,
          error_code:unknown.error_code,
          error_message:unknown.error_message,
          now:now()
        });

        if (typeof adapter.verifyAbsent === 'function') {
          const absent = await adapter.verifyAbsent({
            envelope,
            route:route.route,
            attempted_result:result || null
          });
          if (absent === true) {
            sentCopyState = 'verified_absent';
            continue;
          }
        }

        return {
          state:'verification_required_before_retry',
          delivered:false,
          shipment_key:shipmentKey,
          verification_required:true,
          attempts
        };
      }

      const sentAttempt = {
        outcome:'sent',
        route:route.route,
        provider_message_id:providerMessageId
      };
      attempts.push(sentAttempt);
      recordDeliveryAttempt({
        ledger_file,
        shipment_key:shipmentKey,
        route:route.route,
        provider,
        outcome:'sent',
        provider_message_id:providerMessageId,
        now:now()
      });

      const sentMessage = await adapter.readSent({
        provider_message_id:providerMessageId,
        envelope
      });
      const verification = verifySentCopy({
        envelope,
        sent_message:sentMessage
      });

      if (!verification.verified) {
        return {
          state:'provider_accepted_unverified',
          delivered:false,
          shipment_key:shipmentKey,
          provider_message_id:providerMessageId,
          verification,
          attempts
        };
      }

      const verified = markSentCopyVerified({
        ledger_file,
        shipment_key:shipmentKey,
        verification_ref:verification.verification_digest,
        provider_message_id:providerMessageId,
        attachment_names:verification.attachment_names,
        recipient_verified:verification.recipient_verified,
        subject_verified:verification.subject_verified,
        attachments_verified:verification.attachments_verified,
        now:now()
      });

      return {
        state:'verified_delivered',
        delivered:true,
        duplicate_suppressed:false,
        shipment:verified.shipment,
        provider_message_id:providerMessageId,
        verification,
        attempts
      };
    } catch (error) {
      const classification = classifyDeliveryFailure(error);
      const outcome = classification.verification_required ? 'unknown' : 'failed';
      const attempt = {
        outcome,
        route:route.route,
        ambiguous_provider_acceptance:classification.verification_required === true,
        error_code:clean(error?.code) || classification.classification,
        error_message:clean(error?.message) || classification.classification,
        error_detail:clean(error?.detail) || null,
        error:{
          code:clean(error?.code) || null,
          name:clean(error?.name) || null,
          message:clean(error?.message) || null,
          detail:clean(error?.detail) || null
        }
      };
      attempts.push(attempt);
      preAcceptanceAttempts += 1;

      recordDeliveryAttempt({
        ledger_file,
        shipment_key:shipmentKey,
        route:route.route,
        provider,
        outcome,
        error_code:attempt.error_code,
        error_message:attempt.error_message,
        error_detail:attempt.error_detail,
        ambiguous_provider_acceptance:classification.verification_required === true,
        now:now()
      });

      if (classification.verification_required) {
        if (typeof adapter.verifyAbsent === 'function') {
          const absent = await adapter.verifyAbsent({
            envelope,
            route:route.route,
            error
          });
          if (absent === true) {
            sentCopyState = 'verified_absent';
            continue;
          }
        }

        return {
          state:'verification_required_before_retry',
          delivered:false,
          shipment_key:shipmentKey,
          verification_required:true,
          classification,
          attempts
        };
      }
    }
  }

  return {
    state:'retry_budget_exhausted',
    delivered:false,
    shipment_key:shipmentKey,
    attempts
  };
}
