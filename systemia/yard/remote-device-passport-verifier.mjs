import { randomUUID } from 'node:crypto';

// Passport permit custody must be on the independently authenticated owner
// side. Never expose its mint/grant methods to the Remote Operator MCP caller.
// This adapter accepts ONLY Passport read/atomic consume capabilities.
const PRODUCT = 'evercraft.remote-device-trust';

export function remoteDevicePermitBinding({
  deployment_id, action, device_fingerprint, node_id, approval_ref,
  payload_sha256,
} = {}) {
  const broker = String(deployment_id || '').trim();
  const operation = String(action || '').trim();
  const fingerprint = String(device_fingerprint || '').trim().toLowerCase();
  const node = String(node_id || '').trim();
  const ref = String(approval_ref || '').trim();
  const digest = String(payload_sha256 || '').trim();
  if (!/^[a-zA-Z0-9._-]{1,128}$/.test(broker) ||
      !/^[a-zA-Z0-9._-]{1,128}$/.test(node) ||
      !['authorize', 'revoke'].includes(operation) ||
      !/^sha256:[a-f0-9]{64}$/.test(fingerprint) ||
      !/^[a-f0-9]{64}$/.test(digest) ||
      !/^permit_[a-zA-Z0-9-]{8,128}$/.test(ref)) {
    throw new Error('remote_device_passport_binding_invalid');
  }
  return {
    product: PRODUCT,
    scope: 'remote_device.' + operation,
    resource_ref: 'broker:' + broker + '/node:' + node + '/fingerprint:' + fingerprint,
    request_fingerprint: 'sha256:' + digest,
    permit_id: ref,
  };
}

// Only a trusted Systemia component may instantiate this adapter with a
// Passport whose permit issuance is protected by actual owner authentication.
// A caller-supplied permit ID or even a minted permit outside the exact owner
// and request scope does not establish authorization.
export function createRemoteDevicePassportVerifier({
  passport,
  ownerSubjectRef,
} = {}) {
  const actor = String(ownerSubjectRef || '').trim();
  if (!passport ||
      typeof passport.getActionPermitState !== 'function' ||
      typeof passport.consumeActionPermit !== 'function' ||
      !actor || actor.length > 256) {
    throw new Error('remote_device_passport_owner_authority_required');
  }
  return async request => {
    const binding = remoteDevicePermitBinding(request);
    const permit = passport.getActionPermitState(binding.permit_id);
    if (!permit || permit.active !== true ||
        permit.consumed !== false || permit.expired !== false ||
        permit.grant_active !== true || permit.cancelled !== false ||
        permit.actor_ref !== actor ||
        permit.product !== binding.product ||
        permit.scope !== binding.scope ||
        permit.resource_ref !== binding.resource_ref ||
        permit.request_fingerprint !== binding.request_fingerprint) {
      throw new Error('remote_device_passport_permit_denied');
    }

    // Passport locks, reloads and atomically marks the permit consumed before
    // a broker mutation is attempted. Always use a NEW consumption idempotency
    // key so replay cannot return a previous "duplicate" success receipt.
    const consumed = passport.consumeActionPermit({
      permit_id: binding.permit_id,
      actor_ref: actor,
      request_fingerprint: binding.request_fingerprint,
      evidence_ref: 'remote-device-trust:' + binding.scope,
      idempotency_key: 'remote_device_consume_' + randomUUID(),
    });
    if (consumed?.state !== 'consumed' ||
        consumed?.consumption?.permit_id !== binding.permit_id ||
        consumed?.consumption?.actor_ref !== actor ||
        consumed?.consumption?.product !== binding.product ||
        consumed?.consumption?.scope !== binding.scope ||
        consumed?.consumption?.resource_ref !== binding.resource_ref ||
        consumed?.consumption?.request_fingerprint !== binding.request_fingerprint) {
      throw new Error('remote_device_passport_consumption_unverified');
    }

    // This shape is checked independently by Yard before its mutating call.
    return {
      ...request,
      approved: true,
      one_time_consumed: true,
    };
  };
}
