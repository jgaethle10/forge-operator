import { evaluateFinancialAgentRequest } from './policy.mjs';

const requestKeys = ['schema', 'operation', 'account_ref', 'connector_id', 'method'];
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const deny = (reason, receipt = null) => ({
  allowed: false, decision: 'deny', reason, receipt, data: null,
});

/**
 * Executes authorized read requests through a private adapter boundary.
 * Dependencies are privileged server-side providers. Callers may supply only a
 * session proof, signed-grant reference and narrow request; never trust fields.
 * This library is not itself an identity provider or banking integration.
 */
export function createAccountSentinelGateway({
  identity, consent, connectors, revocations, bankReader, audit,
  trustedPublicKeys, clock = () => new Date(),
}) {
  if (![identity?.resolve, consent?.get, connectors?.get, revocations?.snapshot,
    bankReader?.read, audit?.append].every(x => typeof x === 'function')) {
    throw new Error('required_privileged_provider_missing');
  }
  if (!trustedPublicKeys || typeof trustedPublicKeys !== 'object') {
    throw new Error('trusted_signer_registry_missing');
  }

  const record = async (event) => {
    const receipt = await audit.append(event);
    if (!receipt?.hash || typeof receipt.hash !== 'string') throw new Error('audit_receipt_missing');
    return receipt;
  };

  return Object.freeze({
    async read(input) {
      // Reject extra properties, including forged "trustedPrincipal" and "trustedConnector".
      if (!exact(input, ['session_proof', 'grant_ref', 'request']) ||
          typeof input.session_proof !== 'string' || !input.session_proof ||
          typeof input.grant_ref !== 'string' || !input.grant_ref ||
          !exact(input.request, requestKeys)) {
        return deny('invalid_gateway_request');
      }
      const { request } = input;
      let decision;
      try {
        // Each resolver is trusted server-side code, never the request payload.
        const [principal, signedGrant, connector, revoked] = await Promise.all([
          identity.resolve(input.session_proof),
          consent.get(input.grant_ref),
          connectors.get(request.connector_id),
          revocations.snapshot(),
        ]);
        decision = evaluateFinancialAgentRequest({
          request, signedGrant, trustedPrincipal: principal,
          trustedConnector: connector, trustedRevocations: revoked,
          trustedPublicKeys, now: clock(),
        });
      } catch {
        decision = { allowed: false, reason: 'authority_lookup_unavailable' };
      }
      // No sensitive account IDs, raw grant details, session IDs or response data in audit.
      const auditBase = { operation: typeof request.operation === 'string' ? request.operation : 'invalid' };
      let receipt;
      try {
        receipt = await record({ ...auditBase, kind: decision.allowed ? 'preauthorized' : 'denied',
          reason: decision.reason });
      } catch {
        // Never contact a bank adapter if audit is unavailable.
        return deny('audit_unavailable');
      }
      if (!decision.allowed) return deny(decision.reason, receipt);
      try {
        // No raw credentials are ever sent from the agent request to this adapter.
        const data = await bankReader.read({
          operation: request.operation,
          account_ref: request.account_ref,
          connector_id: request.connector_id,
        });
        // Even if fetching succeeded, do not release data without the completion receipt.
        const completed = await record({ ...auditBase, kind: 'read_completed', reason: 'ok' });
        return { allowed: true, decision: 'allow_read_only', reason: 'scoped_consent_verified',
          data, receipt: completed };
      } catch {
        try {
          receipt = await record({ ...auditBase, kind: 'read_failed', reason: 'provider_or_audit_error' });
        } catch { /* must not leak provider data */ }
        return deny('provider_or_audit_error', receipt);
      }
    },
  });
}
