import { randomUUID } from 'node:crypto';

// Owner-authenticated Passport custody MUST live outside the MCP caller.
// Only read and atomic consume interfaces are required by this verifier.
// Issuance of grants and permits is exclusively an independent owner action.
export function remoteOperatorPermitBinding({
  action, root_key, node_id, approval_ref, payload_sha256,
} = {}) {
  const operation = String(action || '');
  const root = String(root_key || '');
  const node = String(node_id || '');
  const permit = String(approval_ref || '');
  const digest = String(payload_sha256 || '').toLowerCase();
  if (!['remote_write_file', 'remote_exec'].includes(operation) ||
      !/^[a-zA-Z0-9._-]{1,128}$/.test(root) ||
      !/^[a-zA-Z0-9._-]{1,128}$/.test(node) ||
      !/^permit_[a-zA-Z0-9-]{8,128}$/.test(permit) ||
      !/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error('remote_operator_passport_binding_invalid');
  }
  return {
    permit_id: permit,
    product: 'evercraft.remote-operator',
    scope: 'remote_operator.' + operation,
    resource_ref: 'node:' + node + '/root:' + root,
    request_fingerprint: 'sha256:' + digest,
  };
}

// Production must inject a Passport backed by an independently authenticated
// owner identity and a protected state store; an MCP caller cannot mint permits.
export function createRemoteOperatorPassportVerifier({
  passport,
  ownerSubjectRef,
} = {}) {
  const owner = String(ownerSubjectRef || '').trim();
  if (!passport ||
      typeof passport.getActionPermitState !== 'function' ||
      typeof passport.consumeActionPermit !== 'function' ||
      !owner || owner.length > 256)
    throw new Error('remote_operator_passport_owner_authority_required');
  return async request => {
    const bound = remoteOperatorPermitBinding(request);
    const state = passport.getActionPermitState(bound.permit_id);
    if (!state ||
        state.active !== true || state.consumed !== false ||
        state.expired !== false || state.cancelled !== false ||
        state.grant_active !== true || state.actor_ref !== owner ||
        state.product !== bound.product || state.scope !== bound.scope ||
        state.resource_ref !== bound.resource_ref ||
        state.request_fingerprint !== bound.request_fingerprint) {
      throw new Error('remote_operator_passport_permit_denied');
    }
    // Passport atomically consumes this exact permit before any remote
    // file write or execution. Use a fresh idempotency key on every attempt:
    // never treat a replayed "duplicate" response as fresh authority.
    const consumed = passport.consumeActionPermit({
      permit_id: bound.permit_id,
      actor_ref: owner,
      request_fingerprint: bound.request_fingerprint,
      evidence_ref: 'remote-operator:' + bound.scope,
      idempotency_key: 'remote_operator_consume_' + randomUUID(),
    });
    if (consumed?.state !== 'consumed' ||
        consumed?.consumption?.permit_id !== bound.permit_id ||
        consumed?.consumption?.actor_ref !== owner ||
        consumed?.consumption?.product !== bound.product ||
        consumed?.consumption?.scope !== bound.scope ||
        consumed?.consumption?.resource_ref !== bound.resource_ref ||
        consumed?.consumption?.request_fingerprint !== bound.request_fingerprint)
      throw new Error('remote_operator_passport_consumption_unverified');
    return { ...request, approved: true, one_time_consumed: true };
  };
}
